/**
 * Scheduled plan changes (downgrades and cancellations).
 *
 * A downgrade never creates a second subscription. At the end of the paid cycle
 * the SAME row switches to the new plan and keeps `mercado_pago_subscription_id`,
 * so the Mercado Pago preapproval keeps resolving to it, the billing history
 * stays on one subscription and the billing anchor never drifts.
 *
 * Recreating the row (the previous behaviour) orphaned the preapproval: it kept
 * charging the old price while the webhook could no longer grant access.
 *
 * This module is the single place that applies a scheduled change. It is called
 * lazily (getPartnerPlan / getPartnerSubscription) and by the reconciliation cron
 * so the change happens even if nobody opens the app.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { getPlanById, invalidatePartnerPlanCache } from "@/lib/services/subscription.service"
import { computeSubscriptionPeriods } from "./subscription-period"
import { logBillingAudit } from "./audit"

export interface ScheduledPlanChangeSource {
  id: string
  partner_id: string
  status: string
  plan_id: string
  pending_plan_id?: string | null
  cancel_at_period_end?: boolean | null
  current_period_start?: string | null
  current_period_end?: string | null
  billing_anchor_day?: number | null
  mercado_pago_subscription_id?: string | null
  created_at?: string | null
}

export type ScheduledChangeKind = "plan_change" | "cancellation"

export interface ScheduledChangeResult {
  /** Whether the database was actually changed. */
  applied: boolean
  /** What the row was waiting for; `null` when there is no scheduled change. */
  kind: ScheduledChangeKind | null
  /** Plan the subscription switched to (plan changes only). */
  nextPlanId: string | null
}

/** Whether the subscription has a change waiting for the end of the cycle. */
export function hasScheduledPlanChange(
  sub: Pick<ScheduledPlanChangeSource, "pending_plan_id" | "cancel_at_period_end">,
): boolean {
  return Boolean(sub.pending_plan_id) || Boolean(sub.cancel_at_period_end)
}

/** `plan_change` when a new plan is queued, `cancellation` when it just ends. */
export function scheduledChangeKind(
  sub: Pick<ScheduledPlanChangeSource, "pending_plan_id" | "cancel_at_period_end">,
): ScheduledChangeKind | null {
  if (!hasScheduledPlanChange(sub)) return null
  return sub.pending_plan_id ? "plan_change" : "cancellation"
}

/**
 * Whether the paid cycle is over and the scheduled change must be applied.
 * Only an active/trialing contract rotates; past_due rows follow the grace flow.
 */
export function isScheduledPlanChangeDue(
  sub: ScheduledPlanChangeSource,
  now: Date = new Date(),
): boolean {
  if (!hasScheduledPlanChange(sub)) return false
  if (!["active", "trialing"].includes(String(sub.status))) return false

  const end = sub.current_period_end ? new Date(sub.current_period_end) : null
  if (!end || isNaN(end.getTime())) return false

  return end.getTime() <= now.getTime()
}

/**
 * A preapproval cancellation is not, by itself, enough to revoke access.
 *
 * When the partner scheduled a downgrade/cancellation, Mercado Pago is told to
 * stop charging immediately and then echoes a `cancelled` event. Dropping the
 * local status on that event would cut a paid cycle short, so the cycle keeps
 * running until `current_period_end` and the scheduled change applies then.
 */
export function shouldKeepScheduledAccess(
  before: Pick<ScheduledPlanChangeSource, "pending_plan_id" | "cancel_at_period_end" | "current_period_end">,
  targetStatus: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (targetStatus !== "cancelled") return false
  if (!before.cancel_at_period_end && !before.pending_plan_id) return false

  const end = before.current_period_end ? new Date(before.current_period_end) : null
  return Boolean(end && !isNaN(end.getTime()) && end.getTime() > now.getTime())
}

/**
 * Apply the scheduled change of a subscription, in place.
 *
 * - `pending_plan_id` set → rotate the plan on the same row (next cycle starts
 *   at `current_period_end`); a free target also drops the preapproval id.
 * - only `cancel_at_period_end` → close the subscription and let the partner
 *   fall back to the free plan.
 */
