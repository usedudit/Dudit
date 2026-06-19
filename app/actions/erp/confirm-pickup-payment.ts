"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateOrders } from "@/lib/utils/revalidation"

export async function confirmPickupPaymentAction(params: {
  orderId: string
  paymentMethod: "cash" | "pix" | "card" | "other"
}) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }

  await requirePermission(ctx.partnerId, "orders", "edit")

  const supabase = await getSupabaseServerClient()
  const adminClient = createAdminClient()

  const { data: order } = await adminClient
    .from("orders")
    .select("id, order_number, situation, total_amount, partner_id")
    .eq("id", params.orderId)
    .eq("partner_id", ctx.partnerId)
    .single()

  if (!order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.situation !== "awaiting_pickup_payment") {
    return { error: "Este pedido não está aguardando pagamento na retirada" }
  }

  const now = new Date().toISOString()
  const paymentMethodLabels: Record<string, string> = {
    cash: "Dinheiro",
    pix: "Pix",
    card: "Cartão",
    other: "Outro",
  }

  const { error: updateError } = await adminClient
    .from("orders")
    .update({
      situation: "paid",
      paid_at: now,
      payment_method_at_pickup: params.paymentMethod,
      amount_paid: order.total_amount,
      paid_amount: order.total_amount,
    })
    .eq("id", params.orderId)
    .eq("situation", "awaiting_pickup_payment")

  if (updateError) {
    return { error: `Erro ao confirmar pagamento: ${updateError.message}` }
  }

  await logAuditEvent({
    partnerId: ctx.partnerId,
    actorUserId: user.id,
    entityType: "order",
    entityId: params.orderId,
    actionType: "payment_confirmed_at_pickup",
    changeLines: [
      `confirmou pagamento na retirada: ${paymentMethodLabels[params.paymentMethod]}`,
    ],
    metadata: {
      paymentMethod: params.paymentMethod,
      amount: order.total_amount,
    },
    source: "manual",
  })

  try {
    const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
    await createTransactionFromOrder(adminClient, {
      order_number: order.order_number || order.id,
      partner_id: ctx.partnerId,
      total_amount: order.total_amount,
      payment_method: paymentMethodLabels[params.paymentMethod],
      payment_provider: "pickup",
      payment_date: now,
      payment_breakdown: [{ method: paymentMethodLabels[params.paymentMethod], amount: order.total_amount }],
      customer_contact_id: null,
      customer_name: null,
    })
  } catch (txErr: any) {
    console.error("Erro ao criar transação para pagamento na retirada:", txErr.message)
  }

  try {
    const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
    await fulfillMarketplaceOrder(adminClient, params.orderId)
  } catch (fulfillErr: any) {
    console.error("Erro ao processar fulfillment:", fulfillErr.message)
  }

  try {
    const { onOrderStatusChanged } = await import("@/lib/services/notification-automation.service")
    const { data: fullOrder } = await adminClient
      .from("orders")
      .select("id, order_number, partner_id, buyer_id, customer_name, total_amount, delivery_status, situation")
      .eq("id", params.orderId)
      .single()
    if (fullOrder) {
      onOrderStatusChanged(fullOrder, "paid", undefined, { skipPartnerTeam: true }).catch(console.error)
    }
  } catch {}

  await revalidateOrders(ctx.partnerId)

  return { success: true }
}
