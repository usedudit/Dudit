"use client"

import { useEffect, useRef } from "react"
import type { SponsoredAd } from "@/lib/ads/types"
import { trackAdClick, trackAdImpression } from "@/app/actions/marketplace/ads"

interface SponsoredAdCardProps {
    ad: SponsoredAd
    variant?: "banner" | "carousel" | "inline" | "compact"
    className?: string
}

export function SponsoredAdCard({ ad, variant = "banner", className = "" }: SponsoredAdCardProps) {
    const trackedRef = useRef(false)

    useEffect(() => {
        if (trackedRef.current) return
        trackedRef.current = true
        trackAdImpression(ad.id)
    }, [ad.id])

    const handleClick = () => {
        trackAdClick(ad.id)
        window.open(ad.destination_url, "_blank", "noopener,noreferrer")
    }

    if (variant === "banner") {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`group relative w-full text-left rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200/80 bg-white hover:border-gray-300 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center h-[72px] sm:h-[84px] md:h-[90px] ${className}`}
            >
                {/* Left Thumbnail Image */}
                <div className="relative w-20 sm:w-28 md:w-36 h-full shrink-0 bg-gray-100 overflow-hidden">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                    />
                </div>

                {/* Middle Info */}
                <div className="flex-1 min-w-0 px-3 sm:px-4 py-1.5 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded">
                            Patrocinado
                        </span>
                        {ad.advertiser_logo ? (
                            <img
                                src={ad.advertiser_logo}
                                alt={ad.advertiser_name}
                                className="w-3.5 h-3.5 rounded-full object-cover"
                            />
                        ) : null}
                        <span className="text-[11px] sm:text-xs font-medium text-brand-inactive-text truncate">
                            {ad.advertiser_name}
                        </span>
                    </div>

                    <h3 className="font-bold text-xs sm:text-sm text-brand-dark line-clamp-1 group-hover:text-brand-green transition-colors leading-tight">
                        {ad.title}
                    </h3>
                    {ad.description ? (
                        <p className="text-[10px] sm:text-[11px] text-gray-500 line-clamp-1 mt-0.5 hidden sm:block">
                            {ad.description}
                        </p>
                    ) : null}
                </div>

                {/* Right Action / CTA */}
                <div className="shrink-0 pr-3 sm:pr-4 flex items-center">
                    <div className="flex items-center gap-1 bg-gray-50 group-hover:bg-brand-green group-hover:text-white text-brand-dark border border-gray-200 group-hover:border-brand-green text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all">
                        <span className="hidden sm:inline">Conferir</span>
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </button>
        )
    }

    if (variant === "compact") {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`group relative w-full text-left rounded-xl overflow-hidden border border-brand-border bg-white hover:border-gray-300 shadow-xs hover:shadow-sm transition-all flex items-center h-[72px] sm:h-[78px] ${className}`}
            >
                {/* Left Thumbnail */}
                <div className="relative w-20 sm:w-24 h-full shrink-0 bg-gray-50 overflow-hidden">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                    />
                </div>

                {/* Right Info */}
                <div className="flex-1 min-w-0 px-3 py-1.5 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="inline-block bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                            Patrocinado
                        </span>
                        {ad.advertiser_logo ? (
                            <img
                                src={ad.advertiser_logo}
                                alt={ad.advertiser_name}
                                className="w-3.5 h-3.5 rounded-full object-cover"
                            />
                        ) : null}
                        <span className="text-[10px] sm:text-[11px] font-medium text-brand-inactive-text truncate">
                            {ad.advertiser_name}
                        </span>
                    </div>
                    <p className="font-bold text-xs text-brand-dark line-clamp-2 leading-tight group-hover:text-brand-green transition-colors">
                        {ad.title}
                    </p>
                </div>
            </button>
        )
    }

    if (variant === "inline") {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`group w-full text-left flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-xs hover:shadow-sm transition-shadow ${className}`}
            >
                <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-50">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover object-center"
                        loading="lazy"
                    />
                </div>
                <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-center">
                    <span className="inline-block bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1 w-fit">
                        Patrocinado
                    </span>
                    <p className="font-semibold text-sm text-brand-dark line-clamp-2">{ad.title}</p>
                    <p className="text-xs text-brand-inactive-text mt-0.5">{ad.advertiser_name}</p>
                </div>
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`group shrink-0 snap-center text-left rounded-[20px] overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all w-[260px] sm:w-[280px] md:w-[300px] ${className}`}
        >
            <div className="relative aspect-[4/3] w-full bg-gray-50">
                <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
                    loading="lazy"
                />
                <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                    Patrocinado
                </span>
            </div>
            <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                    {ad.advertiser_logo ? (
                        <img
                            src={ad.advertiser_logo}
                            alt={ad.advertiser_name}
                            className="w-6 h-6 rounded-full object-cover"
                        />
                    ) : null}
                    <p className="text-xs font-medium text-brand-inactive-text truncate">{ad.advertiser_name}</p>
                </div>
                <p className="font-bold text-brand-dark text-sm md:text-base line-clamp-2">{ad.title}</p>
            </div>
        </button>
    )
}


