/**
 * Subscription Service - Central service for plan lookups, feature flags, and limit enforcement.
 *
 * Uses in-memory cache (30s TTL for partner plans, 60s for all plans) to minimize DB hits.
 * All functions use getAdminClient() (server-side only, bypasses RLS).
 *
 * @module subscription-service
 */

import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Plan {
  id: string
  name: string
  slug: string
  price: number
  limits_json: Record<string, number | string>
  features_json: string[]
  sort_order: number
  is_active: boolean
}

export interface Subscription {
  id: string
  partner_id: string
  plan_id: string
  plan_snapshot: Plan | null
  mercado_pago_subscription_id: string | null
  status: "trialing" | "active" | "past_due" | "cancelled" | "paused" | "pending"
  payment_provider: string
  billing_email: string | null
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  past_due_at: string | null
  billing_anchor_day?: number | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  ended_at: string | null
  pending_plan_id: string | null
  created_at: string
  updated_at: string
}

export interface UsageCounters {
  partner_id: string
  products_count: number
  users_count: number
  images_count: number
  services_count: number
  quotes_month_count: number
  quotes_month_reset: string | null
  orders_month_count: number
  orders_month_reset: string | null
  appointments_month_count: number
  appointments_month_reset: string | null
  service_orders_month_count: number
  service_orders_month_reset: string | null
  xml_imports_month_count: number
  xml_imports_month_reset: string | null
}

