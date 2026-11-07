import { getAdminClient } from "@/lib/supabase/admin"
import {
  findSuperFreteIntegration as getSuperFreteIntegration,
  buildSuperFreteClient as createClientFromIntegration,
} from "@/lib/services/shipping/superfrete-integration"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateOrderHistory } from "@/lib/utils/revalidation"
import { getCarrierStatusLabel } from "@/lib/orders/carrier-status"

export type CarrierLabelCancelResult =
  | { success: true; cancelled: true }
  | { success: false; cancelled: false; error: string; alreadyPosted?: boolean }

const POSTED_STATUSES = ["posted", "in_transit", "delivered"]

/**
 * Cancela uma etiqueta de transportadora (SuperFrete) e marca o envio como
 * cancelado. Usado pelo cancelamento de pedido e pelo menu de etiqueta.
 */
export async function cancelCarrierLabelForOrder(params: {
  partnerId: string
  orderId: string
  labelId: string
  reason: string
  currentStatus?: string | null
  /** Usuário que solicitou o cancelamento (para o histórico do pedido). */
  actorUserId?: string | null
  /** Limite por chamada à SuperFrete. Usado pelo cron para caber no orçamento. */
  timeoutMs?: number
}): Promise<CarrierLabelCancelResult> {
  const { partnerId, orderId, labelId, reason } = params
  const cleanReason = String(reason || "").trim()
  if (!labelId) {
    return { success: false, cancelled: false, error: "Etiqueta não encontrada." }
  }

  const status = String(params.currentStatus || "").trim()
  if (status === "cancelled") {
    return { success: true, cancelled: true }
  }
  if (POSTED_STATUSES.includes(status)) {
    return {
      success: false,
      cancelled: false,
      alreadyPosted: true,
      error: "A etiqueta já foi postada pela transportadora. Aguarde a conclusão da entrega para solicitar troca ou devolução.",
    }
  }

  const supabase = getAdminClient()
  const integration = await getSuperFreteIntegration(supabase, partnerId)
  const client = createClientFromIntegration(integration)
  if (!client) {
    return { success: false, cancelled: false, error: "SuperFrete não conectado." }
  }

  try {
    await client.cancelOrder(labelId, cleanReason, params.timeoutMs)
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase()
    const isNotFound =
      err?.status === 404 ||
      msg.includes("pedido não encontrado") ||
      msg.includes("não encontrado") ||
      msg.includes("orders.0")
    if (!isNotFound) {
      const message = err?.message || "Erro ao cancelar etiqueta."
      return { success: false, cancelled: false, error: message }
    }
    // Se a etiqueta já não existia na SuperFrete (expirada, apagada ou sandbox),
    // prossegue para marcar como cancelada localmente sem travar o pedido.
  }

  const cancelledAt = new Date().toISOString()
  const { data: shipmentRow } = await supabase
    .from("order_shipments")
    .select("id, status, payload")
    .eq("partner_id", partnerId)
    .eq("order_id", orderId)
    .eq("external_label_id", labelId)
    .maybeSingle()

  const previousStatus = shipmentRow?.status || status || null
  const previousPayload = (shipmentRow?.payload as Record<string, unknown> | null) || {}

  const { error: updateError } = await supabase
    .from("order_shipments")
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt,
      payload: {
        ...previousPayload,
        cancel_reason: cleanReason || null,
        cancelled_at: cancelledAt,
        cancelled_by: params.actorUserId || null,
      },
    })
    .eq("partner_id", partnerId)
    .eq("order_id", orderId)
    .eq("external_label_id", labelId)

  if (updateError) {
    return { success: false, cancelled: false, error: updateError.message }
  }

  // Registra o cancelamento (e o motivo) no histórico do pedido. Sem isso a
  // timeline só mostrava mudanças de status cruas, em inglês, e o motivo
  // informado pelo lojista era perdido.
  const reasonLine = cleanReason
    ? `cancelou a etiqueta de frete. Motivo: ${cleanReason}`
    : "cancelou a etiqueta de frete."
  const statusLine =
    previousStatus && previousStatus !== "cancelled"
      ? `status do envio: ${getCarrierStatusLabel(previousStatus)} -> Cancelado.`
      : null

  await Promise.all([
    logAuditEvent({
      partnerId,
      actorUserId: params.actorUserId || null,
      entityType: "order",
      entityId: orderId,
      actionType: "shipping_label_cancelled",
      changeLines: statusLine ? [reasonLine, statusLine] : [reasonLine],
      metadata: {
        shipment_id: shipmentRow?.id || null,
        label_id: labelId,
        reason: cleanReason || null,
        from_status: previousStatus,
        to_status: "cancelled",
      },
      source: "user",
    }),
    revalidateOrderHistory(orderId),
  ])

  return { success: true, cancelled: true }
}
