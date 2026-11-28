"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import {
  evaluateNoShowAlerts,
  evaluateStagnantServices,
  evaluatePendingConfirmations,
  evaluateRescheduleOpportunities,
  evaluateRetentionOpportunities,
  toDateStr,
  subtractDays,
  addDays,
  APPOINTMENT_LIST_COLUMNS,
  type NoShowAlertsResult,
  type StagnantServicesResult,
  type PendingConfirmationAlert,
  type RescheduleOpportunity,
  type RetentionOpportunity,
} from "@/lib/erp/appointment-insights"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { sanitizeNotes } from "@/lib/input-validator"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { revalidatePath, revalidateTag } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { applyServiceOrderToGoals } from "@/lib/services/sales-goals.service"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { startOfDay, getTodayYmd, getDateComponents } from "@/lib/date"
import { getAdminTimeline } from "@/lib/services/timeline.service"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { resolveAppointmentCustomerIds } from "@/lib/erp/appointment-customer-resolution"
import { formatCurrency, formatDateToBR } from "@/lib/utils/formatters"

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

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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

async function requireAppointmentOrderView(orderId: string, partnerId: string) {
  await requirePermission(partnerId, "orders", "view")
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from("orders")
    .select("id, store_id")
    .eq("id", orderId)
    .eq("partner_id", partnerId)
    .maybeSingle()
  if (error || !order) throw new Error("Pedido não encontrado.")
  if (order.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "view")
  return order
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

function normalizeHistoryValue(value: unknown): string {
  return String(value ?? "").trim()
}

function formatAppointmentSlot(date?: string | null, time?: string | null): string {
  const formattedDate = date ? formatDateToBR(String(date).slice(0, 10)) : ""
  const formattedTime = time ? String(time).slice(0, 5) : ""
  if (formattedDate && formattedTime) return `${formattedDate} às ${formattedTime}`
  return formattedDate || formattedTime || "horário não informado"
}

/**
 * Monta linhas de histórico específicas do agendamento.
 *
 * Evita o genérico "atualizou informações", que fazia o histórico perder o
 * contexto e ainda podia ser interpretado como uma solicitação de troca/devolução.
 */
function buildAppointmentUpdateLines(
  current: Record<string, any>,
  updated: Record<string, any>,
  paymentStatus: string,
  paidAmount: number,
): string[] {
  const lines: string[] = []

  const oldStatus = normalizeHistoryValue(current.status)
  const newStatus = normalizeHistoryValue(updated.status)
  if (newStatus && oldStatus !== newStatus) {
    lines.push(`Status do agendamento alterado de "${oldStatus || "não informado"}" para "${newStatus}".`)
  }

  const oldDate = normalizeHistoryValue(current.start_date)
  const oldTime = normalizeHistoryValue(current.start_time)
  const newDate = normalizeHistoryValue(updated.start_date)
  const newTime = normalizeHistoryValue(updated.start_time)
  if ((oldDate !== newDate || oldTime.slice(0, 5) !== newTime.slice(0, 5)) && (newDate || newTime)) {
    lines.push(`Reagendou o atendimento de ${formatAppointmentSlot(oldDate, oldTime)} para ${formatAppointmentSlot(newDate, newTime)}.`)
  }

  const oldDuration = Number(current.duration_minutes || 0)
  const newDuration = Number(updated.duration_minutes || 0)
  if (oldDuration !== newDuration && newDuration > 0) {
    lines.push(`Alterou a duração do atendimento de ${oldDuration} min para ${newDuration} min.`)
  }

  const oldService = normalizeHistoryValue(current.service_name)
  const newService = normalizeHistoryValue(updated.service_name)
  if (newService && oldService !== newService) {
    lines.push(`Alterou o serviço de "${oldService || "não informado"}" para "${newService}".`)
  }

  const oldStaff = normalizeHistoryValue(current.staff_name)
  const newStaff = normalizeHistoryValue(updated.staff_name)
  if (newStaff && oldStaff !== newStaff) {
    lines.push(`Alterou o profissional de "${oldStaff || "não informado"}" para "${newStaff}".`)
  }

  const oldCustomer = normalizeHistoryValue(current.customer_name)
  const newCustomer = normalizeHistoryValue(updated.customer_name)
  if (newCustomer && oldCustomer !== newCustomer) {
    lines.push(`Alterou o cliente de "${oldCustomer || "não informado"}" para "${newCustomer}".`)
  }

  const oldPrice = Number(current.price || 0)
  const newPrice = Number(updated.price || 0)
  if (Math.abs(oldPrice - newPrice) > 0.009) {
    lines.push(`Alterou o valor de ${formatCurrency(oldPrice)} para ${formatCurrency(newPrice)}.`)
  }

  const oldPaymentStatus = normalizeHistoryValue(current.payment_status)
  const newPaymentStatus = normalizeHistoryValue(paymentStatus)
  if (newPaymentStatus && oldPaymentStatus !== newPaymentStatus) {
    lines.push(`Alterou a situação de pagamento de "${oldPaymentStatus || "não informada"}" para "${newPaymentStatus}".`)
  }

  const oldPaidAmount = Number(current.paid_amount || 0)
  if (Math.abs(oldPaidAmount - Number(paidAmount || 0)) > 0.009) {
    lines.push(`Atualizou o valor pago de ${formatCurrency(oldPaidAmount)} para ${formatCurrency(paidAmount)}.`)
  }

  const oldNotes = normalizeHistoryValue(current.notes)
  const newNotes = normalizeHistoryValue(updated.notes)
  if (oldNotes !== newNotes) {
    lines.push(newNotes ? "Atualizou as observações do agendamento." : "Removeu as observações do agendamento.")
  }

  return lines
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

  const capabilities = await getPartnerCapabilities(params.partnerId, { storeId: params.appointment.store_id || null })

  let paymentTransactionId = existingPaymentTx?.id || null
  if (capabilities.hasFinancial && !paymentTransactionId) {
    const nowIso = new Date().toISOString()
    const { data: txResult, error: txError } = await createAdminClient().rpc(
      "create_appointment_payment_transaction_atomic",
      {
        p_partner_id: params.partnerId,
        p_appointment_id: params.appointment.id,
        p_rows: [{
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
        }],
      },
    )
    if (txError) throw txError
    paymentTransactionId = txResult?.transactionId || null
    if (!paymentTransactionId) throw new Error("A RPC não retornou a transação de pagamento do agendamento.")
  }

  if (capabilities.hasProductivity) {
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
  }

  return { saleId: params.appointment.marketplace_order_id || null, paymentTransactionId }
}

async function syncAppointmentReceivable(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  userId: string
  appointment: any
  currentReceivableId?: string | null
}) {
  const capabilities = await getPartnerCapabilities(params.partnerId, { storeId: params.appointment.store_id || null })
  if (!capabilities.hasFinancial) return params.currentReceivableId || null

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
    const { partnerId, storeId } = await getPartnerContextWithPermission("view")
    if (!storeId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(storeId, partnerId, "appointments", "view")
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("partner_id", partnerId)
      .or(`store_id.eq.${storeId},store_id.is.null`)
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) throw error
    return { success: true, items: data || [] }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao buscar agendamentos", items: [] }
  }
}