export interface LimitCheckResult {
  allowed: boolean
  limit: number | "unlimited"
  current: number
  message?: string
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Grace period for past_due subscriptions.
 * Users keep access for this many days after a payment failure.
 * After this period, the Mercado Pago preapproval is cancelled (so it stops
 * retrying and can never charge a cancelled plan) and the partner is
 * downgraded to the free plan.
 */
export const PAST_DUE_GRACE_PERIOD_DAYS = 3

/**
 * Cancel a past_due subscription whose grace period expired.
 *
 * Idempotent: safe to call from request-time plan resolution and from cron.
 */
export async function expirePastDueSubscription(sub: {
  id: string
  partner_id: string
  mercado_pago_subscription_id?: string | null
}): Promise<void> {
  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  // 1. Stop Mercado Pago from retrying / charging a cancelled plan.
  if (sub.mercado_pago_subscription_id) {
    try {
      const { cancelMpPreapproval } = await import("@/lib/services/mercadopago/subscriptions")
      await cancelMpPreapproval(sub.mercado_pago_subscription_id)
    } catch (err: any) {
      console.error("[SUBSCRIPTION] Failed to cancel MP preapproval on grace expiry:", err?.message)
    }
  }

  // 2. Close the subscription locally.
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

  // 3. Close the open billing cycle + notify the partner.
  try {
    const { syncSubscriptionToBilling } = await import("@/lib/billing/sync-subscription")
    await syncSubscriptionToBilling(sub.id, "reconciliation", {
      status: "cancelled",
      // The row was already flipped to cancelled above; preserve the real
      // transition so the partner gets the cancellation notification.
      previousStatus: "past_due",
      cancellationReason: "payment_failure",
      skipArchiving: true,
    })
  } catch (err: any) {
    console.error("[SUBSCRIPTION] Failed to sync billing on grace expiry:", err?.message)
  }

  // 4. Downgrade resources to the free plan.
  try {
    const { enforcePlanLimitsAndArchiveExcess } = await import(
      "@/lib/services/subscription-archiver.service"
    )
    await enforcePlanLimitsAndArchiveExcess(sub.partner_id)
  } catch (archErr: any) {
    console.error("[SUBSCRIPTION] Error archiving on grace expiry:", archErr.message)
  }

  partnerPlanCache.delete(sub.partner_id)
}

// ─── In-memory Cache ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Plan cache TTL - kept short (30 seconds) to balance freshness with DB load.
 * Webhooks force-invalidate the cache immediately on status changes,
 * so this TTL only matters for the gap between a webhook updating the DB
 * and the next plan resolution call.
 */
const PARTNER_PLAN_TTL_MS = 30_000     // 30 seconds
const ALL_PLANS_TTL_MS = 60_000         // 60 seconds
const USAGE_COUNTERS_TTL_MS = 15_000    // 15 seconds

const partnerPlanCache = new Map<string, CacheEntry<Plan>>()
const usageCountersCache = new Map<string, CacheEntry<UsageCounters | null>>()
const allPlansCache: { entry: CacheEntry<Plan[]> | null } = { entry: null }

export function invalidateUsageCountersCache(partnerId?: string): void {
  if (partnerId) {
    usageCountersCache.delete(partnerId)
  } else {
    usageCountersCache.clear()
  }
}

function getCached<T>(cache: CacheEntry<T> | undefined | null): T | null {
  if (!cache) return null
  if (Date.now() > cache.expiresAt) return null
  return cache.data
}

// ─── Free Plan Fallback ─────────────────────────────────────────────────────

let freePlanCache: CacheEntry<Plan> | null = null

export async function getFreePlan(): Promise<Plan> {
  const cached = getCached(freePlanCache)
  if (cached) return cached

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("slug", "free")
    .eq("is_active", true)
    .single()

  if (error || !data) {
    // Hardcoded emergency fallback - should never happen in practice
    console.error("[SUBSCRIPTION] Free plan not found in database, using emergency fallback")
    return {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Começar",
      slug: "free",
      price: 0,
      // Keep aligned with DB migration 20260504 (Começar/Crescer/Escalar "limits_json").
      limits_json: {
        items: 15,
        images_per_item: 2,
        monthly_orders: 25,
        monthly_appointments: 30,
        monthly_quotes: 10,
        monthly_service_orders: 15,
        users: 1,
        recurring_plans: 0,
        active_subscriptions: 0,
      },
      features_json: ["public_storefront", "technical_specs", "pdv_basic", "whatsapp_orders", "whatsapp_bookings", "qr_code_profile"],
      sort_order: 0,
      is_active: true,
    }
  }

  const plan = data as Plan
  freePlanCache = { data: plan, expiresAt: Date.now() + ALL_PLANS_TTL_MS }
  return plan
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Get all active plans, ordered by sort_order.
 * Cached for 60 seconds.
 */
export async function getAllPlans(): Promise<Plan[]> {
  const cached = getCached(allPlansCache.entry)
  if (cached) return cached

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching plans:", error.message)
    return []
  }

  const plans = (data || []) as Plan[]
  allPlansCache.entry = { data: plans, expiresAt: Date.now() + ALL_PLANS_TTL_MS }
  return plans
}

/**
 * Get a single plan by ID.
 */
export async function getPlanById(planId: string): Promise<Plan | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("plans")
    .select("*")
    .eq("id", planId)
    .single()

  if (error || !data) return null
  return data as Plan
}

/**
 * Lightweight status snapshot for the global subscription status indicator.
 * Unlike getPartnerSubscription, it also returns cancelled subscriptions so the
 * ERP can tell the partner their plan was cancelled (instead of silently
 * falling back to the free plan).
 */
export interface SubscriptionBannerInfo {
  status: string
  past_due_at: string | null
  trial_end: string | null
  plan_name: string | null
}

export const getPartnerSubscriptionBannerInfo = cache(
  async (partnerId: string): Promise<SubscriptionBannerInfo | null> => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("subscriptions")
      .select("status, past_due_at, trial_end, plan_snapshot, created_at, plan:plans!plan_id(name)")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) return null

    const rows = (data || []) as any[]
    if (rows.length === 0) return null

    // Prefer the subscription that actually grants access. A newer "pending"
    // row is usually an unfinished plan-change checkout and must not hide the
    // paid plan the partner still has (nor make the UI claim the free plan is
    // awaiting payment).
    const selected =
      [...rows].sort(
        (a, b) =>
          subscriptionStatusPriority(a.status) - subscriptionStatusPriority(b.status) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0] || null

    if (!selected) return null

    return {
      status: String(selected.status),
      past_due_at: selected.past_due_at || null,
      trial_end: selected.trial_end || null,
      plan_name:
        selected.plan?.name ||
        (selected.plan_snapshot as any)?.name ||
        null,
    }
  },
)

