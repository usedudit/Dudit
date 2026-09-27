import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { verifySuperFreteWebhookSignature } from "@/lib/services/shipping/superfrete"
import { decrypt } from "@/lib/cryptoService"
import { captureError } from "@/lib/monitoring/sentry"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS } from "@/lib/services/shipping/superfrete"
import { logAuditEvent } from "@/lib/services/timeline.service"

const SUPERFRETE_PROVIDER = "superfrete"

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
  const { id: superfreteOrderId, status, tracking, tracking_url } = data

  if (!event || !superfreteOrderId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const supabase = getAdminClient()

    const { data: shipments } = await supabase
      .from("order_shipments")
      .select("id, order_id, partner_id, integration_id, provider_slug, kind")
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .eq("external_label_id", superfreteOrderId)

    if (!shipments || shipments.length === 0) {
      return NextResponse.json({ message: "Shipment not found, skipping" }, { status: 200 })
    }

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

      const deliveryStatus = SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[status] || null

      const shipmentPatch: Record<string, unknown> = {
        status,
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
      if (status === "delivered") {
        shipmentPatch.delivered_at = new Date().toISOString()
      }
      if (status === "cancelled") {
        shipmentPatch.cancelled_at = new Date().toISOString()
      }

      await supabase
        .from("order_shipments")
        .update(shipmentPatch)
        .eq("id", shipment.id)
        .eq("partner_id", shipment.partner_id)

      // Reverse shipments (buyer -> store) never change the order's own
      // delivery status — only outbound labels (store -> buyer) do.
      if (deliveryStatus && shipment.kind !== "return") {
        await supabase
          .from("orders")
          .update({ delivery_status: deliveryStatus })
          .eq("id", shipment.order_id)
          .eq("partner_id", shipment.partner_id)
      }

      await logAuditEvent({
        partnerId: shipment.partner_id,
        actorUserId: null,
        entityType: "order",
        entityId: shipment.order_id,
        actionType: "shipping_status_updated",
        changeLines: [
          shipment.kind === "return"
            ? `Status da etiqueta de devolução atualizado para: ${status}`
            : `Status de frete atualizado para: ${status}`,
        ],
        source: "webhook",
        metadata: {
          shipment_id: shipment.id,
          shipment_status: status,
          shipment_kind: shipment.kind,
          delivery_status: deliveryStatus,
          tracking_number: tracking,
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
