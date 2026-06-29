import { TZDate } from "@date-fns/tz"
import { getDefaultTimezone } from "./tz"

export function nowUTC(): Date {
  return new Date()
}

export function parseInTz(dateStr: string, timeStr: string, tz?: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [h, min] = timeStr.split(":").map(Number)
  const tzDate = new TZDate(y, m - 1, d, h, min, tz || getDefaultTimezone())
  return new Date(tzDate.getTime())
}

export function getDateComponents(date: Date | string | number, tz?: string): {
  year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number
} {
  const zoned = new TZDate(+new Date(date), tz || getDefaultTimezone())
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
    dayOfWeek: zoned.getDay(),
  }
}

export function getTodayYmd(tz?: string): string {
  const resolvedTz = tz || getDefaultTimezone()
  const zoned = new TZDate(Date.now(), resolvedTz)
  const y = zoned.getFullYear()
  const m = String(zoned.getMonth() + 1).padStart(2, "0")
  const d = String(zoned.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function startOfDay(ymd: string, tz?: string): Date {
  return parseInTz(ymd, "00:00", tz)
}

export function endOfDay(ymd: string, tz?: string): Date {
  return parseInTz(ymd, "23:59", tz)
}

export function msToYmd(ms: number, tz?: string): string {
  const { year, month, day } = getDateComponents(new Date(ms), tz)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
