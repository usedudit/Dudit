/**
 * Post-payment fulfillment for unified marketplace checkout.
 * Creates bookings, subscriptions idempotently. Financial movements are created
 * by createTransactionFromOrder on payment approval (webhook / manual confirm).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import type {
  CheckoutFulfillmentPayload,
  CheckoutFulfillmentResult,
  LineFulfillmentMode,
  ServiceBookingMetadata,
} from "@/lib/types/marketplace-cart"
import { isStaffSlotAvailable } from "@/lib/commerce/scheduling-availability"
import { syncAppointmentReceivable } from "@/lib/services/appointment-receivable"
import { onMarketplaceOrderPaid } from "@/lib/services/marketplace-metrics.service"

const STOREFRONT_CHANNEL = "online_storefront"

function computeEndTime(time: string, durationMinutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const endMinutes = h * 60 + m + durationMinutes
  const endH = Math.floor(endMinutes / 60)
  const endM = endMinutes % 60
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
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
    fulfillmentMode?: LineFulfillmentMode | null
    bufferMinutes?: number
  },
): Promise<{ appointmentId: string | null; needsReschedule: boolean }> {
  const customerId = await ensureMarketplaceCustomer({
    partnerId: params.partnerId,
    name: params.buyerName,
    email: params.buyerEmail,
    phone: params.buyerPhone || null,
    userId: params.buyerId,
  })

  const slotOk = await isStaffSlotAvailable(supabase, {
    partnerId: params.partnerId,
    staffId: params.meta.staffId,
    date: params.meta.date,
    startTime: params.meta.time,
    durationMinutes: params.meta.durationMinutes,
    bufferMinutes: params.bufferMinutes ?? 0,
  })

  const endTime = computeEndTime(params.meta.time, params.meta.durationMinutes)

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, customer_id, needs_reschedule")
    .eq("marketplace_order_id", params.orderId)
    .eq("partner_id", params.partnerId)
    .eq("service_name", params.meta.serviceName)
    .eq("start_date", params.meta.date)
    .eq("start_time", params.meta.time)
    .eq("staff_partner_user_id", params.meta.staffId)
    .maybeSingle()

  if (existing?.id) {
    const needsReschedule = Boolean(existing.needs_reschedule)
    const remaining = Math.max(0, params.fullPrice - params.paidAmount)
    const receivableId = await syncAppointmentReceivable({
      supabase,
      partnerId: params.partnerId,
      appointmentId: existing.id as string,
      customerId: existing.customer_id,
      serviceName: params.meta.serviceName,
      startDate: params.meta.date,
      remaining,
      paidAmount: params.paidAmount,
    })

    const updatePayload: Record<string, unknown> = {
      paid_amount: params.paidAmount,
      payment_status: params.paymentStatus,
      fulfillment_mode:
        params.fulfillmentMode === "customer_location" ? "customer_location" : "on_site",
      needs_reschedule: needsReschedule,
      status: needsReschedule
        ? "Reservado"
        : (params.paymentStatus === "paid" || params.paymentStatus === "partially_paid")
          ? "Confirmado"
          : "Reservado",
    }
    if (receivableId) updatePayload.receivable_transaction_id = receivableId

    await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", existing.id)

    return { appointmentId: existing.id as string, needsReschedule }
  }

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
      fulfillment_mode:
        params.fulfillmentMode === "customer_location" ? "customer_location" : "on_site",
      needs_reschedule: !slotOk,
      pricing_unit: "Por Serviço",
      notes: params.meta.notes || null,
      status: !slotOk
        ? "Reservado"
        : (params.paymentStatus === "paid" || params.paymentStatus === "partially_paid")
          ? "Confirmado"
          : "Reservado",
      source: "appointment",
      marketplace_order_id: params.orderId,
    })
    .select("id")
    .single()

  if (error) throw error
  const appointmentId = appointment.id as string

  const remaining = Math.max(0, params.fullPrice - params.paidAmount)
  const receivableId = await syncAppointmentReceivable({
    supabase,
    partnerId: params.partnerId,
    appointmentId,
    customerId,
    serviceName: params.meta.serviceName,
    startDate: params.meta.date,
    remaining,
    paidAmount: params.paidAmount,
  })

  if (receivableId) {
    await supabase
      .from("appointments")
      .update({ receivable_transaction_id: receivableId })
      .eq("id", appointmentId)
  }

  return { appointmentId, needsReschedule: !slotOk }
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
      sales_channel: STOREFRONT_CHANNEL,
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

  const idempotencyKey = `fulfill:order:${orderId}`

  const { data: existingFulfillment } = await supabase
    .from("checkout_fulfillments")
    .select("id, status, result")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  const situation = String(order.situation || "").toLowerCase()
  const payload = order.checkout_fulfillment as CheckoutFulfillmentPayload | null
  const expectedScheduledServices = (payload?.lines || []).filter(
    (line) =>
      line.itemType === "service_booking" &&
      line.bookingMetadata &&
      !line.bookingMetadata.instantPurchase &&
      line.bookingMetadata.staffId,
  ).length

  if (existingFulfillment?.status === "completed") {
    const appointmentIds = (existingFulfillment.result as CheckoutFulfillmentResult)?.appointmentIds || []
    if (situation === "paid" || situation === "approved") {
      if (appointmentIds.length >= expectedScheduledServices && payload?.lines) {
        for (const line of payload.lines) {
          if (line.itemType === "service_booking" && line.bookingMetadata) {
            const fullPrice = line.fullPrice ?? line.bookingMetadata.price
            const paidAmount = line.payDepositOnly
              ? (line.depositAmount ?? line.unitPrice * line.quantity)
              : line.unitPrice * line.quantity
            const paymentStatus = line.payDepositOnly ? "partially_paid" : "paid"
            
            await supabase
              .from("appointments")
              .update({
                paid_amount: paidAmount,
                payment_status: paymentStatus,
                status: "Confirmado"
              })
              .eq("marketplace_order_id", orderId)

            const remaining = Math.max(0, fullPrice - paidAmount)
            const { data: appts } = await supabase
              .from("appointments")
              .select("id, customer_id")
              .eq("marketplace_order_id", orderId)
            
            for (const appt of appts || []) {
              const receivableId = await syncAppointmentReceivable({
                supabase,
                partnerId: order.partner_id,
                appointmentId: appt.id,
                customerId: appt.customer_id,
                serviceName: line.bookingMetadata.serviceName,
                startDate: line.bookingMetadata.date,
                remaining,
                paidAmount,
              })
              if (receivableId) {
                await supabase
                  .from("appointments")
                  .update({ receivable_transaction_id: receivableId })
                  .eq("id", appt.id)
              }
            }
          }
        }
      }
    }
    if (appointmentIds.length >= expectedScheduledServices) {
      if (situation === "paid" || situation === "approved") {
        await onMarketplaceOrderPaid(supabase, orderId)
      }
      return { success: true, result: (existingFulfillment.result || {}) as CheckoutFulfillmentResult, skipped: true }
    }
  }

  if (!options?.force && situation !== "paid" && situation !== "approved") {
    return { success: false, error: "Pedido ainda não está pago." }
  }

  if (!payload?.lines?.length) {
    if (situation === "paid" || situation === "approved") {
      await onMarketplaceOrderPaid(supabase, orderId)
    }
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
        const isOrderPaid = situation === "paid" || situation === "approved"
        const fullPrice = line.fullPrice ?? line.bookingMetadata.price
        const paidAmount = isOrderPaid
          ? (line.payDepositOnly
              ? (line.depositAmount ?? line.unitPrice * line.quantity)
              : line.unitPrice * line.quantity)
          : 0
        const paymentStatus = isOrderPaid
          ? (line.payDepositOnly ? "partially_paid" : "paid")
          : "unpaid"

        const bookingResult = await createBookingFromMetadata(supabase, {
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
          fulfillmentMode: line.fulfillmentMode,
        })

        if (bookingResult.needsReschedule) {
          result.rescheduleRequired = result.rescheduleRequired || []
          result.rescheduleRequired.push({
            serviceName: line.bookingMetadata.serviceName,
            date: line.bookingMetadata.date,
            time: line.bookingMetadata.time,
          })
        } else if (bookingResult.appointmentId) {
          result.appointmentIds!.push(bookingResult.appointmentId)
        }

        if (bookingResult.appointmentId && line.bookingMetadata) {
          const { serviceName, date, time } = line.bookingMetadata
          import("@/lib/services/notification-automation.service")
            .then(({ notifyAppointmentCreatedFromMarketplace }) =>
              notifyAppointmentCreatedFromMarketplace({
                partnerId: order.partner_id,
                appointmentId: bookingResult.appointmentId!,
                customerName: buyerName,
                serviceName,
                startDate: date,
                startTime: time,
                customerId: null,
                marketplaceOrderId: orderId,
                storeName: undefined,
              }),
            )
            .catch(console.error)
        }
      }

      if (line.itemType === "subscription" && line.recurringPlanId) {
        const subDeliveryType =
          line.fulfillmentMode === "delivery" ? "delivery" : "pickup"
        const { subscriptionId, executionId } = await createSubscriptionFromPlan(supabase, {
          partnerId: order.partner_id,
          buyerId: order.buyer_id,
          buyerEmail,
          buyerName,
          buyerPhone: profile?.phone,
          recurringPlanId: line.recurringPlanId,
          orderId,
          deliveryType: subDeliveryType,
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

    if (situation === "paid" || situation === "approved") {
      await onMarketplaceOrderPaid(supabase, orderId)
    }

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
