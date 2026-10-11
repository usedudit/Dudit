import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { verifySuperFreteWebhookSignature } from "@/lib/services/shipping/superfrete"
import { decrypt } from "@/lib/cryptoService"
import { captureError } from "@/lib/monitoring/sentry"
import { revalidateOrders } from "@/lib/utils/revalidation"
import {
  SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS,
  SUPERFRETE_WEBHOOK_STATUS_TO_SHIPMENT_STATUS,
} from "@/lib/services/shipping/superfrete"
import { logAuditEvent } from "@/lib/services/timeline.service"

const SUPERFRETE_PROVIDER = "superfrete"

// Ordem dos status de entrega do Dudit - usada para impedir regressão
// (ex.: retry atrasado de order.released depois de order.delivered).
const DELIVERY_STATUS_RANK: Record<string, number> = {
  not_sent: 0,
  preparing: 0,
  sent: 1,
  delivered: 2,
}

function canMoveDeliveryStatus(current: string | null | undefined, next: string): boolean {
  if (next === "cancelled") return true
  const currentRank = current ? DELIVERY_STATUS_RANK[current] : undefined
  const nextRank = DELIVERY_STATUS_RANK[next]
  if (currentRank === undefined || nextRank === undefined) return true
  return nextRank >= currentRank
}

// Ordem dos status do próprio rótulo (order_shipments.status). Mesma proteção:
// retries atrasados da SuperFrete (5×/15min) não podem regredir a etiqueta
// (ex.: released recheque depois de delivered). "failed" e "cancelled" são
// terminais e sempre permitidos; timestamps/tracking continuam sendo gravados.
const SHIPMENT_STATUS_RANK: Record<string, number> = {
  pending: 0,
  released: 1,
  posted: 2,
  in_transit: 3,
  delivered: 4,
}

