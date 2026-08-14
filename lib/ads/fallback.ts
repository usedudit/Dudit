import type { AdSlot } from "@/lib/ads/types"
import type { SponsoredAd } from "@/lib/ads/types"

export interface ExternalAdFallbackConfig {
    slot: AdSlot
    enabled: boolean
    publisherId?: string
    adUnitId?: string
}

export function getExternalAdFallbackConfig(slot: AdSlot): ExternalAdFallbackConfig {
    const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID

    if (!publisherId) {
        return {
            slot,
            enabled: false,
        }
    }

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

export function getExternalAdSlotId(slot: AdSlot): string | null {
    const config = getExternalAdFallbackConfig(slot)
    if (!config.enabled || !config.adUnitId) return null
    return config.adUnitId
}

