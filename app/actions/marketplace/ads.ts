"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { selectAdsForSlot } from "@/lib/ads/select-ads"
import { buildUserAdLocationContext } from "@/lib/ads/location-context"
import type { AdSlot, SponsoredAd, UserAdLocationContext } from "@/lib/ads/types"
import { AD_SLOT_LIMITS } from "@/lib/ads/constants"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import { traceServerAction } from "@/lib/observability/request-trace"

export async function getSponsoredAdsForSlot(
    slot: AdSlot,
    location: Partial<UserAdLocationContext> & {
        city?: string | null
        citySlug?: string | null
    },
): Promise<SponsoredAd[]> {
    const context = buildUserAdLocationContext({
        lat: location.lat,
        lng: location.lng,
        citySlug: location.citySlug,
        city: location.city,
        state: location.state,
        country: location.country,
    })

    const limit = AD_SLOT_LIMITS[slot]
    return selectAdsForSlot(context, limit)
}

export async function trackAdImpression(adId: string): Promise<void> {
    await trackAdImpressions([adId])
}

export async function trackAdImpressions(adIds: string[]): Promise<boolean> {
    await traceServerAction("ads.trackImpressions")
    const safeIds = [...new Set((adIds || []).map(sanitizeUUID).filter((id): id is string => Boolean(id)))].slice(0, 50)
    if (safeIds.length === 0) return true

    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const supabase = getAdminClient()
        const { error } = await supabase.rpc("increment_ad_impressions", { p_ad_ids: safeIds })
        if (error) {
            console.error("[ads] impression tracking failed:", error)
            return false
        }
        return true
    } catch (err) {
        console.error("[ads] impression tracking failed:", err)
        return false
    }
}

export async function trackAdClick(adId: string): Promise<void> {
    const safeId = sanitizeUUID(adId)
    if (!safeId) return

    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const supabase = getAdminClient()
        await supabase.rpc("increment_ad_click", { ad_id: safeId })
    } catch (err) {
        console.error("[ads] click tracking failed:", err)
    }
}
