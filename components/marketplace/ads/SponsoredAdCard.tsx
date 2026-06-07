"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import type { SponsoredAd } from "@/lib/ads/types"
import { trackAdClick, trackAdImpression } from "@/app/actions/marketplace/ads"

interface SponsoredAdCardProps {
    ad: SponsoredAd
    variant?: "carousel" | "inline" | "compact"
    className?: string
}

export function SponsoredAdCard({ ad, variant = "carousel", className = "" }: SponsoredAdCardProps) {
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

    if (variant === "compact") {
        return (
            <button
                type="button"
                onClick={handleClick}
                className={`group w-full text-left rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow ${className}`}
            >
                <div className="relative aspect-[16/9] w-full bg-gray-50">
                    <img
                        src={ad.image_url}
                        alt={ad.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                    <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Patrocinado
                    </span>
                </div>
                <div className="p-3">
                    <p className="font-semibold text-sm text-brand-dark line-clamp-1">{ad.title}</p>
                    <p className="text-xs text-brand-inactive-text mt-0.5">{ad.advertiser_name}</p>
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
                        className="w-full h-full object-cover"
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
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    loading="lazy"
                />
                <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                    Patrocinado
                </span>
            </div>
            <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                    {ad.advertiser_logo ? (
                        <Image
                            src={ad.advertiser_logo}
                            alt={ad.advertiser_name}
                            width={24}
                            height={24}
                            className="rounded-full object-cover"
                        />
                    ) : null}
                    <p className="text-xs font-medium text-brand-inactive-text truncate">{ad.advertiser_name}</p>
                </div>
                <p className="font-bold text-brand-dark text-sm md:text-base line-clamp-2">{ad.title}</p>
            </div>
        </button>
    )
}
