import { getAdminClient } from "@/lib/supabase/admin"
import {
  findSuperFreteIntegration as getSuperFreteIntegration,
  buildSuperFreteClient as createClientFromIntegration,
} from "@/lib/services/shipping/superfrete-integration"

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
  /** Limite por chamada à SuperFrete. Usado pelo cron para caber no orçamento. */
  timeoutMs?: number
}): Promise<CarrierLabelCancelResult> {
  const { partnerId, orderId, labelId, reason } = params
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
    await client.cancelOrder(labelId, reason, params.timeoutMs)
  } catch (err: any) {
    const message = err?.message || "Erro ao cancelar etiqueta."
    return { success: false, cancelled: false, error: message }
  }

  const { error: updateError } = await supabase
    .from("order_shipments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("partner_id", partnerId)
    .eq("order_id", orderId)
    .eq("external_label_id", labelId)

  if (updateError) {
    return { success: false, cancelled: false, error: updateError.message }
  }

  return { success: true, cancelled: true }
}
