"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly"
export type RecurringType = "income" | "expense"
export type RecurringContactType = "customer" | "supplier" | "service" | "employee" | "partner" | "other"

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
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()
    const nextRunDate = input.nextRunDate || input.startDate
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
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        next_run_date: nextRunDate,
        account_id: input.accountId ?? null,
        category_id: input.categoryId ?? null,
        subcategory_id: input.subcategoryId ?? null,
        contact_id: contactId,
        customer_id: customerId,
        contact_type: contactTypeResolved,
        active: true,
      })
      .select("*")
      .single()
    if (error) throw error
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
    const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
    if ("intervalValue" in payload) {
      payload.interval_value = Math.max(Number(payload.intervalValue || 1), 1)
      delete payload.intervalValue
    }
    if ("useLastDay" in payload) {
      payload.use_last_day = !!payload.useLastDay
      delete payload.useLastDay
    }

    // Changes only apply from now forward: set effective_from_date if not already set
    const hasFinancialChange = ["amount", "description", "category_id", "subcategory_id",
      "account_id", "contact_id", "customer_id", "contact_type", "frequency",
      "interval_value", "week_days", "month_day", "use_last_day"].some(k => k in payload)
    if (hasFinancialChange && !payload.effective_from_date) {
      payload.effective_from_date = new Date().toISOString()
    }

    // NEVER allow updating fields that would affect past transactions
    // Past paid transactions remain untouched (they are separate rows in transactions table)

    const { data, error } = await supabase
      .from("recurring_transactions")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("*")
      .single()
    if (error) throw error
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function pauseRecurringTransactionAction(id: string, partnerId: string) {
  return updateRecurringTransactionAction(id, partnerId, { active: false })
}

export async function resumeRecurringTransactionAction(id: string, partnerId: string) {
  return updateRecurringTransactionAction(id, partnerId, {
    active: true,
  })
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("*")
      .single()
    if (error) throw error
    // Note: past paid transactions are NEVER deleted or modified
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
        active: source.active,
      })
      .select("*")
      .single()
    if (error) throw error
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

/* ── Pure date math for occurrence generation ── */

function addInterval(d: Date, frequency: RecurringFrequency, interval: number): Date {
  const result = new Date(d)
  const iv = Math.max(Math.floor(Number(interval) || 1), 1)
  switch (frequency) {
    case "daily":
      result.setDate(result.getDate() + iv)
      break
    case "weekly":
      result.setDate(result.getDate() + 7 * iv)
      break
    case "monthly":
      result.setMonth(result.getMonth() + iv)
      break
    case "yearly":
      result.setFullYear(result.getFullYear() + iv)
      break
  }
  return result
}

function toYmdString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export type RecurringOccurrence = {
  recurringId: string
  recurringTemplateId: string
  occurrenceDate: string   // yyyy-MM-dd
  dueDate: string          // yyyy-MM-dd (same as occurrenceDate)
  isVirtual: true
  description: string
  amount: number
  type: RecurringType
  frequency: RecurringFrequency
  accountId: string | null
  categoryId: string | null
  subcategoryId: string | null
  contactId: string | null
  customerId: string | null
  contactType: RecurringContactType | null
}

/**
 * Generate virtual recurring occurrences from start_date using frequency + interval.
 * 
 * CRITICAL: Occurrences are derived purely from start_date + frequency + interval.
 * We NEVER rely on mutable next_run_date for correctness.
 * 
 * Rules:
 * - If end_date: generate until end_date
 * - If no end_date: generate within today → today + 3 months
 * - Filter out dates that already have a PAID transaction
 * - Each item includes occurrence_date, due_date, is_virtual: true
 */
export async function generateRecurringOccurrencesAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")
    const supabase = await getSupabaseServerClient()

    // Fetch active recurring templates
    const { data: templates, error: tplErr } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("active", true)
    if (tplErr) throw tplErr
    if (!templates || templates.length === 0) return { success: true, data: [] }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayYmd = toYmdString(today)

    // Safe window ceiling: today + 3 months
    const ceiling = new Date(today)
    ceiling.setMonth(ceiling.getMonth() + 3)

    // Fetch ALL existing paid transactions for these recurring IDs to filter duplicates
    const recurringIds = templates.map((t: any) => t.id)
    const { data: paidTxs } = await supabase
      .from("transactions")
      .select("recurring_id, due_date, status")
      .in("recurring_id", recurringIds)
      .eq("status", "paid")

    // Build a set of "recurringId|dueDate" for O(1) lookups
    const paidSet = new Set<string>()
    for (const tx of paidTxs || []) {
      if (tx.recurring_id && tx.due_date) {
        const dateStr = typeof tx.due_date === "string" ? tx.due_date.slice(0, 10) : ""
        paidSet.add(`${tx.recurring_id}|${dateStr}`)
      }
    }

    const allOccurrences: RecurringOccurrence[] = []

    for (const tpl of templates) {
      const startDate = new Date(tpl.start_date)
      startDate.setHours(12, 0, 0, 0)
      const endDate = tpl.end_date ? new Date(tpl.end_date) : ceiling
      const interval = Math.max(Number(tpl.interval_value) || 1, 1)
      const freq = tpl.frequency as RecurringFrequency

      // Derive occurrences from start_date + frequency + interval
      let current = new Date(startDate)
      let safety = 0
      const maxOccurrences = 500 // absolute safety cap

      while (current <= endDate && current <= ceiling && safety < maxOccurrences) {
        safety++
        const ymd = toYmdString(current)

        // Only include future or today occurrences
        if (ymd >= todayYmd) {
          const key = `${tpl.id}|${ymd}`
          // Only include if NOT already paid
          if (!paidSet.has(key)) {
            allOccurrences.push({
              recurringId: tpl.id,
              recurringTemplateId: tpl.id,
              occurrenceDate: ymd,
              dueDate: ymd,
              isVirtual: true,
              description: tpl.description,
              amount: Number(tpl.amount),
              type: tpl.type as RecurringType,
              frequency: freq,
              accountId: tpl.account_id || null,
              categoryId: tpl.category_id || null,
              subcategoryId: tpl.subcategory_id || null,
              contactId: tpl.contact_id || null,
              customerId: tpl.customer_id || null,
              contactType: tpl.contact_type || null,
            })
          }
        }

        current = addInterval(current, freq, interval)
      }
    }

    // Sort by date ASC
    allOccurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))

    return { success: true, data: allOccurrences }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
