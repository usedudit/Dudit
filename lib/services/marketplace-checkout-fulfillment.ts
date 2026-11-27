/**
 * Post-payment fulfillment for unified marketplace checkout.
 * Creates bookings, subscriptions idempotently. Financial movements are created
 * by createTransactionFromOrder on payment approval (webhook / manual confirm).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrderPaidAmount, getOrderTotalAmount } from "@/lib/payments/order-financial-state"
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
import { createMpPreapproval } from "@/lib/services/mercadopago/partner-preapproval"
import {
  computeNextExecutionAt,
  toMpFrequency,
} from "@/lib/services/recurring/frequency"
import { resolveSubscriptionShipping } from "@/lib/services/recurring/shipping"
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"
import { increment_usage_counter } from "@/lib/services/subscription.service"

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

/**
 * PostgrestError (returned by supabase-js) is a plain object, not an Error
 * instance. Without this, every database failure would be reported as the
 * generic "Erro ao concluir fulfillment", hiding the real cause.
 */
function describeFulfillmentError(error: unknown): string {
  if (error instanceof Error) return error.message

  if (error && typeof error === "object") {
    const err = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }
    const parts: string[] = []
    if (typeof err.message === "string" && err.message.trim()) parts.push(err.message.trim())
    if (typeof err.details === "string" && err.details.trim()) parts.push(err.details.trim())
    if (typeof err.hint === "string" && err.hint.trim()) parts.push(`hint: ${err.hint.trim()}`)
    if (typeof err.code === "string" && err.code.trim()) parts.push(`(${err.code.trim()})`)
    if (parts.length > 0) return parts.join(" ")

    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== "{}") return serialized
    } catch {
      // ignore circular structures
    }
  }

  if (typeof error === "string" && error.trim()) return error.trim()
  return "Erro ao concluir fulfillment"
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
  /** True when the time was inferred (booking metadata was lost) and must be rescheduled. */
  needsReschedule?: boolean
}

/**
 * Resolves how much of a service group was actually paid.
 * Deposit-enabled lines used to always be marked as partially paid, even when
 * the customer paid the full order (common when the sinal is just an option).
 */
