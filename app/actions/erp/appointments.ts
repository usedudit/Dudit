"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { sanitizeNotes } from "@/lib/input-validator"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { revalidatePath, revalidateTag } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { applyServiceOrderToGoals } from "@/lib/services/sales-goals.service"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { startOfDay } from "@/lib/date"
import { getAdminTimeline } from "@/lib/services/timeline.service"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"

export type AppointmentStatus =
  | "Reservado"
  | "Confirmado"
  | "Aguardando"
  | "Em andamento"
  | "Iniciado"
  | "Concluído"
  | "Pago"
  | "Ausência"
  | "Cancelado"
  | "Indisponível"
  | "Partially Paid"
  | "Pago Parcialmente"

export type AppointmentServiceInfo = {
  id: string | null
  name: string
  price: number
  categoryId?: string | null
}

export type AppointmentItemInput = {
  product_id?: string | null
  variant_id?: string | null
  service_id?: string | null
  name: string
  quantity: number
  usage_type: 'consumed' | 'returnable' | 'reference'
}

export type AppointmentInput = {
  customerName: string
  customerId?: string | null
  serviceName: string
  serviceId?: string | null
  categoryId?: string | null
  date: string
  time: string
  endDate?: string | null
  endTime?: string | null
  duration: number
  staffId: string
  staffName: string
  price?: number
  pricingUnit?: string | null
  notes?: string | null
  status?: AppointmentStatus
  source?: "appointment" | "unavailable"
  recurrenceRule?: string | null
  recurrenceGroupId?: string | null
  fulfillmentMode?: string | null
  salesChannel?: string | null
  storeId?: string | null
  orderId?: string | null
  marketplaceOrderId?: string | null
  orderItemId?: string | null
  services?: AppointmentServiceInfo[]
  items?: AppointmentItemInput[]
}

function safeRevalidateTag(tag: string) {
  // @ts-ignore
  revalidateTag(tag, "max")
}

function sanitizeStatus(value?: string | null): AppointmentStatus {
  const v = String(value || "").trim().toLowerCase()
  if (v === "confirmado" || v === "confirmed") return "Confirmado"
  if (v === "aguardando" || v === "pending") return "Aguardando"
  if (v === "iniciado" || v === "in progress") return "Iniciado"
  if (v === "concluído" || v === "concluido" || v === "completed") return "Concluído"
  if (v === "pago" || v === "paid") return "Pago"
  if (v === "pago parcialmente" || v === "partially paid" || v === "parcialmente pago") return "Pago Parcialmente"
  if (v === "ausência" || v === "ausencia" || v === "absence") return "Ausência"
  if (v === "cancelado" || v === "canceled" || v === "cancelled") return "Cancelado"
  if (v === "indisponível" || v === "indisponivel" || v === "unavailable") return "Indisponível"
  return "Reservado"
}

