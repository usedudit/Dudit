/**
 * PRODUCTION - canonical implementation for subscription billing sync.
 *
 * Invariants (see migrations/20261028_subscription_billing_cycle_integrity.sql):
 * 1. One `billing_purchases` row per subscription per billing cycle.
 * 2. A closed cycle is immutable: its period is never rewritten.
 * 3. A purchase status is derived from the payment of its OWN cycle, never
 *    from the global subscription status.
 * 4. Nothing is billed for a preapproval checkout. Rows are only created when
 *    Mercado Pago actually attempts/settles a charge (recordSubscriptionCharge).
 * 5. Status changes always notify the partner (in-app + push + email).
 *
 * BACKUP/LEGACY alternatives (do NOT use in production):
 * - scripts/sync-subscription-to-billing.sql (manual/dev/testing only)
 * - SQL RPC sync_subscription_to_billing() in migrations (legacy, superseded)
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { logBillingAudit } from "./audit"
import { refreshInvoiceForPurchase } from "./invoice-generation"
import { computeSubscriptionPeriods, cycleKey, resolveBillingCycle } from "./subscription-period"
import { shouldKeepScheduledAccess } from "./plan-change"
import {
  recordSubscriptionCharge,
  type RecordChargeResult,
  type SubscriptionCharge,
  type SyncContext,
} from "./record-charge"

export type { SyncContext, SubscriptionCharge }

export interface SubscriptionSyncOptions {
  /** Explicit subscription status (webhook/reconcile/manual). */
  status?: string | null
  /**
   * Status before this event, when the caller already wrote the new status to
   * the DB before calling (webhook route). Used only to detect transitions.
   */
  previousStatus?: string | null
  /** Start of the cycle the event refers to (Mercado Pago `debit_date`). */
  cycleStart?: Date | null
  cycleEnd?: Date | null
  /** Real charge event. When present, the cycle purchase is recorded. */
  charge?: SubscriptionCharge | null
  /** Cycle of `charge`; defaults to the cycle containing now. */
  chargeCycleStart?: Date | null
  /** Why the subscription was cancelled — changes the notification wording. */
  cancellationReason?: "payment_failure" | "user" | "expired" | null
  /** Set false to suppress partner notifications (migrations/backfills). */
  notify?: boolean
  /**
   * Set true when the caller already ran the downgrade archiver. Avoids doing
   * the work twice on paths like past-due expiry that archive explicitly.
   */
  skipArchiving?: boolean
}

export interface SubscriptionSyncResult {
  purchaseId: string | null
  created: boolean
  nextPurchaseId?: string | null
  subscriptionStatus?: string
  purchaseStatus?: string
  cycleKey?: string | null
}

const PAST_DUE_GRACE_PERIOD_DAYS = 3

function normalizeStatus(status?: string | null): string | null {
  if (!status) return null
  const s = status.trim().toLowerCase()
  if (["trial", "trialing"].includes(s)) return "trialing"
  if (s === "active") return "active"
  if (s === "pending") return "pending"
  if (["past_due", "error", "failed", "rejected", "unpaid"].includes(s)) return "past_due"
  if (["cancelled", "canceled"].includes(s)) return "cancelled"
  if (["refunded", "refund"].includes(s)) return "refunded"
  if (s === "paused") return "paused"
  return s
}

function sameCycle(iso: string | null | undefined, target: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return cycleKey(d) === cycleKey(target)
}

function isLaterCycle(a: Date, b: Date | null | undefined): boolean {
  if (!b || isNaN(b.getTime())) return true
  return cycleKey(a) > cycleKey(b)
}

