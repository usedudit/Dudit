/**
 * Subscription Service - Central service for plan lookups, feature flags, and limit enforcement.
 *
 * Uses in-memory cache (30s TTL for partner plans, 60s for all plans) to minimize DB hits.
 * All functions use getAdminClient() (server-side only, bypasses RLS).
 *
 * @module subscription-service
 */

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
 * After this period, they're downgraded to the free plan.
 */
const PAST_DUE_GRACE_PERIOD_DAYS = 3

// ─── In-memory Cache ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Plan cache TTL - kept short (10 seconds) to limit stale access windows.
 * Webhooks force-invalidate the cache immediately on status changes,
 * so this TTL only matters for the gap between a webhook updating the DB
 * and the next plan resolution call.
 */
const PARTNER_PLAN_TTL_MS = 10_000     // 10 seconds
const ALL_PLANS_TTL_MS = 60_000         // 60 seconds

const partnerPlanCache = new Map<string, CacheEntry<Plan>>()
const allPlansCache: { entry: CacheEntry<Plan[]> | null } = { entry: null }

function getCached<T>(cache: CacheEntry<T> | undefined | null): T | null {
  if (!cache) return null
  if (Date.now() > cache.expiresAt) return null
  return cache.data
}

// ─── Free Plan Fallback ─────────────────────────────────────────────────────

let freePlanCache: CacheEntry<Plan> | null = null

async function getFreePlan(): Promise<Plan> {
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
      limits_json: { products: 15, images_per_product: 2, total_images: 30, users: 1, quotes_per_month: 10, orders_per_month: 25, appointments_per_month: 30, service_orders: 15 },
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
 * Get the non-cancelled subscription for a partner, or null.
 * Includes pending and past_due - used for UI display, race condition guards,
 * and preventing duplicate checkout creation.
 *
 * ⚠️ DO NOT use this for access control. Use getPartnerPlan() instead.
 */
export async function getPartnerSubscription(partnerId: string): Promise<SubscriptionWithPlan | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("subscriptions")
    .select("*, plan:plans!plan_id(*)")
    .eq("partner_id", partnerId)
    .in("status", ["active", "trialing", "past_due", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching subscription:", error.message)
    return null
  }

  if (!data) return null

  return {
    ...data,
    plan: data.plan as Plan,
  } as SubscriptionWithPlan
}

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
export async function getPartnerPlan(partnerId: string): Promise<Plan> {
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
      plan = activeSub.plan as Plan
    } else {
      // Check past_due subscriptions against grace period.
      // Grace period is measured from past_due_at - a dedicated column set
      // EXCLUSIVELY by the webhook when payment failure is confirmed.
      // This is 100% deterministic: no other code path can modify it.
      // Fallback to created_at if past_due_at is null (legacy rows before migration).
      const graceCutoff = new Date(
        Date.now() - PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      )

      const pastDueSub = candidates.find((s: any) => {
        if (s.status !== "past_due") return false

        // past_due_at: exact moment payment failure was confirmed via webhook.
        // Grace = N days from that moment.
        const graceAnchor = s.past_due_at
          ? new Date(s.past_due_at)
          : new Date(s.created_at)

        return graceAnchor >= graceCutoff
      })

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
}

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
export async function getUsageCounters(partnerId: string): Promise<UsageCounters | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("usage_counters")
    .select("*")
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (error) {
    console.error("[SUBSCRIPTION] Error fetching usage counters:", error.message)
    return null
  }

  return data as UsageCounters | null
}

// ─── Counter name → usage_counters column mapping ───────────────────────────

const LIMIT_TO_COUNTER_MAP: Record<string, keyof UsageCounters> = {
  products: "products_count",
  users: "users_count",
  total_images: "images_count",
  services: "services_count",
  quotes_per_month: "quotes_month_count",
  orders_per_month: "orders_month_count",
  appointments_per_month: "appointments_month_count",
  service_orders: "service_orders_month_count",
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

  if (current >= limit) {
    const plan = await getPartnerPlan(partnerId)
    return {
      allowed: false,
      limit,
      current,
      message: `Limite do plano ${plan.name} atingido: máximo de ${limit} ${limitName}. Faça upgrade para continuar.`,
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
}

/**
 * Invalidate all plan caches.
 * Call this after plan configuration changes.
 */
export function invalidateAllPlanCaches(): void {
  partnerPlanCache.clear()
  allPlansCache.entry = null
  freePlanCache = null
}

/**
 * Increment a usage counter via RPC.
 */
export async function increment_usage_counter(partnerId: string, counterName: string, amount: number = 1) {
  const admin = getAdminClient()
  const { error } = await admin.rpc("increment_usage_counter", {
    p_partner_id: partnerId,
    p_counter_name: counterName,
    p_amount: amount,
  })
  if (error) console.error(`[SUBSCRIPTION] Error incrementing counter ${counterName}:`, error.message)
}

/**
 * Decrement a usage counter via RPC.
 */
export async function decrement_usage_counter(partnerId: string, counterName: string, amount: number = 1) {
  const admin = getAdminClient()
  const { error } = await admin.rpc("decrement_usage_counter", {
    p_partner_id: partnerId,
    p_counter_name: counterName,
    p_amount: amount,
  })
  if (error) console.error(`[SUBSCRIPTION] Error decrementing counter ${counterName}:`, error.message)
}
