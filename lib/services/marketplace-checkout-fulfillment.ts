/**
 * Post-payment fulfillment for unified marketplace checkout.
 * Creates bookings, subscriptions idempotently. Financial movements are created
 * by createTransactionFromOrder on payment approval (webhook / manual confirm).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrderPaidAmount } from "@/lib/payments/order-financial-state"
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
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"

const STOREFRONT_CHANNEL = "online_storefront"

// Marketplace order sources - orders created via marketplace checkout have these sources
const marketplaceOrderSources = new Set(["vitrine online", "marketplace", "online store"])
function isMarketplaceOrderSource(orderSource: string | undefined): boolean {
  return marketplaceOrderSources.has((orderSource || "").toLowerCase().trim())
}

function isPaymentConfirmedForFulfillment(order: {
  situation?: string | null
  paid_amount?: number | null
  amount_paid?: number | null
}): boolean {
  const situation = String(order.situation || "").toLowerCase()
  if (situation === "paid" || situation === "approved") return true
  if (getOrderPaidAmount(order) > 0.009 && (situation === "partially_paid" || situation === "pending" || situation === "in_process")) {
    return true
  }
  return false
}

function computeEndTime(time: string, durationMinutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const endMinutes = h * 60 + m + durationMinutes
  const endH = Math.floor(endMinutes / 60)
  const endM = endMinutes % 60
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
}

type GroupedService = {
  serviceName: string
  serviceId?: string | null
  fullPrice: number
  durationMinutes: number
  notes?: string | null
  storeId?: string
  payDepositOnly?: boolean
  depositAmount?: number | null
  unitPrice: number
  quantity: number
}

type ServiceGroup = {
  key: string
  staffId: string
  staffName: string
  date: string
  time: string
  fulfillmentMode: LineFulfillmentMode | null
  services: GroupedService[]
  totalPrice: number
  totalDuration: number
}

function groupServiceBookingLines(
  lines: Array<{
    bookingMetadata?: ServiceBookingMetadata | null
    fulfillmentMode?: LineFulfillmentMode | null
    serviceId?: string | null
    fullPrice?: number | null
    unitPrice: number
    quantity: number
    payDepositOnly?: boolean
    depositAmount?: number | null
  }>,
): ServiceGroup[] {
  const groups = new Map<string, ServiceGroup>()

  for (const line of lines) {
    if (!line.bookingMetadata) continue
    const meta = line.bookingMetadata
    const mode = line.fulfillmentMode || null
    const key = `${meta.staffId}|${meta.date}|${meta.time}|${mode}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        staffId: meta.staffId,
        staffName: meta.staffName,
        date: meta.date,
        time: meta.time,
        fulfillmentMode: mode,
        services: [],
        totalPrice: 0,
        totalDuration: 0,
      })
    }

    const group = groups.get(key)!
    const fullPrice = line.fullPrice ?? meta.price
    group.services.push({
      serviceName: meta.serviceName,
      serviceId: line.serviceId,
      fullPrice,
      durationMinutes: meta.durationMinutes,
      notes: meta.notes,
      storeId: meta.storeId,
      payDepositOnly: line.payDepositOnly,
      depositAmount: line.depositAmount ?? undefined,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })
    group.totalPrice += fullPrice
    group.totalDuration += meta.durationMinutes
  }

  return Array.from(groups.values())
}

async function createBookingFromMetadata(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    buyerId: string
    buyerEmail?: string | null
    buyerName: string
    buyerPhone?: string | null
    customerId?: string | null
    financeAccountId?: string | null
    meta: ServiceBookingMetadata
    orderId: string
    paidAmount: number
    fullPrice: number
    paymentStatus: "unpaid" | "partially_paid" | "paid"
    fulfillmentMode?: LineFulfillmentMode | null
    bufferMinutes?: number
    paymentMethod?: string | null
  },
): Promise<{ appointmentId: string | null; needsReschedule: boolean }> {
  const customerId = params.customerId || await ensureMarketplaceCustomer({
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
    storeId: params.meta.storeId || null,
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
      paymentMethod: params.paymentMethod,
      financeAccountId: params.financeAccountId,
    })

    const updatePayload: Record<string, unknown> = {
      store_id: params.meta.storeId || null,
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
      store_id: params.meta.storeId || null,
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
    paymentMethod: params.paymentMethod,
    financeAccountId: params.financeAccountId,
  })

  if (receivableId) {
    await supabase
      .from("appointments")
      .update({ receivable_transaction_id: receivableId })
      .eq("id", appointmentId)
  }

  return { appointmentId, needsReschedule: !slotOk }
}

async function createGroupedBookingFromMetadata(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    buyerId: string
    buyerEmail?: string | null
    buyerName: string
    buyerPhone?: string | null
    customerId?: string | null
    financeAccountId?: string | null
    group: ServiceGroup
    orderId: string
    paidAmount: number
    paymentStatus: "unpaid" | "partially_paid" | "paid"
    paymentMethod?: string | null
  },
): Promise<{ appointmentId: string | null; needsReschedule: boolean }> {
  const customerId = params.customerId || await ensureMarketplaceCustomer({
    partnerId: params.partnerId,
    name: params.buyerName,
    email: params.buyerEmail,
    phone: params.buyerPhone || null,
    userId: params.buyerId,
  })

  const slotOk = await isStaffSlotAvailable(supabase, {
    partnerId: params.partnerId,
    staffId: params.group.staffId,
    date: params.group.date,
    startTime: params.group.time,
    durationMinutes: params.group.totalDuration,
    bufferMinutes: 0,
    storeId: params.group.services[0]?.storeId || null,
  })

  const endTime = computeEndTime(params.group.time, params.group.totalDuration)
  const combinedServiceName = params.group.services.map((s) => s.serviceName).join(", ")

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, customer_id, needs_reschedule")
    .eq("marketplace_order_id", params.orderId)
    .eq("partner_id", params.partnerId)
    .eq("staff_partner_user_id", params.group.staffId)
    .eq("start_date", params.group.date)
    .eq("start_time", params.group.time)
    .maybeSingle()

  if (existing?.id) {
    const needsReschedule = Boolean(existing.needs_reschedule)
    const remaining = Math.max(0, params.group.totalPrice - params.paidAmount)
    const receivableId = await syncAppointmentReceivable({
      supabase,
      partnerId: params.partnerId,
      appointmentId: existing.id as string,
      customerId: existing.customer_id,
      serviceName: combinedServiceName,
      startDate: params.group.date,
      remaining,
      paidAmount: params.paidAmount,
      paymentMethod: params.paymentMethod,
      financeAccountId: params.financeAccountId,
    })

    const updatePayload: Record<string, unknown> = {
      store_id: params.group.services[0]?.storeId || null,
      service_name: combinedServiceName,
      paid_amount: params.paidAmount,
      payment_status: params.paymentStatus,
      price: params.group.totalPrice,
      duration_minutes: params.group.totalDuration,
      end_time: endTime,
      fulfillment_mode:
        params.group.fulfillmentMode === "customer_location" ? "customer_location" : "on_site",
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

    const { data: existingItems } = await supabase
      .from("appointment_items")
      .select("id, service_id, name")
      .eq("appointment_id", existing.id)

    const existingServiceIds = new Set((existingItems || []).map((i: any) => i.service_id).filter(Boolean))
    const newServiceIds = params.group.services.map((s) => s.serviceId).filter(Boolean)

    const needsItemSync = newServiceIds.some((id) => !existingServiceIds.has(id)) ||
      (existingItems || []).length !== params.group.services.length

    if (needsItemSync) {
      await supabase.from("appointment_items").delete().eq("appointment_id", existing.id)
      const items = params.group.services.map((s) => ({
        appointment_id: existing.id,
        service_id: s.serviceId || null,
        name: s.serviceName,
        quantity: 1,
        usage_type: "reference",
      }))
      await supabase.from("appointment_items").insert(items)
    }

    return { appointmentId: existing.id as string, needsReschedule }
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      partner_id: params.partnerId,
      store_id: params.group.services[0]?.storeId || null,
      customer_id: customerId,
      customer_name: params.buyerName,
      service_name: combinedServiceName,
      start_date: params.group.date,
      start_time: params.group.time,
      end_date: params.group.date,
      end_time: endTime,
      duration_minutes: params.group.totalDuration,
      staff_partner_user_id: params.group.staffId,
      staff_name: params.group.staffName,
      price: params.group.totalPrice,
      paid_amount: params.paidAmount,
      payment_status: params.paymentStatus,
      sales_channel: STOREFRONT_CHANNEL,
      fulfillment_mode:
        params.group.fulfillmentMode === "customer_location" ? "customer_location" : "on_site",
      needs_reschedule: !slotOk,
      pricing_unit: "Por Serviço",
      notes: params.group.services[0]?.notes || null,
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

  const items = params.group.services.map((s) => ({
    appointment_id: appointmentId,
    service_id: s.serviceId || null,
    name: s.serviceName,
    quantity: 1,
    usage_type: "reference",
  }))
  await supabase.from("appointment_items").insert(items)

  const remaining = Math.max(0, params.group.totalPrice - params.paidAmount)
  const receivableId = await syncAppointmentReceivable({
    supabase,
    partnerId: params.partnerId,
    appointmentId,
    customerId,
    serviceName: combinedServiceName,
    startDate: params.group.date,
    remaining,
    paidAmount: params.paidAmount,
    paymentMethod: params.paymentMethod,
    financeAccountId: params.financeAccountId,
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
      id, partner_id, buyer_id, store_id, situation, customer_id, checkout_fulfillment,
      order_source, finance_account_id, customer_name, delivery_type, delivery_address, payment_method,
      paid_amount, amount_paid
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
  const serviceBookingLines = (payload?.lines || []).filter(
    (line) =>
      line.itemType === "service_booking" &&
      line.bookingMetadata &&
      !line.bookingMetadata.instantPurchase &&
      line.bookingMetadata.staffId,
  )
  const serviceGroups = groupServiceBookingLines(serviceBookingLines)
  const expectedGroups = serviceGroups.length

  const paymentConfirmed = isPaymentConfirmedForFulfillment(order)

  const isMarketplace = isMarketplaceOrderSource(order.order_source)

  if (existingFulfillment?.status === "completed") {
    const appointmentIds = (existingFulfillment.result as CheckoutFulfillmentResult)?.appointmentIds || []
    if (paymentConfirmed) {
      if (appointmentIds.length >= expectedGroups && payload?.lines) {
        for (const group of serviceGroups) {
          const groupPaidAmount = paymentConfirmed
            ? group.services.reduce((sum, s) => {
                return sum + (s.payDepositOnly
                  ? (s.depositAmount ?? s.unitPrice * s.quantity)
                  : s.unitPrice * s.quantity)
              }, 0)
            : 0
          const groupPaymentStatus = !paymentConfirmed
            ? "unpaid"
            : group.services.some((s) => s.payDepositOnly) || situation === "partially_paid"
              ? "partially_paid"
              : "paid"

          await supabase
            .from("appointments")
            .update({
              paid_amount: groupPaidAmount,
              payment_status: groupPaymentStatus,
              status: "Confirmado",
            })
            .eq("marketplace_order_id", orderId)
            .eq("staff_partner_user_id", group.staffId)
            .eq("start_date", group.date)
            .eq("start_time", group.time)

          const remaining = Math.max(0, group.totalPrice - groupPaidAmount)
          const { data: appts } = await supabase
            .from("appointments")
            .select("id, customer_id")
            .eq("marketplace_order_id", orderId)
            .eq("staff_partner_user_id", group.staffId)
            .eq("start_date", group.date)
            .eq("start_time", group.time)

          for (const appt of appts || []) {
            const receivableId = await syncAppointmentReceivable({
              supabase,
              partnerId: order.partner_id,
              appointmentId: appt.id,
              customerId: appt.customer_id,
              serviceName: group.services.map((s) => s.serviceName).join(", "),
              startDate: group.date,
              remaining,
              paidAmount: groupPaidAmount,
              paymentMethod: order.payment_method,
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
    if (appointmentIds.length >= expectedGroups) {
      if (isMarketplace && paymentConfirmed) {
        await onMarketplaceOrderPaid(supabase, orderId)
      }
      return { success: true, result: (existingFulfillment.result || {}) as CheckoutFulfillmentResult, skipped: true }
    }
  }

  if (!options?.force && !paymentConfirmed) {
    return { success: false, error: "Pedido ainda não está pago." }
  }

  if (!payload?.lines?.length) {
    if (isMarketplace && paymentConfirmed) {
      await onMarketplaceOrderPaid(supabase, orderId)
    }
    return { success: true, skipped: true }
  }

  if (!existingFulfillment) {
    await supabase.from("checkout_fulfillments").insert({
      order_id: orderId,
      partner_id: order.partner_id,
      store_id: order.store_id,
      idempotency_key: idempotencyKey,
      status: "pending",
    })
  }


  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("user_id", order.buyer_id)
    .maybeSingle()

  let resolvedCustomerId = (order as any).customer_id as string | null
  let buyerEmail: string | null = null

  if (!resolvedCustomerId) {
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(order.buyer_id)
      buyerEmail = authData?.user?.email || null
    } catch (err) {
      console.error("Error fetching buyer email from auth.users:", err)
    }
  }

  const buyerName = profile?.full_name || order.customer_name || buyerEmail?.split("@")[0] || "Cliente"

  if (!resolvedCustomerId) {
    try {
      resolvedCustomerId = await ensureMarketplaceCustomer({
        partnerId: order.partner_id,
        name: buyerName,
        email: buyerEmail,
        phone: profile?.phone || null,
        userId: order.buyer_id,
      })
    } catch (custErr) {
      console.error("Error ensuring marketplace customer in fulfillMarketplaceOrder:", custErr)
    }
  }

  const result: CheckoutFulfillmentResult = {
    appointmentIds: [],
    subscriptionIds: [],
    executionIds: [],
  }

  try {
    const bookingResults = await Promise.all(
      serviceGroups.map(async (group) => {
        addMonitoringBreadcrumb({ domain: "orders", message: "fulfillment.started", metadata: { entityId: orderId } })

        const groupPaidAmount = paymentConfirmed
          ? group.services.reduce((sum, s) => {
              return sum + (s.payDepositOnly
                ? (s.depositAmount ?? s.unitPrice * s.quantity)
                : s.unitPrice * s.quantity)
            }, 0)
          : 0
        const groupPaymentStatus = !paymentConfirmed
          ? "unpaid"
          : group.services.some((s) => s.payDepositOnly) || situation === "partially_paid"
            ? "partially_paid"
            : "paid"

        const bookingResult = await createGroupedBookingFromMetadata(supabase, {
          partnerId: order.partner_id,
          buyerId: order.buyer_id,
          buyerEmail,
          buyerName,
          buyerPhone: profile?.phone,
          customerId: resolvedCustomerId,
          financeAccountId: order.finance_account_id,
          group,
          orderId,
          paidAmount: groupPaidAmount,
          paymentStatus: groupPaymentStatus,
          paymentMethod: order.payment_method,
        })

        return { group, bookingResult }
      })
    )

    const hasProductLines = payload.lines.some(
      (line) => (line.itemType as string) === "product" || (line.itemType as string) === "variant",
    )
    const isMixedOrder = hasProductLines && serviceBookingLines.length > 0

    for (const { group, bookingResult } of bookingResults) {
      if (bookingResult.needsReschedule) {
        result.rescheduleRequired = result.rescheduleRequired || []
        for (const svc of group.services) {
          result.rescheduleRequired.push({
            serviceName: svc.serviceName,
            date: group.date,
            time: group.time,
          })
        }
      } else if (bookingResult.appointmentId) {
        result.appointmentIds!.push(bookingResult.appointmentId)

        if (order.payment_method === "Assinatura (Créditos)" || order.payment_method === "subscription_credits") {
          const { data: customer } = await supabase
            .from("customers")
            .select("id")
            .eq("partner_id", order.partner_id)
            .eq("marketplace_user_id", order.buyer_id)
            .maybeSingle()

          if (customer?.id) {
            for (const svc of group.services) {
              const { data: svcRow } = await supabase
                .from("services")
                .select("id")
                .eq("partner_id", order.partner_id)
                .eq("name", svc.serviceName)
                .maybeSingle()

              if (svcRow?.id) {
                const { consumeSubscriptionCredits } = await import("@/lib/services/credit.service")
                await consumeSubscriptionCredits(supabase, {
                  partnerId: order.partner_id,
                  customerId: customer.id,
                  serviceId: svcRow.id,
                  quantity: svc.quantity,
                  orderId: order.id,
                  appointmentId: bookingResult.appointmentId,
                  idempotencyKey: `checkout:credits:${order.id}:${bookingResult.appointmentId}:${svc.serviceName}`,
                })
              }
            }
          }
        }
      }

      if (bookingResult.appointmentId && !isMixedOrder) {
        const combinedServiceName = group.services.map((s) => s.serviceName).join(", ")
        const firstStoreId = group.services[0]?.storeId
        import("@/lib/services/notification-automation.service")
          .then(({ notifyAppointmentCreatedFromMarketplace }) =>
            notifyAppointmentCreatedFromMarketplace({
              partnerId: order.partner_id,
              customerName: buyerName,
              serviceName: combinedServiceName,
              startDate: group.date,
              startTime: group.time,
              staffPartnerUserId: group.staffId,
              storeId: firstStoreId || null,
              appointmentId: bookingResult.appointmentId!,
            })
          )
          .catch((err) => console.error("[fulfillment] notifyAppointmentCreatedFromMarketplace error:", err))
      }
    }

    const subscriptionLines = payload.lines.filter(
      (line) => line.itemType === "subscription" && line.recurringPlanId
    )
    for (const line of subscriptionLines) {
      const subDeliveryType =
        line.fulfillmentMode === "delivery" ? "delivery" : "pickup"
      const { subscriptionId, executionId } = await createSubscriptionFromPlan(supabase, {
        partnerId: order.partner_id,
        buyerId: order.buyer_id,
        buyerEmail,
        buyerName,
        buyerPhone: profile?.phone,
        recurringPlanId: line.recurringPlanId!,
        orderId,
        deliveryType: subDeliveryType,
        deliveryAddress: order.delivery_address || payload.deliveryAddress,
        financeAccountId: order.finance_account_id,
      })
      result.subscriptionIds!.push(subscriptionId)
      result.executionIds!.push(executionId)
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

    if (isMarketplace && paymentConfirmed) {
      await onMarketplaceOrderPaid(supabase, orderId)
    }

    return { success: true, result }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao concluir fulfillment"
    captureError(e, {
      module: "orders",
      action: "marketplace_fulfillment",
      entityId: orderId,
      metadata: { idempotencyKey },
    })
    await supabase
      .from("checkout_fulfillments")
      .update({ status: "failed", error_message: message })
      .eq("idempotency_key", idempotencyKey)
    return { success: false, error: message }
  }
}