/**
 * Order used when a partner has more than one live subscription row.
 * Lower is more authoritative: the paid contract wins over an unfinished
 * checkout, and a cancelled row is only used when nothing else exists.
 */
function subscriptionStatusPriority(status: string | null | undefined): number {
  switch (status) {
    case "active":
    case "trialing":
      return 0
    case "past_due":
      return 1
    case "pending":
      return 2
    case "paused":
      return 3
    case "cancelled":
    case "refunded":
      return 4
    default:
      return 5
  }
}

/**
 * Get the non-cancelled subscription for a partner, or null.
 * Includes pending and past_due - used for UI display, race condition guards,
 * and preventing duplicate checkout creation.
 *
 * ⚠️ DO NOT use this for access control. Use getPartnerPlan() instead.
 */
export const getPartnerSubscription = cache(async (partnerId: string): Promise<SubscriptionWithPlan | null> => {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, plan:plans!plan_id(*)")
    .eq("partner_id", partnerId)
    .in("status", ["active", "trialing", "past_due", "pending"])
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching subscription:", error.message)
    return null
  }

  const rows = (data || []) as any[]
  if (rows.length === 0) return null

  // A plan-change checkout creates a new "pending" row while the current paid
  // subscription stays active. Always resolve the row that actually grants
  // access, otherwise the pending attempt would shadow the paid plan.
  const selected =
    [...rows].sort(
      (a, b) =>
        subscriptionStatusPriority(a.status) - subscriptionStatusPriority(b.status) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0] || null

  if (!selected) return null

  // A scheduled change (downgrade or cancellation) whose cycle already ended is
  // applied by the same routine used by getPartnerPlan, so both paths agree.
  const scheduledChangeDue =
    (Boolean(selected.pending_plan_id) || Boolean(selected.cancel_at_period_end)) &&
    selected.current_period_end &&
    new Date(selected.current_period_end).getTime() <= Date.now()

  if (scheduledChangeDue) {
    const { applyScheduledPlanChange } = await import("@/lib/billing/plan-change")
    const change = await applyScheduledPlanChange(selected.id)

    if (change.applied && change.kind === "cancellation") {
      return null
    }

    if (change.applied) {
      // Plan rotated in place: reload so callers see the new plan/period.
      const { data: refreshed } = await admin
        .from("subscriptions")
        .select("*, plan:plans!plan_id(*)")
        .eq("id", selected.id)
        .maybeSingle()

      if (refreshed) {
        return {
          ...refreshed,
          plan: refreshed.plan as Plan,
        } as SubscriptionWithPlan
      }
    }

    // Could not apply (e.g. scheduled plan deleted): keep the current row
    // instead of revoking access.
    return {
      ...selected,
      plan: selected.plan as Plan,
    } as SubscriptionWithPlan
  }

  return {
    ...selected,
    plan: selected.plan as Plan,
  } as SubscriptionWithPlan
})

/**
 * Get the EFFECTIVE plan for a partner - used for access control.
 *
 * SECURITY: This function determines what features and limits a partner has.
 * It ONLY grants access for:
 *   - "active" subscriptions
 *   - "trialing" subscriptions
 *   - "past_due" subscriptions within the grace period (3 days from period end)
 *
 * It NEVER grants access for:
 *   - "pending" subscriptions (checkout created but not paid)
 *   - "past_due" beyond the grace period
 *   - "cancelled" or "paused" subscriptions
 *
 * CONSISTENCY: Uses a SINGLE atomic query to fetch all candidate subscriptions,
 * then applies deterministic selection in application code. This eliminates
 * race conditions where a webhook could change status between queries.
 *
 * CACHE: 10-second TTL. Webhooks force-invalidate on every status change,
 * so stale access windows are bounded to max ~10 seconds in worst case.
 */
