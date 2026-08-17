"use client"

import type { AdSlot, SponsoredAd } from "@/lib/ads/types"
import { SponsoredAdCard } from "@/components/marketplace/ads/SponsoredAdCard"
import { shouldRenderExternalFallback, shouldRenderHouseBanner } from "@/lib/ads/fallback"
import { GoogleAdSenseFallback } from "@/components/marketplace/ads/GoogleAdSenseFallback"
import { HouseAdBanner } from "@/components/marketplace/ads/HouseAdBanner"

interface SponsoredAdsCarouselProps {
    ads: SponsoredAd[]
    slot: AdSlot
    title?: string
    size?: "default" | "compact"
    className?: string
}

export function SponsoredAdsCarousel({
    ads,
    slot,
    title = "Patrocinados na sua região",
    className = "",
}: SponsoredAdsCarouselProps) {
    const externalFallback = shouldRenderExternalFallback(ads, slot)
    const houseBannerEnabled = shouldRenderHouseBanner(ads)
    const displayAds = ads.slice(0, 2)

    if (displayAds.length === 0) {
        if (externalFallback) {
            return (
                <section className={`mx-auto mb-8 md:mb-10 max-w-[1400px] px-4 lg:px-0 ${className}`}>
                    <GoogleAdSenseFallback slot={slot} format="horizontal" />
                </section>
            )
        }

        if (houseBannerEnabled) {
            return (
                <section className={`mx-auto mb-8 md:mb-10 max-w-[1400px] px-4 lg:px-0 ${className}`}>
                    <div className="w-full flex justify-center">
                        <div className="w-full max-w-[680px]">
                            <HouseAdBanner variant="banner" />
                        </div>
                    </div>
                </section>
            )
        }

        return null
    }

    return (
        <section className={`mx-auto mb-8 md:mb-10 max-w-[1400px] px-4 lg:px-0 ${className}`}>
            {displayAds.length === 1 ? (
                <div className="w-full flex justify-center">
                    <div className="w-full max-w-[680px]">
                        <SponsoredAdCard
                            ad={displayAds[0]}
                            variant="banner"
                        />
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {displayAds.map((ad) => (
                        <SponsoredAdCard
                            key={ad.id}
                            ad={ad}
                            variant="banner"
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

