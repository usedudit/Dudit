import type { SupabaseClient } from "@supabase/supabase-js"
import type { RecurringFrequencyType } from "@/lib/types/recurring"

/**
 * Frequencias aceitas em recurring_plans.frequency_type.
 * ATENCAO: o banco so aceita daily|weekly|monthly|yearly|custom. O codigo
 * legado usava day|week|month|year e caia sempre no fallback de 30 dias.
 */
export type { RecurringFrequencyType }

export interface RecurringFrequencyPlan {
  frequency_type?: string | null
  frequency_interval?: number | null
  start_date?: string | null
  weekdays?: number[] | null
  day_of_month?: number | null
  use_last_day?: boolean | null
  year_month?: number | null
  year_day?: number | null
}

/** Frequencia aceita pelo Mercado Pago em preapproval.auto_recurring. */
export interface MpFrequency {
  frequency: number
  frequency_type: "days" | "weeks" | "months" | "years"
}

const FALLBACK_AFTER_DAYS = 30

export function normalizeFrequencyType(value?: string | null): RecurringFrequencyType {
  switch (value) {
    case "daily":
    case "day":
      return "daily"
    case "weekly":
    case "week":
      return "weekly"
    case "monthly":
    case "month":
      return "monthly"
    case "yearly":
    case "year":
      return "yearly"
    case "custom":
      return "custom"
    default:
      return "monthly"
  }
}

export function normalizeFrequencyInterval(value?: number | null): number {
  const interval = Math.floor(Number(value || 1))
  return Number.isFinite(interval) && interval >= 1 ? interval : 1
}

/**
 * Calcula a PROXIMA execucao a partir de p_current_run.
 * Sempre retorna uma data estritamente posterior a p_current_run - a mesma
 * garantia da RPC financial_next_run_date.
 *
 * Usa a RPC recurring_plan_next_execution_at quando disponivel (fonte da
 * verdade, respeita weekdays/day_of_month/use_last_day/year_month/year_day)
 * e cai para um calculo em memoria se a chamada falhar.
 */
export async function computeNextExecutionAt(
  supabase: SupabaseClient,
  plan: RecurringFrequencyPlan,
  currentRun: Date = new Date(),
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("recurring_plan_next_execution_at", {
      p_frequency_type: normalizeFrequencyType(plan.frequency_type),
      p_frequency_interval: normalizeFrequencyInterval(plan.frequency_interval),
      p_current_run: currentRun.toISOString(),
      p_start_date: (plan.start_date as string | null) || currentRun.toISOString(),
      p_weekdays: (plan.weekdays as number[] | null) ?? null,
      p_day_of_month: (plan.day_of_month as number | null) ?? null,
      p_use_last_day: Boolean(plan.use_last_day),
      p_year_month: (plan.year_month as number | null) ?? null,
      p_year_day: (plan.year_day as number | null) ?? null,
    })

    if (!error && data) {
      const iso = toIso(data)
      if (iso && iso > currentRun.toISOString()) return iso
    }
  } catch {
    // segue para o fallback em memoria
  }

  return nextExecutionFallback(plan, currentRun)
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function nextExecutionFallback(plan: RecurringFrequencyPlan, currentRun: Date): string {
  const type = normalizeFrequencyType(plan.frequency_type)
  const interval = normalizeFrequencyInterval(plan.frequency_interval)

  if (type === "custom") {
    return new Date(currentRun.getTime() + FALLBACK_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }

  const next = new Date(currentRun)

  if (type === "daily") {
    next.setDate(next.getDate() + interval)
  } else if (type === "weekly") {
    const weekdays = plan.weekdays
    if (weekdays && weekdays.length > 0) {
      const start = new Date(currentRun)
      start.setDate(start.getDate() + 1)
      for (let i = 0; i < 800; i += 1) {
        const candidate = new Date(start)
        candidate.setDate(start.getDate() + i)
        const weeksFromStart = Math.floor(
          (candidate.getTime() - new Date(plan.start_date || currentRun).getTime()) / (7 * 24 * 60 * 60 * 1000),
        )
        if (
          weekdays.includes(candidate.getUTCDay()) &&
          Math.abs(weeksFromStart % interval) === 0
        ) {
          return candidate.toISOString()
        }
      }
    }
    next.setDate(next.getDate() + interval * 7)
  } else if (type === "monthly") {
    const day = plan.day_of_month
    if (plan.use_last_day) {
      const nextMonth = new Date(next.getFullYear(), next.getMonth() + interval + 1, 0)
      next.setMonth(next.getMonth() + interval)
      next.setDate(nextMonth.getDate())
    } else if (day && day >= 1) {
      next.setMonth(next.getMonth() + interval)
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(day, lastDay))
    } else {
      next.setMonth(next.getMonth() + interval)
    }
  } else {
    next.setFullYear(next.getFullYear() + interval)
    if (plan.year_month) next.setMonth(plan.year_month - 1)
    if (plan.year_day) {
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
      next.setDate(Math.min(plan.year_day, lastDay))
    }
  }

  if (next.getTime() <= currentRun.getTime()) {
    return new Date(currentRun.getTime() + FALLBACK_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }

  return next.toISOString()
}

/**
 * Converte a frequencia do plano para os formatos que o Mercado Pago aceita em
 * preapproval.auto_recurring. O legado so emitia days|months e so reconhecia
 * month|week, fazendo planos anuais virarem cobrancas de 30 dias.
 */
export function toMpFrequency(plan: RecurringFrequencyPlan): MpFrequency {
  const interval = normalizeFrequencyInterval(plan.frequency_interval)

  switch (normalizeFrequencyType(plan.frequency_type)) {
    case "daily":
    case "custom":
      return { frequency: interval, frequency_type: "days" }
    case "weekly":
      return { frequency: interval, frequency_type: "weeks" }
    case "yearly":
      return { frequency: interval, frequency_type: "years" }
    case "monthly":
    default:
      return { frequency: interval, frequency_type: "months" }
  }
}
