"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"

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
  contactType?: RecurringContactType | null
}) {
  try {
    await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()
    const nextRunDate = input.nextRunDate || input.startDate
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
        contact_id: input.contactId ?? null,
        contact_type: input.contactType ?? null,
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
    // recalculate baseline from now to prevent immediate stale run loops
    next_run_date: new Date().toISOString(),
  })
}

export async function duplicateRecurringTransactionAction(id: string, partnerId: string) {
  try {
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

