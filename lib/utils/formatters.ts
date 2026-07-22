/**
 * Formatting utilities for a standardized display across the project.
 * Focuses on pt-BR locale.
 *
 * Date/time functions now delegate to lib/date for centralized timezone handling.
 */

import * as dateTz from "@/lib/date"

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
  return dateTz.formatDate(date)
}

/**
 * Robust string-based formatter from YYYY-MM-DD to DD-MM-YYYY without timezone shift.
 */
export function formatDateToBR(dateStr?: string | null): string {
  if (!dateStr) return ""
  const parts = dateStr.split("-")
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return dateStr
}

/**
 * Formats a date as "DD de Mês de YYYY, HH:mm" (Timezone: America/Sao_Paulo).
 */
export function formatFullDate(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatFullDate(date)
}

/**
 * Formats a date as "DD de Mês" (Timezone: America/Sao_Paulo).
 */
export function formatShortDate(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "dd 'de' MMMM")
}

/**
 * Formats a date with time: DD/MM/YYYY HH:mm.
 */
export function formatDateTime(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatDateTime(date)
}

/**
 * Formats a date as HH:mm (America/Sao_Paulo).
 */
export function formatTime(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatTime(date)
}

/**
 * Calendar-day difference: dueYmd (YYYY-MM-DD) minus "today" in America/Sao_Paulo.
 * 0 = vence hoje, 1 = vence amanhã, negative = already passed that calendar day.
 */
export function diffCalendarDaysInSaoPaulo(dueYmd: string): number {
  return dateTz.diffCalendarDays(dateTz.getTodayYmd(), dueYmd)
}

/** Hoje (calendário) em YYYY-MM-DD no fuso America/Sao_Paulo. */
export function getTodayYmdSaoPaulo(): string {
  return dateTz.getTodayYmd()
}

/**
 * Exibe data vinda do Postgres sem erro de "um dia antes":
 * valores `DATE` (YYYY-MM-DD) são o dia civil desejado; não usar `new Date("YYYY-MM-DD")` (UTC meia-noite).
 */
export function formatBrazilDateFromDbInput(
  value: string | null | undefined,
  variant: "dayMonthYear" | "dayMonth"
): string {
  return dateTz.formatBrazilDateFromDbInput(value, variant)
}

/**
 * Formats a date as DD/MM.
 */
export function formatDayMonth(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "dd/MM")
}

/**
 * Formats a date as a long month name (janeiro, fevereiro...).
 */
export function formatMonth(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "MMMM")
}

/**
 * Formats a date as YYYY.
 */
export function formatYear(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "yyyy")
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

/**
 * Returns the suffix string corresponding to a billing unit.
 */
export function getBillingUnitSuffix(unit?: string | null): string {
  if (!unit) return ""
  switch (unit) {
    case "per_hour":
      return "/hora"
    case "per_day":
      return "/dia"
    case "per_week":
      return "/semana"
    case "per_month":
      return "/mês"
    case "per_year":
      return "/ano"
    default:
      return ""
  }
}

/**
 * Returns year, month, day, hour, minute, second and dayOfWeek in America/Sao_Paulo timezone.
 */
export function getSaoPauloDateComponents(date: Date = new Date()) {
  return dateTz.getDateComponents(date)
}

/**
 * Returns the timezone offset in minutes for America/Sao_Paulo for a given Date.
 * E.g., returns -180 (for UTC-3).
 */
export function getSaoPauloOffsetMinutes(date: Date = new Date()): number {
  try {
    const tzString = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    const localString = date.toLocaleString("en-US", { timeZone: "UTC" })
    const tzDate = new Date(tzString)
    const localDate = new Date(localString)
    return Math.round((tzDate.getTime() - localDate.getTime()) / 60000)
  } catch {
    return -180 // Fallback to standard UTC-3
  }
}

/**
 * Creates a Date object representing the given calendar date/time in America/Sao_Paulo.
 * Handles DST correctly via Intl.
 */
export function createSaoPauloDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  return dateTz.parseInTz(ymd, hm)
}

/**
 * Retorna o timezone IANA padrão da aplicação.
 * Lê de APP_DEFAULT_TIMEZONE (env) se definido, senão usa America/Sao_Paulo.
 * Isso permite trocar o timezone globalmente sem alterar código,
 * e futuramente pode ser sobrescrito por parceiro.
 */
