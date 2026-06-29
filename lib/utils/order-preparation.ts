import type { OpeningHoursData } from "@/lib/utils/opening-hours"
import { getDateComponents, parseInTz, getDefaultTimezone } from "@/lib/date"

const MINUTES_IN_DAY = 24 * 60
const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

type PreparationProductLike = {
  availability_value?: number | string | null
  availability_unit?: string | null
}

function safeNumber(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function clampPreparationMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function parseUnitToMultiplier(unit: string): number {
  const normalized = String(unit || "").trim().toLowerCase()
  if (!normalized) return 1

  if (normalized.startsWith("hora")) return 60
  if (normalized.startsWith("dia")) return 1440
  if (normalized.startsWith("min")) return 1
  return 1
}

export function getPreparationTimeInMinutes(product: PreparationProductLike | null | undefined): number {
  if (!product || typeof product !== "object") return 0
  const value = Math.max(0, safeNumber(product.availability_value))
  if (!value) return 0
  const multiplier = parseUnitToMultiplier(String(product.availability_unit || "Minutos"))
  return clampPreparationMinutes(value * multiplier)
}

export function getMaxCartPreparationTimeInMinutes(products: Array<PreparationProductLike | null | undefined>): number {
  if (!Array.isArray(products) || products.length === 0) return 0
  let max = 0
  for (const product of products) {
    const prep = getPreparationTimeInMinutes(product)
    if (prep > max) max = prep
  }
  return clampPreparationMinutes(max)
}

type DayWindow = { openMinute: number; closeMinute: number }

function getScheduleForDate(openingHours: OpeningHoursData | null | undefined, date: Date): DayWindow | null {
  if (!openingHours || typeof openingHours !== "object") return null
  const { dayOfWeek } = getDateComponents(date, getDefaultTimezone())
  const dayKey = DAYS_OF_WEEK[dayOfWeek]
  const schedule = openingHours[dayKey]
  if (!schedule?.enabled) return null

  const [fromH, fromM] = String(schedule.from || "").split(":").map(Number)
  const [toH, toM] = String(schedule.to || "").split(":").map(Number)
  if (!Number.isFinite(fromH) || !Number.isFinite(fromM) || !Number.isFinite(toH) || !Number.isFinite(toM)) return null

  const openMinute = fromH * 60 + fromM
  let closeMinute = toH * 60 + toM
  if (closeMinute <= openMinute) closeMinute += MINUTES_IN_DAY

  return { openMinute, closeMinute }
}

function cloneDateAtMinute(baseDate: Date, minuteOfDay: number): Date {
  const tz = getDefaultTimezone()
  const { year, month, day } = getDateComponents(baseDate, tz)
  const dayOffset = Math.floor(minuteOfDay / MINUTES_IN_DAY)
  const minuteRemainder = minuteOfDay % MINUTES_IN_DAY
  const hour = Math.floor(minuteRemainder / 60)
  const minute = minuteRemainder % 60

  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const tm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  const baseCloned = parseInTz(ymd, tm, tz)
  if (dayOffset > 0) {
    return new Date(baseCloned.getTime() + dayOffset * 24 * 60 * 60 * 1000)
  }
  return baseCloned
}

function addDays(baseDate: Date, days: number): Date {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000)
}

function findNextOpenDay(openingHours: OpeningHoursData | null | undefined, fromDate: Date): Date | null {
  for (let i = 1; i <= 14; i++) {
    const candidate = addDays(fromDate, i)
    const schedule = getScheduleForDate(openingHours, candidate)
    if (schedule) {
      return cloneDateAtMinute(candidate, schedule.openMinute)
    }
  }
  return null
}

export function adjustToBusinessHours(
  datetime: Date,
  openingHours: OpeningHoursData | null | undefined,
  preparationTimeMinutes = 0,
): Date {
  const inputDate = datetime instanceof Date ? datetime : new Date(datetime)
  if (Number.isNaN(inputDate.getTime())) return new Date()
  const normalizedPreparationMinutes = clampPreparationMinutes(safeNumber(preparationTimeMinutes || 0))

  if (!openingHours || typeof openingHours !== "object") {
    // Fallback: when store hours are not configured, still honor preparation time.
    return new Date(inputDate.getTime() + normalizedPreparationMinutes * 60000)
  }

  let current = new Date(inputDate)
  let remaining = normalizedPreparationMinutes
  let safety = 0

  while (safety < 31) {
    safety += 1
    const schedule = getScheduleForDate(openingHours, current)

    if (!schedule) {
      const nextOpen = findNextOpenDay(openingHours, current)
      if (!nextOpen) return new Date(current)
      current = nextOpen
      continue
    }

    const { hour: hNow, minute: mNow } = getDateComponents(current, getDefaultTimezone())
    const minuteNow = hNow * 60 + mNow
    const absoluteMinuteNow = minuteNow
    const openMinute = schedule.openMinute
    const closeMinute = schedule.closeMinute

    if (absoluteMinuteNow < openMinute) {
      current = cloneDateAtMinute(current, openMinute)
    } else if (absoluteMinuteNow >= closeMinute) {
      const nextOpen = findNextOpenDay(openingHours, current)
      if (!nextOpen) return new Date(current)
      current = nextOpen
      continue
    }

    if (remaining <= 0) return new Date(current)

    const { hour: curH, minute: curM } = getDateComponents(current, getDefaultTimezone())
    const currentMinute = curH * 60 + curM
    const availableToday = closeMinute - currentMinute
    if (availableToday >= remaining) {
      const doneAt = new Date(current.getTime() + remaining * 60000)
      return doneAt
    }

    remaining -= Math.max(0, availableToday)
    const nextOpen = findNextOpenDay(openingHours, current)
    if (!nextOpen) {
      return new Date(current.getTime() + remaining * 60000)
    }
    current = nextOpen
  }

  return new Date(current)
}

export function computeOrderPreparationEstimate(params: {
  products: Array<PreparationProductLike | null | undefined>
  openingHours: OpeningHoursData | null | undefined
  now?: Date
  pickupWindowMinutes?: number
  deliveryTimeEstimateMinutes?: number
}) {
  const now = params.now instanceof Date ? params.now : new Date(params.now || Date.now())
  if (Number.isNaN(now.getTime())) return null

  if (!Array.isArray(params.products) || params.products.length === 0) return null

  const preparationTimeMinutes = getMaxCartPreparationTimeInMinutes(params.products)
  const adjustedReadyAt = adjustToBusinessHours(now, params.openingHours, preparationTimeMinutes)

  if (Number.isNaN(adjustedReadyAt.getTime())) return null

  const pickupWindowMinutes = clampPreparationMinutes(safeNumber(params.pickupWindowMinutes ?? 30))
  const pickupWindowStart = new Date(adjustedReadyAt)
  const pickupWindowEnd = new Date(adjustedReadyAt.getTime() + pickupWindowMinutes * 60000)
  const deliveryMinutes = clampPreparationMinutes(safeNumber(params.deliveryTimeEstimateMinutes ?? 0))
  const estimatedDeliveryAt = new Date(adjustedReadyAt.getTime() + deliveryMinutes * 60000)

  const readyInMinutes = clampPreparationMinutes((adjustedReadyAt.getTime() - now.getTime()) / 60000)

  return {
    now,
    preparationTimeMinutes,
    readyAt: adjustedReadyAt,
    readyInMinutes,
    pickupWindowStart,
    pickupWindowEnd,
    estimatedDeliveryAt,
  }
}
