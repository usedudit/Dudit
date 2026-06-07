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

async function fetchCityAds(citySlug: string): Promise<Advertisement[]> {
    const supabase = getAdminClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from("advertisements")
        .select(AD_SELECT_COLUMNS)
        .eq("status", "active")
        .eq("target_mode", "cities")
        .lte("starts_at", now)
        .gte("ends_at", now)
        .contains("cities", [citySlug.toLowerCase()])
        .order("priority", { ascending: false })
        .limit(QUERY_LIMIT_PER_TIER)

    if (error) {
        console.error("[ads] city query failed:", error.message)
        return []
    }
    return (data || []) as Advertisement[]
}

async function fetchRadiusAds(context: UserAdLocationContext): Promise<Advertisement[]> {
    if (context.lat == null || context.lng == null) return []

    const supabase = getAdminClient()
    const now = new Date().toISOString()
    const userPoint = { lat: context.lat, lng: context.lng }
    const lookupBox = buildBoundingBox(userPoint, MAX_RADIUS_LOOKUP_KM)
    if (!lookupBox) return []

    const { data, error } = await supabase
        .from("advertisements")
        .select(AD_SELECT_COLUMNS)
        .eq("status", "active")
        .eq("target_mode", "radius")
        .lte("starts_at", now)
        .gte("ends_at", now)
        .gte("center_lat", lookupBox.minLat)
        .lte("center_lat", lookupBox.maxLat)
        .gte("center_lng", lookupBox.minLng)
        .lte("center_lng", lookupBox.maxLng)
        .order("priority", { ascending: false })
        .limit(QUERY_LIMIT_PER_TIER)

    if (error) {
        console.error("[ads] radius query failed:", error.message)
        return []
    }

    return ((data || []) as Advertisement[]).filter((ad) => {
        if (ad.center_lat == null || ad.center_lng == null || !ad.radius_km) return false
        const distance = calculateDistance(userPoint, { lat: ad.center_lat, lng: ad.center_lng })
        return distance <= ad.radius_km
    })
}

async function fetchStateAds(state: string): Promise<Advertisement[]> {
    const supabase = getAdminClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from("advertisements")
        .select(AD_SELECT_COLUMNS)
        .eq("status", "active")
        .eq("target_mode", "state")
        .eq("state", state.toUpperCase())
        .lte("starts_at", now)
        .gte("ends_at", now)
        .order("priority", { ascending: false })
        .limit(QUERY_LIMIT_PER_TIER)

    if (error) {
        console.error("[ads] state query failed:", error.message)
        return []
    }
    return (data || []) as Advertisement[]
}

async function fetchCountryAds(country: string): Promise<Advertisement[]> {
    const supabase = getAdminClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
        .from("advertisements")
        .select(AD_SELECT_COLUMNS)
        .eq("status", "active")
        .eq("target_mode", "country")
        .eq("country", country.toUpperCase())
        .lte("starts_at", now)
        .gte("ends_at", now)
        .order("priority", { ascending: false })
        .limit(QUERY_LIMIT_PER_TIER)

    if (error) {
        console.error("[ads] country query failed:", error.message)
        return []
    }
    return (data || []) as Advertisement[]
}

async function selectAdsUncached(context: UserAdLocationContext, limit: number): Promise<SponsoredAd[]> {
    const tierResults: Partial<Record<AdTargetMode, Advertisement[]>> = {}

    const tasks: Promise<void>[] = []

    if (context.citySlug) {
        tasks.push(
            fetchCityAds(context.citySlug).then((rows) => {
                tierResults.cities = rows
            }),
        )
    }

    if (context.lat != null && context.lng != null) {
        tasks.push(
            fetchRadiusAds(context).then((rows) => {
                tierResults.radius = rows
            }),
        )
    }

    if (context.state) {
        tasks.push(
            fetchStateAds(context.state).then((rows) => {
                tierResults.state = rows
            }),
        )
    }

    if (context.country) {
        tasks.push(
            fetchCountryAds(context.country).then((rows) => {
                tierResults.country = rows
            }),
        )
    }

    await Promise.all(tasks)

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
