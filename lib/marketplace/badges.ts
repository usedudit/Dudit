/**
 * Shared badge utilities for marketplace items.
 * Single source of truth used by Home (discover.ts), Explore (search.ts & ExplorarPageClient),
 * and Storefront (VendorPage).
 */

export type BadgeVariant = "purple" | "red" | "green" | "blue"

export interface BadgeData {
    _badgeLabel?: string
    _badgeVariant?: BadgeVariant
}

export interface MarketplaceBadgeOptions {
    /** User ID (used for daily deterministic low-stock urgency rotation) */
    userId?: string | null
    /** Hard cap on how many items can receive "Destaque" in this list (default: 3) */
    maxHighlights?: number
    /** Max fraction of products in the list that can receive "Destaque" (default: 0.05 = 5%) */
    maxHighlightRatio?: number
    /** Limit to at most one "Destaque" per store/partner in multi-store lists (default: true) */
    onePerStore?: boolean
}

/**
 * Hash function for deterministic low-stock badge rotation based on seed and item ID.
 */
function badgeHash(seed: string, id: string): number {
    let h = 0
    const s = `${seed}-${id}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
    return Math.abs(h)
}

/**
 * Generates a daily per-user seed for low-stock urgency badge rotation.
 */
export function getVendorBadgeSeed(userId?: string | null): string {
    return `dudit-${userId ?? "anon"}-${new Date().toDateString()}`
}

function isProductItem(item: any): boolean {
    if (!item) return false
    const rawType = String(item.itemType ?? "").toLowerCase()
    if (rawType === "plano" || rawType === "servico" || rawType === "serviço" || rawType === "loja" || rawType === "vitrine") {
        return false
    }
    if (item.duration_minutes !== undefined) return false
    return true
}

function resolveStock(item: any): number | null {
    const raw = item._stock ?? item.stock_quantity ?? item.stock_available
    if (raw === undefined || raw === null || raw === "") return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
}

function resolveStoreKey(item: any): string | null {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const id = item.store_id ?? rawStore?.id ?? rawPartner?.store_id ?? item.partner_id ?? rawPartner?.id
    return id ? String(id) : null
}

interface HighlightMetrics {
    sales30: number
    sales7: number
    views30: number
    favorites: number
    rating: number
    marketplaceScore: number
}

function extractHighlightMetrics(item: any): HighlightMetrics {
    return {
        sales30: Number(item._sales ?? item.sales_last_30_days ?? item.sales ?? 0) || 0,
        sales7: Number(item._salesWeek ?? item.sales_last_7_days ?? 0) || 0,
        views30: Number(item._views ?? item.views_last_30_days ?? item.views_count ?? 0) || 0,
        favorites: Number(item._favs ?? item.favorites_count ?? 0) || 0,
        rating: Number(item.rating ?? 0) || 0,
        marketplaceScore: Number(item.marketplace_score ?? 0) || 0,
    }
}

/**
 * Checks whether a product has real traction/quality merit to earn the "Destaque" badge.
 * Never depends on manual `featured` flags or random chance on zero-activity items.
 */
function qualifiesForHighlight(item: any, metrics: HighlightMetrics): boolean {
    const stock = resolveStock(item)
    if (stock !== null && stock <= 0) return false

    // Disqualify poorly rated items
    if (metrics.rating > 0 && metrics.rating < 4.0) return false

    const hasRecentSales = metrics.sales30 >= 2 || metrics.sales7 >= 1
    const hasHighRatingWithTraction =
        metrics.rating >= 4.5 && (metrics.sales30 >= 1 || metrics.favorites >= 2 || metrics.views30 >= 15)
    const hasStrongEngagement = metrics.favorites >= 3 || metrics.views30 >= 30
    const hasHighMarketplaceScore = metrics.marketplaceScore >= 0.45

    return hasRecentSales || hasHighRatingWithTraction || hasStrongEngagement || hasHighMarketplaceScore
}

function computeHighlightScore(m: HighlightMetrics): number {
    return (
        m.sales30 * 5 +
        m.sales7 * 4 +
        m.favorites * 2.5 +
        Math.min(m.views30, 500) * 0.08 +
        (m.rating >= 4.5 ? m.rating * 2 : 0) +
        m.marketplaceScore * 15
    )
}

/**
 * Applies marketplace badges to a list of items:
 * 1. "Últimos X" (red): low-stock urgency for products with 1-5 units left.
 * 2. "Destaque" (purple): merit-based highlight strictly capped to the top-performing
 *    products in the list (by recent sales, favorites, views, rating and marketplace_score),
 *    with optional per-store diversity so no single store floods the feed.
 *
 * Idempotent: if some items in the list already carry "Destaque" (e.g. decorated on the server
 * and passed through client normalization), existing highlights count toward the cap.
 */
export function applyMarketplaceBadges<T extends Record<string, any>>(
    items: T[],
    options: MarketplaceBadgeOptions = {}
): T[] {
    if (!Array.isArray(items) || items.length === 0) return items || []

    const {
        userId = null,
        maxHighlights = 3,
        maxHighlightRatio = 0.05,
        onePerStore = true,
    } = options

    const seed = getVendorBadgeSeed(userId)

    // Pass 1: clone products & apply low-stock "Últimos X" badge
    let productCount = 0
    let existingHighlights = 0
    const highlightedStores = new Set<string>()

    const result = items.map((item) => {
        if (!isProductItem(item)) return item
        productCount++

        if (item._badgeLabel) {
            if (item._badgeLabel === "Destaque") {
                existingHighlights++
                const storeKey = resolveStoreKey(item)
                if (storeKey) highlightedStores.add(storeKey)
            }
            return item
        }

        const stock = resolveStock(item)
        if (stock !== null && stock > 0 && stock <= 5) {
            const h = badgeHash(seed, `${item.id}-launch-badge`) % 100
            if (h < 45) {
                return { ...item, _badgeLabel: `Últimos ${stock}`, _badgeVariant: "red" as BadgeVariant }
            }
        }

        return item
    })

    if (productCount === 0 || maxHighlights <= 0) return result

    const ratioCap = Math.max(1, Math.floor(productCount * maxHighlightRatio))
    const totalCap = Math.min(maxHighlights, ratioCap)
    let remainingSlots = Math.max(0, totalCap - existingHighlights)

    if (remainingSlots === 0) return result

    // Pass 2: rank eligible products by real traction/quality score
    const candidates: Array<{ index: number; score: number; sales30: number; favorites: number; id: string; storeKey: string | null }> = []

    for (let i = 0; i < result.length; i++) {
        const item = result[i]
        if (!isProductItem(item) || item._badgeLabel) continue

        const metrics = extractHighlightMetrics(item)
        if (!qualifiesForHighlight(item, metrics)) continue

        candidates.push({
            index: i,
            score: computeHighlightScore(metrics),
            sales30: metrics.sales30,
            favorites: metrics.favorites,
            id: String(item.id ?? i),
            storeKey: resolveStoreKey(item),
        })
    }

    if (candidates.length === 0) return result

    candidates.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score
        if (b.sales30 !== a.sales30) return b.sales30 - a.sales30
        if (b.favorites !== a.favorites) return b.favorites - a.favorites
        return a.id.localeCompare(b.id)
    })

    for (const candidate of candidates) {
        if (remainingSlots <= 0) break
        if (onePerStore && candidate.storeKey && highlightedStores.has(candidate.storeKey)) {
            continue
        }

        result[candidate.index] = {
            ...result[candidate.index],
            _badgeLabel: "Destaque",
            _badgeVariant: "purple" as BadgeVariant,
        }
        if (candidate.storeKey) highlightedStores.add(candidate.storeKey)
        remainingSlots--
    }

    return result
}

/**
 * Convenience wrapper for vendor storefront / client lists.
 */
export function applyVendorUrgencyBadges(
    items: any[],
    userId?: string | null,
    options?: Omit<MarketplaceBadgeOptions, "userId">
): any[] {
    return applyMarketplaceBadges(items, {
        userId,
        maxHighlights: 3,
        maxHighlightRatio: 0.08,
        onePerStore: false,
        ...options,
    })
}