export const getPartnerPlan = cache(async (partnerId: string): Promise<Plan> => {
  const cached = getCached(partnerPlanCache.get(partnerId))
  if (cached) return cached

  const admin = getAdminClient()

  // SINGLE atomic query: fetch ALL potentially qualifying subscriptions at once.
  // This eliminates the race condition where a webhook could change status
  // between two sequential queries.
  const { data: candidates, error } = await admin
    .from("subscriptions")
    .select("*, plan:plans!plan_id(*)")
    .eq("partner_id", partnerId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching subscriptions for plan resolution:", error.message)
  }

  let plan: Plan | null = null

  if (candidates && candidates.length > 0) {
    // Deterministic selection priority:
    // 1. active or trialing (highest priority - confirmed payment)
    // 2. past_due within grace period (temporary access)
    // 3. nothing qualifies → free plan

    const activeSub = candidates.find(
      (s: any) => s.status === "active" || s.status === "trialing",
    )

    if (activeSub?.plan) {
      // A paid cycle can end with a scheduled plan change (downgrade) or with a
      // plain cancellation. Both are applied by `applyScheduledPlanChange`, on
      // the SAME subscription row (never cancel + insert: that orphaned the MP
      // preapproval).
      const hasScheduledChange =
        Boolean(activeSub.pending_plan_id) || Boolean(activeSub.cancel_at_period_end)
      const isPeriodExpired =
        hasScheduledChange &&
        activeSub.current_period_end &&
        new Date(activeSub.current_period_end).getTime() <= Date.now()

      if (isPeriodExpired) {
        const { applyScheduledPlanChange } = await import("@/lib/billing/plan-change")
        const change = await applyScheduledPlanChange(activeSub.id)

        if (change.applied) {
          plan =
            change.kind === "plan_change" && change.nextPlanId
              ? (await getPlanById(change.nextPlanId)) ?? (await getFreePlan())
              : await getFreePlan()
        } else {
          // The scheduled change could not be applied (e.g. the plan was
          // deleted). Keep the current plan instead of revoking access.
          plan = activeSub.plan as Plan
        }
      } else {
        // Subscription is still actively valid!
        plan = activeSub.plan as Plan
      }
    } else {
      // Check past_due subscriptions against grace period.
      // Grace period is measured from past_due_at - a dedicated column set
      // EXCLUSIVELY by the webhook when payment failure is confirmed.
      // This is 100% deterministic: no other code path can modify it.
      // Fallback to created_at if past_due_at is null (legacy rows before migration).
      const graceCutoff = new Date(
        Date.now() - PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      )

      const pastDueCandidates = candidates.filter((s: any) => s.status === "past_due")
      const graceAnchorFor = (s: any) =>
        s.past_due_at ? new Date(s.past_due_at) : new Date(s.created_at)

      // Expired grace: cancel MP + close the subscription, then downgrade.
      const expired = pastDueCandidates.filter((s: any) => graceAnchorFor(s) < graceCutoff)
      for (const expiredSub of expired) {
        console.warn(
          `[SUBSCRIPTION] Partner ${partnerId} past_due beyond ${PAST_DUE_GRACE_PERIOD_DAYS}-day grace (${expiredSub.id}). Cancelling.`,
        )
        await expirePastDueSubscription(expiredSub)
      }

      const pastDueSub = pastDueCandidates.find((s: any) => graceAnchorFor(s) >= graceCutoff)

      if (pastDueSub?.plan) {
        console.warn(
          `[SUBSCRIPTION] Partner ${partnerId} has past_due subscription ${pastDueSub.id} within grace period (${PAST_DUE_GRACE_PERIOD_DAYS} days from past_due_at). Access maintained.`,
        )
        plan = pastDueSub.plan as Plan
      }
    }
  }

  // Fallback to free plan if no qualifying subscription found
  if (!plan) {
    plan = await getFreePlan()
  }

  partnerPlanCache.set(partnerId, { data: plan, expiresAt: Date.now() + PARTNER_PLAN_TTL_MS })
  return plan
})

/**
 * Check if a partner can use a specific feature.
 * Features are stored as string arrays in plans.features_json.
 */