function resolveGroupPayment(params: {
  paymentConfirmed: boolean
  orderFullyPaid: boolean
  orderPaidAmount?: number
  situation: string
  group: ServiceGroup
}): { paidAmount: number; paymentStatus: "unpaid" | "partially_paid" | "paid" } {
  if (!params.paymentConfirmed) return { paidAmount: 0, paymentStatus: "unpaid" }

  const hasDepositLine = params.group.services.some((s) => s.payDepositOnly)
  const paidAmount = params.orderFullyPaid
    ? params.group.totalPrice
    : hasDepositLine
      ? params.group.services.reduce((sum, s) => {
          return sum + (s.payDepositOnly ? (s.depositAmount ?? s.unitPrice * s.quantity) : s.unitPrice * s.quantity)
        }, 0)
      : params.situation === "partially_paid" && typeof params.orderPaidAmount === "number"
        ? Math.min(params.group.totalPrice, Math.max(0, params.orderPaidAmount))
        : params.group.services.reduce((sum, s) => sum + s.unitPrice * s.quantity, 0)

  const paymentStatus: "unpaid" | "partially_paid" | "paid" = params.orderFullyPaid
    ? "paid"
    : (hasDepositLine || params.situation === "partially_paid")
      ? "partially_paid"
      : "paid"

  return { paidAmount, paymentStatus }
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

async function resolveAppointmentItemsFromServices(
  supabase: SupabaseClient,
  partnerId: string,
  appointmentId: string,
  services: Array<{
    serviceName: string
    serviceId?: string | null
    quantity?: number
  }>,
): Promise<Array<{
  appointment_id: string
  service_id: string | null
  product_id: string | null
  variant_id: string | null
  name: string
  quantity: number
  usage_type: "consumed" | "returnable" | "reference"
}>> {
  if (!services || services.length === 0) return []

  const serviceIds = Array.from(new Set(services.map((s) => s.serviceId).filter(Boolean) as string[]))
  const serviceNames = Array.from(new Set(services.map((s) => s.serviceName).filter(Boolean)))

  const dbServices: Array<{ id: string; name: string; resources: any }> = []

  if (serviceIds.length > 0) {
    const { data: byIds, error: byIdsErr } = await supabase
      .from("services")
      .select("id, name, resources")
      .eq("partner_id", partnerId)
      .in("id", serviceIds)
    if (!byIdsErr && byIds) dbServices.push(...byIds)
  }

  const unmatchedNames = serviceNames.filter(
    (name) => !dbServices.some((s) => s.name?.trim().toLowerCase() === name.trim().toLowerCase())
  )

  if (unmatchedNames.length > 0) {
    const { data: byNames, error: byNamesErr } = await supabase
      .from("services")
      .select("id, name, resources")
      .eq("partner_id", partnerId)
      .in("name", unmatchedNames)
    if (!byNamesErr && byNames) dbServices.push(...byNames)
  }

  const items: Array<{
    appointment_id: string
    service_id: string | null
    product_id: string | null
    variant_id: string | null
    name: string
    quantity: number
    usage_type: "consumed" | "returnable" | "reference"
  }> = []

  for (const svc of services) {
    const dbSvc = dbServices.find(
      (s) =>
        (svc.serviceId && s.id === svc.serviceId) ||
        (s.name && s.name.trim().toLowerCase() === svc.serviceName.trim().toLowerCase())
    )
    if (!dbSvc || !Array.isArray(dbSvc.resources) || dbSvc.resources.length === 0) {
      // Service has no items/resources configured -> do not create any appointment_items!
      continue
    }

    const svcQty = Math.max(1, Number(svc.quantity || 1))
    for (const res of dbSvc.resources) {
      if (!res || !res.name || typeof res.name !== "string" || !res.name.trim()) continue

      const itemQty = Math.max(1, Number(res.quantity || 1) * svcQty)
      const usageType: "consumed" | "returnable" | "reference" =
        res.usage_type === "returnable" || res.usage_type === "reference" ? res.usage_type : "consumed"

      items.push({
        appointment_id: appointmentId,
        service_id: dbSvc.id || svc.serviceId || null,
        product_id: res.product_id || null,
        variant_id: res.variant_id || null,
        name: res.name.trim(),
        quantity: itemQty,
        usage_type: usageType,
      })
    }
  }

  return items
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

    const { error: updateError } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", existing.id)

    if (updateError) throw updateError

    const resolvedItems = await resolveAppointmentItemsFromServices(
      supabase,
      params.partnerId,
      existing.id as string,
      [{
        serviceName: params.meta.serviceName,
        serviceId: (params.meta as any).serviceId || null,
        quantity: 1,
      }],
    )
    await supabase.from("appointment_items").delete().eq("appointment_id", existing.id)
    if (resolvedItems.length > 0) {
      await supabase.from("appointment_items").insert(resolvedItems)
    }

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

  increment_usage_counter(params.partnerId, "appointments_month_count").catch(console.error)

  const items = await resolveAppointmentItemsFromServices(
    supabase,
    params.partnerId,
    appointmentId,
    [{
      serviceName: params.meta.serviceName,
      serviceId: (params.meta as any).serviceId || null,
      quantity: 1,
    }],
  )
  if (items.length > 0) {
    await supabase.from("appointment_items").insert(items)
  }

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
  const needsReschedule = Boolean(params.group.needsReschedule) || !slotOk

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
    const needsReschedule = Boolean(existing.needs_reschedule) || Boolean(params.group.needsReschedule)
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

    const { error: updateError } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", existing.id)

    if (updateError) throw updateError

    const resolvedItems = await resolveAppointmentItemsFromServices(
      supabase,
      params.partnerId,
      existing.id as string,
      params.group.services,
    )

    // Sync appointment items: delete old items and only insert if the services have actual configured resources
    await supabase.from("appointment_items").delete().eq("appointment_id", existing.id)
    if (resolvedItems.length > 0) {
      await supabase.from("appointment_items").insert(resolvedItems)
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
      needs_reschedule: needsReschedule,
      pricing_unit: "Por Serviço",
      notes: params.group.services[0]?.notes || null,
      status: needsReschedule
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

  increment_usage_counter(params.partnerId, "appointments_month_count").catch(console.error)

  const items = await resolveAppointmentItemsFromServices(
    supabase,
    params.partnerId,
    appointmentId,
    params.group.services,
  )
  if (items.length > 0) {
    await supabase.from("appointment_items").insert(items)

    if (items.some((i) => i.product_id)) {
      try {
        const { handleAppointmentItemsStockMovement } = await import("@/app/actions/erp/appointment-items")
        await handleAppointmentItemsStockMovement({
          appointmentId,
          partnerId: params.partnerId,
          oldStatus: null,
          newStatus: needsReschedule
            ? "Reservado"
            : (params.paymentStatus === "paid" || params.paymentStatus === "partially_paid")
              ? "Confirmado"
              : "Reservado",
          userId: params.buyerId,
          storeId: params.group.services[0]?.storeId || null,
          paymentStatus: params.paymentStatus,
          paidAmount: params.paidAmount,
          price: params.group.totalPrice,
        })
      } catch (stockErr) {
        console.error("[marketplace fulfillment] stock movement error:", stockErr)
      }
    }
  }

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
    /** orders.delivery_fee ja resolvido no checkout (fonte do snapshot) */
    deliveryFee?: number | null
    /** orders.delivery_breakdown ja resolvido no checkout */
    deliveryBreakdown?: Record<string, unknown> | null
  },
): Promise<{ subscriptionId: string; executionId: string }> {
  // O plano e' a fonte da verdade: buscamos primeiro (sem filtrar pelo
  // partner_id vindo do checkout) e usamos o partner proprio do plano.
  const { data: plan, error: planError } = await supabase
    .from("recurring_plans")
    .select(
      "id, name, status, price, start_date, show_in_marketplace, billing_mode, frequency_type, frequency_interval, weekdays, day_of_month, use_last_day, year_month, year_day, shipping_mode, shipping_flat_amount, fulfillment_modes, store_id, partner_id",
    )
    .eq("id", params.recurringPlanId)
    .maybeSingle()

  if (planError) throw planError
  if (!plan?.id) throw new Error("Plano de assinatura não encontrado.")
  if (plan.status !== "active") throw new Error("Este plano não está mais ativo para novas assinaturas.")
  if (!plan.show_in_marketplace) throw new Error("Este plano não está disponível para novas assinaturas.")

  // Modalidades do plano: so' entrega quando o plano aceita entrega etc.
  const planModes = normalizeFulfillmentModes(plan.fulfillment_modes, ["delivery", "pickup"])
  if (!planModes.includes(params.deliveryType)) {
    throw new Error(
      params.deliveryType === "delivery"
        ? "Este plano é somente para retirada no local."
        : "Este plano é somente para entrega e não aceita retirada.",
    )
  }

  const partnerId = String(plan.partner_id || params.partnerId)

  const customerId = await ensureMarketplaceCustomer({
    partnerId,
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

  // Frete: resolvido UMA vez aqui e congelado na assinatura. A cobranca dos
  // ciclos seguintes nunca re-cota.
  const shipping = resolveSubscriptionShipping({
    deliveryType: params.deliveryType,
    shippingMode: plan.shipping_mode,
    shippingFlatAmount: plan.shipping_flat_amount,
    deliveryFee: params.deliveryFee,
    deliveryBreakdown: params.deliveryBreakdown,
  })

  if (!shipping.resolved) {
    throw new Error("Endereço fora da área de entrega.")
  }

  const { data: existing } = await supabase
    .from("recurring_subscriptions")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("customer_id", customerId)
    .eq("recurring_plan_id", params.recurringPlanId)
    .in("status", ["active", "paused"])
    .maybeSingle()

  if (existing?.id) {
    throw new Error("Assinatura já ativa para este plano.")
  }

  // A RPC sempre devolve uma data posterior a currentRun: sem isso a execucao
  // vencedora do ciclo 1 reagendaria a si mesma para "agora" e geraria uma
  // cobranca dupla minutos depois.
  const nextExecutionAt = await computeNextExecutionAt(supabase, plan, new Date())

  const { data: subscription, error: subError } = await supabase
    .from("recurring_subscriptions")
    .insert({
      partner_id: partnerId,
      store_id: plan.store_id || null,
      customer_id: customerId,
      recurring_plan_id: params.recurringPlanId,
      status: "active",
      billing_mode: plan.billing_mode === "auto_mercado_pago" ? "auto_mercado_pago" : "manual",
      next_execution_at: nextExecutionAt,
      last_execution_at: new Date().toISOString(),
      delivery_type: params.deliveryType,
      delivery_address: params.deliveryAddress || null,
      finance_account_id: params.financeAccountId || null,
      shipping_amount: shipping.amount,
      shipping_source: shipping.source,
      shipping_quoted_at: new Date().toISOString(),
      carrier_service_id: shipping.carrierServiceId,
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
      partner_id: partnerId,
      scheduled_for: scheduledFor,
      status: "completed",
      order_id: params.orderId,
      completed_at: new Date().toISOString(),
      // Ciclo 1 registra o frete EFETIVAMENTE cobrado no pedido (o snapshot da
      // assinatura pode diferir quando um cupom de frete foi aplicado).
      shipping_amount: Number(params.deliveryFee ?? 0),
    })
    .select("id")
    .single()

  if (execError) throw execError

  // Ciclo 1 ja foi pago no checkout: os creditos de servico do plano ficam
  // disponiveis imediatamente (mesmo fluxo do grantCreditsForCycle dos ciclos
  // seguintes). Best-effort: nao pode reverter a assinatura ja criada.
  if (customerId) {
    try {
      const { grantSubscriptionCredits } = await import("@/lib/services/credit.service")
      const granted = await grantSubscriptionCredits(supabase, {
        partnerId,
        customerId,
        subscriptionId: subscription.id as string,
        executionId: execution.id as string,
        nextExecutionAt,
      })
      if (!granted.success) {
        console.error("[marketplace fulfillment] grantSubscriptionCredits falhou:", granted.error)
      }
    } catch (creditErr) {
      console.error("[marketplace fulfillment] grantSubscriptionCredits erro:", creditErr)
    }
  }

  // Ciclo 1 ja foi pago no checkout da Dudit: o preapproval do MP cobrara a
  // partir do proximo ciclo (nextExecutionAt).
  if (plan.billing_mode === "auto_mercado_pago" && Number(plan.price || 0) + shipping.amount > 0) {
    await linkMpPreapproval(supabase, {
      partnerId,
      subscriptionId: subscription.id as string,
      payerEmail: params.buyerEmail,
      planName: plan.name || "Plano de assinatura",
      amount: Number(plan.price) + shipping.amount,
      frequencyPlan: plan,
      startDate: nextExecutionAt,
    })
  }

  return { subscriptionId: subscription.id as string, executionId: execution.id as string }
}

async function linkMpPreapproval(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    subscriptionId: string
    payerEmail?: string | null
    planName: string
    amount: number
    frequencyPlan: {
      frequency_type?: string | null
      frequency_interval?: number | null
      start_date?: string | null
      weekdays?: number[] | null
      day_of_month?: number | null
      use_last_day?: boolean | null
      year_month?: number | null
      year_day?: number | null
    }
    startDate: string
  },
): Promise<void> {
  try {
    const { frequency, frequency_type } = toMpFrequency(params.frequencyPlan)
    const preapproval = await createMpPreapproval({
      partnerId: params.partnerId,
      payerEmail: params.payerEmail || "cliente@dudit.com.br",
      planName: params.planName,
      amount: params.amount,
      frequency,
      frequencyType: frequency_type,
      externalReference: params.subscriptionId,
      startDate: params.startDate,
    })

    await supabase
      .from("recurring_subscriptions")
      .update({
        mp_preapproval_id: preapproval.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.subscriptionId)
  } catch (e: unknown) {
    // A assinatura e o pedido ja existem; sem o preapproval os ciclos seguintes
    // nao serao cobrados automaticamente, mas o checkout nao pode falhar.
    console.error("[linkMpPreapproval] Falha ao criar preapproval no Mercado Pago:", e)
    captureError(e, {
      module: "marketplace",
      action: "create_subscription_preapproval",
      entityId: params.subscriptionId,
      metadata: { partnerId: params.partnerId },
    })
    // Avisa o lojista na timeline da assinatura: sem preapproval os proximos
    // ciclos saem como cobranca manual (A combinar) em vez de automaticos.
    try {
      const { logAuditEvent } = await import("@/lib/services/timeline.service")
      await logAuditEvent({
        partnerId: params.partnerId,
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: params.subscriptionId,
        actionType: "updated",
        changeLines: [
          "falha ao ativar a cobrança automática no Mercado Pago: os próximos ciclos serão gerados como cobrança manual (A combinar).",
        ],
        source: "system",
      })
    } catch (auditErr) {
      console.error("[linkMpPreapproval] Falha ao registrar aviso na timeline:", auditErr)
    }
  }
}

async function resolveFallbackStaff(
  supabase: SupabaseClient,
  partnerId: string,
  storeId: string | null,
  preferredPartnerUserId?: string | null,
): Promise<{ id: string; name: string } | null> {
  const { data: activeUsers } = await supabase
    .from("partner_users")
    .select("id, user_id, role_id, role, is_active, created_at")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })

  const users = (activeUsers || []) as Array<{
    id: string
    user_id?: string | null
    role_id?: string | null
    role?: string | null
  }>
  if (users.length === 0) return null

  let chosen = preferredPartnerUserId
    ? users.find((u) => u.id === preferredPartnerUserId)
    : undefined

  if (!chosen && storeId) {
    const { data: members } = await supabase
      .from("store_members")
      .select("partner_user_id")
      .eq("store_id", storeId)
    const memberIds = new Set((members || []).map((m: any) => m.partner_user_id))
    chosen = users.find((u) => memberIds.has(u.id))
  }

  if (!chosen) {
    chosen =
      users.find((u) => u.role_id === "owner") ||
      users.find((u) => u.role?.toLowerCase() === "owner") ||
      users[0]
  }

  let name = "Equipe"
  if (chosen?.user_id) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", chosen.user_id)
      .maybeSingle()
    if (profile?.full_name) name = profile.full_name
  }

  return { id: chosen.id, name }
}

