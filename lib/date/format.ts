import { TZDate } from "@date-fns/tz"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { getDefaultTimezone } from "./tz"

export function formatInTz(date: Date | string | number, tz: string, pattern: string): string {
  const zoned = new TZDate(+new Date(date), tz)
  return format(zoned, pattern, { locale: ptBR })
}

export function formatDate(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "dd/MM/yyyy")
}

export function formatDateTime(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "dd/MM/yyyy HH:mm")
}

export function formatTime(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "HH:mm")
}

export function formatFullDate(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "dd 'de' MMMM 'de' yyyy, HH:mm")
}

export function formatDateShort(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "dd 'de' MMM")
}

export function formatDateTimeWithBullet(date: Date | string | number, tz?: string): string {
  return formatInTz(date, tz || getDefaultTimezone(), "dd/MM/yyyy '•' HH:mm")
}

export function formatBrazilDateFromDbInput(
  value: string | null | undefined,
  variant: "dayMonthYear" | "dayMonth",
  tz?: string,
): string {
  if (value == null || value === "") return "-"
  const s = String(value).trim()
  const ymd = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const dt = parseDateOnly(ymd, tz || getDefaultTimezone())
    const pattern = variant === "dayMonthYear" ? "dd 'de' MMM yyyy" : "dd 'de' MMM"
    return format(dt, pattern, { locale: ptBR })
  }
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  const resolvedTz = tz || getDefaultTimezone()
  const zoned = new TZDate(dt.getTime(), resolvedTz)
  const pattern = variant === "dayMonthYear" ? "dd 'de' MMM yyyy" : "dd 'de' MMM"
  return format(zoned, pattern, { locale: ptBR })
}

export function toDateTimeInputValue(date: Date | string | number, tz?: string): string {
  const resolvedTz = tz || getDefaultTimezone()
  const zoned = new TZDate(+new Date(date), resolvedTz)
  const y = zoned.getFullYear()
  const m = String(zoned.getMonth() + 1).padStart(2, "0")
  const d = String(zoned.getDate()).padStart(2, "0")
  const h = String(zoned.getHours()).padStart(2, "0")
  const min = String(zoned.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}T${h}:${min}`
}

function parseDateOnly(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  const tzDate = new TZDate(y, m - 1, d, 12, 0, tz)
  return new Date(tzDate.getTime())
}
