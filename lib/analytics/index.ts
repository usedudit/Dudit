import posthog from "posthog-js"

/**
 * Marketplace / buyer funnel events.
 *
 * Keep this list honest: only events that are actually captured somewhere in
 * the app belong here. Events that are not wired are removed instead of
 * pretending the funnel is instrumented.
 */
export type MarketplaceEvent =
    | "product_viewed"
    | "storefront_viewed"
    | "add_to_cart_clicked"
    | "buy_now_clicked"
    | "whatsapp_lead_clicked"
    | "checkout_started"
    | "checkout_failed"
    | "payment_method_selected"
    | "order_submitted"
    | "search_performed"
    | "search_zero_results"
    | "filter_applied"
    | "review_submitted"

/**
 * Authentication funnel events. Never include e-mail, phone or other PII in
 * the properties of these events.
 */
export type AuthEvent =
    | "signup_started"
    | "signup_completed"
    | "login_succeeded"
    | "login_failed"
    | "password_reset_requested"
    | "password_reset_completed"

/**
 * Merchant / ERP activation and payment events.
 */
export type ErpEvent =
    | "partner_wizard_step"
    | "partner_created"
    | "product_created"
    | "sale_completed"
    | "payment_approved"
    | "payment_failed"
    | "feature_paywall_viewed"
    | "plan_upgrade_clicked"
    | "plan_upgrade_started"
    | "plan_upgrade_completed"
    | "subscription_cancelled"

/**
 * Account lifecycle events.
 */
export type AccountEvent =
    | "account_deletion_requested"
    | "account_deletion_completed"

/**
 * Acquisition, marketing, and free tool events.
 */
export type MarketingEvent =
    | "cta_clicked"
    | "pricing_viewed"
    | "tool_calculated"

/**
 * Extract safe acquisition context (pathname + UTM params, no PII).
 */
export function getAcquisitionContext(): Record<string, string> {
    if (typeof window === "undefined") return {}
    const ctx: Record<string, string> = {
        path: window.location.pathname,
    }
    try {
        const params = new URLSearchParams(window.location.search)
        for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
            const val = params.get(key)
            if (val) ctx[key] = val
        }
    } catch {
        // Ignore URL parsing issues
    }
    return ctx
}

/**
 * Capture an analytics event safely from client components
 */
export function trackEvent(
    event: MarketplaceEvent | AuthEvent | ErpEvent | AccountEvent | MarketingEvent | (string & {}),
    properties?: Record<string, any>
) {
    if (typeof window === "undefined") return
    try {
        posthog.capture(event, properties)
    } catch (err) {
        console.warn("[PostHog] Failed to capture event:", event, err)
    }
}

/**
 * Identify an authenticated user (No-op in Ultra-Lean mode to eliminate person properties / $set events)
 */
export function identifyUser(_userId: string, _traits?: Record<string, any>) {
    // Intencionalmente no-op: person_profiles='never' configurado no PostHog para economizar cota
}

/**
 * Reset PostHog user identity on logout
 */
export function resetUser() {
    // Intencionalmente no-op
}

/**
 * Associate events with a B2B Store / Partner group (No-op to eliminate $groupidentify events)
 */
export function setStoreGroup(
    _storeId: string,
    _properties?: {
        name?: string
        plan?: string
        mode?: string
        city?: string
        [key: string]: any
    }
) {
    // Intencionalmente no-op: evita eventos de $groupidentify
}

/**
 * Check if a PostHog feature flag is active
 */
export function isFeatureFlagEnabled(flagKey: string): boolean {
    if (typeof window === "undefined") return false
    try {
        return Boolean(posthog.isFeatureEnabled(flagKey))
    } catch {
        return false
    }
}

export { posthog }
