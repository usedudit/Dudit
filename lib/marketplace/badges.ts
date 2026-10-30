/**
 * Shared badge utilities for marketplace items.
 * Used by both VendorPage (seller profile) and ExplorarPage (explore page).
 */

export type BadgeVariant = "purple" | "red" | "green" | "blue"

export interface BadgeData {
    _badgeLabel?: string
    _badgeVariant?: BadgeVariant
}

/**
 * Hash function for deterministic badge assignment based on seed and item ID.
 */
function badgeHash(seed: string, id: string): number {
    let h = 0
    const s = `${seed}-${id}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
    return Math.abs(h)
}

/**
 * Generates a seed for vendor badges that changes daily per user.
 * This ensures badges like "Destaque" rotate daily for each user.
 */
export function getVendorBadgeSeed(userId?: string | null): string {
    return `dudit-${userId ?? "anon"}-${new Date().toDateString()}`
}

/**
 * Applies urgency badges ("Destaque", "Últimos X") to an item.
 * - "Últimos X" (red): for products with low stock (1-5 units)
 * - "Destaque" (purple): random highlight for ~15% of items
 * 
 * Does not apply to services, plans, or items that already have a badge.
 */
export function applyVendorUrgencyBadge(item: any, userId?: string | null): any {
    if (!item || item._badgeLabel) return item
    // Don't apply to services, plans, or items with duration (services)
    if (item.itemType === "plano" || item.itemType === "servico" || item.duration_minutes !== undefined) return item

    const stock = Number(item.stock_quantity ?? item.stock_available ?? 0)
    const seed = getVendorBadgeSeed(userId)
    const h = badgeHash(seed, `${item.id}-launch-badge`) % 100

    // "Últimos X" - low stock badge (45% chance when stock 1-5)
    if (stock > 0 && stock <= 5 && h < 45) {
        return { ...item, _badgeLabel: `Últimos ${stock}`, _badgeVariant: "red" }
    }

    // "Destaque" - random highlight (~15% chance)
    if (h >= 75 && h < 90) {
        return { ...item, _badgeLabel: "Destaque", _badgeVariant: "purple" }
    }

    return item
}

/**
 * Applies urgency badges to an array of items.
 */
export function applyVendorUrgencyBadges(items: any[], userId?: string | null): any[] {
    return (items || []).map(item => applyVendorUrgencyBadge(item, userId))
}