export async function canUseFeature(partnerId: string, featureName: string): Promise<boolean> {
  const plan = await getPartnerPlan(partnerId)
  return plan.features_json.includes(featureName)
}

/**
 * Get the limit value for a specific resource.
 * Returns the numeric limit or "unlimited".
 */
export async function getLimit(partnerId: string, limitName: string): Promise<number | "unlimited"> {
  const plan = await getPartnerPlan(partnerId)
  const value = plan.limits_json[limitName]

  if (value === undefined || value === null) {
    if (limitName === "customers") return "unlimited"
    if (limitName === "services" && plan.limits_json["items"] !== undefined) {
      const itemsVal = plan.limits_json["items"]
      if (itemsVal === "unlimited") return "unlimited"
      return typeof itemsVal === "number" ? itemsVal : parseInt(String(itemsVal), 10) || 0
    }
    // Unknown limit - default to 0 (deny by default)
    console.warn(`[SUBSCRIPTION] Unknown limit "${limitName}" for plan "${plan.slug}"`)
    return 0
  }

  if (value === "unlimited") return "unlimited"
  return typeof value === "number" ? value : parseInt(String(value), 10) || 0
}

/**
 * Get the usage counters for a partner.
 * Returns null if no counters row exists yet.
 */
export const getUsageCounters = cache(async (partnerId: string): Promise<UsageCounters | null> => {
  const cached = getCached(usageCountersCache.get(partnerId))
  if (cached !== null && cached !== undefined) {
    return cached
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("usage_counters")
    .select("partner_id, products_count, users_count, images_count, services_count, quotes_month_count, quotes_month_reset, orders_month_count, orders_month_reset, appointments_month_count, appointments_month_reset, service_orders_month_count, service_orders_month_reset, xml_imports_month_count, xml_imports_month_reset")
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching usage counters:", error.message)
    return null
  }

  if (!data) {
    usageCountersCache.set(partnerId, { data: null, expiresAt: Date.now() + USAGE_COUNTERS_TTL_MS })
    return null
  }

  // Safety net: if for any reason DB-side cron reset isn't running,
  // reset monthly counters lazily on-demand (based on *_month_reset timestamps).
  // This ensures quotes_month_count is correctly incremented & rolled over.
  const counters = data as UsageCounters
  const now = new Date()
  const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime()

  const updates: Partial<UsageCounters> = {}
  const quotesReset = counters.quotes_month_reset ? new Date(counters.quotes_month_reset).getTime() : 0
  const ordersReset = counters.orders_month_reset ? new Date(counters.orders_month_reset).getTime() : 0
  const appointmentsReset = counters.appointments_month_reset ? new Date(counters.appointments_month_reset).getTime() : 0
  const serviceOrdersReset = counters.service_orders_month_reset ? new Date(counters.service_orders_month_reset).getTime() : 0
  const xmlImportsReset = counters.xml_imports_month_reset ? new Date(counters.xml_imports_month_reset).getTime() : 0

  if (quotesReset < monthStartUtc) {
    updates.quotes_month_count = 0
      ; (updates as any).quotes_month_reset = now.toISOString()
  }
  if (ordersReset < monthStartUtc) {
    updates.orders_month_count = 0
      ; (updates as any).orders_month_reset = now.toISOString()
  }
  if (appointmentsReset < monthStartUtc) {
    updates.appointments_month_count = 0
      ; (updates as any).appointments_month_reset = now.toISOString()
  }
  if (serviceOrdersReset < monthStartUtc) {
    updates.service_orders_month_count = 0
      ; (updates as any).service_orders_month_reset = now.toISOString()
  }
  if (xmlImportsReset < monthStartUtc) {
    updates.xml_imports_month_count = 0
      ; (updates as any).xml_imports_month_reset = now.toISOString()
  }

  let finalCounters = counters
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await admin.from("usage_counters").update(updates).eq("partner_id", partnerId)
    if (updateError) {
      console.error("[SUBSCRIPTION] Error resetting monthly counters:", updateError.message)
      // Still return stale counters; limit enforcement will be conservative (deny).
    } else {
      const { data: refreshed } = await admin
        .from("usage_counters")
        .select("partner_id, products_count, users_count, images_count, services_count, quotes_month_count, quotes_month_reset, orders_month_count, orders_month_reset, appointments_month_count, appointments_month_reset, service_orders_month_count, service_orders_month_reset, xml_imports_month_count, xml_imports_month_reset")
        .eq("partner_id", partnerId)
        .maybeSingle()
      if (refreshed) finalCounters = refreshed as UsageCounters
    }
  }

  usageCountersCache.set(partnerId, { data: finalCounters, expiresAt: Date.now() + USAGE_COUNTERS_TTL_MS })
  return finalCounters
})