function addMinutesToDateTime(date: string, time: string, durationMinutes: number) {
  const [year, month, day] = String(date || "").split("-").map(Number)
  const [hour, minute] = String(time || "00:00").split(":").map(Number)
  const base = new Date(year || 1970, (month || 1) - 1, day || 1, hour || 0, minute || 0)
  base.setMinutes(base.getMinutes() + Math.max(0, Number(durationMinutes || 0)))
  return {
    date: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`,
    time: `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`,
  }
}

function toDbPayload(input: AppointmentInput, partnerId: string, defaultStoreId?: string | null) {
  const durationMinutes = Math.max(1, Number(input.duration || 0))
  const derivedEnd = addMinutesToDateTime(input.date, input.time, durationMinutes)
  return {
    partner_id: partnerId,
    customer_id: input.customerId || null,
    customer_name: String(input.customerName || "Cliente Sem Nome").trim(),
    service_name: String(input.serviceName || "Serviço").trim(),
    service_id: input.serviceId || null,
    category_id: input.categoryId || null,
    start_date: input.date,
    start_time: input.time,
    end_date: input.endDate || derivedEnd.date,
    end_time: input.endTime || derivedEnd.time,
    duration_minutes: durationMinutes,
    staff_partner_user_id: input.staffId,
    staff_name: String(input.staffName || "Profissional").trim(),
    price: Number(input.price || 0),
    pricing_unit: input.pricingUnit || "Por Serviço",
    notes: sanitizeNotes(input.notes),
    status: sanitizeStatus(input.status),
    source: input.source || "appointment",
    recurrence_rule: input.recurrenceRule || null,
    recurrence_group_id: input.recurrenceGroupId || null,
    fulfillment_mode: input.fulfillmentMode || null,
    sales_channel: input.salesChannel || "manual",
    store_id: input.storeId || defaultStoreId || null,
    marketplace_order_id: input.orderId || input.marketplaceOrderId || null,
    order_item_id: input.orderItemId || null,
  }
}

async function getPartnerContextWithPermission(permission: "view" | "create" | "edit" | "delete") {
  const user = await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("Contexto ERP não encontrado")
  await requirePermission(context.partnerId, "appointments", permission, user)
  return { user, partnerId: context.partnerId, storeId: context.activeStoreId || null }
}

function isPaidStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase()
  return s === "pago" || s === "paid" || s === "concluído" || s === "concluido" || s === "completed" || s === "finalizado"
}

function isPartialStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase()
  return s === "partially paid" || s === "pago parcialmente" || s === "parcialmente pago"
}

function isOrderPriceLocked(situation: string | null | undefined) {
  const normalized = String(situation || "").toLowerCase()
  return normalized === "paid" || normalized === "partially_paid"
}

async function createAppointmentSaleAndSyncGoals(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  userId: string
  appointment: any
  paidAmount: number
}) {
  const paidAmount = Math.max(0, Number(params.paidAmount || 0))
  if (paidAmount <= 0.009) return { saleId: null, paymentTransactionId: null as string | null }

  const txRefNote = `appointment:${params.appointment.id}:payment`

  const { data: existingPaymentTx } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", txRefNote)
    .limit(1)
    .maybeSingle()

  let orderDiscount = 0
  let orderExtra = 0
  let orderPaymentMethod: string | null = null
  if (params.appointment.marketplace_order_id) {
    const { data: orderData } = await params.supabase
      .from("orders")
      .select("payment_method_discount_amount, payment_method_extra_amount, payment_method")
      .eq("id", params.appointment.marketplace_order_id)
      .eq("partner_id", params.partnerId)
      .maybeSingle()

    if (orderData) {
      orderDiscount = Number(orderData.payment_method_discount_amount || 0)
      orderExtra = Number(orderData.payment_method_extra_amount || 0)
      orderPaymentMethod = orderData.payment_method || null
    }
  }

  const baseAmount = Number(params.appointment.price || 0)
  const finalAmount = Math.max(0, baseAmount - orderDiscount + orderExtra)
  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(params.supabase as any, params.partnerId, false)
  const fallbackSaleNumber = `DDT-${String(params.appointment.id).slice(0, 8).toUpperCase()}`

  let paymentTransactionId = existingPaymentTx?.id || null
  if (!paymentTransactionId) {
    const nowIso = new Date().toISOString()
    const { data: tx, error: txError } = await params.supabase
      .from("transactions")
      .insert({
        partner_id: params.partnerId,
        store_id: params.appointment.store_id || null,
        description: fallbackSaleNumber,
        category: "Vendas",
        customer_id: params.appointment.customer_id || null,
        contact_type: "customer",
        amount: paidAmount,
        due_date: null,
        payment_date: nowIso,
        transaction_date: nowIso,
        status: "paid",
        notes: null,
        payment_type: orderPaymentMethod || "Agendamento",
        original_amount: paidAmount,
        interest_amount: null,
        fee_amount: 0,
        transaction_type: "income",
        origin: "system",
        reference_note: txRefNote,
        account_id: financeAccountId || null,
        created_by_user_id: params.userId,
      })
      .select("id")
      .single()
    if (txError) throw txError
    paymentTransactionId = tx?.id || null

    if (financeAccountId && paidAmount > 0) {
      const { error: balanceError } = await params.supabase.rpc("apply_account_balance_delta", {
        p_account_id: financeAccountId,
        p_partner_id: params.partnerId,
        p_delta: Math.round(paidAmount * 100) / 100,
      })
      if (balanceError) {
        console.error("[createAppointmentSaleAndSyncGoals] Erro ao atualizar saldo da conta:", balanceError.message)
      }
    }
  }

  try {
    await applyServiceOrderToGoals({
      supabase: params.supabase as any,
      partnerId: params.partnerId,
      sellerUserId: params.appointment.staff_partner_user_id || params.userId,
      saleAmount: finalAmount > 0 ? finalAmount : paidAmount,
      createdByUserId: params.userId,
    })
  } catch (err: any) {
    console.error("[createAppointmentSaleAndSyncGoals] Erro ao sincronizar metas:", err.message)
  }

  return { saleId: params.appointment.marketplace_order_id || null, paymentTransactionId }
}

export async function syncAppointmentReceivable(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  userId: string
  appointment: any
  currentReceivableId?: string | null
}) {
  const ref = `appointment:${params.appointment.id}:receivable`
  const status = String(params.appointment.status || "")
  const paymentStatus = String(params.appointment.payment_status || "")
  const totalAmount = Number(params.appointment.price || 0)

  // Guard: não criar receivable para agendamentos sem valor (R$0)
  if (totalAmount <= 0.009) return params.currentReceivableId || null

  const paidAmount = Number(params.appointment.paid_amount || 0)
  const remaining = Math.max(0, totalAmount - paidAmount)
  const isActuallyPaid = isPaidStatus(status) || paymentStatus === 'paid'
  const shouldBePending = !isActuallyPaid && remaining > 0.009
  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(params.supabase as any, params.partnerId, false)

  let saleNumber = `DDT-${String(params.appointment.id).slice(0, 8).toUpperCase()}`
  let orderPaymentMethod: string | null = null
  let orderPaymentMethodId: string | null = null

  if (params.appointment.marketplace_order_id) {
    const { data: existingOrder } = await params.supabase
      .from("orders")
      .select("order_number")
      .eq("id", params.appointment.marketplace_order_id)
      .eq("partner_id", params.partnerId)
      .limit(1)
      .maybeSingle()
    if (existingOrder?.order_number) {
      saleNumber = existingOrder.order_number
    }
  } else {
    const saleRefNote = `appointment:${params.appointment.id}:sale`
    const { data: existingSale } = await params.supabase
      .from("sales")
      .select("sale_number")
      .eq("partner_id", params.partnerId)
      .eq("notes", saleRefNote)
      .limit(1)
      .maybeSingle()
    if (existingSale?.sale_number) {
      saleNumber = existingSale.sale_number
    }
  }

  const paymentMethod = params.appointment.payment_method || orderPaymentMethod || null
  const paymentMethodId = params.appointment.payment_method_id || orderPaymentMethodId || null

  const existingId = params.currentReceivableId || (await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", ref)
    .limit(1)
    .maybeSingle()).data?.id || null

  if (shouldBePending) {
    if (existingId) {
      await params.supabase
        .from("transactions")
        .update({
          description: saleNumber,
          amount: remaining,
          original_amount: remaining,
          status: "pending",
          due_date: params.appointment.start_date,
          payment_date: null,
          transaction_date: startOfDay(params.appointment.start_date).toISOString(),
          payment_type: paymentMethod || "Agendamento",
          payment_method_id: paymentMethodId || null,
        })
        .eq("id", existingId)
        .eq("partner_id", params.partnerId)
      return existingId
    }

    const { data, error } = await params.supabase
      .from("transactions")
      .insert({
        partner_id: params.partnerId,
        description: saleNumber,
        category: "Vendas",
        customer_id: params.appointment.customer_id || null,
        contact_type: "customer",
        amount: remaining,
        due_date: params.appointment.start_date,
        payment_date: null,
        transaction_date: `${params.appointment.start_date}T12:00:00.000Z`,
        status: "pending",
        notes: null,
        payment_type: paymentMethod || "Agendamento",
        payment_method_id: paymentMethodId || null,
        original_amount: remaining,
        interest_amount: null,
        fee_amount: 0,
        transaction_type: "income",
        origin: "system",
        reference_note: ref,
        account_id: financeAccountId || null,
        created_by_user_id: params.userId,
      })
      .select("id")
      .single()
    if (error) throw error
    return data?.id || null
  }

  if (existingId) {
    await params.supabase
      .from("transactions")
      .update({
        description: saleNumber,
        amount: totalAmount,
        original_amount: totalAmount,
        status: "paid",
        payment_date: new Date().toISOString(),
        payment_type: paymentMethod || "Agendamento",
        payment_method_id: paymentMethodId || null,
      })
      .eq("id", existingId)
      .eq("partner_id", params.partnerId)
  }
  return existingId
}

/** @deprecated Use getAppointmentsByDateRangeAction instead - this fetches ALL appointments with select(*) */
export async function getAppointmentsAction() {
  try {
    const { partnerId } = await getPartnerContextWithPermission("view")
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("partner_id", partnerId)
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) throw error
    return { success: true, items: data || [] }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao buscar agendamentos", items: [] }
  }
}

// -- Optimized appointment columns for list/calendar rendering (no select *) --
const APPOINTMENT_LIST_COLUMNS = `
  id, partner_id, customer_id, customer_name, service_name,
  start_date, start_time, end_date, end_time, duration_minutes,
  staff_partner_user_id, staff_name, status, price, pricing_unit, notes, source,
  sales_channel, payment_status, fulfillment_mode, needs_reschedule, sale_id, marketplace_order_id
`

/**
 * Fetch appointments within a date range, with optional staff filter.
 * All filtering is done at the database level - no in-memory filtering.
 *
 * Uses the standard interval overlap condition:
 *   start_date <= queryEnd AND end_date >= queryStart
 * This captures:
 *   - Appointments fully within the range
 *   - Multi-day appointments that started before the range
 *   - Multi-day appointments that end after the range
 *   - Appointments that span the entire range
 */
export async function getAppointmentsByDateRangeAction(
  startDate: string,
  endDate: string,
  staffId?: string | null,
  storeIdParam?: string | null
) {
  try {
    const { partnerId, storeId: contextStoreId } = await getPartnerContextWithPermission("view")
    const activeStoreId = storeIdParam ?? contextStoreId
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("appointments")
      .select(APPOINTMENT_LIST_COLUMNS)
      .eq("partner_id", partnerId)
      // Optimal overlap: appointment.start_date <= queryEnd AND appointment.end_date >= queryStart
      .lte("start_date", endDate)
      .gte("end_date", startDate)

    // Staff filtering at DB level
    if (staffId) {
      query = query.eq("staff_partner_user_id", staffId)
    }

    // Store filtering: if storeId provided or available in context, filter by store (or store_id IS NULL for unassigned)
    if (activeStoreId) {
      query = query.or(`store_id.eq.${activeStoreId},store_id.is.null`)
    }

    const { data, error } = await query
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500) // Safety cap to prevent excessive data loads

    if (error) throw error
    return { success: true, items: data || [] }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao buscar agendamentos", items: [] }
  }
}

// -- Default business hours (structured for easy future migration to a DB table) --
const DEFAULT_BUSINESS_HOURS = { startHour: 8, startMinute: 0, endHour: 19, endMinute: 0 }
const SLOT_INCREMENT_MINUTES = 15

/**
 * Generate available time slots for a staff member on a specific date.
 * Takes into account:
 * - Existing appointments (conflict detection)
 * - Service duration (the slot must fit the full service)
 * - Buffer minutes between appointments
 * - Business hours (default 08:00–19:00, structured for future DB config)
 *
 * All computation is server-side - no client-side slot generation.
 */
export async function getAvailableTimeSlotsAction(
  date: string,
  staffId: string,
  serviceDurationMinutes: number,
  bufferMinutes: number = 0,
  storeId?: string | null,
  excludeAppointmentId?: string | null
) {
  try {
    const { partnerId } = await getPartnerContextWithPermission("view")
    const supabase = await getSupabaseServerClient()

    // Fetch existing appointments for this staff on this date
    let query = supabase
      .from("appointments")
      .select("id, start_time, end_time, duration_minutes, status")
      .eq("partner_id", partnerId)
      .eq("staff_partner_user_id", staffId)
      .lte("start_date", date)
      .or(`end_date.gte.${date},end_date.is.null`)

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    const { data: existingAppts, error } = await query.order("start_time", { ascending: true })

    if (error) throw error

    // Build list of occupied time ranges (in minutes from midnight)
    const occupiedRanges: Array<{ start: number; end: number }> = (existingAppts || [])
      .filter((apt: any) =>
        apt.id !== excludeAppointmentId &&
        !["cancelado", "cancelled", "canceled"].includes(String(apt.status || "").toLowerCase())
      )
      .map((apt: any) => {
      const [sh, sm] = String(apt.start_time || "").split(":").map(Number)
      const startMin = (sh || 0) * 60 + (sm || 0)

      let endMin: number
      if (apt.end_time) {
        const [eh, em] = String(apt.end_time).split(":").map(Number)
        endMin = (eh || 0) * 60 + (em || 0)
        if (endMin <= startMin) endMin = startMin + Number(apt.duration_minutes || 60)
      } else {
        endMin = startMin + Number(apt.duration_minutes || 60)
      }

      // Add buffer after each appointment
        return { start: startMin, end: endMin + bufferMinutes }
      })

    // Fetch store opening hours
    let storeQuery = supabase.from("stores").select("opening_hours")
    if (storeId) {
      storeQuery = storeQuery.eq("id", storeId)
    } else {
      storeQuery = storeQuery.eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1)
    }
    const { data: storeData, error: storeErr } = await storeQuery.maybeSingle()

    if (storeErr) throw storeErr

    const rawOpeningHours = storeData?.opening_hours

    // Determine day of the week
    const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const [year, month, day] = date.split("-").map(Number)
    const dateObj = new Date(year, month - 1, day)
    const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()]

    const { normalizeOpeningHours, parseTimeToMinutes } = await import("@/lib/utils/opening-hours")
    const normalized = normalizeOpeningHours(rawOpeningHours)
    const daySchedule = normalized[dayOfWeek]

    const slots: string[] = []
    const conflictingSlots: string[] = []

    if (daySchedule && daySchedule.enabled) {
      const dayStartMin = parseTimeToMinutes(daySchedule.from)
      let dayEndMin = parseTimeToMinutes(daySchedule.to)
      if (dayEndMin <= dayStartMin) dayEndMin += 24 * 60
      const totalDurationNeeded = serviceDurationMinutes + bufferMinutes

      for (let slotStart = dayStartMin; slotStart + serviceDurationMinutes <= dayEndMin; slotStart += SLOT_INCREMENT_MINUTES) {
        const slotEnd = slotStart + totalDurationNeeded

        // Check if this slot conflicts with any existing appointment
        const hasConflict = occupiedRanges.some(
          (range) => slotStart < range.end && slotEnd > range.start
        )

        const h = Math.floor(slotStart / 60) % 24
        const m = slotStart % 60
        const slot = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        slots.push(slot)
        if (hasConflict) conflictingSlots.push(slot)
      }
    }

    return { success: true, slots, conflictingSlots }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao buscar horários", slots: [], conflictingSlots: [] }
  }
}

export async function createAppointmentsAction(payload: AppointmentInput[]) {
  try {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { success: false, error: "Nenhum agendamento enviado", created: [] }
    }

    const { user, partnerId, storeId: contextStoreId } = await getPartnerContextWithPermission("create")
    const supabase = await getSupabaseServerClient()
    const rows = payload.map((item) => toDbPayload(item, partnerId, contextStoreId))

    // -- Idempotency guard for order_item_id --
    if (rows[0] && rows[0].order_item_id) {
      const { data: existingOrderItemAppt } = await supabase
        .from("appointments")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("order_item_id", rows[0].order_item_id)
        .limit(1)

      if (existingOrderItemAppt && existingOrderItemAppt.length > 0) {
        return { success: true, created: existingOrderItemAppt }
      }
    }

    // -- Idempotency guard: reject duplicate submissions within 30 seconds --
    // Checks the first item in the batch against recent inserts
    const firstRowItem = rows[0]
    if (firstRowItem) {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
      const { data: recentDup } = await supabase
        .from("appointments")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("customer_name", firstRowItem.customer_name)
        .eq("service_name", firstRowItem.service_name)
        .eq("start_date", firstRowItem.start_date)
        .eq("start_time", firstRowItem.start_time)
        .eq("staff_partner_user_id", firstRowItem.staff_partner_user_id)
        .gte("created_at", thirtySecondsAgo)
        .limit(1)

      if (recentDup && recentDup.length > 0) {
        return { success: false, error: "Agendamento duplicado detectado. Aguarde alguns segundos.", created: [] }
      }
    }

    // -- Plan limit check --
    const limitCheck = await checkLimit(partnerId, "monthly_appointments")
    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.message || "Limite mensal de agendamentos atingido.", created: [] }
    }

    const { data, error } = await supabase.from("appointments").insert(rows).select("*")
    if (error) throw error

    const createdRows = data || []

    // -- Post-insert processing (optimized: skip unnecessary work, batch where safe) --
    // Receivable sync is only needed for appointments with price > 0
    // Unavailable slots (price=0) never need receivables
    const receivableUpdates: Array<{ id: string; receivableId: string }> = []
    for (let i = 0; i < createdRows.length; i++) {
      const row = createdRows[i]
      const price = Number(row.price || 0)
      const linkedOrderId = row.marketplace_order_id || payload[i]?.orderId || payload[i]?.marketplaceOrderId

      if (linkedOrderId) {
        // Appointment is linked to an existing order (ERP/POS service sale)
        // Skip creating a new order and skip creating new receivables!
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, situation")
          .eq("id", linkedOrderId)
          .maybeSingle()

        const targetPaymentStatus = existingOrder?.situation === "paid"
          ? "paid"
          : (existingOrder?.situation === "partially_paid" ? "partially_paid" : "unpaid")

        await supabase
          .from("appointments")
          .update({
            marketplace_order_id: linkedOrderId,
            payment_status: targetPaymentStatus,
          })
          .eq("id", row.id)
          .eq("partner_id", partnerId)

        row.marketplace_order_id = linkedOrderId
        row.payment_status = targetPaymentStatus
        continue
      }

      if (price > 0.009 && row.source !== "unavailable") {
        const isMarketplace = !!row.marketplace_order_id

        let pricingResult: any
        let giftItems: any[] = []
        let filteredPromotions: any[] = []
        if (isMarketplace) {
          const { listActivePromotionsForMarketplaceAction, filterRawPromotionsByGiftStock, buildGiftOrderItems } = await import("@/app/actions/shared/promotions")
          const rawPromotions = await listActivePromotionsForMarketplaceAction(partnerId, row.customer_id || null)
          filteredPromotions = await filterRawPromotionsByGiftStock(rawPromotions, supabase)

          pricingResult = calculateOrderPricing({
            items: [{
              serviceId: row.service_id,
              categoryId: row.category_id,
              unitPrice: price,
              quantity: 1
            }],
            shippingCost: 0,
            promotions: filteredPromotions,
          })

          const giftIds = pricingResult.appliedGiftProductIds || []
          giftItems = await buildGiftOrderItems(supabase, giftIds, filteredPromotions)
        } else {
          pricingResult = {
            finalTotal: price,
            subtotal: price,
            appliedGiftProductIds: [],
            appliedPromotionIds: [],
            pricingVersion: null,
          }
        }

        // 1. Create a pending order in public.orders
        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .insert({
            partner_id: partnerId,
            buyer_id: row.customer_id || null,
            customer_name: row.customer_name,
            total_amount: pricingResult.finalTotal,
            discount_amount: 0,
            paid_amount: 0,
            situation: "pending",
            delivery_status: "delivered", // Fulfilled right away
            delivery_type: "pickup",
            payment_method: "Método não definido",
            order_source: "Manual",
            pricing_version: pricingResult.pricingVersion,
            notes: row.notes || null,
            created_by: user.id,
            store_id: row.store_id || payload[i]?.storeId || null,
          })
          .select("id, order_number")
          .single()

        if (orderErr) {
          console.error("[createAppointmentsAction] failed to create order:", orderErr)
        }

        if (order?.id) {
          // 2. Insert into order_items
          // Get individual services from original payload for this row
          const origInput = payload[i]
          const individualServices = origInput?.services || []

          let serviceItems: any[]
          if (individualServices.length > 1) {
            // Multiple services: create one order_item per service
            const totalIndPrice = individualServices.reduce((s, svc) => s + Number(svc.price || 0), 0)
            const scale = totalIndPrice > 0 ? pricingResult.subtotal / totalIndPrice : 1
            serviceItems = individualServices.map((svc) => ({
              order_id: order.id,
              product_id: null,
              variant_id: null,
              product_name: svc.name,
              product_price: Math.round(Number(svc.price || 0) * scale * 100) / 100,
              quantity: 1,
              subtotal: Math.round(Number(svc.price || 0) * scale * 100) / 100,
              line_type: "service_booking",
              fulfillment_mode: row.fulfillment_mode || "on_site",
              service_id: svc.id || null,
              is_gift: false,
              original_price: null,
              is_promotional: false,
              promotion_id: null,
            }))
          } else {
            // Single service: use existing approach
            serviceItems = [{
              order_id: order.id,
              product_id: null,
              variant_id: null,
              product_name: row.service_name || "Serviço",
              product_price: pricingResult.subtotal,
              quantity: 1,
              subtotal: pricingResult.subtotal,
              line_type: "service_booking",
              fulfillment_mode: row.fulfillment_mode || "on_site",
              service_id: row.service_id,
              is_gift: false,
              original_price: null,
              is_promotional: false,
              promotion_id: null,
            }]
          }

          const itemsToInsert = [
            ...serviceItems,
            ...giftItems.map(item => ({
              order_id: order.id,
              product_id: item.product_id,
              service_id: item.service_id,
              product_name: item.product_name,
              product_price: 0,
              original_price: item.original_price,
              quantity: 1,
              subtotal: 0,
              line_type: item.service_id ? "service_booking" : "product",
              is_gift: true,
              is_promotional: true,
              promotion_id: item.promotion_id,
            }))
          ]
          await supabase.from("order_items").insert(itemsToInsert)

          // Reserve stock for physical gift products
          const giftStockItems = giftItems
            .filter(item => item.product_id)
            .map((item) => ({
              product_id: item.product_id,
              variant_id: null,
              quantity: 1,
            }))

          if (giftStockItems.length > 0) {
            await reserveOrderInventory({
              client: supabase as any,
              partnerId,
              orderId: order.id,
              items: giftStockItems,
            })
          }

          // Register audit log for skipped gifts (due to stock or inactive)
          const skippedGifts = filteredPromotions.filter(
            (p) => p.giftUnavailable && pricingResult.appliedPromotionIds.includes(p.id)
          )
          for (const promo of skippedGifts) {
            await logAuditEvent({
              partnerId,
              actorUserId: user.id,
              entityType: "appointment",
              entityId: row.id,
              actionType: "created",
              changeLines: [`Brinde da campanha "${promo.name}" temporariamente indisponível (sem estoque).`],
              source: "manual",
            })
          }

          // 3. Update the appointment with marketplace_order_id and payment_status
          await supabase
            .from("appointments")
            .update({
              marketplace_order_id: order.id,
              payment_status: "unpaid",
            })
            .eq("id", row.id)
            .eq("partner_id", partnerId)

          // Update row in-memory so returned created row contains it
          row.marketplace_order_id = order.id
          row.payment_status = "unpaid"
        }

        const receivableId = await syncAppointmentReceivable({
          supabase,
          partnerId,
          userId: user.id,
          appointment: { ...row, paid_amount: Number(row.paid_amount || 0) },
          currentReceivableId: row.receivable_transaction_id || null,
        })
        if (receivableId) {
          receivableUpdates.push({ id: row.id, receivableId })
        }
      }
    }

    // Batch receivable ID updates
    if (receivableUpdates.length > 0) {
      await Promise.all(
        receivableUpdates.map(({ id, receivableId }) =>
          supabase
            .from("appointments")
            .update({ receivable_transaction_id: receivableId })
            .eq("id", id)
            .eq("partner_id", partnerId)
        )
      )
    }

    // Insert appointment items from payload
    const itemsToInsert: any[] = []
    for (let i = 0; i < createdRows.length; i++) {
      const row = createdRows[i]
      const payloadItems = payload[i]?.items
      if (payloadItems && payloadItems.length > 0) {
        for (const item of payloadItems) {
          itemsToInsert.push({
            appointment_id: row.id,
            product_id: item.product_id || null,
            variant_id: item.variant_id || null,
            service_id: item.service_id || null,
            name: item.name,
            quantity: item.quantity,
            usage_type: item.usage_type,
          })
        }
      }
    }
    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase.from("appointment_items").insert(itemsToInsert)
      if (itemsError) {
        console.error("createAppointmentsAction items insert error:", itemsError)
      }
    }

    // -- Stock Movement Integration (store-aware, only finalize consumed when paid) --
    try {
      const { handleAppointmentItemsStockMovement } = await import("@/app/actions/erp/appointment-items")
      for (let i = 0; i < createdRows.length; i++) {
        const row = createdRows[i]
        try {
          await handleAppointmentItemsStockMovement({
            appointmentId: row.id,
            partnerId,
            oldStatus: null,
            newStatus: row.status,
            userId: user.id,
            storeId: payload[i]?.storeId || null,
            paymentStatus: row.payment_status || null,
            paidAmount: Number(row.paid_amount || 0),
            price: Number(row.price || 0),
          })
        } catch (stockRowErr) {
          console.error(`[appointment_stock_create] failed for row ${row.id}:`, stockRowErr)
        }
      }
    } catch (stockErr) {
      console.error("[appointment_stock_create] failed to process movement:", stockErr)
    }

    // Audit logs - run in parallel (each is an independent insert)
    await Promise.all(
      createdRows.map((row: any) =>
        logAuditEvent({
          partnerId,
          actorUserId: user.id,
          entityType: "appointment",
          entityId: row.id,
          actionType: "created",
          changeLines: [`criou agendamento para ${row.customer_name}.`],
          metadata: { status: row.status, source: row.source },
        })
      )
    )

    // Increment usage counter for each created appointment
    await increment_usage_counter(partnerId, "appointments_month_count", createdRows.length)

    // Revalidation - once at the end, not per-row
    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.services(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.financial(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
    revalidatePath("/erp/painel")
    revalidatePath("/erp/servicos")

    // Only send notifications for marketplace/online appointments, not manual ones
    const rowsToNotify = createdRows.filter(row => row.sales_channel && row.sales_channel !== "manual")
    if (rowsToNotify.length > 0) {
      Promise.all([
        import("@/lib/services/whatsapp-automation.service"),
        import("@/lib/services/notification-automation.service"),
      ])
        .then(([whatsapp, notifications]) => {
          for (const row of rowsToNotify) {
            whatsapp.onAppointmentCreated(row).catch(console.error)
            notifications.onAppointmentCreated(row, "system").catch(console.error)
          }
        })
        .catch(() => { })
    }

    // Return the post-processing rows so newly created/linked sale IDs are
    // immediately available to the calendar without a second fetch.
    return { success: true, created: createdRows }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao criar agendamento", created: [] }
  }
}

export async function updateAppointmentAction(appointmentId: string, payload: Partial<AppointmentInput>) {
  try {
    if (!appointmentId) return { success: false, error: "Agendamento inválido" }

    const { user, partnerId } = await getPartnerContextWithPermission("edit")
    const supabase = await getSupabaseServerClient()

    const { data: current, error: currentError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .single()
    if (currentError || !current) throw currentError || new Error("Agendamento não encontrado")

    const paymentStatusValue = (payload as any)?.paymentStatus ?? current.payment_status
    const paidAmountValue = Math.max(0, Number((payload as any)?.paidAmount ?? current.paid_amount ?? 0))

    const linkedOrderId = current.marketplace_order_id || null
    let linkedOrder: { situation?: string | null; payment_method_discount_amount?: number | null; payment_method_extra_amount?: number | null } | null = null
    if (linkedOrderId) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("situation, payment_method_discount_amount, payment_method_extra_amount")
        .eq("id", linkedOrderId)
        .eq("partner_id", partnerId)
        .maybeSingle()
      if (orderError) throw orderError
      linkedOrder = orderData
    }

    const requestedPrice = payload.price === undefined ? Number(current.price || 0) : Number(payload.price || 0)
    if (linkedOrder && isOrderPriceLocked(linkedOrder.situation) && Math.abs(requestedPrice - Number(current.price || 0)) > 0.009) {
      return { success: false, error: "O valor do serviço não pode ser alterado porque esta venda já foi paga ou parcialmente paga." }
    }

    const nextStartDate = payload.date ?? current.start_date
    const nextStartTime = payload.time ?? current.start_time
    const shouldRecalculateEnd = payload.date !== undefined || payload.time !== undefined || payload.duration !== undefined
    const derivedEnd = addMinutesToDateTime(nextStartDate, nextStartTime, Number(payload.duration ?? current.duration_minutes ?? 0))

    const mapped = toDbPayload(
      {
        customerName: payload.customerName ?? current.customer_name,
        customerId: payload.customerId ?? current.customer_id,
        serviceName: payload.serviceName ?? current.service_name,
        serviceId: payload.serviceId ?? current.service_id,
        categoryId: payload.categoryId ?? current.category_id,
        date: payload.date ?? current.start_date,
        time: payload.time ?? current.start_time,
        endDate: shouldRecalculateEnd ? derivedEnd.date : (payload.endDate ?? current.end_date),
        endTime: shouldRecalculateEnd ? derivedEnd.time : (payload.endTime ?? current.end_time),
        duration: payload.duration ?? current.duration_minutes,
        staffId: payload.staffId ?? current.staff_partner_user_id,
        staffName: payload.staffName ?? current.staff_name,
        price: payload.price ?? current.price,
        pricingUnit: payload.pricingUnit ?? current.pricing_unit,
        notes: payload.notes ?? current.notes,
        status: payload.status ?? current.status,
        source: payload.source ?? current.source,
        salesChannel: payload.salesChannel ?? current.sales_channel ?? "manual",
        fulfillmentMode: payload.fulfillmentMode ?? current.fulfillment_mode,
        storeId: payload.storeId ?? current.store_id,
        orderId: current.marketplace_order_id,
        orderItemId: current.order_item_id,
      },
      partnerId,
    )

    const { data: updated, error } = await supabase
      .from("appointments")
      .update(mapped)
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .select("*")
      .single()
    if (error) throw error

    if (updated.marketplace_order_id) {
      const orderPrice = Number(updated.price || 0)

      const discountAmt = Number(linkedOrder?.payment_method_discount_amount || 0)
      const extraAmt = Number(linkedOrder?.payment_method_extra_amount || 0)
      const nextTotalAmount = Math.max(0, orderPrice - discountAmt + extraAmt)

      await supabase
        .from("orders")
        .update({
          total_amount: nextTotalAmount,
          notes: updated.notes || null,
        })
        .eq("id", updated.marketplace_order_id)
        .eq("partner_id", partnerId)

      const individualSvcs = (payload.services || []) as Array<{ name: string; price: number; id?: string | null }>
      let serviceItems: any[]
      if (individualSvcs.length > 0) {
        serviceItems = individualSvcs.map((svc: { name: string; price: number; id?: string | null }) => ({
          order_id: updated.marketplace_order_id,
          product_id: null,
          variant_id: null,
          product_name: svc.name,
          product_price: Number(svc.price || 0),
          quantity: 1,
          subtotal: Number(svc.price || 0),
          line_type: "service_booking",
          fulfillment_mode: updated.fulfillment_mode || "on_site",
          service_id: svc.id || updated.service_id,
          is_gift: false,
          original_price: null,
          is_promotional: false,
          promotion_id: null,
        }))
      } else {
        const svcNames = String(updated.service_name || "Serviço").split(',').map((s: string) => s.trim()).filter(Boolean)
        const svcCount = svcNames.length
        const svcUnitPrice = svcCount > 1 ? Math.round((orderPrice / svcCount) * 100) / 100 : orderPrice
        serviceItems = svcNames.map((name: string) => ({
          order_id: updated.marketplace_order_id,
          product_id: null,
          variant_id: null,
          product_name: name,
          product_price: svcUnitPrice,
          quantity: 1,
          subtotal: svcUnitPrice,
          line_type: "service_booking",
          fulfillment_mode: updated.fulfillment_mode || "on_site",
          service_id: updated.service_id,
          is_gift: false,
          original_price: null,
          is_promotional: false,
          promotion_id: null,
        }))
      }
      // Update service lines in place. Deleting/recreating them used to break
      // appointments.order_item_id, which made the order screen show
      // "Criar agendamento" again after an edit.
      if (!linkedOrder || !isOrderPriceLocked(linkedOrder.situation)) {
        const { data: existingServiceItems, error: serviceItemsError } = await supabase
          .from("order_items")
          .select("id, service_id, product_name, is_gift, line_type")
          .eq("order_id", updated.marketplace_order_id)
          .eq("line_type", "service_booking")
          .neq("is_gift", true)
          .order("created_at", { ascending: true })
        if (serviceItemsError) throw serviceItemsError

        const unused = [...(existingServiceItems || [])]
        const updates: Promise<void>[] = []
        const inserts: any[] = []

        for (const item of serviceItems) {
          const preferredIndex = current.order_item_id
            ? unused.findIndex((existing: any) => existing.id === current.order_item_id)
            : -1
          const matchIndex = preferredIndex >= 0
            ? preferredIndex
            : unused.findIndex((existing: any) =>
              (item.service_id && existing.service_id === item.service_id) ||
              String(existing.product_name || "").trim().toLowerCase() === String(item.product_name || "").trim().toLowerCase()
            )
          const existing = matchIndex >= 0 ? unused.splice(matchIndex, 1)[0] : null
          if (existing) {
            updates.push((async () => {
              const { error: updateError } = await supabase
                .from("order_items")
                .update(item)
                .eq("id", existing.id)
                .eq("order_id", updated.marketplace_order_id)
              if (updateError) throw updateError
            })())
          } else {
            inserts.push(item)
          }
        }

        if (updates.length > 0) await Promise.all(updates)
        if (inserts.length > 0) {
          const { data: insertedItems, error: insertError } = await supabase.from("order_items").insert(inserts).select("id")
          if (insertError) throw insertError
          if (!current.order_item_id && insertedItems?.[0]?.id) {
            await supabase.from("appointments").update({ order_item_id: insertedItems[0].id }).eq("id", appointmentId).eq("partner_id", partnerId)
          }
        }
        if (unused.length > 0) {
          const { error: deleteError } = await supabase
            .from("order_items")
            .delete()
            .in("id", unused.map((item: any) => item.id))
            .eq("order_id", updated.marketplace_order_id)
          if (deleteError) throw deleteError
        }
      }
    }

    const paidAmountFromPayload = Math.max(0, Number((payload as any)?.paidAmount ?? updated.paid_amount ?? 0))
    const normalizedStatus = String(updated.status || "")
    const normalizedPaymentStatus = String(paymentStatusValue || "")
    const isPartial = isPartialStatus(normalizedStatus) || normalizedPaymentStatus === 'partially_paid'
    const isPaid = isPaidStatus(normalizedStatus) || normalizedPaymentStatus === 'paid'
    const price = Number(updated.price || 0)
    const effectivePaidAmount = (isPaid && paidAmountValue < price) ? price : paidAmountValue

    const hasLinkedOrder = !!updated.marketplace_order_id

    let saleId: string | null = updated.sale_id || null
    let paymentTransactionId: string | null = updated.payment_transaction_id || null
    if (!hasLinkedOrder && (isPaid || isPartial) && Number(updated.price || 0) > 0.009) {
      const synced = await createAppointmentSaleAndSyncGoals({
        supabase,
        partnerId,
        userId: user.id,
        appointment: { ...updated, paid_amount: effectivePaidAmount },
        paidAmount: effectivePaidAmount,
      })
      saleId = synced.saleId
      paymentTransactionId = synced.paymentTransactionId
    }

    let receivableTransactionId: string | null = updated.receivable_transaction_id || null
    if (!hasLinkedOrder) {
      receivableTransactionId = await syncAppointmentReceivable({
        supabase,
        partnerId,
        userId: user.id,
        appointment: { ...updated, payment_status: normalizedPaymentStatus, paid_amount: effectivePaidAmount },
        currentReceivableId: updated.receivable_transaction_id || null,
      })
    }

    // Update payment_status and paid_amount directly
    const paymentUpdatePayload: Record<string, any> = {
      paid_amount: effectivePaidAmount,
    }
    if (paymentStatusValue) {
      paymentUpdatePayload.payment_status = paymentStatusValue
    }
    if ((payload as any)?.saleId) {
      paymentUpdatePayload.sale_id = (payload as any).saleId
    }

    const { data: syncedAppointment } = await supabase
      .from("appointments")
      .update({
        ...paymentUpdatePayload,
        sale_id: saleId || (payload as any)?.saleId || updated.sale_id,
        payment_transaction_id: paymentTransactionId,
        receivable_transaction_id: receivableTransactionId,
      })
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .select("*")
      .single()

    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "appointment",
      entityId: appointmentId,
      actionType: "updated",
      changeLines: ["atualizou informações do agendamento."],
      metadata: { oldStatus: current.status, newStatus: normalizedStatus, paidAmount: effectivePaidAmount },
    })

    if (normalizedStatus === "Cancelado" && current.status !== "Cancelado" && updated.customer_id) {
      try {
        const { refundSubscriptionCredits } = await import("@/lib/services/credit.service")
        await refundSubscriptionCredits(supabase, {
          partnerId,
          customerId: updated.customer_id,
          appointmentId,
        })
      } catch (err) {
        console.error("[updateAppointment] Error refunding credits:", err)
      }
    }

    // -- Stock Movement Integration (store-aware, only finalize consumed when paid) --
    try {
      const { handleAppointmentItemsStockMovement } = await import("@/app/actions/erp/appointment-items")
      await handleAppointmentItemsStockMovement({
        appointmentId: updated.id,
        partnerId,
        oldStatus: current.status,
        newStatus: normalizedStatus,
        userId: user.id,
        storeId: payload.storeId ?? current.store_id ?? null,
        paymentStatus: String(paymentStatusValue || current.payment_status || ''),
        paidAmount: effectivePaidAmount,
        price: price,
      })
    } catch (stockErr) {
      console.error("[appointment_stock] failed to process movement:", stockErr)
    }

    await revalidateEntityTimeline("appointment", appointmentId)
    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.services(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.financial(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
    safeRevalidateTag(`partner-stats-${partnerId}`)
    revalidatePath("/erp/painel")
    revalidatePath("/erp/servicos")

    const finalRow = syncedAppointment || updated

    const wasNotSuccessful = !["Concluído", "Pago", "Pago Parcialmente", "Confirmado"].includes(String(current.status || ""))
    const isNowSuccessful = ["Concluído", "Pago", "Pago Parcialmente", "Confirmado"].includes(String(normalizedStatus || ""))
    const isMarketplaceAppointment = finalRow.sales_channel === "online_storefront"
    if (wasNotSuccessful && isNowSuccessful && isMarketplaceAppointment) {
      import("@/lib/services/marketplace-metrics.service")
        .then(({ recordAppointmentBookingMetrics }) =>
          recordAppointmentBookingMetrics(supabase, appointmentId),
        )
        .catch(console.error)
    }

    const dateChanged = current.start_date !== finalRow.start_date
    const timeChanged = current.start_time !== finalRow.start_time
    const rescheduled = dateChanged || timeChanged

    if (rescheduled && finalRow.source !== "unavailable") {
      import("@/lib/services/whatsapp-automation.service")
        .then(({ onAppointmentRescheduled }) =>
          onAppointmentRescheduled(finalRow, "manual"),
        )
        .catch(console.error)
      import("@/lib/services/notification-automation.service")
        .then(({ onAppointmentRescheduled }) =>
          onAppointmentRescheduled(finalRow, "manual"),
        )
        .catch(console.error)
    } else {
      const prevStatus = String(current.status)
      const nextStatus = String(normalizedStatus)
      if (prevStatus !== nextStatus) {
        import("@/lib/services/whatsapp-automation.service")
          .then(({ onAppointmentStatusChanged }) =>
            onAppointmentStatusChanged(finalRow, prevStatus, nextStatus, "manual"),
          )
          .catch(console.error)
        import("@/lib/services/notification-automation.service")
          .then(({ onAppointmentStatusChanged }) =>
            onAppointmentStatusChanged(finalRow, prevStatus, nextStatus, "manual"),
          )
          .catch(console.error)
      }
    }

    return { success: true, item: finalRow }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao atualizar agendamento" }
  }
}

export async function deleteAppointmentAction(appointmentId: string, notifyClient: boolean = true, cancellationNote?: string) {
  try {
    if (!appointmentId) return { success: false, error: "Agendamento inválido" }
    const { partnerId, user } = await getPartnerContextWithPermission("delete")
    const supabase = await getSupabaseServerClient()

    // Log the deletion and optionally notify
    const { data: current } = await supabase
      .from("appointments")
      .select("id, partner_id, customer_id, customer_name, service_name, start_date, start_time, marketplace_order_id, source, status")
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .single()

    if (current) {
      await logAuditEvent({
        partnerId,
        actorUserId: user.id,
        entityType: "appointment",
        entityId: appointmentId,
        actionType: "deleted",
        changeLines: [`excluiu agendamento de ${current.customer_name} (${current.service_name}).`],
      })

      if (notifyClient && current.source !== "unavailable") {
        const currentWithNote = cancellationNote ? { ...current, cancellation_note: cancellationNote } : current

        import("@/lib/services/whatsapp-automation.service")
          .then(({ onAppointmentStatusChanged }) =>
            onAppointmentStatusChanged(currentWithNote, current.status, "Cancelado", "manual"),
          )
          .catch(console.error)

        import("@/lib/services/notification-automation.service")
          .then(({ onAppointmentStatusChanged }) =>
            onAppointmentStatusChanged(currentWithNote, current.status, "Cancelado", "manual"),
          )
          .catch(console.error)
      }

      if (current.customer_id) {
        try {
          const { refundSubscriptionCredits } = await import("@/lib/services/credit.service")
          await refundSubscriptionCredits(supabase, {
            partnerId,
            customerId: current.customer_id,
            appointmentId,
          })
        } catch (err) {
          console.error("[deleteAppointment] Error refunding credits:", err)
        }
      }
    }

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)

    if (error) throw error

    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.services(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
    revalidatePath("/erp/painel")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao excluir agendamento" }
  }
}

export async function deleteUnavailableSeriesAction(partnerId: string, serviceName: string) {
  try {
    const { user } = await getPartnerContextWithPermission("delete")
    const supabase = await getSupabaseServerClient()

    // Only delete "unavailable" sources with matching service name
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("partner_id", partnerId)
      .eq("service_name", serviceName)
      .eq("source", "unavailable")

    if (error) throw error

    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "appointment",
      entityId: "batch",
      actionType: "deleted",
      changeLines: [`excluiu série de horários indisponíveis: ${serviceName}.`],
    })

    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.services(partnerId))
    safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
    revalidatePath("/erp/painel")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao excluir série" }
  }
}

export async function getAppointmentHistoryAction(appointmentId: string) {
  try {
    if (!appointmentId) return { success: false, history: [], error: "Agendamento inválido" }
    const { partnerId } = await getPartnerContextWithPermission("view")
    const timeline = await getAdminTimeline("appointment", appointmentId, partnerId, 50)
    const history = timeline.map((entry, idx) => ({
      id: entry.id || `${idx}`,
      type: entry.action_type,
      description: entry.change_lines?.[0] || "Atualização no agendamento",
      timestamp: entry.created_at,
      user: entry.actor_name || "Sistema",
    }))
    return { success: true, history }
  } catch (error: any) {
    return { success: false, history: [], error: error?.message || "Erro ao buscar histórico" }
  }
}

export async function getMarketplaceOrderDetailsAction(orderId: string, partnerId: string) {
  try {
    const user = await requireUser()
    if (!user) return null
    await requirePermission(partnerId, "orders", "view")
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
      .from("orders")
      .select("total_amount, payment_method, paid_amount, situation, order_source")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!data) return null
    return {
      totalAmount: Number(data.total_amount || 0),
      paymentMethod: data.payment_method || '',
      paidAmount: Number(data.paid_amount || 0),
      situation: data.situation || 'pending',
      orderSource: data.order_source || '',
    }
  } catch {
    return null
  }
}

export async function getAppointmentOrderItemsAction(orderId: string, partnerId: string) {
  try {
    const user = await requireUser()
    if (!user) return null
    await requirePermission(partnerId, "orders", "view")
    const supabase = await getSupabaseServerClient()
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("situation, total_amount, paid_amount")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, line_type, product_id, product_name, product_price, quantity, subtotal, service_id, is_gift, original_price")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
    ])
    if (!orderRes.data) return null
    return {
      situation: orderRes.data.situation || "pending",
      totalAmount: Number(orderRes.data.total_amount || 0),
      paidAmount: Number(orderRes.data.paid_amount || 0),
      items: (itemsRes.data || []).map((item: any) => ({
        id: item.id,
        lineType: item.line_type || "product",
        productName: item.product_name,
        productPrice: Number(item.product_price || 0),
        quantity: Number(item.quantity || 0),
        subtotal: Number(item.subtotal || 0),
        serviceId: item.service_id || null,
        isGift: Boolean(item.is_gift),
        originalPrice: item.original_price ? Number(item.original_price) : null,
      })),
    }
  } catch {
    return null
  }
}

export async function getAppointmentOrderDataAction(orderId: string, partnerId: string) {
  try {
    const user = await requireUser()
    if (!user) return null
    await requirePermission(partnerId, "orders", "view")
    const supabase = await getSupabaseServerClient()
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("order_number, situation, total_amount, paid_amount, payment_method, order_source")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, line_type, product_name, product_price, quantity, subtotal, service_id, is_gift, original_price")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
    ])
    if (!orderRes.data) return null
    return {
      orderNumber: orderRes.data.order_number || null,
      situation: orderRes.data.situation || "pending",
      totalAmount: Number(orderRes.data.total_amount || 0),
      paidAmount: Number(orderRes.data.paid_amount || 0),
      paymentMethod: orderRes.data.payment_method || "",
      orderSource: orderRes.data.order_source || "",
      items: (itemsRes.data || []).map((item: any) => ({
        id: item.id,
        lineType: item.line_type || "product",
        productName: item.product_name,
        productPrice: Number(item.product_price || 0),
        quantity: Number(item.quantity || 0),
        subtotal: Number(item.subtotal || 0),
        serviceId: item.service_id || null,
        isGift: Boolean(item.is_gift),
        originalPrice: item.original_price ? Number(item.original_price) : null,
      })),
    }
  } catch {
    return null
  }
}

export async function getAppointmentDetailsDataAction(params: {
  appointmentId?: string
  partnerId: string
  linkedOrderId?: string | null
  includePlan?: boolean
}) {
  try {
    const user = await requireUser()
    if (!user) return { success: false, error: "Não autenticado" }

    const { appointmentId, partnerId, linkedOrderId } = params
    const includePlan = params.includePlan ?? !appointmentId

    // Verify view permissions once
    await requirePermission(partnerId, "appointments", "view")

    const supabase = createAdminClient()

    // Run all database fetches in parallel on the server
    const [partnerPlanRes, appointmentItemsRes, orderDataRes] = await Promise.all([
      // The plan is only needed by the item editor. Avoid this query when a
      // read-only appointment is opened.
      includePlan ? supabase
        .from("subscriptions")
        .select("plan_id, status")
        .eq("partner_id", partnerId)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle() : Promise.resolve({ data: null, error: null }),

      // Keep the hot path flat. Joining products/services here made an empty
      // stock tab wait on a much heavier relational query.
      appointmentId ? supabase
        .from("appointment_items")
        .select(`
            id, appointment_id, product_id, variant_id, service_id,
            name, quantity, usage_type, created_at, updated_at
        `)
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true })
        .limit(500) : Promise.resolve({ data: null, error: null }),

      // 4. Order and Order items (if linkedOrderId provided)
      linkedOrderId ? Promise.all([
        supabase
          .from("orders")
          .select("order_number, situation, total_amount, paid_amount, payment_method, order_source")
          .eq("id", linkedOrderId)
          .eq("partner_id", partnerId)
          .maybeSingle(),
        supabase
          .from("order_items")
          .select("id, line_type, product_name, product_price, quantity, subtotal, service_id, is_gift, original_price")
          .eq("order_id", linkedOrderId)
          .order("created_at", { ascending: true })
      ]) : Promise.resolve([null, null])
    ])

    // Process Partner Plan
    let planSlug = 'free'
    if (partnerPlanRes.data?.plan_id) {
      const { data: plan } = await supabase
        .from("plans")
        .select("slug")
        .eq("id", partnerPlanRes.data.plan_id)
        .maybeSingle()
      planSlug = plan?.slug || 'free'
    }

    // Enrich appointment items only when there are actual product/service IDs.
    let appointmentItems = []
    if (appointmentItemsRes.data) {
      const productIds = [...new Set(appointmentItemsRes.data.map((item: any) => item.product_id).filter(Boolean))]
      const serviceIds = [...new Set(appointmentItemsRes.data.map((item: any) => item.service_id).filter(Boolean))]
      const [productsRes, servicesRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from("products").select("id, name, sku, stock_available, images").in("id", productIds)
          : Promise.resolve({ data: [] }),
        serviceIds.length > 0
          ? supabase.from("services").select("id, name").in("id", serviceIds)
          : Promise.resolve({ data: [] }),
      ])
      const productsMap = new Map<string, any>((productsRes.data || []).map((product: any) => [String(product.id), product]))
      const servicesMap = new Map<string, any>((servicesRes.data || []).map((service: any) => [String(service.id), service]))
      appointmentItems = appointmentItemsRes.data.map((item: any) => {
        const p = item.product_id ? productsMap.get(String(item.product_id)) : null
        const s = item.service_id ? servicesMap.get(String(item.service_id)) : null
        return {
          id: item.id,
          appointmentId: item.appointment_id,
          productId: item.product_id,
          variantId: item.variant_id,
          serviceId: item.service_id,
          name: item.name,
          quantity: item.quantity,
          usageType: item.usage_type,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          product: p ? {
            name: p.name,
            sku: p.sku || 'N/A',
            image: p.images?.[0] || null,
            stock: p.stock_available ?? 0,
          } : null,
          serviceName: s?.name || null,
        }
      })
    }

    // Process Order Data
    let orderData = null
    if (linkedOrderId && orderDataRes) {
      const [orderRes, itemsRes] = orderDataRes as any
      if (orderRes?.data) {
        orderData = {
          orderNumber: orderRes.data.order_number || null,
          situation: orderRes.data.situation || "pending",
          totalAmount: Number(orderRes.data.total_amount || 0),
          paidAmount: Number(orderRes.data.paid_amount || 0),
          paymentMethod: orderRes.data.payment_method || "",
          orderSource: orderRes.data.order_source || "",
          items: (itemsRes?.data || []).map((item: any) => ({
            id: item.id,
            lineType: item.line_type || "product",
            productName: item.product_name,
            productPrice: Number(item.product_price || 0),
            quantity: Number(item.quantity || 0),
            subtotal: Number(item.subtotal || 0),
            serviceId: item.service_id || null,
            isGift: Boolean(item.is_gift),
            originalPrice: item.original_price ? Number(item.original_price) : null,
          })),
        }
      }
    }

    return {
      success: true,
      data: {
        defaultFinanceAccountId: null,
        planSlug,
        appointmentItems,
        orderData,
      }
    }
  } catch (err: any) {
    console.error("getAppointmentDetailsDataAction error:", err)
    return { success: false, error: err.message || "Erro ao buscar dados do agendamento" }
  }
}

