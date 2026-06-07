export type AdTargetMode = "radius" | "cities" | "state" | "country"

export type AdStatus = "draft" | "active" | "paused" | "expired"

export type AdSlot = "home" | "explore" | "search" | "detail"

export interface Advertisement {
    id: string
    title: string
    description: string | null
    image_url: string
    destination_url: string
    advertiser_name: string
    advertiser_logo: string | null
    target_mode: AdTargetMode
    center_lat: number | null
    center_lng: number | null
    radius_km: number | null
    cities: string[]
    state: string | null
    country: string | null
    priority: number
    status: AdStatus
    starts_at: string
    ends_at: string
    impressions_count: number
    clicks_count: number
    created_at: string
    updated_at: string
}

export interface SponsoredAd {
    id: string
    title: string
    description: string | null
    image_url: string
    destination_url: string
    advertiser_name: string
    advertiser_logo: string | null
    matchTier: AdTargetMode
}

export interface UserAdLocationContext {
    lat: number | null
    lng: number | null
    citySlug: string | null
    state: string | null
    country: string
}

export interface SelectAdsOptions {
    context: UserAdLocationContext
    limit?: number
}

export interface AdvertisementFormInput {
    title: string
    description?: string | null
    image_url: string
    destination_url: string
    advertiser_name: string
    advertiser_logo?: string | null
    target_mode: AdTargetMode
    center_lat?: number | null
    center_lng?: number | null
    radius_km?: number | null
    cities?: string[]
    state?: string | null
    country?: string | null
    priority?: number
    status: AdStatus
    starts_at: string
    ends_at: string
}

export function computeCtr(clicks: number, impressions: number): number {
    if (!impressions || impressions <= 0) return 0
    return clicks / impressions
}

export function formatCtr(clicks: number, impressions: number): string {
    const ctr = computeCtr(clicks, impressions)
    return `${(ctr * 100).toFixed(2)}%`
}
