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

// ─── In-memory Cache ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const PARTNER_PLAN_TTL_MS = 30_000     // 30 seconds
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
      name: "Free",
      slug: "free",
      price: 0,
      limits_json: { products: 5, images_per_product: 2, total_images: 10, users: 1, quotes_per_month: 3 },
      features_json: ["public_storefront", "technical_specs", "qr_code_profile", "whatsapp_orders", "whatsapp_bookings"],
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
 * Get the active subscription for a partner, or null.
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
 * Get the current plan for a partner.
 * Defaults to Free plan if no active subscription exists.
 * Cached for 30 seconds per partner.
 */
export async function getPartnerPlan(partnerId: string): Promise<Plan> {
  const cached = getCached(partnerPlanCache.get(partnerId))
  if (cached) return cached

  const subscription = await getPartnerSubscription(partnerId)

  let plan: Plan
  if (subscription?.plan) {
    plan = subscription.plan
  } else {
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
