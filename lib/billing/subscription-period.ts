/**
 * Billing period helpers for platform subscriptions.
 *
 * A subscription renews every billing cycle. `billing_purchases` holds one row
 * per cycle: the CURRENT (paid) cycle and the NEXT (upcoming) cycle, each with
 * its own `billing_period_start`/`billing_period_end` and invoice.
 *
 * These helpers compute the cycle boundaries in a way that never shows a
 * "Próxima Fatura" in the past, even when `current_period_end` is stale
 * (e.g. legacy subscriptions created before period tracking existed).
 */

export interface SubscriptionPeriodSource {
  current_period_start?: string | null
  current_period_end?: string | null
  created_at?: string | null
}

export interface SubscriptionPeriods {
  /** When the current (paid) cycle started. */
  periodStart: Date
  /** When the current cycle ends (same as the next charge). */
  periodEnd: Date
  /** When the NEXT (upcoming) cycle starts / invoice is due. */
  nextStart: Date
  /** When the NEXT cycle ends. */
  nextEnd: Date
}

/** Add months clamping to the last day of the target month (no overflow). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime())
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return d
}

/**
 * Compute the current + next billing cycle boundaries for a subscription.
 *
 * Rules:
 * - Anchors on `current_period_start` (fallback `created_at` / now).
 * - If `current_period_end` is in the future it is used as the next charge
 *   date; otherwise it is rolled forward month by month from the period start
 *   until it lands in the future (keeps the day of month via addMonths).
 */
export function computeSubscriptionPeriods(
  sub: SubscriptionPeriodSource,
  now: Date = new Date(),
): SubscriptionPeriods {
  const anchor =
    sub.current_period_start && !isNaN(new Date(sub.current_period_start).getTime())
      ? new Date(sub.current_period_start)
      : sub.created_at && !isNaN(new Date(sub.created_at).getTime())
        ? new Date(sub.created_at)
        : now

  const rawEnd =
    sub.current_period_end && !isNaN(new Date(sub.current_period_end).getTime())
      ? new Date(sub.current_period_end)
      : null

  const periodStart = new Date(Math.min(anchor.getTime(), now.getTime()))

  let nextStart: Date
  if (rawEnd && rawEnd.getTime() > now.getTime()) {
    nextStart = rawEnd
  } else {
    nextStart = addMonths(periodStart, 1)
    while (nextStart.getTime() <= now.getTime()) {
      nextStart = addMonths(nextStart, 1)
    }
  }

  const periodEnd = new Date(nextStart.getTime())
  const nextEnd = addMonths(nextStart, 1)

  return { periodStart, periodEnd, nextStart, nextEnd }
}

/** Format a billing period as a stable "cycle key" (YYYY-MM-DD) used to match purchases. */
export function periodKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
