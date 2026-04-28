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

export async function createAppointmentsAction(payload: AppointmentInput[]) {
  try {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { success: false, error: "Nenhum agendamento enviado", created: [] }
    }

    const { user, partnerId } = await getPartnerContextWithPermission("create")
    const supabase = await getSupabaseServerClient()
    const rows = payload.map((item) => toDbPayload(item, partnerId))

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