/**
 * Rebuilds a booking group from `order_items` when
 * `checkout_fulfillment.lines` was lost (older deposit writes replaced the whole
 * column). The original date/time/staff cannot be recovered, so the group is
 * flagged `needsReschedule` and gets a placeholder slot on the order day.
 */
async function reconstructServiceGroupsFromOrderItems(
  supabase: SupabaseClient,
  order: {
    id: string
    partner_id: string
    store_id?: string | null
    seller_partner_user_id?: string | null
    created_at?: string | null
  },
): Promise<ServiceGroup[]> {
  const { data: items, error } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, product_price, quantity, subtotal, line_type, service_id, fulfillment_mode")
    .eq("order_id", order.id)

  if (error) {
    console.error("[fulfillment] could not load order_items for fallback booking:", error)
    return []
  }

  const serviceItems = (items || []).filter(
    (item: any) =>
      item.line_type === "service_booking" ||
      (!item.product_id && item.service_id),
  )
  if (serviceItems.length === 0) return []

  const serviceIds = Array.from(
    new Set(serviceItems.map((item: any) => item.service_id).filter(Boolean)),
  ) as string[]

  const servicesById = new Map<string, any>()
  if (serviceIds.length > 0) {
    const { data: services } = await supabase
      .from("services")
      .select("id, name, duration_minutes, store_id")
      .eq("partner_id", order.partner_id)
      .in("id", serviceIds)
    for (const service of services || []) servicesById.set(service.id, service)
  }

  const storeId =
    order.store_id ||
    Array.from(servicesById.values()).find((service) => service?.store_id)?.store_id ||
    null

  const staff = await resolveFallbackStaff(
    supabase,
    order.partner_id,
    storeId,
    order.seller_partner_user_id || null,
  )
  if (!staff) {
    console.error("[fulfillment] fallback booking skipped: no staff found for partner", order.partner_id)
    return []
  }

  const createdAt = order.created_at ? new Date(order.created_at) : new Date()
  const validCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
  const date = validCreatedAt.toISOString().slice(0, 10)
  const time = "09:00"

  const groupedServices: GroupedService[] = serviceItems.map((item: any) => {
    const service = item.service_id ? servicesById.get(item.service_id) : null
    const quantity = Math.max(1, Number(item.quantity || 1))
    const unitPrice = Number(item.product_price || 0)
    const duration = Math.max(1, Number(service?.duration_minutes || 30))
    return {
      serviceName: service?.name || item.product_name || "Serviço",
      serviceId: item.service_id || null,
      fullPrice: Number(item.subtotal ?? unitPrice * quantity) || unitPrice * quantity,
      durationMinutes: duration * quantity,
      notes: null,
      storeId: service?.store_id || storeId || undefined,
      unitPrice,
      quantity,
    }
  })

  const totalPrice = groupedServices.reduce((sum, service) => sum + service.fullPrice, 0)
  const totalDuration = groupedServices.reduce((sum, service) => sum + service.durationMinutes, 0)

  return [
    {
      key: `fallback|${staff.id}|${date}|${time}`,
      staffId: staff.id,
      staffName: staff.name,
      date,
      time,
      fulfillmentMode:
        (serviceItems[0] as any)?.fulfillment_mode === "customer_location"
          ? "customer_location"
          : "on_site",
      services: groupedServices,
      totalPrice,
      totalDuration,
      needsReschedule: true,
    },
  ]
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
      paid_amount, amount_paid, total_amount, delivery_fee, delivery_breakdown,
      seller_partner_user_id, created_at
    `)
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { success: false, error: "Pedido não encontrado." }
  }

  const isMarketplace =
    isMarketplaceOrderSource(order.order_source) ||
    Boolean((order.checkout_fulfillment as any)?.lines?.length) ||
    Boolean((order.checkout_fulfillment as any)?.depositCheckout)

  // Pedidos que não pertencem ao marketplace (ex.: pedidos manuais do ERP, vendas de balcão)
  // não devem ser processados pelo fulfillment do marketplace nem ter agendamentos criados automaticamente.
  if (!isMarketplace) {
    return { success: true, skipped: true }
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
  let serviceGroups = groupServiceBookingLines(serviceBookingLines)

  const paymentConfirmed = isPaymentConfirmedForFulfillment(order)
  const orderPaidAmount = getOrderPaidAmount(order)
  const orderTotalAmount = getOrderTotalAmount(order)
  const orderFullyPaid =
    orderTotalAmount > 0.005 && orderPaidAmount >= orderTotalAmount - 0.005

  // Older deposit writes replaced the whole `checkout_fulfillment` column and
  // erased `lines`, so a paid order can arrive here without booking metadata
  // even though its `order_items` still describe the service. Rebuild the
  // booking group (flagged for reschedule) instead of silently skipping it.
  // NEVER run this fallback for non-deposit orders or manual orders.
  let existingOrderAppointmentIds: string[] = []
  const isDepositCheckoutWithoutLines =
    Boolean((order.checkout_fulfillment as any)?.depositCheckout) &&
    !(payload?.lines || []).length

  if (isMarketplace && paymentConfirmed && serviceGroups.length === 0 && isDepositCheckoutWithoutLines) {
    const { data: orderAppointments } = await supabase
      .from("appointments")
      .select("id")
      .eq("marketplace_order_id", orderId)
      .eq("partner_id", order.partner_id)

    if (orderAppointments && orderAppointments.length > 0) {
      existingOrderAppointmentIds = orderAppointments.map((appointment: any) => appointment.id as string)
    } else {
      serviceGroups = await reconstructServiceGroupsFromOrderItems(supabase, {
        id: orderId,
        partner_id: order.partner_id,
        store_id: order.store_id,
        seller_partner_user_id: (order as any).seller_partner_user_id,
        created_at: (order as any).created_at,
      })
    }
  }

  const expectedGroups = serviceGroups.length + existingOrderAppointmentIds.length



  if (existingFulfillment?.status === "completed") {
    const appointmentIds = (existingFulfillment.result as CheckoutFulfillmentResult)?.appointmentIds || []
    if (paymentConfirmed) {
      if (appointmentIds.length >= expectedGroups && serviceGroups.length > 0) {
        for (const group of serviceGroups) {
          const { paidAmount: groupPaidAmount, paymentStatus: groupPaymentStatus } = resolveGroupPayment({
            paymentConfirmed,
            orderFullyPaid,
            orderPaidAmount,
            situation,
            group,
          })

          await supabase
            .from("appointments")
            .update({
              paid_amount: groupPaidAmount,
              payment_status: groupPaymentStatus,
              needs_reschedule: Boolean(group.needsReschedule),
              status: group.needsReschedule ? "Reservado" : "Confirmado",
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

  if (!payload?.lines?.length && serviceGroups.length === 0 && existingOrderAppointmentIds.length === 0) {
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


  const { data: profile } = order.buyer_id
    ? await supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", order.buyer_id)
      .maybeSingle()
    : { data: null }

  let resolvedCustomerId = (order as any).customer_id as string | null
  let buyerEmail: string | null = null

  if (!resolvedCustomerId && order.buyer_id) {
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
    appointmentIds: [...existingOrderAppointmentIds],
    subscriptionIds: [],
    executionIds: [],
  }

  try {
    const bookingResults = await Promise.all(
      serviceGroups.map(async (group) => {
        addMonitoringBreadcrumb({ domain: "orders", message: "fulfillment.started", metadata: { entityId: orderId } })

        const { paidAmount: groupPaidAmount, paymentStatus: groupPaymentStatus } = resolveGroupPayment({
          paymentConfirmed,
          orderFullyPaid,
          orderPaidAmount,
          situation,
          group,
        })

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

    const hasProductLines = (payload?.lines || []).some(
      (line) => (line.itemType as string) === "product" || (line.itemType as string) === "variant",
    )
    const isMixedOrder = hasProductLines && serviceGroups.length > 0

    for (const { group, bookingResult } of bookingResults) {
      // Always record the created appointment (including reschedule-pending ones)
      // so `checkout_fulfillments` can be marked completed and stays idempotent.
      if (bookingResult.appointmentId) {
        result.appointmentIds!.push(bookingResult.appointmentId)
      }

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
        if (order.payment_method === "Assinatura (Créditos)" || order.payment_method === "subscription_credits") {
          const { data: customer } = await supabase
            .from("customers")
            .select("id")
            .eq("partner_id", order.partner_id)
            .eq("marketplace_user_id", order.buyer_id)
            .maybeSingle()

          if (customer?.id) {
            for (const svc of group.services) {
              let serviceId: string | null = svc.serviceId || null

              if (!serviceId) {
                const { data: svcRow } = await supabase
                  .from("services")
                  .select("id")
                  .eq("partner_id", order.partner_id)
                  .eq("name", svc.serviceName)
                  .maybeSingle()
                serviceId = svcRow?.id || null
              }

              if (serviceId) {
                const { consumeSubscriptionCredits } = await import("@/lib/services/credit.service")
                const consumeResult = await consumeSubscriptionCredits(supabase, {
                  partnerId: order.partner_id,
                  customerId: customer.id,
                  serviceId,
                  quantity: svc.quantity,
                  orderId: order.id,
                  appointmentId: bookingResult.appointmentId,
                  idempotencyKey: `checkout:credits:${order.id}:${bookingResult.appointmentId}:${serviceId}`,
                })

                if (!consumeResult.success) {
                  console.error("[fulfillment] Failed to consume subscription credits for service:", serviceId, consumeResult.error)
                }
              } else {
                console.error("[fulfillment] Could not resolve service for credit consumption:", svc.serviceName)
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

    const subscriptionLines = (payload?.lines || []).filter(
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
        deliveryAddress: order.delivery_address || payload?.deliveryAddress,
        financeAccountId: order.finance_account_id,
        deliveryFee: order.delivery_fee ?? 0,
        deliveryBreakdown: (order.delivery_breakdown as Record<string, unknown> | null) ?? null,
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

    // Exporta pedido de checkout para o ERP conectado (Tiny / Bling) de forma idempotente e não-bloqueante
    if (paymentConfirmed) {
      import("@/lib/services/integrations/erp-sync")
        .then(({ exportOrderToConnectedErps }) => {
          exportOrderToConnectedErps(orderId).catch((erpErr) => {
            console.error("[fulfillMarketplaceOrder] ERP export failed:", erpErr)
          })
        })
        .catch(() => {})
    }

    return { success: true, result }
  } catch (e: unknown) {
    const message = describeFulfillmentError(e)
    console.error("[marketplace fulfillment] failed:", { orderId, message, error: e })
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
