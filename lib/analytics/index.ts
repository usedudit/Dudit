import posthog from "posthog-js"

/**
 * Common Marketplace events
 */
export type MarketplaceEvent =
    | "product_viewed"
    | "service_viewed"
    | "storefront_viewed"
    | "add_to_cart_clicked"
    | "buy_now_clicked"
    | "whatsapp_lead_clicked"
    | "checkout_started"
    | "delivery_fee_calculated"
    | "coupon_applied"
    | "payment_method_selected"
    | "order_submitted"
    | "search_performed"
    | "search_zero_results"
    | "filter_applied"

/**
 * Common Merchant / ERP events
 */
export type ErpEvent =
    | "partner_wizard_step"
    | "partner_mode_selected"
    | "partner_created"
    | "first_product_created"
    | "first_sale_recorded"
    | "pos_sale_completed"
    | "cash_register_opened"
    | "cash_register_closed"
    | "service_order_created"
    | "service_order_signed"
    | "xml_imported"
    | "feature_paywall_viewed"
    | "plan_upgrade_clicked"

/**
 * Capture an analytics event safely from client components
 */
export function trackEvent(
    event: MarketplaceEvent | ErpEvent | (string & {}),
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
 * Identify an authenticated user
 */
export function identifyUser(userId: string, traits?: Record<string, any>) {
    if (typeof window === "undefined") return
    try {
        posthog.identify(userId, traits)
    } catch (err) {
        console.warn("[PostHog] Failed to identify user:", err)
    }
}

/**
 * Reset PostHog user identity on logout
 */
export function resetUser() {
    if (typeof window === "undefined") return
    try {
        posthog.reset()
    } catch (err) {
        console.warn("[PostHog] Failed to reset user:", err)
    }
}

/**
 * Associate events with a B2B Store / Partner group
 */
export function setStoreGroup(
    storeId: string,
    properties?: {
        name?: string
        plan?: string
        mode?: string
        city?: string
        [key: string]: any
    }
) {
    if (typeof window === "undefined") return
    try {
        posthog.group("store", storeId, properties)
    } catch (err) {
        console.warn("[PostHog] Failed to set store group:", err)
    }
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
