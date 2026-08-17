import type { SponsoredAd } from "@/lib/ads/types"
import { SponsoredAdCard } from "@/components/marketplace/ads/SponsoredAdCard"
import { shouldRenderExternalFallback, shouldRenderHouseBanner } from "@/lib/ads/fallback"
import { GoogleAdSenseFallback } from "@/components/marketplace/ads/GoogleAdSenseFallback"
import { HouseAdBanner } from "@/components/marketplace/ads/HouseAdBanner"

interface SponsoredAdDetailSlotProps {
    ad: SponsoredAd | null
    className?: string
}

export function SponsoredAdDetailSlot({ ad, className = "" }: SponsoredAdDetailSlotProps) {
    const externalFallback = shouldRenderExternalFallback(ad ? [ad] : [], "detail")
    const houseBannerEnabled = shouldRenderHouseBanner(ad ? [ad] : [])

    if (!ad) {
        if (externalFallback) {
            return (
                <div className={`mt-4 ${className}`}>
                    <GoogleAdSenseFallback slot="detail" format="rectangle" />
                </div>
            )
        }
        if (houseBannerEnabled) {
            return (
                <div className={`mt-4 ${className}`}>
                    <HouseAdBanner variant="compact" />
                </div>
            )
        }
        return null
    }

    return (
        <div className={`mt-4 ${className}`}>
            <SponsoredAdCard ad={ad} variant="compact" />
        </div>
    )
}

interface SponsoredAdsSearchInlineProps {
    ads: SponsoredAd[]
    className?: string
}

export function SponsoredAdsSearchInline({ ads, className = "" }: SponsoredAdsSearchInlineProps) {
    if (!ads.length) return null

    return (
        <div className={`col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 my-2 ${className}`}>
            {ads.map((ad) => (
                <SponsoredAdCard key={ad.id} ad={ad} variant="inline" />
            ))}
        </div>
    )
}

