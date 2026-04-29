"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { revalidatePath, revalidateTag } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { applyServiceOrderToGoals } from "@/lib/services/sales-goals.service"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { getAdminTimeline } from "@/lib/services/timeline.service"
import { increment_usage_counter } from "@/lib/services/subscription.service"

export type AppointmentStatus =
  | "Reservado"
  | "Confirmado"
  | "Aguardando"
  | "Iniciado"
  | "Pago"
  | "Ausência"
  | "Cancelado"
  | "Indisponível"
  | "Partially Paid"
  | "Pago Parcialmente"

export type AppointmentInput = {
  customerName: string
  customerId?: string | null
  serviceName: string
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
  if (v === "pago" || v === "paid") return "Pago"
  if (v === "pago parcialmente" || v === "partially paid" || v === "parcialmente pago") return "Pago Parcialmente"
  if (v === "ausência" || v === "ausencia" || v === "absence") return "Ausência"
  if (v === "cancelado" || v === "canceled" || v === "cancelled") return "Cancelado"
  if (v === "indisponível" || v === "indisponivel" || v === "unavailable") return "Indisponível"
  return "Reservado"
}

function toDbPayload(input: AppointmentInput, partnerId: string) {
  return {
    partner_id: partnerId,
    customer_id: input.customerId || null,
    customer_name: String(input.customerName || "Cliente Sem Nome").trim(),
    service_name: String(input.serviceName || "Serviço").trim(),
    start_date: input.date,
    start_time: input.time,
    end_date: input.endDate || input.date,
    end_time: input.endTime || input.time,
    duration_minutes: Math.max(1, Number(input.duration || 0)),
    staff_partner_user_id: input.staffId,
    staff_name: String(input.staffName || "Profissional").trim(),
    price: Number(input.price || 0),
    pricing_unit: input.pricingUnit || "Por Serviço",
    notes: input.notes || null,
    status: sanitizeStatus(input.status),
    source: input.source || "appointment",
  }
}

async function getPartnerContextWithPermission(permission: "view" | "create" | "edit") {
  const user = await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("Contexto ERP não encontrado")
  await requirePartnerAccessWithPermission(context.partnerId, "appointments", permission, user)
  return { user, partnerId: context.partnerId }
}

function isPaidStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase()
  return s === "pago" || s === "paid"
}

function isPartialStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase()
  return s === "partially paid" || s === "pago parcialmente" || s === "parcialmente pago"
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

  const saleRefNote = `appointment:${params.appointment.id}:sale`
  const txRefNote = `appointment:${params.appointment.id}:payment`

  const [{ data: existingSale }, { data: existingPaymentTx }] = await Promise.all([
    params.supabase
      .from("sales")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("notes", saleRefNote)
      .limit(1)
      .maybeSingle(),
    params.supabase
      .from("transactions")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("reference_note", txRefNote)
      .limit(1)
      .maybeSingle(),
  ])

  let saleId = existingSale?.id || null

  if (!saleId) {
    const { data: saleNumberData } = await params.supabase.rpc("generate_sale_number")
    const saleNumber = String(saleNumberData || "").trim() || `DDT-${String(params.appointment.id).slice(0, 8).toUpperCase()}`
    const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(params.supabase as any, params.partnerId, false)

    const { data: sale, error: saleError } = await params.supabase
      .from("sales")
      .insert({
        partner_id: params.partnerId,
        customer_id: params.appointment.customer_id || null,
        total_amount: Number(params.appointment.price || 0),
        discount_amount: 0,
        final_amount: Number(params.appointment.price || 0),
        paid_amount: paidAmount,
        payment_status: paidAmount >= Number(params.appointment.price || 0) - 0.009 ? "paid" : "partially_paid",
        status: paidAmount >= Number(params.appointment.price || 0) - 0.009 ? "paid" : "partially_paid",
        finance_account_id: financeAccountId || null,
        notes: saleRefNote,
        finalized_by_user_id: params.userId,
        sale_number: saleNumber,
      })
      .select("id")
      .single()

    if (saleError) throw saleError
    saleId = sale?.id || null

    if (saleId) {
      await params.supabase.from("sale_items").insert({
        sale_id: saleId,
        partner_id: params.partnerId,
        product_id: null,
        variant_id: null,
        product_name: params.appointment.service_name || "Serviço",
        variant_name: null,
        unit_price: Number(params.appointment.price || 0),
        quantity: 1,
        subtotal: Number(params.appointment.price || 0),
        total_price: Number(params.appointment.price || 0),
      })
    }
  }

  let paymentTransactionId = existingPaymentTx?.id || null
  if (!paymentTransactionId) {
    const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(params.supabase as any, params.partnerId, false)
    const nowIso = new Date().toISOString()
    const { data: tx, error: txError } = await params.supabase
      .from("transactions")
      .insert({
        partner_id: params.partnerId,
        description: params.appointment.service_name || "Serviço",
        category: "Vendas",
        customer_id: params.appointment.customer_id || null,
        contact_type: "customer",
        amount: paidAmount,
        due_date: null,
        payment_date: nowIso,
        transaction_date: nowIso,
        status: "paid",
        notes: null,
        payment_type: "Agendamento",
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
  }

  const { data: partnerUser } = await params.supabase
    .from("partner_users")
    .select("user_id")
    .eq("id", params.appointment.staff_partner_user_id)
    .eq("partner_id", params.partnerId)
    .maybeSingle()

  const sellerUserId = String(partnerUser?.user_id || params.userId)
  await applyServiceOrderToGoals({
    supabase: createAdminClient() as any,
    partnerId: params.partnerId,
    sellerUserId,
    saleAmount: Number(params.appointment.price || 0),
    createdByUserId: params.userId,
  })

  return { saleId, paymentTransactionId }
}

async function syncAppointmentReceivable(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  userId: string
  appointment: any
  currentReceivableId?: string | null
}) {
  const ref = `appointment:${params.appointment.id}:receivable`
  const status = String(params.appointment.status || "")
  const totalAmount = Number(params.appointment.price || 0)
  const paidAmount = Number(params.appointment.paid_amount || 0)
  const remaining = Math.max(0, totalAmount - paidAmount)
  const shouldBePending = !isPaidStatus(status) && remaining > 0.009
  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(params.supabase as any, params.partnerId, false)

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
          amount: remaining,
          original_amount: remaining,
          status: "pending",
          due_date: params.appointment.start_date,
          payment_date: null,
          transaction_date: `${params.appointment.start_date}T12:00:00.000Z`,
        })
        .eq("id", existingId)
        .eq("partner_id", params.partnerId)
      return existingId
    }

    const { data, error } = await params.supabase
      .from("transactions")
      .insert({
        partner_id: params.partnerId,
        description: params.appointment.service_name || "Serviço",
        category: "Vendas",
        customer_id: params.appointment.customer_id || null,
        contact_type: "customer",
        amount: remaining,
        due_date: params.appointment.start_date,
        payment_date: null,
        transaction_date: `${params.appointment.start_date}T12:00:00.000Z`,
        status: "pending",
        notes: null,
        payment_type: "Agendamento",
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
        amount: 0,
        original_amount: 0,
        status: "paid",
        payment_date: new Date().toISOString(),
      })
      .eq("id", existingId)
      .eq("partner_id", params.partnerId)
  }
  return existingId
}

