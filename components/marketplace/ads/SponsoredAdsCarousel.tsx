"use client"

import type { AdSlot, SponsoredAd } from "@/lib/ads/types"
import { SponsoredAdCard } from "@/components/marketplace/ads/SponsoredAdCard"
import { shouldRenderExternalFallback } from "@/lib/ads/fallback"

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
    size = "default",
    className = "",
}: SponsoredAdsCarouselProps) {
    const externalFallback = shouldRenderExternalFallback(ads, slot)

    if (ads.length === 0) {
        if (externalFallback) {
            return (
                <div
                    className="hidden"
                    data-ad-fallback-slot={slot}
                    data-ad-fallback-unit={externalFallback.adUnitId || ""}
                />
            )
        }
        return null
    }

    const cardVariant = size === "compact" ? "carousel" : "carousel"

    return (
        <section className={`mx-auto mb-10 md:mb-12 max-w-[1400px] overflow-hidden ${className}`}>
            <div className="flex items-end justify-between mb-4 px-4 lg:px-0">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-brand-dark">{title}</h2>
                    <p className="text-xs text-brand-inactive-text mt-1">Anúncios locais selecionados para você</p>
                </div>
            </div>
            <div className="flex overflow-x-auto gap-4 md:gap-5 px-4 lg:px-0 scrollbar-hide pb-2 snap-x snap-mandatory">
                {ads.map((ad) => (
                    <SponsoredAdCard
                        key={ad.id}
                        ad={ad}
                        variant={cardVariant}
                        className={size === "compact" ? "w-[220px] sm:w-[240px]" : undefined}
                    />
                ))}
            </div>
        </section>
    )
}
