"use client"

import type { SponsoredAd } from "@/lib/ads/types"
import { SponsoredAdCard } from "@/components/marketplace/ads/SponsoredAdCard"

interface SponsoredAdDetailSlotProps {
    ad: SponsoredAd | null
    className?: string
}

export function SponsoredAdDetailSlot({ ad, className = "" }: SponsoredAdDetailSlotProps) {
    if (!ad) return null

    return (
        <section className={`mx-auto max-w-[1400px] px-4 lg:px-0 mb-10 ${className}`}>
            <SponsoredAdCard ad={ad} variant="compact" />
        </section>
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
