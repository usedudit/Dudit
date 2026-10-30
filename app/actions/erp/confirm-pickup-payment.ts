"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireStorePermission, requireUser } from "@/lib/auth/authorization"
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
    .select("id, order_number, situation, total_amount, partner_id, store_id, customer_id, buyer_id")
    .eq("id", params.orderId)
    .eq("partner_id", ctx.partnerId)
    .single()

  if (!order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.store_id) {
    await requireStorePermission(order.store_id, ctx.partnerId, "orders", "edit")
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
  if (!Object.prototype.hasOwnProperty.call(paymentMethodLabels, params.paymentMethod)) {
    return { error: "Forma de pagamento inválida" }
  }

  const { data: updatedOrder, error: updateError } = await adminClient
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
    .select("id")
    .maybeSingle()

  if (updateError || !updatedOrder) {
    if (!updateError && !updatedOrder) return { error: "O pedido já foi atualizado por outra operação. Recarregue a tela." }
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
    const { createTransactionFromOrder, syncReceivableForOrder } = await import("@/lib/services/transaction.service")
    await createTransactionFromOrder(adminClient, {
      order_id: params.orderId,
      order_number: order.order_number || order.id,
      partner_id: ctx.partnerId,
      store_id: order.store_id || null,
      total_amount: order.total_amount,
      payment_method: paymentMethodLabels[params.paymentMethod],
      payment_provider: "pickup",
      payment_date: now,
      payment_breakdown: [{ method: paymentMethodLabels[params.paymentMethod], amount: order.total_amount }],
      customer_id: order.customer_id || order.buyer_id || null,
      customer_name: null,
    })

    // Recebível pendente criado na abertura do pedido: sem isto, a transação
    // "A receber" ficaria órfã depois do pagamento confirmado na retirada.
    await syncReceivableForOrder(adminClient, {
      order_number: order.order_number || order.id,
      partner_id: ctx.partnerId,
      store_id: order.store_id || null,
      total_amount: Number(order.total_amount || 0),
      paid_amount: Number(order.total_amount || 0),
      situation: "paid",
      payment_method: paymentMethodLabels[params.paymentMethod],
      customer_id: order.customer_id || order.buyer_id || null,
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
      onOrderStatusChanged(fullOrder, "paid", undefined, "manual").catch(console.error)
    }
  } catch {}

  await revalidateOrders(ctx.partnerId)

  return { success: true }
}