const MAX_APPOINTMENT_DURATION_MINUTES = 525600; // 1 year (365 days)

/**
 * Fetch appointments within a date range, with optional staff filter.
 * All filtering is done at the database level - no in-memory filtering.
 *
 * Uses the standard interval overlap condition:
 *   start_date <= queryEnd AND (end_date >= queryStart OR end_date IS NULL)
 */
export async function getAppointmentsByDateRangeAction(
  startDate: string,
  endDate: string,
  staffId?: string | null,
  storeIdParam?: string | null
) {
  try {
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      throw new Error("Período de agendamento inválido")
    }
    const { partnerId, storeId: contextStoreId } = await getPartnerContextWithPermission("view")
    const activeStoreId = storeIdParam || contextStoreId
    if (!activeStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(activeStoreId, partnerId, "appointments", "view")
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("appointments")
      .select(APPOINTMENT_LIST_COLUMNS)
      .eq("partner_id", partnerId)
      .lte("start_date", endDate)
      .or(`end_date.gte.${startDate},and(end_date.is.null,start_date.gte.${startDate})`)

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

/**
 * Sugestões & Oportunidades - clientes com faltas recorrentes ("Ausência") no período.
 */
export async function getNoShowAlertsAction(
  partnerId: string,
  periodDays: number = 90,
  storeId?: string
): Promise<{ error: string } | NoShowAlertsResult> {
  try {
    const context = await getPartnerContextWithPermission("view")
    if (context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    const effectiveStoreId = storeId || context.storeId
    if (!effectiveStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(effectiveStoreId, partnerId, "appointments", "view")
    const admin = createAdminClient()

    const days = Math.max(1, Math.min(365, Number(periodDays) || 90))
    const today = toDateStr(new Date())
    const cutoff = subtractDays(today, days)

    const columns = "id, customer_id, customer_name, start_date, status, price, source, store_id"

    let pastQuery = admin
      .from("appointments")
      .select(columns)
      .eq("partner_id", partnerId)
      .gte("start_date", cutoff)
      .lte("start_date", today)
    let futureQuery = admin
      .from("appointments")
      .select(columns)
      .eq("partner_id", partnerId)
      .gt("start_date", today)

    pastQuery = pastQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
    futureQuery = futureQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    const [{ data: past, error }, { data: future, error: futureError }] = await Promise.all([
      pastQuery.order("start_date", { ascending: false }).limit(2000),
      futureQuery.order("start_date", { ascending: true }).limit(2000),
    ])

    if (error) return { error: error.message }
    if (futureError) return { error: futureError.message }

    return evaluateNoShowAlerts(past || [], future || [], { periodDays: days, today })
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Sugestões & Oportunidades - agendamentos próximos (próximos 7 dias) aguardando confirmação.
 */
export async function getPendingConfirmationsAction(
  partnerId: string,
  storeId?: string,
  lookaheadDays: number = 7
): Promise<{ error: string } | { items: PendingConfirmationAlert[] }> {
  try {
    const context = await getPartnerContextWithPermission("view")
    if (context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    const effectiveStoreId = storeId || context.storeId
    if (!effectiveStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(effectiveStoreId, partnerId, "appointments", "view")
    const admin = createAdminClient()

    const today = toDateStr(new Date())
    const maxDate = addDays(today, Math.max(1, Math.min(30, lookaheadDays)))

    let query = admin
      .from("appointments")
      .select("id, customer_id, customer_name, service_name, staff_name, start_date, start_time, duration_minutes, status, price, notes, source, store_id, needs_reschedule, customers:customer_id(image_url, phone)")
      .eq("partner_id", partnerId)
      .gte("start_date", today)
      .lte("start_date", maxDate)
      .neq("source", "unavailable")

    query = query.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    const { data, error } = await query
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500)

    if (error) return { error: error.message }

    const rows = (data || []).map((row: any) => ({
      ...row,
      customer_avatar: row.customers?.image_url || null,
      phone: row.customers?.phone || null,
    }))

    const items = evaluatePendingConfirmations(rows, { today, lookaheadDays })
    return { items }
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Sugestões & Oportunidades - agendamentos que necessitam reagendamento ou cancelamentos recentes sem remarcação.
 */
export async function getRescheduleAlertsAction(
  partnerId: string,
  storeId?: string,
  lookbackDays: number = 30
): Promise<{ error: string } | { items: RescheduleOpportunity[] }> {
  try {
    const context = await getPartnerContextWithPermission("view")
    if (context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    const effectiveStoreId = storeId || context.storeId
    if (!effectiveStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(effectiveStoreId, partnerId, "appointments", "view")
    const admin = createAdminClient()

    const today = toDateStr(new Date())
    const cutoff = subtractDays(today, Math.max(1, Math.min(90, lookbackDays)))

    let query = admin
      .from("appointments")
      .select("id, customer_id, customer_name, service_name, staff_name, start_date, start_time, duration_minutes, status, price, notes, source, store_id, needs_reschedule, customers:customer_id(image_url)")
      .eq("partner_id", partnerId)
      .or(`needs_reschedule.eq.true,and(status.ilike.%cancel%,start_date.gte.${cutoff})`)
      .neq("source", "unavailable")

    query = query.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    let futureQuery = admin
      .from("appointments")
      .select("id, customer_id, customer_name, start_date, status, source, store_id")
      .eq("partner_id", partnerId)
      .gte("start_date", today)
      .neq("source", "unavailable")

    futureQuery = futureQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    const [{ data, error }, { data: future, error: futureError }] = await Promise.all([
      query.order("start_date", { ascending: false }).limit(500),
      futureQuery.limit(1000),
    ])

    if (error) return { error: error.message }
    if (futureError) return { error: futureError.message }

    const rows = (data || []).map((row: any) => ({
      ...row,
      customer_avatar: row.customers?.image_url || null,
    }))

    const items = evaluateRescheduleOpportunities(rows, future || [], { today, lookbackDays })
    return { items }
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Sugestões & Oportunidades - clientes fiéis/recorrentes sem novos agendamentos há mais de X dias (risco de churn).
 */
export async function getRetentionOpportunitiesAction(
  partnerId: string,
  minDays: number = 30,
  storeId?: string
): Promise<{ error: string } | { items: RetentionOpportunity[] }> {
  try {
    const context = await getPartnerContextWithPermission("view")
    if (context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    const effectiveStoreId = storeId || context.storeId
    if (!effectiveStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(effectiveStoreId, partnerId, "appointments", "view")
    const admin = createAdminClient()

    const today = toDateStr(new Date())
    const days = Math.max(15, Math.min(180, Number(minDays) || 30))
    const cutoff = subtractDays(today, 180)

    let pastQuery = admin
      .from("appointments")
      .select("id, customer_id, customer_name, service_name, staff_name, start_date, status, price, source, store_id, customers:customer_id(image_url)")
      .eq("partner_id", partnerId)
      .gte("start_date", cutoff)
      .lte("start_date", today)
      .neq("source", "unavailable")

    let futureQuery = admin
      .from("appointments")
      .select("id, customer_id, customer_name, start_date, status, source, store_id")
      .eq("partner_id", partnerId)
      .gte("start_date", today)
      .neq("source", "unavailable")

    pastQuery = pastQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
    futureQuery = futureQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    const [{ data: past, error }, { data: future, error: futureError }] = await Promise.all([
      pastQuery.order("start_date", { ascending: false }).limit(2500),
      futureQuery.limit(2000),
    ])

    if (error) return { error: error.message }
    if (futureError) return { error: futureError.message }

    const rows = (past || []).map((row: any) => ({
      ...row,
      customer_avatar: row.customers?.image_url || null,
    }))

    const items = evaluateRetentionOpportunities(rows, future || [], { today, minDaysSinceLast: days, maxPeriodDays: 180 })
    return { items }
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Confirma rapidamente um agendamento diretamente pela sheet de sugestões.
 */
export async function confirmAppointmentQuickAction(
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { partnerId } = await getPartnerContextWithPermission("edit")
    const supabase = await getSupabaseServerClient()

    const { data: apt, error: findError } = await supabase
      .from("appointments")
      .select("id, partner_id, customer_name, service_name, store_id")
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .single()

    if (findError || !apt) throw new Error("Agendamento não encontrado")

    const { error: updateError } = await supabase
      .from("appointments")
      .update({
        status: "Confirmado",
        needs_reschedule: false,
      })
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)

    if (updateError) throw updateError

    safeRevalidateTag(TAGS.appointments(partnerId))
    revalidatePath("/erp/agendamentos")

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao confirmar agendamento" }
  }
}

/**
 * Sugestões & Oportunidades - serviços ativos sem nenhum agendamento no período.
 */
export async function getStagnantServicesAction(
  partnerId: string,
  periodDays: number = 90,
  storeId?: string
): Promise<{ error: string } | StagnantServicesResult> {
  try {
    const context = await getPartnerContextWithPermission("view")
    if (context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    await requirePermission(partnerId, "services", "view")
    const effectiveStoreId = storeId || context.storeId
    if (!effectiveStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(effectiveStoreId, partnerId, "appointments", "view")
    await requireStorePermission(effectiveStoreId, partnerId, "services", "view")
    const admin = createAdminClient()

    const days = Math.max(1, Math.min(365, Number(periodDays) || 90))
    const today = toDateStr(new Date())
    const cutoff = subtractDays(today, days)

    let servicesQuery = admin
      .from("services")
      .select(
        "id, name, price, promotional_price, duration_minutes, category:service_categories!category_id(name), images, created_at, is_unavailable_type, store_id"
      )
      .eq("partner_id", partnerId)
    servicesQuery = scopeActiveOnly(servicesQuery)

    let usageQuery = admin
      .from("appointments")
      .select("service_id, service_name, start_date, source, status, store_id")
      .eq("partner_id", partnerId)
      .gte("start_date", cutoff)

    servicesQuery = servicesQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
    usageQuery = usageQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)

    const [{ data: services, error }, { data: usage, error: usageError }] = await Promise.all([
      servicesQuery.order("created_at", { ascending: true }).limit(200),
      usageQuery.order("start_date", { ascending: true }).limit(3000),
    ])

    if (error) return { error: error.message }
    if (usageError) return { error: usageError.message }

    const normalizedServices = (services || []).map((s: any) => ({
      ...s,
      category:
        s.category && typeof s.category === "object"
          ? s.category.name || null
          : s.category ?? null,
    }))

    return evaluateStagnantServices(normalizedServices, usage || [], { periodDays: days, today })
  } catch (error: any) {
    return { error: error.message }
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
    if (!isIsoDate(date)) throw new Error("Data inválida")
    const { partnerId, storeId: contextStoreId } = await getPartnerContextWithPermission("view")
    const targetStoreId = storeId || contextStoreId
    if (!targetStoreId) throw new Error("Loja ativa não encontrada")
    await requireStorePermission(targetStoreId, partnerId, "appointments", "view")
    const supabase = await getSupabaseServerClient()

    // Fetch existing appointments for this staff on this date
    let query = supabase
      .from("appointments")
      .select("id, start_time, end_time, duration_minutes, status")
      .eq("partner_id", partnerId)
      .eq("staff_partner_user_id", staffId)
      .lte("start_date", date)
      .or(`end_date.gte.${date},end_date.is.null`)

    query = query.eq("store_id", targetStoreId)

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
    if (targetStoreId) {
      storeQuery = storeQuery.eq("id", targetStoreId)
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

    const today = getTodayYmd()
    const { hour: currentHour, minute: currentMinute } = getDateComponents(new Date())
    const currentMinutes = currentHour * 60 + currentMinute

    const slots: string[] = []
    const conflictingSlots: string[] = []

    // Never offer dates that are already in the past.
    if (date < today) {
      return { success: true, slots, conflictingSlots }
    }

    if (daySchedule && daySchedule.enabled) {
      const dayStartMin = parseTimeToMinutes(daySchedule.from)
      let dayEndMin = parseTimeToMinutes(daySchedule.to)
      if (dayEndMin <= dayStartMin) dayEndMin += 24 * 60
      const totalDurationNeeded = serviceDurationMinutes + bufferMinutes

      // On the current day, hide slots that have already started.
      const minSlotStart = date === today ? currentMinutes : -1

      for (let slotStart = dayStartMin; slotStart + serviceDurationMinutes <= dayEndMin; slotStart += SLOT_INCREMENT_MINUTES) {
        if (slotStart <= minSlotStart) continue

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
    // The partner permission is not sufficient for a store-scoped user. Check
    // every destination store before inserting any appointments.
    const targetStoreIds = Array.from(new Set(rows.map((row) => row.store_id).filter(Boolean))) as string[]
    await Promise.all(targetStoreIds.map((targetStoreId) =>
      requireStorePermission(targetStoreId, partnerId, "appointments", "create"),
    ))

    // Resolve every referenced product, variant and service before inserting
    // appointments. Client-supplied IDs must belong to this partner and to
    // the appointment's store (or be partner-wide resources).
    const requestedItems = payload.flatMap((appointment, appointmentIndex) =>
      (appointment.items || []).map((item) => ({ item, appointmentIndex })),
    )
    if (payload.length > 100 || requestedItems.length > 1000) {
      throw new Error("O lote de agendamentos excede o limite permitido")
    }
    const productIds = Array.from(new Set(requestedItems.map(({ item }) => item.product_id).filter(Boolean))) as string[]
    const variantIds = Array.from(new Set(requestedItems.map(({ item }) => item.variant_id).filter(Boolean))) as string[]
    const serviceIds = Array.from(new Set(requestedItems.map(({ item }) => item.service_id).filter(Boolean))) as string[]
    const [productsResult, variantsResult, servicesResult] = await Promise.all([
      productIds.length
        ? supabase.from("products").select("id, store_id").eq("partner_id", partnerId).in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      variantIds.length
        ? supabase.from("product_variants").select("id, product_id").in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
      serviceIds.length
        ? supabase.from("services").select("id, store_id").eq("partner_id", partnerId).in("id", serviceIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (productsResult.error || variantsResult.error || servicesResult.error) {
      throw new Error("Não foi possível validar os itens do agendamento")
    }
    const productsById = new Map((productsResult.data || []).map((row: any) => [String(row.id), row]))
    const variantsById = new Map((variantsResult.data || []).map((row: any) => [String(row.id), row]))
    const servicesById = new Map((servicesResult.data || []).map((row: any) => [String(row.id), row]))
    if (productsById.size !== productIds.length || variantsById.size !== variantIds.length || servicesById.size !== serviceIds.length) {
      throw new Error("Um produto, variação ou serviço não pertence a este parceiro")
    }
    for (const { item, appointmentIndex } of requestedItems) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("Quantidade inválida para item do agendamento")
      }
      if (!["consumed", "returnable", "reference"].includes(item.usage_type)) {
        throw new Error("Tipo de uso inválido para item do agendamento")
      }
      const product = item.product_id ? productsById.get(String(item.product_id)) : null
      const variant = item.variant_id ? variantsById.get(String(item.variant_id)) : null
      const service = item.service_id ? servicesById.get(String(item.service_id)) : null
      if (item.variant_id && (!product || !variant || String(variant.product_id) !== String(item.product_id))) {
        throw new Error("A variação não pertence ao produto informado")
      }
      const appointmentStoreId = rows[appointmentIndex]?.store_id || null
      for (const resource of [product, service]) {
        if (resource?.store_id && resource.store_id !== appointmentStoreId) {
          throw new Error("Um item do agendamento pertence a outra loja")
        }
      }
    }
    const customerIds = await resolveAppointmentCustomerIds(
      supabase,
      partnerId,
      rows.map((row) => row.customer_id),
    )

    // Resolve both explicit order links and order_item_id references before
    // inserting. Never persist a foreign partner's order/item association.
    const requestedOrderItemIds = Array.from(new Set(rows.map((row) => row.order_item_id).filter(Boolean))) as string[]
    const { data: orderItems, error: orderItemsError } = requestedOrderItemIds.length > 0
      ? await supabase.from("order_items").select("id, order_id").in("id", requestedOrderItemIds)
      : { data: [] as Array<{ id: string; order_id: string | null }>, error: null }
    if (orderItemsError) throw orderItemsError
    const orderItemsById = new Map((orderItems || []).map((item) => [String(item.id), item]))
    if (orderItemsById.size !== requestedOrderItemIds.length) {
      throw new Error("Um item de pedido não foi encontrado")
    }

    const requestedOrderIds = Array.from(new Set([
      ...rows.map((row) => row.marketplace_order_id),
      ...(orderItems || []).map((item) => item.order_id),
    ].filter(Boolean))) as string[]
    const { data: linkedOrders, error: linkedOrdersError } = requestedOrderIds.length > 0
      ? await supabase.from("orders").select("id, customer_id, store_id").eq("partner_id", partnerId).in("id", requestedOrderIds)
      : { data: [] as Array<{ id: string; customer_id: string | null; store_id: string | null }>, error: null }
    if (linkedOrdersError) throw linkedOrdersError
    const ordersById = new Map((linkedOrders || []).map((order) => [String(order.id), order]))
    if (ordersById.size !== requestedOrderIds.length) {
      throw new Error("Um pedido não pertence a este parceiro")
    }
    const customerIdByOrderId = new Map((linkedOrders || []).map((order) => [String(order.id), order.customer_id as string | null]))

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const orderItemId = row.order_item_id
      const itemOrderId = orderItemId ? orderItemsById.get(String(orderItemId))?.order_id || null : null
      if (orderItemId && !itemOrderId) throw new Error("O item do pedido não está vinculado a um pedido")
      if (row.marketplace_order_id && itemOrderId && row.marketplace_order_id !== itemOrderId) {
        throw new Error("O item e o pedido informados não correspondem")
      }
      const resolvedOrderId = row.marketplace_order_id || itemOrderId
      if (resolvedOrderId) {
        const order = ordersById.get(String(resolvedOrderId))
        if (!order) throw new Error("Pedido não encontrado neste parceiro")
        if (order.store_id && order.store_id !== rows[index].store_id) {
          throw new Error("O pedido pertence a outra loja")
        }
        row.marketplace_order_id = String(order.id)
      }

      const rawCustomerId = String(row.customer_id || "").trim()
      // Never trust a client-provided customer ID: marketplace orders may pass
      // an auth user ID, which must be resolved to this partner's customer row.
      row.customer_id = customerIds.get(rawCustomerId) || null
      if (!row.customer_id && row.marketplace_order_id) {
        row.customer_id = customerIdByOrderId.get(row.marketplace_order_id) || null
      }
    }

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

    // Validate 1-year max duration and dates
    for (const row of rows) {
      if (row.duration_minutes > MAX_APPOINTMENT_DURATION_MINUTES) {
        return { success: false, error: "A duração do agendamento não pode exceder 1 ano (365 dias).", created: [] }
      }
      if (row.start_date && row.end_date && row.start_date > row.end_date) {
        return { success: false, error: "A data final do agendamento não pode ser anterior à data inicial.", created: [] }
      }
    }

    const { data, error } = await supabase.from("appointments").insert(rows).select("*")
    if (error) throw error

    const createdRows = data || []

    // Fetch linked item/order state once per unique ID. These are reads only;
    // order creation, appointment updates, stock work, and financial work below
    // remain sequential so their existing dependency and partial-failure order
    // is preserved.
    const linkedOrderIds = new Set<string>()
    const orderItemIdsToResolve = new Set<string>()
    for (let i = 0; i < createdRows.length; i++) {
      const row = createdRows[i]
      const linkedOrderId = row.marketplace_order_id || payload[i]?.orderId || (payload[i] as any)?.marketplaceOrderId
      const orderItemId = row.order_item_id || payload[i]?.orderItemId || (payload[i] as any)?.order_item_id
      if (linkedOrderId) linkedOrderIds.add(String(linkedOrderId))
      else if (orderItemId) orderItemIdsToResolve.add(String(orderItemId))
    }
    const linkedOrderItemsResult = orderItemIdsToResolve.size > 0
      ? await supabase.from("order_items").select("id, order_id").in("id", Array.from(orderItemIdsToResolve))
      : { data: [] as Array<{ id: string; order_id: string | null }> }
    const orderIdByOrderItemId = new Map((linkedOrderItemsResult.data || []).map((item) => [String(item.id), item.order_id as string | null]))
    for (const orderId of orderIdByOrderItemId.values()) {
      if (orderId) linkedOrderIds.add(orderId)
    }
    const linkedOrdersResult = linkedOrderIds.size > 0
      ? await supabase
        .from("orders")
        .select("id, situation")
        .eq("partner_id", partnerId)
        .in("id", Array.from(linkedOrderIds))
      : { data: [] as Array<{ id: string; situation: string | null }> }
    const situationByOrderId = new Map((linkedOrdersResult.data || []).map((order) => [String(order.id), order.situation as string | null]))

    // -- Post-insert processing (optimized: skip unnecessary work, batch where safe) --
    // Receivable sync is only needed for appointments with price > 0
    // Unavailable slots (price=0) never need receivables
    const receivableUpdates: Array<{ id: string; receivableId: string }> = []
    for (let i = 0; i < createdRows.length; i++) {
      const row = createdRows[i]
      const price = Number(row.price || 0)
      let linkedOrderId = row.marketplace_order_id || payload[i]?.orderId || (payload[i] as any)?.marketplaceOrderId
      const orderItemId = row.order_item_id || payload[i]?.orderItemId || (payload[i] as any)?.order_item_id

      if (!linkedOrderId && orderItemId) linkedOrderId = orderIdByOrderItemId.get(String(orderItemId)) || null

      if (linkedOrderId) {
        // Appointment is linked to an existing order (ERP/POS service sale)
        // Skip creating a new order and skip creating new receivables!
        const existingOrderSituation = situationByOrderId.get(String(linkedOrderId))

        const targetPaymentStatus = existingOrderSituation === "paid"
          ? "paid"
          : (existingOrderSituation === "partially_paid" ? "partially_paid" : "unpaid")

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
              // Brinde: receita 0, custo real no CMV.
              unit_cost: Number(item.unit_cost || 0),
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
            name: String(item.name || "").trim().slice(0, 150),
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
      createdRows
        .filter((row: any) => row.source !== "unavailable")
        .map((row: any) =>
          logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "appointment",
            entityId: row.id,
            actionType: "created",
            changeLines: [
              `Agendamento criado para ${row.customer_name || "cliente"}: ${row.service_name || "serviço"} em ${formatAppointmentSlot(row.start_date, row.start_time)}.`,
            ],
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
      import("@/lib/services/notification-automation.service")
        .then(({ onAppointmentCreated }) => {
          for (const row of rowsToNotify) {
            onAppointmentCreated(row, "system").catch(console.error)
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

    if (current.store_id) {
      await requireStorePermission(current.store_id, partnerId, "appointments", "edit")
    }
    const targetStoreId = payload.storeId ?? current.store_id
    if (targetStoreId && targetStoreId !== current.store_id) {
      await requireStorePermission(targetStoreId, partnerId, "appointments", "edit")
    }

    const requestedServiceIds = Array.from(new Set([
      payload.serviceId,
      ...((payload.services || []).map((service) => service.id)),
    ].filter(Boolean))) as string[]
    if (requestedServiceIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, store_id")
        .eq("partner_id", partnerId)
        .in("id", requestedServiceIds)
      if (servicesError) throw servicesError
      if ((services || []).length !== requestedServiceIds.length) {
        throw new Error("Um serviço não pertence a este parceiro")
      }
      if ((services || []).some((service) => service.store_id && service.store_id !== targetStoreId)) {
        throw new Error("Um serviço pertence a outra loja")
      }
    }

    const requestedCustomerId = payload.customerId
    if (requestedCustomerId) {
      const resolvedCustomers = await resolveAppointmentCustomerIds(supabase, partnerId, [requestedCustomerId])
      const resolvedCustomerId = resolvedCustomers.get(String(requestedCustomerId).trim())
      if (!resolvedCustomerId) throw new Error("Cliente não pertence a este parceiro")
      payload = { ...payload, customerId: resolvedCustomerId }
    }

    const paymentStatusValue = (payload as any)?.paymentStatus ?? current.payment_status
    const paidAmountValue = Math.max(0, Number((payload as any)?.paidAmount ?? current.paid_amount ?? 0))

    const requestsSettlement =
      isPaidStatus(String(payload.status ?? current.status ?? "")) ||
      isPartialStatus(String(payload.status ?? current.status ?? "")) ||
      isPaidStatus(String(paymentStatusValue || "")) ||
      isPartialStatus(String(paymentStatusValue || "")) ||
      (payload as any)?.paidAmount !== undefined
    if (requestsSettlement) {
      await requirePermission(partnerId, "financial", "can_settle", user)
      const financialStoreIds = Array.from(new Set([current.store_id, targetStoreId].filter(Boolean))) as string[]
      await Promise.all(financialStoreIds.map((financialStoreId) =>
        requireStorePermission(financialStoreId, partnerId, "financial", "can_settle"),
      ))
    }

    const linkedOrderId = current.marketplace_order_id || null
    let linkedOrder: { situation?: string | null; store_id?: string | null; payment_method_discount_amount?: number | null; payment_method_extra_amount?: number | null } | null = null
    if (linkedOrderId) {
      await requirePermission(partnerId, "orders", "edit", user)
      if (current.store_id) await requireStorePermission(current.store_id, partnerId, "orders", "edit")
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("situation, store_id, payment_method_discount_amount, payment_method_extra_amount")
        .eq("id", linkedOrderId)
        .eq("partner_id", partnerId)
        .maybeSingle()
      if (orderError) throw orderError
      linkedOrder = orderData
      if (orderData?.store_id && orderData.store_id !== targetStoreId) {
        throw new Error("O pedido vinculado pertence a outra loja")
      }
    }

    const requestedPrice = payload.price === undefined ? Number(current.price || 0) : Number(payload.price || 0)
    if (!Number.isFinite(requestedPrice) || requestedPrice < 0) {
      throw new Error("Valor do agendamento inválido")
    }
    const requestedPaidAmount = Number((payload as any)?.paidAmount ?? current.paid_amount ?? 0)
    if (!Number.isFinite(requestedPaidAmount) || requestedPaidAmount < 0 || requestedPaidAmount > requestedPrice + 0.009) {
      throw new Error("Valor pago inválido para este agendamento")
    }
    if ((payload as any)?.paymentStatus !== undefined && !["paid", "partially_paid", "unpaid", "pending"].includes(String((payload as any).paymentStatus))) {
      throw new Error("Situação de pagamento inválida")
    }
    if (linkedOrder && isOrderPriceLocked(linkedOrder.situation) && Math.abs(requestedPrice - Number(current.price || 0)) > 0.009) {
      return { success: false, error: "O valor do serviço não pode ser alterado porque esta venda já foi paga ou parcialmente paga." }
    }

    const nextStartDate = payload.date ?? current.start_date
    const nextStartTime = payload.time ?? current.start_time
    const nextDuration = Number(payload.duration ?? current.duration_minutes ?? 0)
    const derivedEnd = addMinutesToDateTime(nextStartDate, nextStartTime, nextDuration)
    const nextEndDate = payload.endDate ?? (payload.date !== undefined || payload.duration !== undefined ? derivedEnd.date : current.end_date)
    const nextEndTime = payload.endTime ?? (payload.time !== undefined || payload.duration !== undefined ? derivedEnd.time : current.end_time)

    if (nextDuration > MAX_APPOINTMENT_DURATION_MINUTES) {
      return { success: false, error: "A duração do agendamento não pode exceder 1 ano (365 dias)." }
    }

    const mapped = toDbPayload(
      {
        customerName: payload.customerName ?? current.customer_name,
        customerId: payload.customerId ?? current.customer_id,
        serviceName: payload.serviceName ?? current.service_name,
        serviceId: payload.serviceId ?? current.service_id,
        categoryId: payload.categoryId ?? current.category_id,
        date: nextStartDate,
        time: nextStartTime,
        endDate: nextEndDate,
        endTime: nextEndTime,
        duration: nextDuration,
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

    const appointmentChangeLines = buildAppointmentUpdateLines(
      current,
      updated,
      String(paymentStatusValue || ""),
      effectivePaidAmount,
    )

    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "appointment",
      entityId: appointmentId,
      actionType: "updated",
      changeLines: appointmentChangeLines.length > 0
        ? appointmentChangeLines
        : ["Atualizou informações do agendamento."],
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
      import("@/lib/services/notification-automation.service")
        .then(({ onAppointmentRescheduled }) =>
          onAppointmentRescheduled(finalRow, "manual"),
        )
        .catch(console.error)
    } else {
      const prevStatus = String(current.status)
      const nextStatus = String(normalizedStatus)
      if (prevStatus !== nextStatus) {
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
      .select("id, partner_id, customer_id, customer_name, service_name, start_date, start_time, marketplace_order_id, source, status, store_id")
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .single()

    if (current) {
      if (current.store_id) {
        await requireStorePermission(current.store_id, partnerId, "appointments", "delete")
      }
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
    const { user, partnerId: authorizedPartnerId } = await getPartnerContextWithPermission("delete")
    if (partnerId !== authorizedPartnerId) {
      throw new Error("O parceiro informado não corresponde ao contexto ativo")
    }
    const supabase = await getSupabaseServerClient()

    // Resolve the exact rows first so store-scoped permissions are checked for
    // every affected store, then delete only those authorized IDs.
    const { data: unavailableRows, error: lookupError } = await supabase
      .from("appointments")
      .select("id, store_id")
      .eq("partner_id", authorizedPartnerId)
      .eq("service_name", serviceName)
      .eq("source", "unavailable")

    if (lookupError) throw lookupError
    const targetStoreIds = Array.from(new Set((unavailableRows || []).map((row) => row.store_id).filter(Boolean))) as string[]
    await Promise.all(targetStoreIds.map((targetStoreId) =>
      requireStorePermission(targetStoreId, authorizedPartnerId, "appointments", "delete"),
    ))

    const unavailableIds = (unavailableRows || []).map((row) => row.id)
    if (unavailableIds.length === 0) return { success: true }

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("partner_id", authorizedPartnerId)
      .in("id", unavailableIds)

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
    const admin = createAdminClient()
    const { data: appointment, error } = await admin
      .from("appointments")
      .select("store_id")
      .eq("id", appointmentId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (error || !appointment) throw new Error("Agendamento não encontrado")
    if (appointment.store_id) await requireStorePermission(appointment.store_id, partnerId, "appointments", "view")
    const timeline = await getAdminTimeline("appointment", appointmentId, partnerId, 50)
    const history = timeline.map((entry, idx) => ({
      id: entry.id || `${idx}`,
      type: entry.action_type,
      description: entry.change_lines?.[0] || "Atualização no agendamento",
      change_lines: entry.change_lines?.length ? entry.change_lines : ["Atualização no agendamento"],
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
    await requireAppointmentOrderView(orderId, partnerId)
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
    await requireAppointmentOrderView(orderId, partnerId)
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
    await requireAppointmentOrderView(orderId, partnerId)
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

    // Verify view permissions in parallel
    await Promise.all([
      requirePermission(partnerId, "appointments", "view"),
      linkedOrderId ? requirePermission(partnerId, "orders", "view") : Promise.resolve(null),
    ])

    const supabase = createAdminClient()

    // Run core database queries in parallel
    const [appointmentRes, orderRes, orderItemsRes, appointmentItemsRes, partnerPlanRes] = await Promise.all([
      appointmentId
        ? supabase
            .from("appointments")
            .select("store_id, marketplace_order_id, service_name")
            .eq("id", appointmentId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      linkedOrderId
        ? supabase
            .from("orders")
            .select("id, store_id, order_number, situation, total_amount, paid_amount, payment_method, order_source")
            .eq("id", linkedOrderId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      linkedOrderId
        ? supabase
            .from("order_items")
            .select("id, line_type, product_name, product_price, quantity, subtotal, service_id, is_gift, original_price")
            .eq("order_id", linkedOrderId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: null, error: null }),
      appointmentId
        ? supabase
            .from("appointment_items")
            .select(`
                id, appointment_id, product_id, variant_id, service_id,
                name, quantity, usage_type, created_at, updated_at
            `)
            .eq("appointment_id", appointmentId)
            .order("created_at", { ascending: true })
            .limit(500)
        : Promise.resolve({ data: null, error: null }),
      includePlan
        ? supabase
            .from("subscriptions")
            .select("plan_id, status, plans(slug)")
            .eq("partner_id", partnerId)
            .in("status", ["active", "trialing", "past_due"])
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (appointmentId && (appointmentRes.error || !appointmentRes.data)) {
      throw new Error("Agendamento não encontrado")
    }
    const appointmentScope = appointmentRes.data

    if (linkedOrderId) {
      if (orderRes.error || !orderRes.data) {
        throw new Error("Pedido não encontrado.")
      }
      if (appointmentScope?.marketplace_order_id && appointmentScope.marketplace_order_id !== linkedOrderId) {
        throw new Error("Pedido não corresponde ao agendamento")
      }
    }

    // Verify store permissions concurrently if present
    const storeChecks: Promise<any>[] = []
    if (appointmentScope?.store_id) {
      storeChecks.push(requireStorePermission(appointmentScope.store_id, partnerId, "appointments", "view"))
    }
    if (orderRes.data?.store_id && orderRes.data.store_id !== appointmentScope?.store_id) {
      storeChecks.push(requireStorePermission(orderRes.data.store_id, partnerId, "orders", "view"))
    }
    if (storeChecks.length > 0) {
      await Promise.all(storeChecks)
    }

    // Process Partner Plan
    const planSlug = (partnerPlanRes.data as any)?.plans?.slug || 'free'

    // Enrich appointment items only when there are actual product/service IDs.
    let appointmentItems = []
    if (appointmentItemsRes.data) {
      const isMarketplaceApt = Boolean(appointmentScope?.marketplace_order_id)
      const aptServiceName = appointmentScope?.service_name || ''

      const productIds = [...new Set(appointmentItemsRes.data.map((item: any) => item.product_id).filter(Boolean))]
      const serviceIds = [...new Set(appointmentItemsRes.data.map((item: any) => item.service_id).filter(Boolean))]
      const [productsRes, servicesRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from("products").select("id, name, sku, stock_available, images").eq("partner_id", partnerId).or(appointmentScope?.store_id ? `store_id.eq.${appointmentScope.store_id},store_id.is.null` : "store_id.is.null").in("id", productIds)
          : Promise.resolve({ data: [] }),
        serviceIds.length > 0
          ? supabase.from("services").select("id, name, resources").eq("partner_id", partnerId).or(appointmentScope?.store_id ? `store_id.eq.${appointmentScope.store_id},store_id.is.null` : "store_id.is.null").in("id", serviceIds)
          : Promise.resolve({ data: [] }),
      ])
      const productsMap = new Map<string, any>((productsRes.data || []).map((product: any) => [String(product.id), product]))
      const servicesMap = new Map<string, any>((servicesRes.data || []).map((service: any) => [String(service.id), service]))

      // Filter out and remove ghost items inserted by the previous marketplace bug:
      // (no product_id, usage_type is reference, name matches service name, but service has no such resource configured)
      const ghostItemIds: string[] = []
      const validRawItems = appointmentItemsRes.data.filter((item: any) => {
        if (isMarketplaceApt && !item.product_id && item.usage_type === "reference") {
          const s = item.service_id ? servicesMap.get(String(item.service_id)) : null
          const svcResources = Array.isArray(s?.resources) ? s.resources : []
          const hasResourceInSvc = svcResources.some(
            (r: any) => r?.name?.trim().toLowerCase() === item.name?.trim().toLowerCase()
          )
          if (!hasResourceInSvc) {
            const isMatchingServiceName =
              (s?.name && s.name.trim().toLowerCase() === item.name?.trim().toLowerCase()) ||
              (aptServiceName && aptServiceName.toLowerCase().includes(item.name?.trim().toLowerCase()))
            if (isMatchingServiceName) {
              ghostItemIds.push(item.id)
              return false
            }
          }
        }
        return true
      })

      if (ghostItemIds.length > 0) {
        supabase
          .from("appointment_items")
          .delete()
          .in("id", ghostItemIds)
          .then(({ error }: any) => {
            if (error) console.error("Error cleaning up ghost appointment items:", error)
          })
      }

      appointmentItems = validRawItems.map((item: any) => {
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
    if (linkedOrderId && orderRes.data) {
      orderData = {
        orderNumber: orderRes.data.order_number || null,
        situation: orderRes.data.situation || "pending",
        totalAmount: Number(orderRes.data.total_amount || 0),
        paidAmount: Number(orderRes.data.paid_amount || 0),
        paymentMethod: orderRes.data.payment_method || "",
        orderSource: orderRes.data.order_source || "",
        items: (orderItemsRes?.data || []).map((item: any) => ({
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

