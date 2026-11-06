import { revalidateOrders, revalidateOrderHistory } from "@/lib/utils/revalidation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import {
  SUPERFRETE_LABEL_STATUS,
  SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS,
  SUPERFRETE_WEBHOOK_STATUS_TO_SHIPMENT_STATUS,
} from "@/lib/services/shipping/superfrete"

export interface SuperFreteShipmentSnapshot {
  id: string
  order_id: string
  partner_id: string
  kind?: string | null
  return_request_id?: string | null
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  payload?: Record<string, unknown> | null
}

export interface SuperFreteStatusData {
  /** Status cru da SuperFrete (pending, released, generated, posted, delivered, canceled...) */
  status?: string | null
  /** Evento recebido (order.posted, order.delivered...) ou "reconcile" no cron */
  event?: string | null
  tracking?: string | null
  trackingUrl?: string | null
  paidAt?: string | null
  createdAt?: string | null
  generatedAt?: string | null
  postedAt?: string | null
  deliveredAt?: string | null
  canceledAt?: string | null
}

export interface SuperFreteStatusSyncResult {
  shipmentStatus: string | null
  deliveryStatus: string | null
  updated: boolean
}

// Ordem dos status de entrega da Dudit - usada para impedir regressão
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

/**
 * Aplica um status da SuperFrete em order_shipments + orders + devolução.
 * Compartilhado entre o webhook (tempo real) e o cron de reconciliação
 * (eventos perdidos quando a SuperFrete esgota as 5 tentativas de reenvio).
 */
export async function applySuperFreteShipmentStatus(params: {
  supabase: any
  shipment: SuperFreteShipmentSnapshot
  data: SuperFreteStatusData
  source: "webhook" | "system"
}): Promise<SuperFreteStatusSyncResult> {
  const { supabase, shipment, data, source } = params
  const nowIso = new Date().toISOString()

  const rawStatus = typeof data.status === "string" ? data.status : ""
  const shipmentStatus = SUPERFRETE_WEBHOOK_STATUS_TO_SHIPMENT_STATUS[rawStatus] || null
  const deliveryStatus = shipmentStatus
    ? SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[shipmentStatus] || null
    : SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[rawStatus] || null

  let updated = false
  let statusChanged = false
  let trackingChanged = false
  let orderChanged = false
  let returnChanged = false
  const shipmentPatch: Record<string, unknown> = {}

  if (
    shipmentStatus &&
    shipmentStatus !== shipment.status &&
    canMoveShipmentStatus(shipment.status, shipmentStatus)
  ) {
    shipmentPatch.status = shipmentStatus
    statusChanged = true
  }

  if (data.tracking) {
    const nextTrackingUrl =
      data.trackingUrl || `https://rastreio.superfrete.com/#/tracking/${data.tracking}`
    if (shipment.tracking_number !== data.tracking) {
      trackingChanged = true
    }
    if (
      shipment.tracking_number !== data.tracking ||
      shipment.tracking_url !== nextTrackingUrl
    ) {
      shipmentPatch.tracking_number = data.tracking
      shipmentPatch.tracking_url = nextTrackingUrl
    }
  }

  if (data.paidAt) {
    shipmentPatch.paid_at = data.paidAt
  }
  if (data.createdAt) {
    shipmentPatch.requested_at = data.createdAt
  }
  if (shipmentStatus === "delivered") {
    shipmentPatch.delivered_at = data.deliveredAt || nowIso
  }
  if (shipmentStatus === "cancelled") {
    shipmentPatch.cancelled_at = data.canceledAt || nowIso
  }
  if (data.postedAt || data.generatedAt || data.event) {
    shipmentPatch.payload = {
      ...(shipment.payload || {}),
      ...(data.postedAt ? { posted_at: data.postedAt } : {}),
      ...(data.generatedAt ? { generated_at: data.generatedAt } : {}),
      last_event: data.event,
      last_event_at: nowIso,
    }
  }

  if (Object.keys(shipmentPatch).length > 0) {
    await supabase
      .from("order_shipments")
      .update(shipmentPatch)
      .eq("id", shipment.id)
      .eq("partner_id", shipment.partner_id)
    updated = true
  }

  // Reverse shipments (buyer -> store) never change the order's own
  // delivery status - only outbound labels (store -> buyer) do.
  // Preenche os mesmos campos do fluxo de delivery padrão da Dudit
  // (delivery_departure_at / delivery_arrived_at / delivery_completed_at).
  if (deliveryStatus && shipment.kind !== "return") {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("delivery_status, delivery_departure_at, delivery_arrived_at, delivery_completed_at")
      .eq("id", shipment.order_id)
      .eq("partner_id", shipment.partner_id)
      .maybeSingle()

    if (canMoveDeliveryStatus(orderRow?.delivery_status, deliveryStatus)) {
      const orderPatch: Record<string, unknown> = {}
      if (deliveryStatus !== orderRow?.delivery_status) {
        orderPatch.delivery_status = deliveryStatus
      }
      if (shipmentStatus === "posted" && !orderRow?.delivery_departure_at) {
        orderPatch.delivery_departure_at = data.postedAt || nowIso
      }
      if (shipmentStatus === "delivered") {
        if (!orderRow?.delivery_arrived_at) {
          orderPatch.delivery_arrived_at = data.deliveredAt || nowIso
        }
        if (!orderRow?.delivery_completed_at) {
          orderPatch.delivery_completed_at = data.deliveredAt || nowIso
        }
      }
      if (Object.keys(orderPatch).length > 0) {
        await supabase
          .from("orders")
          .update(orderPatch)
          .eq("id", shipment.order_id)
          .eq("partner_id", shipment.partner_id)
        updated = true
        orderChanged = true
      }
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
        source,
        metadata: {
          shipment_id: shipment.id,
          event: data.event,
          tracking_number: data.tracking || null,
        },
      })
      updated = true
      returnChanged = true
    }
  }

  // Webhook sempre registra o evento. A reconciliação só registra quando
  // houve mudança real, para não poluir a timeline a cada ciclo do cron.
  const shouldLog =
    source === "webhook" || statusChanged || trackingChanged || orderChanged || returnChanged

  if (shouldLog) {
    // A timeline do pedido é lida em português: nunca gravar o status cru da
    // SuperFrete ("released", "posted" etc.) na linha do histórico.
    const rawStatusLabel = shipmentStatus || rawStatus
    const statusLabel =
      SUPERFRETE_LABEL_STATUS[rawStatusLabel] || rawStatusLabel || "atualizado"

    await logAuditEvent({
      partnerId: shipment.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: shipment.order_id,
      actionType: "shipping_status_updated",
      changeLines: [
        shipment.kind === "return"
          ? `Status da etiqueta de devolução atualizado para "${statusLabel}".`
          : `Status de frete atualizado para "${statusLabel}".`,
      ],
      source,
      metadata: {
        shipment_id: shipment.id,
        shipment_status: shipmentStatus || rawStatus,
        shipment_status_label: statusLabel,
        shipment_kind: shipment.kind,
        delivery_status: deliveryStatus,
        tracking_number: data.tracking,
        event: data.event,
        origin: source === "system" ? "reconcile" : "webhook",
      },
    })
    await revalidateOrderHistory(shipment.order_id)
  }

  // Só invalida cache quando algo realmente mudou (evita churn no cron).
  if (statusChanged || trackingChanged || orderChanged || returnChanged) {
    await revalidateOrders(shipment.partner_id)
  }

  return { shipmentStatus, deliveryStatus, updated }
}