export function getDefaultTimezone(): string {
  return dateTz.getDefaultTimezone()
}

/**
 * Interpreta uma data e hora no formato YYYY-MM-DD e HH:mm como horário
 * civil em um timezone IANA específico (padrão: getDefaultTimezone()).
 *
 * Retorna um objeto Date UTC equivalente.
 *
 * Ex: parseDateInTimezone("2026-06-29", "14:00", "America/Sao_Paulo")
 *     → Date representando 2026-06-29 17:00 UTC (14:00 BRT = UTC-3)
 *
 * Funciona para QUALQUER timezone IANA (America/New_York, Europe/Lisbon, etc.)
 * e respeita horário de verão automaticamente via Intl.
 */
export function parseDateInTimezone(dateStr: string, timeStr: string, timezone?: string): Date {
  return dateTz.parseInTz(dateStr, timeStr, timezone)
}

/**
 * Normaliza e formata a unidade de medida do produto.
 * Exemplos:
 *   formatUnit("UN") -> "un."
 *   formatUnit("UN", 5, "full") -> "unidades"
 *   formatUnit("KG") -> "kg"
 *   formatUnit("PC", 2, "full") -> "peças"
 */
export function formatUnit(unit?: string | null, quantity = 1, style: "short" | "full" = "short"): string {
  const raw = String(unit || "UN").trim()
  const clean = raw.toUpperCase()
  
  if (style === "full") {
    const isPlural = quantity !== 1
    switch (clean) {
      case "UN":
      case "UNIDADE":
      case "UND":
        return isPlural ? "unidades" : "unidade"
      case "PC":
      case "PECA":
      case "PEÇA":
        return isPlural ? "peças" : "peça"
      case "KG":
      case "QUILO":
        return isPlural ? "quilos" : "quilo"
      case "LT":
      case "LITRO":
        return isPlural ? "litros" : "litro"
      case "MT":
      case "M":
      case "METRO":
        return isPlural ? "metros" : "metro"
      case "CX":
      case "CAIXA":
        return isPlural ? "caixas" : "caixa"
      case "PT":
      case "PACOTE":
      case "PCT":
        return isPlural ? "pacotes" : "pacote"
      case "DZ":
      case "DUZIA":
      case "DÚZIA":
        return isPlural ? "dúzias" : "dúzia"
      case "PAR":
        return isPlural ? "pares" : "par"
      default:
        return raw.toLowerCase()
    }
  }

  switch (clean) {
    case "UN":
    case "UNIDADE":
    case "UND":
      return "un."
    case "PC":
    case "PECA":
    case "PEÇA":
      return "pc."
    case "KG":
    case "QUILO":
      return "kg"
    case "LT":
    case "LITRO":
      return "lt."
    case "MT":
    case "M":
    case "METRO":
      return "m"
    case "CX":
    case "CAIXA":
      return "cx."
    case "PT":
    case "PACOTE":
    case "PCT":
      return "pt."
    case "DZ":
    case "DUZIA":
    case "DÚZIA":
      return "dz."
    case "PAR":
      return "par"
    default:
      return raw.toLowerCase()
  }
}

/**
 * Formata a quantidade com sua unidade correspondente.
 * Ex: formatQuantityWithUnit(10, "KG") -> "10 kg"
 *     formatQuantityWithUnit(5, "UN", "full") -> "5 unidades"
 */
export function formatQuantityWithUnit(quantity: number | string, unit?: string | null, style: "short" | "full" = "short"): string {
  const qtyNum = typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity
  const formattedUnit = formatUnit(unit, qtyNum, style)
  return `${quantity} ${formattedUnit}`
}

/**
 * Formata o preço unitário acompanhado da unidade (quando não for unidade padrão simples).
 * Ex: formatUnitPriceWithUnit(50, "KG") -> "R$ 50,00 / kg"
 *     formatUnitPriceWithUnit(50, "UN") -> "R$ 50,00"
 */
export function formatUnitPriceWithUnit(price: number | string, unit?: string | null): string {
  const formattedPrice = formatCurrency(price)
  const cleanUnit = formatUnit(unit, 1, "short")
  if (cleanUnit === "un.") {
    return formattedPrice
  }
  return `${formattedPrice} / ${cleanUnit}`
}

