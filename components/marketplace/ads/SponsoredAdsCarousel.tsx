"use client"

import type { AdSlot, SponsoredAd } from "@/lib/ads/types"
import { SponsoredAdCard } from "@/components/marketplace/ads/SponsoredAdCard"
import { shouldRenderExternalFallback } from "@/lib/ads/fallback"
import { GoogleAdSenseFallback } from "@/components/marketplace/ads/GoogleAdSenseFallback"

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
    const displayAds = ads.slice(0, 2)

    if (displayAds.length === 0) {
        if (externalFallback) {
            return (
                <section className={`mx-auto mb-10 md:mb-12 max-w-[1400px] px-4 lg:px-0 ${className}`}>
                    <div className="flex items-end justify-between mb-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-brand-dark">{title}</h2>
                            <p className="text-xs text-brand-inactive-text mt-1">Anúncios selecionados para você</p>
                        </div>
                    </div>
                    <GoogleAdSenseFallback slot={slot} format="horizontal" />
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

