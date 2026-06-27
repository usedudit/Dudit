import type { AdSlot } from "@/lib/ads/types"
import type { SponsoredAd } from "@/lib/ads/types"

/**
 * Extension point for future Google AdSense fallback.
 * NOT implemented - returns null when no local ads are available.
 */
export interface ExternalAdFallbackConfig {
    slot: AdSlot
    enabled: boolean
    publisherId?: string
    adUnitId?: string
}

export function getExternalAdFallbackConfig(_slot: AdSlot): ExternalAdFallbackConfig {
    return {
        slot: _slot,
        enabled: false,
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

/**
 * Placeholder component hook for future AdSense integration.
 * Marketplace slots can call this when local ads are empty.
 */
export function getExternalAdSlotId(_slot: AdSlot): string | null {
    const config = getExternalAdFallbackConfig(_slot)
    if (!config.enabled || !config.adUnitId) return null
    return config.adUnitId
}
