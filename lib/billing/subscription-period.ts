/**
 * Billing period helpers for platform subscriptions.
 *
 * A subscription renews every billing cycle. `billing_purchases` holds one row
 * per cycle. Each cycle is identified by the calendar day the subscription was
 * anchored on (the day of `created_at`, or the explicit `billing_anchor_day`),
 * in America/Sao_Paulo — the same timezone Mercado Pago uses for `debit_date`.
 *
 * Everything here is deterministic:
 * - cycles never drift (the anchor day is always recomputed from the original
 *   anchor, so a subscription anchored on the 31st goes 31 → 28/29 → 31 …);
 * - a cycle is `[start, end)` in local calendar days, so an MP charge at
 *   00:00 BRT belongs to the cycle that starts that day;
 * - `current_period_end` is never trusted when it is before the start (legacy
 *   rows corrupted by using `next_payment_date` as period end).
 */

const BILLING_TIME_ZONE = "America/Sao_Paulo"
/** Brazil has no DST since 2019 — America/Sao_Paulo is UTC-3 year-round. */
const BILLING_UTC_OFFSET_HOURS = 3

export interface SubscriptionPeriodSource {
  current_period_start?: string | null
  current_period_end?: string | null
  created_at?: string | null
  billing_anchor_day?: number | null
}

export interface BillingCycle {
  /** First instant of the cycle (00:00 America/Sao_Paulo). */
  start: Date
  /** First instant of the next cycle. */
  end: Date
  /** Stable cycle key, `YYYY-MM-DD` in America/Sao_Paulo. */
  key: string
}

export interface SubscriptionPeriods {
  /** When the current cycle started. */
  periodStart: Date
  /** When the current cycle ends (same as the next charge). */
  periodEnd: Date
  /** When the NEXT cycle starts / invoice is due. */
  nextStart: Date
  /** When the NEXT cycle ends. */
  nextEnd: Date
}

interface CalendarDate {
  year: number
  monthIndex: number
  day: number
}

const billingDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return isNaN(date.getTime()) ? null : date
}

function calendarInBillingTz(date: Date): CalendarDate {
  const parts = billingDateFormatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === "year")?.value)
  const month = Number(parts.find((p) => p.type === "month")?.value)
  const day = Number(parts.find((p) => p.type === "day")?.value)
  return { year, monthIndex: month - 1, day }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Instant of 00:00 (America/Sao_Paulo) for a calendar date. */
function startOfBillingDay(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, BILLING_UTC_OFFSET_HOURS, 0, 0, 0))
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, daysInMonth(year, monthIndex))
}

/**
 * Start of the cycle that is `offset` months away from the anchor month.
 * The original anchor day is always used, so months with fewer days only
 * clamp that specific cycle and never shift the following ones.
 */
function cycleStartAtOffset(anchor: CalendarDate, anchorDay: number, offset: number): Date {
  const absoluteMonth = anchor.monthIndex + offset
  const year = anchor.year + Math.floor(absoluteMonth / 12)
  const monthIndex = ((absoluteMonth % 12) + 12) % 12
  return startOfBillingDay(year, monthIndex, clampDay(year, monthIndex, anchorDay))
}

/**
 * Resolve the billing cycle that contains `instant`.
 */
export function resolveBillingCycle(
  anchor: Date,
  instant: Date,
  anchorDay?: number | null,
): BillingCycle {
  const anchorCalendar = calendarInBillingTz(anchor)
  const instantCalendar = calendarInBillingTz(instant)
  const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : anchorCalendar.day

  let offset =
    (instantCalendar.year - anchorCalendar.year) * 12 +
    (instantCalendar.monthIndex - anchorCalendar.monthIndex)

  let start = cycleStartAtOffset(anchorCalendar, day, offset)
  if (start.getTime() > instant.getTime()) {
    offset -= 1
    start = cycleStartAtOffset(anchorCalendar, day, offset)
  }

  let end = cycleStartAtOffset(anchorCalendar, day, offset + 1)
  while (end.getTime() <= instant.getTime()) {
    offset += 1
    start = end
    end = cycleStartAtOffset(anchorCalendar, day, offset + 1)
  }

  return { start, end, key: cycleKey(start) }
}