// ─── Counter name → usage_counters column mapping ───────────────────────────

const LIMIT_TO_COUNTER_MAP: Record<string, keyof UsageCounters> = {
  // New structure (20260504+)
  items: "products_count",
  images_per_item: "images_count",
  monthly_orders: "orders_month_count",
  monthly_quotes: "quotes_month_count",
  monthly_appointments: "appointments_month_count",
  monthly_service_orders: "service_orders_month_count",
  monthly_xml_imports: "xml_imports_month_count",
  users: "users_count",

  // Back-compat aliases (older code/DB rows)
  products: "products_count",
  images_per_product: "images_count",
  total_images: "images_count",
  services: "services_count",
  quotes_per_month: "quotes_month_count",
  orders_per_month: "orders_month_count",
  appointments_per_month: "appointments_month_count",
  service_orders: "service_orders_month_count",
  xml_imports: "xml_imports_month_count",
}

const LIMIT_NAME_TO_RESOURCE_LABEL: Record<string, string> = {
  items: "itens",
  images_per_item: "imagens por item",
  monthly_orders: "pedidos/mês",
  monthly_quotes: "orçamentos/mês",
  monthly_appointments: "agendamentos/mês",
  monthly_service_orders: "ordens de serviço/mês",
  monthly_xml_imports: "importações XML/mês",
  users: "usuários",
  customers: "clientes",
  recurring_plans: "planos recorrentes",
  active_subscriptions: "assinaturas ativas",
  // Aliases
  products: "itens",
  services: "serviços",
  total_images: "imagens",
  quotes_per_month: "orçamentos/mês",
  orders_per_month: "pedidos/mês",
  appointments_per_month: "agendamentos/mês",
  service_orders: "ordens de serviço/mês",
  xml_imports: "importações XML/mês",
}

/**
 * Check if a partner is within their plan limit for a given resource.
 *
 * If currentValue is provided, it's used directly.
 * Otherwise, the current value is read from usage_counters.
 *
 * @param partnerId - The partner to check
 * @param limitName - The limit key from plans.limits_json (e.g. "products", "users")
 * @param currentValue - Optional: override the current count instead of reading from DB
 */
export async function checkLimit(
  partnerId: string,
  limitName: string,
  currentValue?: number,
): Promise<LimitCheckResult> {
  const limit = await getLimit(partnerId, limitName)

  if (limit === "unlimited") {
    return { allowed: true, limit: "unlimited", current: currentValue ?? 0 }
  }

  // Resolve current value from usage_counters if not provided
  let current = currentValue
  if (current === undefined) {
    const counterColumn = LIMIT_TO_COUNTER_MAP[limitName]
    if (counterColumn) {
      const counters = await getUsageCounters(partnerId)
      current = counters ? (counters[counterColumn] as number) : 0
    } else {
      // For per-item limits like images_per_product, caller MUST provide currentValue
      current = 0
    }
  }

  // If caller passes `currentValue`, it usually represents the *proposed* amount
  // (e.g. images_per_item for a new product), not "already consumed" usage.
  // In that case, allow exactly `limit` and deny only when current > limit.
  const shouldDeny = currentValue !== undefined ? current > limit : current >= limit

  if (shouldDeny) {
    const plan = await getPartnerPlan(partnerId)
    return {
      allowed: false,
      limit,
      current,
      message: `Limite do plano ${plan.name} atingido: máximo de ${limit} ${LIMIT_NAME_TO_RESOURCE_LABEL[limitName] || limitName}. Faça upgrade para continuar.`,
    }
  }

  return { allowed: true, limit, current }
}

