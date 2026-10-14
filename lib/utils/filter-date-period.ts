export const DATE_PERIOD_PRESETS = ["Últimos 3 dias", "Últimos 7 dias", "Últimos 30 dias", "Mês atual", "Ano atual"] as const

/** Rótulos pt-BR para presets internos (snake_case e legíveis) */
export const DATE_PERIOD_PRESET_LABELS: Record<string, string> = {
  current_month: "Mês atual",
  last_month: "Mês anterior",
  last_30_days: "Últimos 30 dias",
  current_quarter: "Trimestre atual",
  current_year: "Ano atual",
  custom: "Personalizado",
}

export type DatePeriodFilterValue = {
  presets: string[]
  from: string
  to: string
}

export const EMPTY_DATE_PERIOD: DatePeriodFilterValue = { presets: [], from: "", to: "" }

import { getTodayYmd, msToYmd } from "@/lib/date"

export function getBrazilTodayYmd(tz?: string): string {
  return getTodayYmd(tz)
}

/** Adiciona dias civis a uma data YYYY-MM-DD (calendário gregoriano). */
export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const x = new Date(Date.UTC(y, m - 1, d))
  x.setUTCDate(x.getUTCDate() + deltaDays)
  const yy = x.getUTCFullYear()
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(x.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function resolveDatePeriodBounds(period: DatePeriodFilterValue): {
  startYmd: string | null
  endYmd: string | null
} {
  const today = getBrazilTodayYmd()

  if (period.from && period.to) {
    return period.from <= period.to
      ? { startYmd: period.from, endYmd: period.to }
      : { startYmd: period.to, endYmd: period.from }
  }
  if (period.from && !period.to) return { startYmd: period.from, endYmd: null }
  if (!period.from && period.to) return { startYmd: null, endYmd: period.to }

  const p = period.presets[0]
  if (!p) return { startYmd: null, endYmd: null }

  if (p === "Últimos 3 dias") return { startYmd: addCalendarDaysYmd(today, -2), endYmd: today }
  if (p === "Últimos 7 dias") return { startYmd: addCalendarDaysYmd(today, -6), endYmd: today }
  if (p === "Últimos 30 dias" || p === "last_30_days") return { startYmd: addCalendarDaysYmd(today, -29), endYmd: today }
  if (p === "Mês atual" || p === "current_month") {
    const [y, m] = today.split("-").map(Number)
    const start = `${y}-${String(m).padStart(2, "0")}-01`
    const lastD = new Date(y, m, 0).getDate()
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`
    return { startYmd: start, endYmd: end }
  }
  if (p === "last_month") {
    const [y, m] = today.split("-").map(Number)
    const prev = m === 12 ? 12 : m - 1
    const year = m === 12 ? y - 1 : y
    const start = `${year}-${String(prev).padStart(2, "0")}-01`
    const lastD = new Date(year, prev, 0).getDate()
    const end = `${year}-${String(prev).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`
    return { startYmd: start, endYmd: end }
  }
  if (p === "current_quarter") {
    const [y, m] = today.split("-").map(Number)
    const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1
    const start = `${y}-${String(quarterStartMonth).padStart(2, "0")}-01`
    const endMonth = quarterStartMonth + 2
    const lastD = new Date(y, endMonth, 0).getDate()
    const end = `${y}-${String(endMonth).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`
    return { startYmd: start, endYmd: end }
  }
  if (p === "Ano atual" || p === "current_year") {
    const y = today.slice(0, 4)
    return { startYmd: `${y}-01-01`, endYmd: `${y}-12-31` }
  }
  return { startYmd: null, endYmd: null }
}

export function ymdInBounds(ymd: string | null | undefined, startYmd: string | null, endYmd: string | null): boolean {
  if (!ymd) return false
  const d = ymd.slice(0, 10)
  if (startYmd && d < startYmd.slice(0, 10)) return false
  if (endYmd && d > endYmd.slice(0, 10)) return false
  return true
}

export function msToBrazilYmd(ms: number, tz?: string): string {
  return msToYmd(ms, tz)
}

/** Converte YYYY-MM-DD (valor interno do filtro) para DD-MM-YYYY na UI. */
export function formatYmdToDmy(ymd: string): string {
  const raw = (ymd || "").trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return ymd
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Texto curto para chip de filtro ativo */
export function summarizeDatePeriodFilter(period: DatePeriodFilterValue): string | null {
  if (period.presets.length > 0) {
    return period.presets.map((p) => DATE_PERIOD_PRESET_LABELS[p] || p).join(", ")
  }
  if (period.from && period.to) return `${formatYmdToDmy(period.from)} - ${formatYmdToDmy(period.to)}`
  if (period.from) return `A partir de ${formatYmdToDmy(period.from)}`
  if (period.to) return `Até ${formatYmdToDmy(period.to)}`
  return null
}

export function isDatePeriodFilterActive(period: DatePeriodFilterValue): boolean {
  return period.presets.length > 0 || Boolean(period.from || period.to)
}
