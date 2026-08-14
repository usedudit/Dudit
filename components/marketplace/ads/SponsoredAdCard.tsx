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
                className={`group relative w-full text-left rounded-2xl md:rounded-3xl overflow-hidden border border-gray-100/80 bg-gray-900 shadow-sm hover:shadow-md transition-all duration-300 aspect-[16/9] sm:aspect-[2.1/1] md:aspect-[2.2/1] lg:aspect-[2.5/1] ${className}`}
            >
                {/* Background Image */}
                <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-500"
                    loading="lazy"
                />

                {/* Subtle dark gradient overlay for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10 transition-opacity duration-300" />

                {/* "Patrocinado" badge */}
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                    <span className="inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-md text-white/95 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full border border-white/15 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Patrocinado
                    </span>
                </div>

                {/* Bottom Content Area */}
                <div className="absolute bottom-0 inset-x-0 p-3.5 sm:p-5 z-10 flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            {ad.advertiser_logo ? (
                                <img
                                    src={ad.advertiser_logo}
                                    alt={ad.advertiser_name}
                                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover border border-white/30"
                                />
                            ) : null}
                            <p className="text-[11px] sm:text-xs md:text-sm font-medium text-white/80 truncate">
                                {ad.advertiser_name}
                            </p>
                        </div>
                        <h3 className="font-bold text-white text-xs sm:text-sm md:text-base leading-snug line-clamp-2 drop-shadow-sm">
                            {ad.title}
                        </h3>
                    </div>

                    <div className="shrink-0 hidden sm:flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 sm:py-2 rounded-full border border-white/20 transition-all group-hover:bg-brand-green group-hover:border-brand-green">
                        <span>Conferir</span>
                        <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                className={`group w-full text-left rounded-2xl border border-brand-border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all ${className}`}
            >
                <div className="relative aspect-[16/9] w-full bg-gray-50 overflow-hidden">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
                        loading="lazy"
                    />
                    <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Patrocinado
                    </span>
                </div>
                <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                        {ad.advertiser_logo ? (
                            <img
                                src={ad.advertiser_logo}
                                alt={ad.advertiser_name}
                                className="w-4 h-4 rounded-full object-cover"
                            />
                        ) : null}
                        <p className="text-[11px] font-medium text-brand-inactive-text truncate">{ad.advertiser_name}</p>
                    </div>
                    <p className="font-bold text-xs sm:text-sm text-brand-dark line-clamp-2 leading-tight group-hover:text-brand-green transition-colors">{ad.title}</p>
                </div>
            </button>
        )
    }

    if (variant === "inline") {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`group w-full text-left flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${className}`}
            >
                <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-gray-50">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover object-center"
                        loading="lazy"
                    />
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                    <span className="inline-block bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5">
                        Patrocinado
                    </span>
                    <p className="font-semibold text-sm text-brand-dark line-clamp-2">{ad.title}</p>
                    <p className="text-xs text-brand-inactive-text mt-1">{ad.advertiser_name}</p>
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