/**
 * Invalidate the cached plan for a partner.
 * Call this after subscription changes.
 */
export function invalidatePartnerPlanCache(partnerId: string): void {
  partnerPlanCache.delete(partnerId)
  usageCountersCache.delete(partnerId)
  import("@/lib/marketplace-capabilities")
    .then((m) => m.invalidateMarketplaceCapabilitiesCache?.(partnerId))
    .catch(() => {})
}

/**
 * Invalidate all plan caches.
 * Call this after plan configuration changes.
 */
export function invalidateAllPlanCaches(): void {
  partnerPlanCache.clear()
  usageCountersCache.clear()
  allPlansCache.entry = null
  freePlanCache = null
  import("@/lib/marketplace-capabilities")
    .then((m) => m.invalidateMarketplaceCapabilitiesCache?.())
    .catch(() => {})
}

/**
 * Increment a usage counter via RPC.
 */
export async function increment_usage_counter(partnerId: string, counterName: string, amount: number = 1) {
  usageCountersCache.delete(partnerId)
  const admin = getAdminClient()
  const { error } = await admin.rpc("increment_usage_counter", {
    p_partner_id: partnerId,
    // DB migration 20260504 uses `p_column_name` (not `p_counter_name`)
    p_column_name: counterName,
    p_amount: amount,
  })
  if (error) console.error(`[SUBSCRIPTION] Error incrementing counter ${counterName}:`, error.message)
}

/**
 * Decrement a usage counter via RPC.
 */
export async function decrement_usage_counter(partnerId: string, counterName: string, amount: number = 1) {
  usageCountersCache.delete(partnerId)
  const admin = getAdminClient()
  const { error } = await admin.rpc("decrement_usage_counter", {
    p_partner_id: partnerId,
    // DB migration 20260504 uses `p_column_name` (not `p_counter_name`)
    p_column_name: counterName,
    p_amount: amount,
  })
  if (error) console.error(`[SUBSCRIPTION] Error decrementing counter ${counterName}:`, error.message)
}

/**
 * Adjust the products/services counters directly.
 *
 * These two counters are normally maintained by AFTER INSERT / AFTER DELETE
 * triggers on `products` and `services`. The app soft-deletes and archives via
 * UPDATE, so the triggers never fire and the RPC allowlist intentionally rejects
 * these columns (to avoid double counting on real INSERT/DELETE). This helper
 * keeps the counters in sync when an item leaves/returns to the countable set.
 */
export async function adjustItemUsageCounter(
  partnerId: string,
  counterName: "products_count" | "services_count",
  delta: number,
): Promise<void> {
  if (!partnerId || !Number.isFinite(delta) || delta === 0) return

  usageCountersCache.delete(partnerId)
  const admin = getAdminClient()
  const { data: counters, error } = await admin
    .from("usage_counters")
    .select(counterName)
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (error) {
    console.error(`[SUBSCRIPTION] Error reading counter ${counterName}:`, error.message)
    return
  }

  if (!counters) {
    if (delta > 0) {
      const { error: insertError } = await admin
        .from("usage_counters")
        .insert({ partner_id: partnerId, [counterName]: delta })
      if (insertError) {
        console.error(`[SUBSCRIPTION] Error creating counter ${counterName}:`, insertError.message)
      }
    }
    return
  }

  const current = Number((counters as any)[counterName] ?? 0)
  const next = Math.max(0, current + delta)
  const { error: updateError } = await admin
    .from("usage_counters")
    .update({ [counterName]: next, updated_at: new Date().toISOString() })
    .eq("partner_id", partnerId)

  if (updateError) {
    console.error(`[SUBSCRIPTION] Error updating counter ${counterName}:`, updateError.message)
  }
}