async function notifyTransition(params: {
  type: "billing.payment_failed" | "billing.payment_reminder" | "billing.payment_received" | "billing.subscription_cancelled" | "billing.subscription_renewed"
  sub: any
  cycleKey?: string | null
  cancellationReason?: "payment_failure" | "user" | "expired" | null
  extra?: Record<string, any>
}) {
  const { type, sub, cycleKey: cycle, extra, cancellationReason } = params
  const userId = sub?.partner?.user_id
  if (!userId) return

  try {
    const planName = sub?.plan?.name || "seu plano"
    const planPrice = Number(sub?.plan?.price || 0)
    const cancellationMessages: Record<string, string> = {
      payment_failure: `A assinatura do plano ${planName} foi cancelada por falta de pagamento. Seus recursos foram ajustados para o plano gratuito.`,
      expired: `A assinatura do plano ${planName} expirou e foi encerrada. Seus recursos foram ajustados para o plano gratuito.`,
      user: `Sua assinatura do plano ${planName} foi cancelada. Seus recursos foram ajustados para o plano gratuito.`,
    }
    const messages: Record<string, string> = {
      "billing.payment_failed": `Não conseguimos cobrar a assinatura do plano ${planName}. Você tem ${PAST_DUE_GRACE_PERIOD_DAYS} dias para regularizar antes da suspensão dos recursos.`,
      "billing.payment_reminder": `O pagamento da assinatura do plano ${planName} continua pendente. Faltam poucos dias antes da suspensão dos recursos.`,
      "billing.payment_received": `Pagamento confirmado! A assinatura do plano ${planName} foi reativada.`,
      "billing.subscription_cancelled": cancellationMessages[cancellationReason || "user"],
      "billing.subscription_renewed": `Sua assinatura do plano ${planName} foi renovada com sucesso.`,
    }

    const { sendBillingNotification } = await import("./notifications")
    await sendBillingNotification(type, userId, sub.partner_id, {
      message: messages[type],
      subscription_id: sub.id,
      mp_subscription_id: sub.mercado_pago_subscription_id || null,
      plan_name: planName,
      plan_price: planPrice,
      is_paid: planPrice > 0,
      next_billing_date: sub.current_period_end || null,
      cycle_key: cycle || null,
      ...(extra || {}),
    })
  } catch (err: any) {
    console.error("[BillingSync] Notification failed:", err?.message)
  }
}

/**
 * Cancel every other live subscription of a partner after `keepSubscriptionId`
 * becomes active.
 *
 * A plan-change upgrade creates a pending subscription while the current paid
 * one stays active. When Mercado Pago confirms the new plan, the old contract
 * must end — otherwise two preapprovals could keep charging and the partner
 * would see two plans. The keep row is never touched.
 */
export async function supersedeOtherSubscriptions(
  partnerId: string,
  keepSubscriptionId: string,
): Promise<void> {
  const supabase = getAdminClient()

  const { data: others, error } = await supabase
    .from("subscriptions")
    .select("id, status, mercado_pago_subscription_id")
    .eq("partner_id", partnerId)
    .neq("id", keepSubscriptionId)
    .in("status", ["active", "trialing", "past_due", "pending"])

  if (error || !others || others.length === 0) return

  const { cancelMpPreapproval } = await import("@/lib/services/mercadopago/subscriptions")

  for (const other of others as any[]) {
    // Stop the old recurring charge first; the local row is closed right after.
    if (other.mercado_pago_subscription_id) {
      try {
        await cancelMpPreapproval(other.mercado_pago_subscription_id)
      } catch (err: any) {
        console.error(
          `[BillingSync] Failed to cancel superseded preapproval ${other.mercado_pago_subscription_id}:`,
          err?.message,
        )
      }
    }

    const nowIso = new Date().toISOString()
    await supabase
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        ended_at: nowIso,
        cancel_at_period_end: false,
        pending_plan_id: null,
        updated_at: nowIso,
      })
      .eq("id", other.id)

    await syncSubscriptionToBilling(other.id, "reconciliation", {
      status: "cancelled",
      previousStatus: other.status,
      cancellationReason: "user",
      notify: false,
      skipArchiving: true,
    })
  }
}

/**
 * Apply a subscription status change and sync its billing state.
 *
 * `options.charge` records a new charge for a cycle (creating the purchase,
 * payment and invoice). Without it, only status/pending-cycle state is updated.
 */
