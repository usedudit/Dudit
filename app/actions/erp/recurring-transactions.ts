"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly"
export type RecurringType = "income" | "expense"
export type RecurringContactType = "customer" | "supplier" | "service" | "employee" | "partner" | "other"
export type RecurringLifecycleStatus = "active" | "paused" | "cancelled"

const LOG = "[recurring]"

function logRecurring(event: string, meta?: Record<string, unknown>) {
  console.info(`${LOG} ${event}`, meta ? JSON.stringify(meta) : "")
}

const ALLOWED_RECURRING_UPDATE_KEYS = new Set([
  "amount",
  "description",
  "frequency",
  "interval_value",
  "week_days",
  "month_day",
  "use_last_day",
  "year_month",
  "year_day",
  "start_date",
  "end_date",
  "next_run_date",
  "account_id",
  "category_id",
  "subcategory_id",
  "contact_id",
  "customer_id",
  "contact_type",
  "payment_method_id",
  "active",
  "status",
  "effective_from_date",
  "updated_at",
])

function toYmdFromTs(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  if (isNaN(d.getTime())) return ""
  d.setHours(12, 0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

async function rpcFinancialNextRunDate(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  tpl: Record<string, unknown>,
  currentIso: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("financial_next_run_date", {
    p_frequency: tpl.frequency as string,
    p_interval: Math.max(Number(tpl.interval_value) || 1, 1),
    p_current_run: currentIso,
    p_start_date: tpl.start_date as string,
    p_week_days: (tpl.week_days as number[] | null) ?? null,
    p_month_day: tpl.month_day != null ? Number(tpl.month_day) : null,
    p_use_last_day: !!(tpl.use_last_day as boolean),
    p_year_month: tpl.year_month != null ? Number(tpl.year_month) : null,
    p_year_day: tpl.year_day != null ? Number(tpl.year_day) : null,
  })
  if (error) {
    logRecurring("occurrence_next_run_rpc_error", { message: error.message, recurringId: tpl.id })
    return null
  }
  if (data == null) return null
  if (typeof data === "string") return data
  if (data instanceof Date) return data.toISOString()
  return String(data)
}

export async function getRecurringTransactionsAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function createRecurringTransactionAction(input: {
  partnerId: string
  type: RecurringType
  amount: number
  description: string
  frequency: RecurringFrequency
  intervalValue?: number
  weekDays?: number[] | null
  monthDay?: number | null
  useLastDay?: boolean
  yearMonth?: number | null
  yearDay?: number | null
  startDate: string
  endDate?: string | null
  nextRunDate?: string
  accountId?: string | null
  categoryId?: string | null
  subcategoryId?: string | null
  contactId?: string | null
  customerId?: string | null
  contactType?: RecurringContactType | null
  paymentMethodId?: string | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()
    const startDate = input.startDate
    const nextRunDate = input.nextRunDate || startDate
    const customerId = input.customerId?.trim() || null
    const contactId = customerId ? null : input.contactId ?? null
    const contactTypeResolved = customerId ? "customer" : input.contactType ?? null
    const { data, error } = await supabase
      .from("recurring_transactions")
      .insert({
        partner_id: input.partnerId,
        type: input.type,
        amount: input.amount,
        description: input.description.trim(),
        frequency: input.frequency,
        interval_value: Math.max(Number(input.intervalValue || 1), 1),
        week_days: input.weekDays || null,
        month_day: input.monthDay ?? null,
        use_last_day: !!input.useLastDay,
        year_month: input.yearMonth ?? null,
        year_day: input.yearDay ?? null,
        start_date: startDate,
        end_date: input.endDate ?? null,
        next_run_date: nextRunDate,
        account_id: input.accountId ?? null,
        category_id: input.categoryId ?? null,
        subcategory_id: input.subcategoryId ?? null,
        contact_id: contactId,
        customer_id: customerId,
        contact_type: contactTypeResolved,
        payment_method_id: input.paymentMethodId ?? null,
        active: true,
        status: "active" as RecurringLifecycleStatus,
      })
      .select("*")
      .single()
    if (error) throw error
    logRecurring("created", { id: data?.id, partnerId: input.partnerId })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function updateRecurringTransactionAction(
  id: string,
  partnerId: string,
  patch: Record<string, unknown>,
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const normalized: Record<string, unknown> = { ...patch }
    if ("intervalValue" in normalized) {
      normalized.interval_value = Math.max(Number(normalized.intervalValue || 1), 1)
      delete normalized.intervalValue
    }
    if ("useLastDay" in normalized) {
      normalized.use_last_day = !!normalized.useLastDay
      delete normalized.useLastDay
    }
    if ("paymentMethodId" in normalized) {
      normalized.payment_method_id = normalized.paymentMethodId
      delete normalized.paymentMethodId
    }

    const payload: Record<string, unknown> = {}
    for (const key of Object.keys(normalized)) {
      if (ALLOWED_RECURRING_UPDATE_KEYS.has(key)) {
        payload[key] = normalized[key]
      }
    }
    payload.updated_at = new Date().toISOString()

    const hasFinancialChange = [
      "amount",
      "description",
      "category_id",
      "subcategory_id",
      "account_id",
      "contact_id",
      "customer_id",
      "contact_type",
      "frequency",
      "interval_value",
      "week_days",
      "month_day",
      "use_last_day",
      "year_month",
      "year_day",
      "start_date",
      "end_date",
      "next_run_date",
      "payment_method_id",
    ].some((k) => k in payload)
    if (hasFinancialChange && !payload.effective_from_date) {
      payload.effective_from_date = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("recurring_transactions")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("*")
      .single()
    if (error) throw error
    logRecurring("updated", { id, partnerId, keys: Object.keys(payload) })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function pauseRecurringTransactionAction(id: string, partnerId: string) {
  const res = await updateRecurringTransactionAction(id, partnerId, {
    active: false,
    status: "paused",
  } as Record<string, unknown>)
  if (res.success) logRecurring("paused", { id, partnerId })
  return res
}

export async function resumeRecurringTransactionAction(id: string, partnerId: string) {
  const res = await updateRecurringTransactionAction(id, partnerId, {
    active: true,
    status: "active",
  } as Record<string, unknown>)
  if (res.success) logRecurring("resumed", { id, partnerId })
  return res
}

export async function cancelRecurringTransactionAction(id: string, partnerId: string) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("recurring_transactions")
      .update({
        active: false,
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("*")
      .single()
    if (error) throw error
    logRecurring("cancelled", { id, partnerId })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function duplicateRecurringTransactionAction(id: string, partnerId: string) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()
    const { data: source, error: sourceError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("id", id)
      .eq("partner_id", partnerId)
      .single()
    if (sourceError || !source) throw sourceError || new Error("Recorrência não encontrada")

    const { data, error } = await supabase
      .from("recurring_transactions")
      .insert({
        partner_id: source.partner_id,
        type: source.type,
        amount: source.amount,
        description: `${source.description} (cópia)`,
        frequency: source.frequency,
        interval_value: source.interval_value,
        week_days: source.week_days,
        month_day: source.month_day,
        use_last_day: source.use_last_day,
        year_month: source.year_month,
        year_day: source.year_day,
        start_date: source.start_date,
        end_date: source.end_date,
        next_run_date: source.start_date,
        last_run_at: null,
        execution_count: 0,
        account_id: source.account_id,
        category_id: source.category_id,
        subcategory_id: source.subcategory_id,
        contact_id: source.contact_id,
        customer_id: source.customer_id,
        contact_type: source.contact_type,
        payment_method_id: source.payment_method_id ?? null,
        active: true,
        status: "active",
      })
      .select("*")
      .single()
    if (error) throw error
    logRecurring("duplicated", { fromId: id, newId: data?.id, partnerId })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function runDueRecurringTransactionsAction(limit = 200) {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc("process_due_recurring_transactions", { p_limit: limit })
    if (error) throw error
    return { success: true, data: data?.[0] || { processed_count: 0, created_count: 0, deactivated_count: 0 } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export type RecurringOccurrence = {
  recurringId: string
  recurringTemplateId: string
  occurrenceDate: string
  dueDate: string
  isVirtual: true
  description: string
  amount: number
  type: RecurringType
  frequency: RecurringFrequency
  accountId: string | null
  categoryId: string | null
  subcategoryId: string | null
  categoryName: string
  contactId: string | null
  customerId: string | null
  contactType: RecurringContactType | null
  contactName: string
  paymentMethodId: string | null
  paymentDisplay: string
}

/**
 * Virtual occurrences: derived only from recurring_transactions + financial_next_run_date.
 * Includes every occurrence with date >= start_date up to end_date or today+3mo, except dates
 * that already have any ledger row for this recurring_id (paid or legacy pending).
 */
export async function generateRecurringOccurrencesAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")
    const supabase = await getSupabaseServerClient()

    const { data: templates, error: tplErr } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("active", true)
      .eq("status", "active")
    if (tplErr) throw tplErr
    if (!templates || templates.length === 0) return { success: true, data: [] as RecurringOccurrence[] }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const ceiling = new Date(today)
    ceiling.setMonth(ceiling.getMonth() + 3)
    const ceilingYmd = toYmdFromTs(ceiling)

    const recurringIds = templates.map((t: { id: string }) => t.id)

    const { data: existingTxs } = await supabase
      .from("transactions")
      .select("recurring_id, due_date")
      .in("recurring_id", recurringIds)

    const occupied = new Set<string>()
    for (const tx of existingTxs || []) {
      if (tx.recurring_id && tx.due_date) {
        const ds = typeof tx.due_date === "string" ? tx.due_date.slice(0, 10) : toYmdFromTs(tx.due_date as string)
        occupied.add(`${tx.recurring_id}|${ds}`)
      }
    }

    const categoryIds = [...new Set(templates.map((t: { category_id: string | null }) => t.category_id).filter(Boolean))]
    const contactIds = [...new Set(templates.map((t: { contact_id: string | null }) => t.contact_id).filter(Boolean))]
    const customerIds = [...new Set(templates.map((t: { customer_id: string | null }) => t.customer_id).filter(Boolean))]
    const pmIds = [...new Set(templates.map((t: { payment_method_id: string | null }) => t.payment_method_id).filter(Boolean))]

    const [{ data: cats }, { data: tcontacts }, { data: customers }, { data: pms }] = await Promise.all([
      categoryIds.length
        ? supabase.from("financial_categories").select("id,name").in("id", categoryIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      contactIds.length
        ? supabase.from("transaction_contacts").select("id,name").in("id", contactIds as string[])
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
      customerIds.length
        ? supabase.from("customers").select("id,name").in("id", customerIds as string[]).eq("partner_id", partnerId)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
      pmIds.length
        ? supabase.from("payment_methods").select("id,name,payment_type").in("id", pmIds as string[]).eq("partner_id", partnerId)
        : Promise.resolve({ data: [] as { id: string; name: string; payment_type: string | null }[] }),
    ])

    const catById = new Map<string, string>((cats || []).map((c: { id: string; name: string }) => [c.id, c.name]))
    const contactById = new Map<string, string>(
      (tcontacts || []).map((c: { id: string; name: string | null }) => [c.id, c.name || "-"]),
    )
    const customerById = new Map<string, string>(
      (customers || []).map((c: { id: string; name: string | null }) => [c.id, c.name || "Cliente"]),
    )
    const pmById = new Map<string, { id: string; name: string; payment_type: string | null }>(
      (pms || []).map((p: { id: string; name: string; payment_type: string | null }) => [p.id, p]),
    )

    const allOccurrences: RecurringOccurrence[] = []

    for (const tpl of templates as Record<string, unknown>[]) {
      const tplId = String(tpl.id)
      const startYmd = toYmdFromTs(tpl.start_date as string)
      const endYmdCap = tpl.end_date ? toYmdFromTs(tpl.end_date as string) : ceilingYmd
      const endYmd = endYmdCap < ceilingYmd ? endYmdCap : ceilingYmd

      const categoryName = tpl.category_id
        ? (catById.get(String(tpl.category_id)) || "Sem categoria")
        : "Sem categoria"

      let contactName = "-"
      if (tpl.customer_id) {
        contactName = customerById.get(String(tpl.customer_id)) || "Cliente"
      } else if (tpl.contact_id) {
        contactName = contactById.get(String(tpl.contact_id)) || "-"
      }

      const pmRow = tpl.payment_method_id ? pmById.get(String(tpl.payment_method_id)) : undefined
      const paymentDisplay = pmRow
        ? formatPaymentMethodLabel(pmRow.name, pmRow.payment_type) || "Não informado"
        : "Não informado"

      let currentIso = new Date(tpl.start_date as string).toISOString()
      let safety = 0
      const maxSteps = 400

      while (safety < maxSteps) {
        safety++
        const ymd = toYmdFromTs(currentIso)
        if (ymd > endYmd) break
        if (ymd < startYmd) {
          const nextEarly = await rpcFinancialNextRunDate(supabase, tpl, currentIso)
          if (!nextEarly) break
          const nextT = new Date(nextEarly).getTime()
          const curT = new Date(currentIso).getTime()
          if (nextT <= curT) break
          currentIso = nextEarly
          continue
        }

        const key = `${tplId}|${ymd}`
        if (!occupied.has(key)) {
          allOccurrences.push({
            recurringId: tplId,
            recurringTemplateId: tplId,
            occurrenceDate: ymd,
            dueDate: ymd,
            isVirtual: true,
            description: String(tpl.description || ""),
            amount: Number(tpl.amount),
            type: tpl.type as RecurringType,
            frequency: tpl.frequency as RecurringFrequency,
            accountId: (tpl.account_id as string | null) || null,
            categoryId: (tpl.category_id as string | null) || null,
            subcategoryId: (tpl.subcategory_id as string | null) || null,
            categoryName,
            contactId: (tpl.contact_id as string | null) || null,
            customerId: (tpl.customer_id as string | null) || null,
            contactType: (tpl.contact_type as RecurringContactType | null) || null,
            contactName,
            paymentMethodId: (tpl.payment_method_id as string | null) || null,
            paymentDisplay,
          })
        }

        const nextIso = await rpcFinancialNextRunDate(supabase, tpl, currentIso)
        if (!nextIso) break
        const nextTime = new Date(nextIso).getTime()
        const curTime = new Date(currentIso).getTime()
        if (nextTime <= curTime) break
        currentIso = nextIso
      }
    }

    allOccurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
    logRecurring("occurrences_generated", { partnerId, count: allOccurrences.length })
    return { success: true, data: allOccurrences }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
