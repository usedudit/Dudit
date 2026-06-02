/**
 * Post-payment fulfillment for unified marketplace checkout.
 * Creates bookings, subscriptions idempotently. Financial movements are created
 * by createTransactionFromOrder on payment approval (webhook / manual confirm).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import type {
  CheckoutFulfillmentPayload,
  CheckoutFulfillmentResult,
  ServiceBookingMetadata,
} from "@/lib/types/marketplace-cart"

const STOREFRONT_CHANNEL = "online_storefront"

function computeEndTime(time: string, durationMinutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const endMinutes = h * 60 + m + durationMinutes
  const endH = Math.floor(endMinutes / 60)
  const endM = endMinutes % 60
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
}

async function syncBookingReceivable(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    appointmentId: string
    customerId: string | null
    serviceName: string
    startDate: string
    remaining: number
    paidAmount: number
  },
) {
  if (params.remaining <= 0.009) {
    const ref = `appointment:${params.appointmentId}:receivable`
    await supabase
      .from("transactions")
      .update({ status: "paid", payment_date: new Date().toISOString().slice(0, 10) })
      .eq("partner_id", params.partnerId)
      .eq("reference_note", ref)
      .eq("status", "pending")
    return
  }

  const ref = `appointment:${params.appointmentId}:receivable`
  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(supabase as any, params.partnerId, false)

  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", ref)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    await supabase
      .from("transactions")
      .update({
        amount: params.remaining,
        original_amount: params.remaining,
        status: "pending",
      })
      .eq("id", existing.id)
    return
  }

  const { data: txData } = await supabase
    .from("transactions")
    .insert({
      partner_id: params.partnerId,
      description: params.serviceName,
      category: "Vendas",
      customer_id: params.customerId,
      contact_type: "customer",
      amount: params.remaining,
      due_date: params.startDate,
      payment_date: params.paidAmount > 0.009 ? new Date().toISOString().slice(0, 10) : null,
      transaction_date: `${params.startDate}T12:00:00.000Z`,
      status: "pending",
      payment_type: "Agendamento",
      original_amount: params.remaining,
      fee_amount: 0,
      transaction_type: "income",
      origin: "system",
      reference_note: ref,
      account_id: financeAccountId || null,
    })
    .select("id")
    .single()

  if (txData?.id) {
    await supabase
      .from("appointments")
      .update({ receivable_transaction_id: txData.id })
      .eq("id", params.appointmentId)
  }

  if (params.paidAmount > 0.009) {
    const payRef = `appointment:${params.appointmentId}:payment`
    const { data: existingPay } = await supabase
      .from("transactions")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("reference_note", payRef)
      .maybeSingle()

    if (!existingPay?.id) {
      const { data: paidTx } = await supabase
        .from("transactions")
        .insert({
          partner_id: params.partnerId,
          description: params.serviceName,
          category: "Vendas",
          customer_id: params.customerId,
          contact_type: "customer",
          amount: params.paidAmount,
          due_date: params.startDate,
          payment_date: new Date().toISOString().slice(0, 10),
          transaction_date: new Date().toISOString(),
          status: "paid",
          payment_type: "Agendamento",
          original_amount: params.paidAmount,
          fee_amount: 0,
          transaction_type: "income",
          origin: "system",
          reference_note: payRef,
          account_id: financeAccountId || null,
        })
        .select("id")
        .single()

      if (paidTx?.id) {
        await supabase
          .from("appointments")
          .update({ payment_transaction_id: paidTx.id })
          .eq("id", params.appointmentId)
      }
    }
  }
}

async function createBookingFromMetadata(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    buyerId: string
    buyerEmail?: string | null
    buyerName: string
    buyerPhone?: string | null
    meta: ServiceBookingMetadata
    orderId: string
    paidAmount: number
    fullPrice: number
    paymentStatus: "unpaid" | "partially_paid" | "paid"
  },
): Promise<string> {
  const customerId = await ensureMarketplaceCustomer({
    partnerId: params.partnerId,
    name: params.buyerName,
    email: params.buyerEmail,
    phone: params.buyerPhone || null,
    userId: params.buyerId,
  })

  const endTime = computeEndTime(params.meta.time, params.meta.durationMinutes)

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      partner_id: params.partnerId,
      customer_id: customerId,
      customer_name: params.buyerName,
      service_name: params.meta.serviceName,
      start_date: params.meta.date,
      start_time: params.meta.time,
      end_date: params.meta.date,
      end_time: endTime,
      duration_minutes: params.meta.durationMinutes,
      staff_partner_user_id: params.meta.staffId,
      staff_name: params.meta.staffName,
      price: params.fullPrice,
      paid_amount: params.paidAmount,
      payment_status: params.paymentStatus,
      sales_channel: STOREFRONT_CHANNEL,
      pricing_unit: "Por Serviço",
      notes: params.meta.notes || null,
      status: params.paymentStatus === "paid" ? "Confirmado" : "Reservado",
      source: "appointment",
      marketplace_order_id: params.orderId,
    })
    .select("id")
    .single()

  if (error) throw error
  const appointmentId = appointment.id as string

  const remaining = Math.max(0, params.fullPrice - params.paidAmount)
  await syncBookingReceivable(supabase, {
    partnerId: params.partnerId,
    appointmentId,
    customerId,
    serviceName: params.meta.serviceName,
    startDate: params.meta.date,
    remaining,
    paidAmount: params.paidAmount,
  })

  return appointmentId
}

async function createSubscriptionFromPlan(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    buyerId: string
    buyerEmail?: string | null
    buyerName: string
    buyerPhone?: string | null
    recurringPlanId: string
    orderId: string
    deliveryType: "pickup" | "delivery"
    deliveryAddress?: string | null
    financeAccountId?: string | null
  },
): Promise<{ subscriptionId: string; executionId: string }> {
  const customerId = await ensureMarketplaceCustomer({
    partnerId: params.partnerId,
    name: params.buyerName,
    email: params.buyerEmail,
    phone: params.buyerPhone || null,
    userId: params.buyerId,
  })

  await supabase
    .from("customers")
    .update({ user_id: params.buyerId })
    .eq("id", customerId)
    .is("user_id", null)

  const { data: plan } = await supabase
    .from("recurring_plans")
    .select("id, status, start_date, show_in_marketplace")
    .eq("id", params.recurringPlanId)
    .eq("partner_id", params.partnerId)
    .maybeSingle()

  if (!plan?.id || plan.status !== "active" || !plan.show_in_marketplace) {
    throw new Error("Plano de assinatura indisponível.")
  }

  const { data: existing } = await supabase
    .from("recurring_subscriptions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("customer_id", customerId)
    .eq("recurring_plan_id", params.recurringPlanId)
    .in("status", ["active", "paused"])
    .maybeSingle()

  if (existing?.id) {
    throw new Error("Assinatura já ativa para este plano.")
  }

  const nextExecutionAt = new Date(
    Math.max(Date.now(), new Date(plan.start_date).getTime()),
  ).toISOString()

  const { data: subscription, error: subError } = await supabase
    .from("recurring_subscriptions")
    .insert({
      partner_id: params.partnerId,
      customer_id: customerId,
      recurring_plan_id: params.recurringPlanId,
      status: "active",
      next_execution_at: nextExecutionAt,
      last_execution_at: new Date().toISOString(),
      delivery_type: params.deliveryType,
      delivery_address: params.deliveryAddress || null,
      finance_account_id: params.financeAccountId || null,
      notes: `Assinatura via checkout pedido ${params.orderId}`,
    })
    .select("id")
    .single()

  if (subError) throw subError

  const scheduledFor = new Date().toISOString()
  const { data: execution, error: execError } = await supabase
    .from("recurring_executions")
    .insert({
      subscription_id: subscription.id,
      partner_id: params.partnerId,
      scheduled_for: scheduledFor,
      status: "completed",
      order_id: params.orderId,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (execError) throw execError

  return { subscriptionId: subscription.id as string, executionId: execution.id as string }
}

export async function fulfillMarketplaceOrder(
  supabase: SupabaseClient,
  orderId: string,
  options?: { force?: boolean },
): Promise<{ success: boolean; result?: CheckoutFulfillmentResult; skipped?: boolean; error?: string }> {
  const idempotencyKey = `fulfill:order:${orderId}`

  const { data: existingFulfillment } = await supabase
    .from("checkout_fulfillments")
    .select("id, status, result")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  if (existingFulfillment?.status === "completed") {
    return { success: true, result: (existingFulfillment.result || {}) as CheckoutFulfillmentResult, skipped: true }
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id, partner_id, buyer_id, situation, checkout_fulfillment,
      finance_account_id, customer_name, delivery_type, delivery_address
    `)
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { success: false, error: "Pedido não encontrado." }
  }

  const situation = String(order.situation || "").toLowerCase()
  if (!options?.force && situation !== "paid" && situation !== "approved") {
    return { success: false, error: "Pedido ainda não está pago." }
  }

  const payload = order.checkout_fulfillment as CheckoutFulfillmentPayload | null
  if (!payload?.lines?.length) {
    return { success: true, skipped: true }
  }

  if (!existingFulfillment) {
    await supabase.from("checkout_fulfillments").insert({
      order_id: orderId,
      partner_id: order.partner_id,
      idempotency_key: idempotencyKey,
      status: "pending",
    })
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("user_id", order.buyer_id)
    .maybeSingle()

  const { data: buyerProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", order.buyer_id)
    .maybeSingle()

  const buyerEmail = buyerProfile?.email || null
  const buyerName = profile?.full_name || order.customer_name || buyerEmail?.split("@")[0] || "Cliente"

  const result: CheckoutFulfillmentResult = {
    appointmentIds: [],
    subscriptionIds: [],
    executionIds: [],
  }

  try {
    for (const line of payload.lines) {
      if (
        line.itemType === "service_booking" &&
        line.bookingMetadata &&
        !line.bookingMetadata.instantPurchase &&
        line.bookingMetadata.staffId
      ) {
        const fullPrice = line.fullPrice ?? line.bookingMetadata.price
        const paidAmount = line.payDepositOnly
          ? (line.depositAmount ?? line.unitPrice * line.quantity)
          : line.unitPrice * line.quantity
        const paymentStatus =
          paidAmount >= fullPrice - 0.01
            ? "paid"
            : paidAmount > 0.01
              ? "partially_paid"
              : "unpaid"

        const appointmentId = await createBookingFromMetadata(supabase, {
          partnerId: order.partner_id,
          buyerId: order.buyer_id,
          buyerEmail,
          buyerName,
          buyerPhone: profile?.phone,
          meta: line.bookingMetadata,
          orderId,
          paidAmount,
          fullPrice,
          paymentStatus,
        })
        result.appointmentIds!.push(appointmentId)
      }

      if (line.itemType === "subscription" && line.recurringPlanId) {
        const { subscriptionId, executionId } = await createSubscriptionFromPlan(supabase, {
          partnerId: order.partner_id,
          buyerId: order.buyer_id,
          buyerEmail,
          buyerName,
          buyerPhone: profile?.phone,
          recurringPlanId: line.recurringPlanId,
          orderId,
          deliveryType: (order.delivery_type as "pickup" | "delivery") || payload.deliveryType || "pickup",
          deliveryAddress: order.delivery_address || payload.deliveryAddress,
          financeAccountId: order.finance_account_id,
        })
        result.subscriptionIds!.push(subscriptionId)
        result.executionIds!.push(executionId)
      }
    }

    await supabase
      .from("checkout_fulfillments")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("idempotency_key", idempotencyKey)

    return { success: true, result }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao concluir fulfillment"
    await supabase
      .from("checkout_fulfillments")
      .update({ status: "failed", error_message: message })
      .eq("idempotency_key", idempotencyKey)
    return { success: false, error: message }
  }
}