export async function syncSubscriptionToBilling(
  subscriptionId: string,
  context: SyncContext = "webhook",
  options: SubscriptionSyncOptions = {},
): Promise<SubscriptionSyncResult> {
  const supabase = getAdminClient()
  const nowIso = new Date().toISOString()
  const notify = options.notify !== false

  // ── 0. Load current subscription (previous status is needed for transitions) ──
  const { data: before, error: beforeError } = await supabase
    .from("subscriptions")
    .select("id, status, past_due_at, created_at, current_period_start, current_period_end, billing_anchor_day, cancel_at_period_end, pending_plan_id")
    .eq("id", subscriptionId)
    .maybeSingle()

  if (beforeError || !before) {
    console.error(`[BillingSync] Subscription ${subscriptionId} not found:`, beforeError?.message)
    return { purchaseId: null, created: false }
  }

  let targetStatus = normalizeStatus(options.status)

  // Mercado Pago cancels the preapproval as soon as a downgrade/cancellation is
  // scheduled and echoes a `cancelled` event right away. Honouring it would cut
  // a paid cycle short, so the row keeps its status until `current_period_end`,
  // when the scheduled change is applied.
  if (shouldKeepScheduledAccess(before as any, targetStatus)) {
    targetStatus = null
  }

  const previousStatus = normalizeStatus(options.previousStatus) ?? (before.status as string)

  // ── 1. Apply status + period (never reset dates to "now") ──
  if (targetStatus) {
    const updateSub: Record<string, any> = { updated_at: nowIso }

    if (targetStatus !== previousStatus) {
      updateSub.status = targetStatus
    }

    if (targetStatus === "active" || targetStatus === "trialing") {
      updateSub.past_due_at = null
      updateSub.cancel_at_period_end = false
      updateSub.cancelled_at = null
      updateSub.ended_at = null
    } else if (targetStatus === "past_due") {
      // Anchor the grace period on the FIRST failure only. Repeated retries
      // (recycling/webhooks every day) must not extend the grace period.
      updateSub.past_due_at = before.past_due_at || nowIso
    } else if (targetStatus === "cancelled" || targetStatus === "refunded") {
      updateSub.status = "cancelled"
      updateSub.cancelled_at = nowIso
      updateSub.ended_at = nowIso
      updateSub.cancel_at_period_end = false
      updateSub.past_due_at = null
    } else if (targetStatus === "paused") {
      updateSub.cancel_at_period_end = false
    }

    if (options.cycleStart) {
      const anchor = before.created_at ? new Date(before.created_at) : options.cycleStart
      const cycle = resolveBillingCycle(anchor, options.cycleStart, before.billing_anchor_day ?? undefined)
      const currentStart = before.current_period_start ? new Date(before.current_period_start) : null
      // Only move the period forward. A late charge of an old cycle must never
      // rewind the current period (that is how "end before start" happened).
      if (!currentStart || isNaN(currentStart.getTime()) || isLaterCycle(options.cycleStart, currentStart)) {
        updateSub.current_period_start = cycle.start.toISOString()
        updateSub.current_period_end = cycle.end.toISOString()
        if (!before.billing_anchor_day) {
          updateSub.billing_anchor_day = Number(
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Sao_Paulo",
              day: "numeric",
            }).format(anchor),
          )
        }
      }
    }
    if (options.cycleEnd) {
      updateSub.current_period_end = options.cycleEnd.toISOString()
    }

    const { error: updateErr } = await supabase
      .from("subscriptions")
      .update(updateSub)
      .eq("id", subscriptionId)

    if (updateErr) {
      console.error(`[BillingSync] Failed to update subscription ${subscriptionId}:`, updateErr.message)
    }
  }

  // ── 2. Load the enriched subscription (post-update state) ──
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select(`
      *,
      plan:plan_id (*),
      partner:partner_id (id, user_id)
    `)
    .eq("id", subscriptionId)
    .single()

  if (subError || !sub) {
    console.error(`[BillingSync] Subscription ${subscriptionId} not found after update:`, subError?.message)
    return { purchaseId: null, created: false }
  }

  // A freshly paid subscription replaces any other live contract for the same
  // partner (plan-change upgrade). Without this the previous preapproval would
  // keep charging and two plans would remain active.
  if (
    ["active", "trialing"].includes(String(sub.status)) &&
    !["active", "trialing"].includes(String(previousStatus))
  ) {
    await supersedeOtherSubscriptions(sub.partner_id, sub.id)
  }

  // The Escalar plan natively includes all add-ons: immediately stop any
  // standalone add-on recurring charges on Mercado Pago as soon as Escalar is active.
  if (
    ["active", "trialing"].includes(String(sub.status)) &&
    String(sub.plan?.slug || "").toLowerCase() === "escalar"
  ) {
    try {
      const { cancelPartnerAddonSubscriptionsForPlanInclusion } = await import(
        "@/lib/services/addon.service"
      )
      await cancelPartnerAddonSubscriptionsForPlanInclusion(sub.partner_id)
    } catch (addonCancelErr: any) {
      console.error(
        `[BillingSync] Failed to cancel add-on subscriptions after Escalar activation for partner ${sub.partner_id}:`,
        addonCancelErr?.message,
      )
    }
  }

  const periods = computeSubscriptionPeriods(sub)

  // ── 2b. Repair corrupted periods (legacy rows written with next_payment_date) ──
  // A period whose end is not after its start is unusable for "access until"
  // and cancellation, but the real cycle is fully derivable from the anchor.
  const storedStart = sub.current_period_start ? new Date(sub.current_period_start) : null
  const storedEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
  const periodBroken =
    !storedStart ||
    !storedEnd ||
    isNaN(storedStart.getTime()) ||
    isNaN(storedEnd.getTime()) ||
    storedEnd.getTime() <= storedStart.getTime()

  if (periodBroken) {
    const { error: repairErr } = await supabase
      .from("subscriptions")
      .update({
        current_period_start: periods.periodStart.toISOString(),
        current_period_end: periods.periodEnd.toISOString(),
        updated_at: nowIso,
      })
      .eq("id", subscriptionId)

    if (!repairErr) {
      sub.current_period_start = periods.periodStart.toISOString()
      sub.current_period_end = periods.periodEnd.toISOString()
    }
  }

  // ── 3. Record a real charge for a specific cycle ──
  let chargeResult: RecordChargeResult | null = null
  if (options.charge) {
    chargeResult = await recordSubscriptionCharge({
      subscriptionId,
      context,
      charge: options.charge,
      cycleStart: options.chargeCycleStart || options.cycleStart || periods.periodStart,
    })
  }

  // ── 4. Status-only handling of the open cycle ──
  const { data: purchases } = await supabase
    .from("billing_purchases")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .eq("purchase_type", "subscription")
    .order("created_at", { ascending: false })

  const allPurchases = (purchases || []) as any[]
  const currentPurchase = chargeResult?.purchaseId
    ? allPurchases.find((p) => p.id === chargeResult!.purchaseId) || null
    : allPurchases.find((p) => sameCycle(p.billing_period_start, periods.periodStart)) || null

  if (!chargeResult && currentPurchase) {
    if (sub.status === "cancelled") {
      // Cancel only cycles that were never paid. A paid cycle keeps its status.
      const open = allPurchases.filter((p) => p.status === "pending" && p.id === currentPurchase.id)
      for (const purchase of open) {
        await supabase
          .from("billing_purchases")
          .update({ status: "cancelled", updated_at: nowIso })
          .eq("id", purchase.id)

        await supabase
          .from("billing_payments")
          .update({ status: "cancelled", paid_at: null, updated_at: nowIso })
          .eq("purchase_id", purchase.id)
          .in("status", ["pending", "processing", "rejected"])

        await refreshInvoiceForPurchase(purchase.id).catch(() => null)
      }
    } else {
      // Repair legacy/out-of-order state: a cycle with an approved payment is
      // paid, even if a later reconciliation left the purchase as pending.
      if (currentPurchase.status !== "completed" && currentPurchase.status !== "cancelled") {
        const { data: cyclePayments } = await supabase
          .from("billing_payments")
          .select("status, paid_at")
          .eq("purchase_id", currentPurchase.id)

        const approvedPayment = (cyclePayments || []).find((p: any) => p.status === "approved")
        if (approvedPayment) {
          await supabase
            .from("billing_purchases")
            .update({ status: "completed", updated_at: nowIso })
            .eq("id", currentPurchase.id)
          currentPurchase.status = "completed"
        }
      }

      // Keep the invoice snapshot in sync with the real payment status.
      await refreshInvoiceForPurchase(currentPurchase.id).catch(() => null)
    }
  }

  // Never leave a deleted/renamed open cycle behind.
  for (const purchase of allPurchases) {
    if (purchase.status !== "pending") continue
    if (currentPurchase && purchase.id === currentPurchase.id) continue
    if (chargeResult && purchase.id === chargeResult.purchaseId) continue

    const inFuture = purchase.billing_period_start
      ? new Date(purchase.billing_period_start).getTime() > periods.nextStart.getTime() - 1
      : false

    if (inFuture || sub.status === "cancelled") {
      await supabase
        .from("billing_purchases")
        .update({ status: "cancelled", updated_at: nowIso })
        .eq("id", purchase.id)
    }
  }

  // ── 5. Notifications on real transitions (idempotent per transition) ──
  if (notify) {
    const transitionCycle = chargeResult?.cycleKey || cycleKey(periods.periodStart)

    if (sub.status === "past_due" && previousStatus !== "past_due") {
      await notifyTransition({
        type: "billing.payment_failed",
        sub,
        cycleKey: transitionCycle,
        extra: { idempotency_bucket: "past_due" },
      })
    } else if (sub.status === "cancelled" && !["cancelled", "refunded"].includes(previousStatus)) {
      await notifyTransition({
        type: "billing.subscription_cancelled",
        sub,
        cycleKey: transitionCycle,
        cancellationReason:
          options.cancellationReason ||
          (previousStatus === "past_due" ? "payment_failure" : "user"),
        extra: { idempotency_bucket: "cancelled" },
      })
    } else if (sub.status === "active" && previousStatus === "past_due") {
      await notifyTransition({
        type: "billing.payment_received",
        sub,
        cycleKey: transitionCycle,
        extra: { idempotency_bucket: "reactivated" },
      })
    } else if (
      sub.status === "active" &&
      previousStatus === "active" &&
      chargeResult &&
      options.charge?.status === "approved"
    ) {
      await notifyTransition({
        type: "billing.subscription_renewed",
        sub,
        cycleKey: transitionCycle,
        extra: { idempotency_bucket: "renewed" },
      })
    }
  }

  // ── 6. Audit + cache ──
  if (previousStatus !== sub.status) {
    await logBillingAudit(
      sub.status === "cancelled" ? "billing.purchase.cancelled" : "billing.subscription.status_changed",
      sub.partner_id,
      {
        subscription_id: subscriptionId,
        previous_status: previousStatus,
        new_status: sub.status,
        cycle_key: chargeResult?.cycleKey || null,
        via: context,
      },
      sub.partner?.user_id || undefined,
    )
  }

  try {
    const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
    invalidatePartnerPlanCache(sub.partner_id)
  } catch {
    // non-critical
  }

  // ── 7. Downgrade resources when a real cancellation lands ──
  // Webhooks may cancel a subscription directly (no scheduled change), so the
  // archiver must run here too. `skipArchiving` prevents duplicate work on
  // callers that already archive (past-due expiry / scheduled cancellation).
  if (
    !options.skipArchiving &&
    sub.status === "cancelled" &&
    ["active", "trialing", "past_due"].includes(String(previousStatus))
  ) {
    try {
      const { enforcePlanLimitsAndArchiveExcess } = await import(
        "@/lib/services/subscription-archiver.service"
      )
      await enforcePlanLimitsAndArchiveExcess(sub.partner_id)
    } catch (archErr: any) {
      console.error("[BillingSync] Archiving after cancellation failed:", archErr?.message)
    }
  }

  return {
    purchaseId: currentPurchase?.id || chargeResult?.purchaseId || null,
    created: Boolean(chargeResult?.createdPurchase),
    nextPurchaseId: null,
    subscriptionStatus: sub.status,
    purchaseStatus: chargeResult
      ? undefined
      : currentPurchase?.status,
    cycleKey: chargeResult?.cycleKey || null,
  }
}