export async function applyScheduledPlanChange(
  subscriptionId: string,
  now: Date = new Date(),
): Promise<ScheduledChangeResult> {
  const admin = getAdminClient()

  const { data: sub, error } = await admin
    .from("subscriptions")
    .select(
      "id, partner_id, status, plan_id, pending_plan_id, cancel_at_period_end, current_period_start, current_period_end, billing_anchor_day, mercado_pago_subscription_id, created_at",
    )
    .eq("id", subscriptionId)
    .maybeSingle()

  if (error || !sub) {
    console.error("[PlanChange] Subscription not found:", subscriptionId, error?.message)
    return { applied: false, kind: null, nextPlanId: null }
  }

  if (!isScheduledPlanChangeDue(sub as ScheduledPlanChangeSource, now)) {
    return { applied: false, kind: null, nextPlanId: null }
  }

  // ── Cancellation: there is no next plan, the contract just ends ──
  if (!sub.pending_plan_id) {
    await endSubscriptionAtPeriodEnd(sub as ScheduledPlanChangeSource, now)
    return { applied: true, kind: "cancellation", nextPlanId: null }
  }

  // ── Plan change: rotate the same row to the new plan ──
  const nextPlan = await getPlanById(sub.pending_plan_id)
  if (!nextPlan || !nextPlan.is_active) {
    console.error(
      "[PlanChange] Scheduled plan is unavailable, keeping the current plan:",
      sub.pending_plan_id,
    )
    return { applied: false, kind: "plan_change", nextPlanId: sub.pending_plan_id }
  }

  const nextIsFree = Number(nextPlan.price || 0) <= 0
  const periods = computeSubscriptionPeriods(sub as ScheduledPlanChangeSource, now)

  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      plan_id: nextPlan.id,
      plan_snapshot: nextPlan,
      status: "active",
      pending_plan_id: null,
      cancel_at_period_end: false,
      cancelled_at: null,
      ended_at: null,
      past_due_at: null,
      current_period_start: periods.periodStart.toISOString(),
      current_period_end: periods.periodEnd.toISOString(),
      // A free plan has nothing to charge: the preapproval is already cancelled
      // (it was stopped when the change was scheduled) and must be detached.
      ...(nextIsFree ? { mercado_pago_subscription_id: null } : {}),
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id)

  if (updateError) {
    console.error("[PlanChange] Failed to apply scheduled plan:", updateError.message)
    return { applied: false, kind: "plan_change", nextPlanId: nextPlan.id }
  }

  invalidatePartnerPlanCache(sub.partner_id)

  if (nextIsFree && sub.mercado_pago_subscription_id) {
    try {
      const { cancelMpPreapproval } = await import("@/lib/services/mercadopago/subscriptions")
      await cancelMpPreapproval(sub.mercado_pago_subscription_id)
    } catch {
      // Already cancelled when the change was scheduled.
    }
  }

  await logBillingAudit("billing.subscription.status_changed", sub.partner_id, {
    subscription_id: sub.id,
    change: "scheduled_plan_change",
    from_plan_id: sub.plan_id,
    to_plan_id: nextPlan.id,
    effective_at: now.toISOString(),
  })

  // Status-only sync: no charge exists for the new cycle yet. The purchase is
  // created when Mercado Pago actually charges the new price.
  try {
    const { syncSubscriptionToBilling } = await import("./sync-subscription")
    await syncSubscriptionToBilling(sub.id, "reconciliation", {
      status: "active",
      previousStatus: "active",
      notify: false,
    })
  } catch (syncErr: any) {
    console.error("[PlanChange] Billing sync after plan change failed:", syncErr?.message)
  }

  try {
    const { enforcePlanLimitsAndArchiveExcess } = await import(
      "@/lib/services/subscription-archiver.service"
    )
    await enforcePlanLimitsAndArchiveExcess(sub.partner_id, nextPlan.limits_json)
  } catch (archErr: any) {
    console.error("[PlanChange] Archiving after plan change failed:", archErr?.message)
  }

  return { applied: true, kind: "plan_change", nextPlanId: nextPlan.id }
}

/**
 * Close a subscription whose paid cycle is over. Mirrors the past-due expiry
 * flow: stop Mercado Pago, flip the row, sync billing (which notifies the
 * partner) and archive resources down to the free plan.
 */
async function endSubscriptionAtPeriodEnd(
  sub: ScheduledPlanChangeSource,
  now: Date,
): Promise<void> {
  const admin = getAdminClient()
  const nowIso = now.toISOString()

  // Safety net for legacy rows that were scheduled before the preapproval was
  // cancelled at scheduling time.
  if (sub.mercado_pago_subscription_id) {
    try {
      const { cancelMpPreapproval } = await import("@/lib/services/mercadopago/subscriptions")
      await cancelMpPreapproval(sub.mercado_pago_subscription_id)
    } catch {
      // Already cancelled.
    }
  }

  await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      ended_at: nowIso,
      cancel_at_period_end: false,
      updated_at: nowIso,
    })
    .eq("id", sub.id)

  invalidatePartnerPlanCache(sub.partner_id)

  try {
    const { syncSubscriptionToBilling } = await import("./sync-subscription")
    await syncSubscriptionToBilling(sub.id, "reconciliation", {
      status: "cancelled",
      previousStatus: "active",
      cancellationReason: "user",
      skipArchiving: true,
    })
  } catch (syncErr: any) {
    console.error("[PlanChange] Billing sync after cancellation failed:", syncErr?.message)
  }

  try {
    const { enforcePlanLimitsAndArchiveExcess } = await import(
      "@/lib/services/subscription-archiver.service"
    )
    await enforcePlanLimitsAndArchiveExcess(sub.partner_id)
  } catch (archErr: any) {
    console.error("[PlanChange] Archiving after cancellation failed:", archErr?.message)
  }
}

/**
 * Apply every scheduled change whose cycle already ended. Used by the
 * reconciliation cron so a partner who never opens the app still rotates plan
 * (or is cancelled) on time.
 */
export async function applyDueScheduledPlanChanges(
  limit: number = 50,
  now: Date = new Date(),
): Promise<{ applied: number; failed: number }> {
  const admin = getAdminClient()

  const { data, error } = await admin
    .from("subscriptions")
    .select("id")
    .in("status", ["active", "trialing"])
    .lte("current_period_end", now.toISOString())
    .or("pending_plan_id.not.is.null,cancel_at_period_end.is.true")
    .limit(limit)

  if (error || !data || data.length === 0) return { applied: 0, failed: 0 }

  let applied = 0
  let failed = 0

  for (const row of data as Array<{ id: string }>) {
    const result = await applyScheduledPlanChange(row.id, now)
    if (result.applied) applied++
    else if (result.kind) failed++
  }

  if (applied > 0 || failed > 0) {
    console.log(`[PlanChange] Scheduled changes applied=${applied} failed=${failed}`)
  }

  return { applied, failed }
}
