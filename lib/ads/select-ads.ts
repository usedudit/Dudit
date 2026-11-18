import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { calculateDistance, buildBoundingBox } from "@/lib/services/location.service"
import type { AdTargetMode, Advertisement, SelectAdsOptions, SponsoredAd, UserAdLocationContext } from "@/lib/ads/types"
import { AD_CACHE_TTL_SECONDS } from "@/lib/ads/constants"
import { buildAdCacheKey } from "@/lib/ads/location-context"
import { TAGS } from "@/lib/utils/revalidation-tags"

const AD_SELECT_COLUMNS = `
    id, title, description, image_url, destination_url,
    advertiser_name, advertiser_logo,
    target_mode, center_lat, center_lng, radius_km,
    cities, state, country, priority
`

const TIER_ORDER: AdTargetMode[] = ["cities", "radius", "state", "country"]

const QUERY_LIMIT_PER_TIER = 30
const MAX_RADIUS_LOOKUP_KM = 150

function shuffleSamePriority<T extends { priority: number }>(items: T[]): T[] {
    const groups = new Map<number, T[]>()
    for (const item of items) {
        const bucket = groups.get(item.priority) || []
        bucket.push(item)
        groups.set(item.priority, bucket)
    }

    const sortedPriorities = [...groups.keys()].sort((a, b) => b - a)
    const result: T[] = []

    for (const priority of sortedPriorities) {
        const bucket = groups.get(priority) || []
        for (let i = bucket.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[bucket[i], bucket[j]] = [bucket[j], bucket[i]]
        }
        result.push(...bucket)
    }

    return result
}

function toSponsoredAd(row: Advertisement, matchTier: AdTargetMode): SponsoredAd {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        image_url: row.image_url,
        destination_url: row.destination_url,
        advertiser_name: row.advertiser_name,
        advertiser_logo: row.advertiser_logo,
        matchTier,
    }
}

function getRoundedNowString(): string {
    const d = new Date()
    const ms = 30 * 60 * 1000 // 30 minutes
    const rounded = new Date(Math.round(d.getTime() / ms) * ms)
    return rounded.toISOString()
}

const getCachedActiveAds = (roundedNow: string) => unstable_cache(
    async () => {
        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from("advertisements")
            .select(AD_SELECT_COLUMNS)
            .eq("status", "active")
            .lte("starts_at", roundedNow)
            .gte("ends_at", roundedNow)
            .order("priority", { ascending: false })

        if (error) {
            console.error("[ads] fetch active ads failed:", error.message)
            return []
        }
        return (data || []) as Advertisement[]
    },
    [`active-advertisements-${roundedNow}`],
    {
        tags: [TAGS.advertisements],
        revalidate: AD_CACHE_TTL_SECONDS // 30 minutes TTL (explicitly revalidated on admin changes)
    }
)

async function selectAdsUncached(context: UserAdLocationContext, limit: number): Promise<SponsoredAd[]> {
    const roundedNow = getRoundedNowString()
    const activeAds = await getCachedActiveAds(roundedNow)()

    const tierResults: Record<AdTargetMode, Advertisement[]> = {
        cities: [],
        radius: [],
        state: [],
        country: [],
    }

    const userPoint = context.lat != null && context.lng != null
        ? { lat: context.lat, lng: context.lng }
        : null

    for (const ad of activeAds) {
        if (ad.target_mode === "cities" && context.citySlug && Array.isArray(ad.cities)) {
            if (ad.cities.some(c => c.toLowerCase() === context.citySlug!.toLowerCase())) {
                tierResults.cities.push(ad)
            }
        } else if (ad.target_mode === "radius" && userPoint && ad.center_lat != null && ad.center_lng != null && ad.radius_km) {
            const distance = calculateDistance(userPoint, { lat: ad.center_lat, lng: ad.center_lng })
            if (distance <= ad.radius_km) {
                tierResults.radius.push(ad)
            }
        } else if (ad.target_mode === "state" && context.state && ad.state) {
            if (ad.state.toUpperCase() === context.state.toUpperCase()) {
                tierResults.state.push(ad)
            }
        } else if (ad.target_mode === "country" && context.country && ad.country) {
            if (ad.country.toUpperCase() === context.country.toUpperCase()) {
                tierResults.country.push(ad)
            }
        }
    }

    const selected: SponsoredAd[] = []
    const seen = new Set<string>()

    for (const tier of TIER_ORDER) {
        const rows = tierResults[tier] || []
        const ordered = shuffleSamePriority(rows)

        for (const row of ordered) {
            if (seen.has(row.id)) continue
            seen.add(row.id)
            selected.push(toSponsoredAd(row, tier))
            if (selected.length >= limit) return selected
        }
    }

    return selected
}

export const selectAds = cache(async (options: SelectAdsOptions): Promise<SponsoredAd[]> => {
    const limit = Math.max(1, Math.min(options.limit ?? 6, 20))
    const context = options.context
    const cacheKey = buildAdCacheKey(context, "all", limit)

    return unstable_cache(
        () => selectAdsUncached(context, limit),
        [cacheKey],
        { revalidate: AD_CACHE_TTL_SECONDS, tags: [TAGS.advertisements] },
    )()
})

export async function selectAdsForSlot(
    context: UserAdLocationContext,
    limit: number,
): Promise<SponsoredAd[]> {
    return selectAds({ context, limit })
}
