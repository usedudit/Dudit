/**
 * Formatting utilities for a standardized display across the project.
 * Focuses on pt-BR locale.
 */

/**
 * Formats a number as BRL currency (R$ 0,00).
 */
export function formatCurrency(value: number | string): string {
  const amount = typeof value === "string" ? parseFloat(value) : value
  let formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount || 0)
  
  // Normalize output if the system locale fallback occurs
  if (formatted.includes("BRL")) {
    formatted = formatted.replace("BRL", "R$")
  }
  if (formatted.startsWith("$") && !formatted.startsWith("R$")) {
    formatted = formatted.replace("$", "R$")
  }
  return formatted
}

/**
 * Formats a date as DD/MM/YYYY.
 */
export function formatDate(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/**
 * Formats a date as "DD de Mês de YYYY, HH:mm" (Timezone: America/Sao_Paulo).
 */
export function formatFullDate(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/**
 * Formats a date as "DD de Mês" (Timezone: America/Sao_Paulo).
 */
export function formatShortDate(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/**
 * Formats a date with time: DD/MM/YYYY HH:mm.
 */
export function formatDateTime(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/**
 * Formats a date as HH:mm (America/Sao_Paulo).
 */
export function formatTime(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/**
 * Calendar-day difference: dueYmd (YYYY-MM-DD) minus "today" in America/Sao_Paulo.
 * 0 = vence hoje, 1 = vence amanhã, negative = already passed that calendar day.
 */
export function diffCalendarDaysInSaoPaulo(dueYmd: string): number {
  const trimmed = dueYmd.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 0
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = Number(parts.find((p) => p.type === "year")?.value)
  const m = Number(parts.find((p) => p.type === "month")?.value)
  const d = Number(parts.find((p) => p.type === "day")?.value)
  const todayMs = Date.UTC(y, m - 1, d)
  const [dy, dm, dd] = trimmed.split("-").map(Number)
  const dueMs = Date.UTC(dy, dm - 1, dd)
  return Math.round((dueMs - todayMs) / 86400000)
}

/** Hoje (calendário) em YYYY-MM-DD no fuso America/Sao_Paulo. */
export function getTodayYmdSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${d}`
}

/**
 * Exibe data vinda do Postgres sem erro de “um dia antes”:
 * valores `DATE` (YYYY-MM-DD) são o dia civil desejado; não usar `new Date("YYYY-MM-DD")` (UTC meia-noite).
 */
export function formatBrazilDateFromDbInput(
  value: string | null | undefined,
  variant: "dayMonthYear" | "dayMonth"
): string {
  if (value == null || value === "") return "-"
  const s = String(value).trim()
  const ymd = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-").map(Number)
    const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    return anchor.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      ...(variant === "dayMonthYear" ? { year: "numeric" as const } : {}),
      timeZone: "America/Sao_Paulo",
    })
  }
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(variant === "dayMonthYear" ? { year: "numeric" as const } : {}),
    timeZone: "America/Sao_Paulo",
  })
}

/**
 * Formats a date as DD/MM.
 */
export function formatDayMonth(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d)
}
/**
 * Formats a date as a long month name (January, February...).
 */
export function formatMonth(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d)
}

/**
 * Formats a date as YYYY.
 */
export function formatYear(date: Date | string | number): string {
  if (!date) return ""
  const d = new Date(date)
  return new Intl.DateTimeFormat("pt-BR", { year: "numeric" }).format(d)
}

/**
 * Formats a number with pt-BR separators.
 */
export function formatNumber(
  value: number | string,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2
): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num || 0)
}

/**
 * Formats a string as CPF (000.000.000-00).
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1")
}

/**
 * Formats a string as CNPJ (00.000.000/0000-00).
 */
export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1")
}

/**
 * Formats a string as CEP (00000-000).
 */
export function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{3})\d+?$/, "$1")
}
/**
 * Formats a number as a percentage (0,00%).
 */
export function formatPercent(value: number | string, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format((num || 0) / 100)
}
