import type { AdSlot } from "@/lib/ads/types"
import type { SponsoredAd } from "@/lib/ads/types"

export interface ExternalAdFallbackConfig {
    slot: AdSlot
    enabled: boolean
    publisherId?: string
    adUnitId?: string
}

export interface HouseBannerConfig {
    enabled: boolean
    contactUrl: string
}

export function getExternalAdFallbackConfig(slot: AdSlot): ExternalAdFallbackConfig {
    const rawId = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID || "").trim()
    const adsenseEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true"

    if (!adsenseEnabled || !rawId) {
        return {
            slot,
            enabled: false,
        }
    }

    const publisherId = rawId.startsWith("ca-pub-")
        ? rawId
        : rawId.startsWith("pub-")
        ? `ca-${rawId}`
        : `ca-pub-${rawId}`

    const slotMap: Record<AdSlot, string | undefined> = {
        home: process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME,
        explore: process.env.NEXT_PUBLIC_ADSENSE_SLOT_EXPLORE,
        search: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SEARCH,
        detail: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DETAIL,
    }

    return {
        slot,
        enabled: true,
        publisherId,
        adUnitId: slotMap[slot] || undefined,
    }
}

export function shouldRenderExternalFallback(
    localAds: SponsoredAd[],
    slot: AdSlot,
): ExternalAdFallbackConfig | null {
    if (localAds.length > 0) return null

    const config = getExternalAdFallbackConfig(slot)
    return config.enabled ? config : null
}

export function getHouseBannerConfig(): HouseBannerConfig {
    const isEnabled = process.env.NEXT_PUBLIC_ADS_HOUSE_BANNER_ENABLED === "true"
    const contactUrl =
        process.env.NEXT_PUBLIC_ADS_CONTACT_URL ||
        "https://wa.me/5516999999999?text=Ol%C3%A1%21+Gostaria+de+anunciar+na+Dudit."

    return {
        enabled: isEnabled,
        contactUrl,
    }
}

export function shouldRenderHouseBanner(localAds: SponsoredAd[]): boolean {
    if (localAds.length > 0) return false
    return getHouseBannerConfig().enabled
}

export function getExternalAdSlotId(slot: AdSlot): string | null {
    const config = getExternalAdFallbackConfig(slot)
    if (!config.enabled || !config.adUnitId) return null
    return config.adUnitId
}