function canMoveShipmentStatus(current: string | null | undefined, next: string): boolean {
  if (next === "cancelled" || next === "failed") return true
  const currentRank = current ? SHIPMENT_STATUS_RANK[current] : undefined
  const nextRank = SHIPMENT_STATUS_RANK[next]
  if (currentRank === undefined || nextRank === undefined) return true
  return nextRank >= currentRank
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get("X-ME-Signature") || ""

  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const event = parsed.event
  const data = parsed.data || {}
  const { id: superfreteOrderId, tracking, tracking_url } = data

  if (!event || !superfreteOrderId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const supabase = getAdminClient()

    const { data: shipments } = await supabase
      .from("order_shipments")
      .select(
        "id, order_id, partner_id, integration_id, provider_slug, kind, return_request_id, status, payload",
      )
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .eq("external_label_id", superfreteOrderId)

    if (!shipments || shipments.length === 0) {
      return NextResponse.json({ message: "Shipment not found, skipping" }, { status: 200 })
    }

    const rawStatus = typeof data.status === "string" ? data.status : ""
    const shipmentStatus = SUPERFRETE_WEBHOOK_STATUS_TO_SHIPMENT_STATUS[rawStatus] || null
    const deliveryStatus = shipmentStatus
      ? SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[shipmentStatus] || null
      : SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[rawStatus] || null
    const nowIso = new Date().toISOString()

    for (const shipment of shipments) {
      const { data: integration } = await supabase
        .from("partner_integrations")
        .select("webhook_secret_encrypted")
        .eq("partner_id", shipment.partner_id)
        .eq("provider_slug", SUPERFRETE_PROVIDER)
        .maybeSingle()

      let signatureValid = false
      if (integration?.webhook_secret_encrypted) {
        try {
          const secret = decrypt(integration.webhook_secret_encrypted, SUPERFRETE_PROVIDER)
          signatureValid = verifySuperFreteWebhookSignature(body, signature, secret)
        } catch (err) {
          console.warn("[SuperFrete Webhook] Failed to verify signature:", err)
        }
      }

      if (!signatureValid) {
        captureError(new Error("SuperFrete webhook signature verification failed"), {
          module: "shipping",
          action: "webhook_signature_invalid",
          partnerId: shipment.partner_id,
        })
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const shipmentPatch: Record<string, unknown> = {}

      if (shipmentStatus && canMoveShipmentStatus(shipment.status, shipmentStatus)) {
        shipmentPatch.status = shipmentStatus
      }

      if (tracking) {
        shipmentPatch.tracking_number = tracking
        shipmentPatch.tracking_url =
          tracking_url || `https://rastreio.superfrete.com/#/tracking/${tracking}`
      }

      if (data.paid_at) {
        shipmentPatch.paid_at = data.paid_at
      }
      if (data.created_at) {
        shipmentPatch.requested_at = data.created_at
      }
      if (shipmentStatus === "delivered") {
        shipmentPatch.delivered_at = data.delivered_at || nowIso
      }
      if (shipmentStatus === "cancelled") {
        shipmentPatch.cancelled_at = data.canceled_at || nowIso
      }
      if (data.posted_at || data.generated_at || event) {
        shipmentPatch.payload = {
          ...((shipment.payload as Record<string, unknown> | null) || {}),
          ...(data.posted_at ? { posted_at: data.posted_at } : {}),
          ...(data.generated_at ? { generated_at: data.generated_at } : {}),
          last_event: event,
          last_event_at: nowIso,
        }
      }

      if (Object.keys(shipmentPatch).length > 0) {
        await supabase
          .from("order_shipments")
          .update(shipmentPatch)
          .eq("id", shipment.id)
          .eq("partner_id", shipment.partner_id)
      }

      // Reverse shipments (buyer -> store) never change the order's own
      // delivery status - only outbound labels (store -> buyer) do.
      // Preenche os mesmos campos do fluxo de delivery padrão do Dudit
      // (delivery_departure_at / delivery_arrived_at / delivery_completed_at).
      if (deliveryStatus && shipment.kind !== "return") {
        const { data: orderRow } = await supabase
          .from("orders")
          .select("delivery_status, delivery_departure_at, delivery_arrived_at, delivery_completed_at")
          .eq("id", shipment.order_id)
          .eq("partner_id", shipment.partner_id)
          .maybeSingle()

        if (canMoveDeliveryStatus(orderRow?.delivery_status, deliveryStatus)) {
          const orderPatch: Record<string, unknown> = { delivery_status: deliveryStatus }
          if (shipmentStatus === "posted" && !orderRow?.delivery_departure_at) {
            orderPatch.delivery_departure_at = data.posted_at || nowIso
          }
          if (shipmentStatus === "delivered") {
            if (!orderRow?.delivery_arrived_at) {
              orderPatch.delivery_arrived_at = data.delivered_at || nowIso
            }
            if (!orderRow?.delivery_completed_at) {
              orderPatch.delivery_completed_at = data.delivered_at || nowIso
            }
          }
          await supabase
            .from("orders")
            .update(orderPatch)
            .eq("id", shipment.order_id)
            .eq("partner_id", shipment.partner_id)
        }
      }

      // Logística reversa: o item voltou para a loja → o pedido de
      // devolução sai de WAITING_ITEM_RETURN e entra em PROCESSING.
      if (shipment.kind === "return" && shipment.return_request_id && shipmentStatus === "delivered") {
        const { data: returnRequest } = await supabase
          .from("return_requests")
          .select("id, status")
          .eq("id", shipment.return_request_id)
          .is("deleted_at", null)
          .maybeSingle()

        if (returnRequest?.status === "WAITING_ITEM_RETURN") {
          await supabase
            .from("return_requests")
            .update({ status: "PROCESSING", updated_at: nowIso })
            .eq("id", returnRequest.id)

          await logAuditEvent({
            partnerId: shipment.partner_id,
            actorUserId: null,
            entityType: "return_request",
            entityId: returnRequest.id,
            actionType: "return_item_received",
            changeLines: ["Item da devolução entregue na loja (transportadora) - status: PROCESSING"],
            source: "webhook",
            metadata: {
              shipment_id: shipment.id,
              event,
              tracking_number: tracking || null,
            },
          })
        }
      }

      await logAuditEvent({
        partnerId: shipment.partner_id,
        actorUserId: null,
        entityType: "order",
        entityId: shipment.order_id,
        actionType: "shipping_status_updated",
        changeLines: [
          shipment.kind === "return"
            ? `Status da etiqueta de devolução atualizado para: ${shipmentStatus || rawStatus}`
            : `Status de frete atualizado para: ${shipmentStatus || rawStatus}`,
        ],
        source: "webhook",
        metadata: {
          shipment_id: shipment.id,
          shipment_status: shipmentStatus || rawStatus,
          shipment_kind: shipment.kind,
          delivery_status: deliveryStatus,
          tracking_number: tracking,
          event,
        },
      })

      revalidateOrders(shipment.partner_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "webhook_process",
    })
    console.error("[SuperFrete Webhook] Error processing webhook:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: err?.status && err.status >= 400 && err.status < 500 ? err.status : 500 },
    )
  }
}