/** @deprecated Use getAppointmentsByDateRangeAction instead — this fetches ALL appointments with select(*) */
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
  staff_partner_user_id, staff_name, status, price, pricing_unit, notes, source
`

/**
 * Fetch appointments within a date range, with optional staff filter.
 * All filtering is done at the database level — no in-memory filtering.
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
  staffId?: string | null
) {
  try {
    const { partnerId } = await getPartnerContextWithPermission("view")
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
 * All computation is server-side — no client-side slot generation.
 */
export async function getAvailableTimeSlotsAction(
  date: string,
  staffId: string,
  serviceDurationMinutes: number,
  bufferMinutes: number = 0
) {
  try {
    const { partnerId } = await getPartnerContextWithPermission("view")
    const supabase = await getSupabaseServerClient()

    // Fetch existing appointments for this staff on this date
    const { data: existingAppts, error } = await supabase
      .from("appointments")
      .select("start_time, end_time, duration_minutes")
      .eq("partner_id", partnerId)
      .eq("staff_partner_user_id", staffId)
      .eq("start_date", date)
      .neq("status", "Cancelado")
      .order("start_time", { ascending: true })

    if (error) throw error

    // Build list of occupied time ranges (in minutes from midnight)
    const occupiedRanges: Array<{ start: number; end: number }> = (existingAppts || []).map((apt: any) => {
      const [sh, sm] = String(apt.start_time || "").split(":").map(Number)
      const startMin = (sh || 0) * 60 + (sm || 0)

      let endMin: number
      if (apt.end_time) {
        const [eh, em] = String(apt.end_time).split(":").map(Number)
        endMin = (eh || 0) * 60 + (em || 0)
      } else {
        endMin = startMin + Number(apt.duration_minutes || 60)
      }

      // Add buffer after each appointment
      return { start: startMin, end: endMin + bufferMinutes }
    })

    // Generate all possible slots within business hours
    const bh = DEFAULT_BUSINESS_HOURS
    const dayStartMin = bh.startHour * 60 + bh.startMinute
    const dayEndMin = bh.endHour * 60 + bh.endMinute
    const totalDurationNeeded = serviceDurationMinutes + bufferMinutes

    const slots: string[] = []

    for (let slotStart = dayStartMin; slotStart + serviceDurationMinutes <= dayEndMin; slotStart += SLOT_INCREMENT_MINUTES) {
      const slotEnd = slotStart + totalDurationNeeded

      // Check if this slot conflicts with any existing appointment
      const hasConflict = occupiedRanges.some(
        (range) => slotStart < range.end && slotEnd > range.start
      )

      if (!hasConflict) {
        const h = Math.floor(slotStart / 60)
        const m = slotStart % 60
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
      }
    }

    return { success: true, slots }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao buscar horários", slots: [] }
  }
}

export async function createAppointmentsAction(payload: AppointmentInput[]) {
  try {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { success: false, error: "Nenhum agendamento enviado", created: [] }
    }

    const { user, partnerId } = await getPartnerContextWithPermission("create")
    const supabase = await getSupabaseServerClient()
    const rows = payload.map((item) => toDbPayload(item, partnerId))

    // -- Idempotency guard: reject duplicate submissions within 30 seconds --
    // Checks the first item in the batch against recent inserts
    const firstRow = rows[0]
    if (firstRow) {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
      const { data: recentDup } = await supabase
        .from("appointments")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("customer_name", firstRow.customer_name)
        .eq("service_name", firstRow.service_name)
        .eq("start_date", firstRow.start_date)
        .eq("start_time", firstRow.start_time)
        .eq("staff_partner_user_id", firstRow.staff_partner_user_id)
        .gte("created_at", thirtySecondsAgo)
        .limit(1)

      if (recentDup && recentDup.length > 0) {
        return { success: false, error: "Agendamento duplicado detectado. Aguarde alguns segundos.", created: [] }
      }
    }

    const { data, error } = await supabase.from("appointments").insert(rows).select("*")
    if (error) throw error

    for (const row of data || []) {
      const receivableId = await syncAppointmentReceivable({
        supabase,
        partnerId,
        userId: user.id,
        appointment: { ...row, paid_amount: Number(row.paid_amount || 0) },
        currentReceivableId: row.receivable_transaction_id || null,
      })
      if (receivableId) {
        await supabase
          .from("appointments")
          .update({ receivable_transaction_id: receivableId })
          .eq("id", row.id)
          .eq("partner_id", partnerId)
      }

      await logAuditEvent({
        partnerId,
        actorUserId: user.id,
        entityType: "appointment",
        entityId: row.id,
        actionType: "created",
        changeLines: [`criou agendamento para ${row.customer_name}.`],
        metadata: { status: row.status, source: row.source },
      })
      await revalidateEntityTimeline("appointment", row.id)
    }

    // Increment usage counter for each created appointment
    increment_usage_counter(partnerId, "appointments_month_count", data.length).catch(console.error)

    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    revalidatePath("/erp/services")

    return { success: true, created: data || [] }
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

    const mapped = toDbPayload(
      {
        customerName: payload.customerName ?? current.customer_name,
        customerId: payload.customerId ?? current.customer_id,
        serviceName: payload.serviceName ?? current.service_name,
        date: payload.date ?? current.start_date,
        time: payload.time ?? current.start_time,
        endDate: payload.endDate ?? current.end_date,
        endTime: payload.endTime ?? current.end_time,
        duration: payload.duration ?? current.duration_minutes,
        staffId: payload.staffId ?? current.staff_partner_user_id,
        staffName: payload.staffName ?? current.staff_name,
        price: payload.price ?? current.price,
        pricingUnit: payload.pricingUnit ?? current.pricing_unit,
        notes: payload.notes ?? current.notes,
        status: payload.status ?? current.status,
        source: payload.source ?? current.source,
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

    const paidAmountFromPayload = Math.max(0, Number((payload as any)?.paidAmount ?? updated.paid_amount ?? 0))
    const normalizedStatus = String(updated.status || "")
    const isPartial = isPartialStatus(normalizedStatus)
    const isPaid = isPaidStatus(normalizedStatus)
    const effectivePaidAmount = isPaid
      ? Number(updated.price || 0)
      : isPartial
        ? Math.min(Number(updated.price || 0), paidAmountFromPayload > 0 ? paidAmountFromPayload : Number(updated.price || 0) / 2)
        : Math.max(0, Number(updated.paid_amount || 0))

    let saleId: string | null = updated.sale_id || null
    let paymentTransactionId: string | null = updated.payment_transaction_id || null
    if ((isPaid || isPartial) && Number(updated.price || 0) > 0.009) {
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

    const receivableTransactionId = await syncAppointmentReceivable({
      supabase,
      partnerId,
      userId: user.id,
      appointment: { ...updated, paid_amount: effectivePaidAmount },
      currentReceivableId: updated.receivable_transaction_id || null,
    })

    const { data: syncedAppointment } = await supabase
      .from("appointments")
      .update({
        sale_id: saleId,
        payment_transaction_id: paymentTransactionId,
        receivable_transaction_id: receivableTransactionId,
        paid_amount: effectivePaidAmount,
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

    await revalidateEntityTimeline("appointment", appointmentId)
    safeRevalidateTag(TAGS.entityTimeline("appointment-list", partnerId))
    revalidatePath("/erp/services")

    return { success: true, item: syncedAppointment || updated }
  } catch (error: any) {
    return { success: false, error: error?.message || "Erro ao atualizar agendamento" }
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