/** The cycle that starts exactly when `instant` starts (used for the next cycle). */
export function nextBillingCycle(cycle: BillingCycle, anchorDay: number): BillingCycle {
  const start = cycle.end
  const anchorCalendar = calendarInBillingTz(cycle.start)
  const day = anchorDay >= 1 && anchorDay <= 31 ? anchorDay : anchorCalendar.day
  const startCalendar = calendarInBillingTz(start)
  const offset =
    (startCalendar.year - anchorCalendar.year) * 12 +
    (startCalendar.monthIndex - anchorCalendar.monthIndex)
  const end = cycleStartAtOffset(anchorCalendar, day, offset + 1)
  return { start, end, key: cycleKey(start) }
}

/**
 * Compute the current + next billing cycle boundaries for a subscription.
 *
 * The anchor is `created_at` (the day the subscription/charge relationship
 * began). `current_period_start` is only used when `created_at` is missing,
 * because renewal flows used to overwrite it with "now" and reset the anchor.
 */
export function computeSubscriptionPeriods(
  sub: SubscriptionPeriodSource,
  now: Date = new Date(),
): SubscriptionPeriods {
  const created = toDate(sub.created_at)
  const periodStart = toDate(sub.current_period_start)
  const anchor = created ?? periodStart ?? now

  const anchorCalendar = calendarInBillingTz(anchor)
  const anchorDay =
    sub.billing_anchor_day && sub.billing_anchor_day >= 1 && sub.billing_anchor_day <= 31
      ? sub.billing_anchor_day
      : anchorCalendar.day

  const current = resolveBillingCycle(anchor, now, anchorDay)
  const next = nextBillingCycle(current, anchorDay)

  return {
    periodStart: current.start,
    periodEnd: current.end,
    nextStart: next.start,
    nextEnd: next.end,
  }
}

/**
 * Resolve the cycle for an explicit charge date (Mercado Pago `debit_date`).
 * Falls back to the cycle containing `now` when the date is missing/invalid.
 */
export function resolveChargeCycle(
  sub: SubscriptionPeriodSource,
  chargeDate: Date | null | undefined,
  now: Date = new Date(),
): BillingCycle {
  const anchor = toDate(sub.created_at) ?? toDate(sub.current_period_start) ?? now
  const anchorCalendar = calendarInBillingTz(anchor)
  const anchorDay =
    sub.billing_anchor_day && sub.billing_anchor_day >= 1 && sub.billing_anchor_day <= 31
      ? sub.billing_anchor_day
      : anchorCalendar.day

  return resolveBillingCycle(anchor, chargeDate && !isNaN(chargeDate.getTime()) ? chargeDate : now, anchorDay)
}

/** Format a cycle start as a stable key (`YYYY-MM-DD` in America/Sao_Paulo). */
export function cycleKey(date: Date): string {
  const { year, monthIndex, day } = calendarInBillingTz(date)
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Back-compat alias: cycle key of any instant. */
export function periodKey(date: Date): string {
  return cycleKey(date)
}

/**
 * Add months clamped to the last day of the target month, preserving the
 * time of day. Kept for callers that still need raw month math.
 */
export function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate()
  const target = new Date(date.getTime())
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target
}

/** Local calendar day used as billing anchor for a subscription. */
export function billingAnchorDay(sub: SubscriptionPeriodSource): number {
  if (sub.billing_anchor_day && sub.billing_anchor_day >= 1 && sub.billing_anchor_day <= 31) {
    return sub.billing_anchor_day
  }
  const anchor = toDate(sub.created_at) ?? toDate(sub.current_period_start)
  if (!anchor) return new Date().getDate()
  return calendarInBillingTz(anchor).day
}
