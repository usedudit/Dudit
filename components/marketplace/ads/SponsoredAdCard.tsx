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

    if (variant === "compact") {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <span className="text-[9px] font-semibold tracking-wider text-gray-400 uppercase mb-1 select-none">
                    Publicidade
                </span>
                <button
                    type="button"
                    onClick={handleClick}
                    className="group relative w-full text-left rounded-xl overflow-hidden border border-gray-200/80 bg-gray-50 hover:opacity-95 transition-all duration-200 shadow-xs aspect-[3/1] sm:aspect-[3.2/1]"
                >
                    <img
                        src={ad.image_url}
                        alt={ad.title || "Publicidade"}
                        className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
                        loading="lazy"
                    />
                </button>
            </div>
        )
    }

    if (variant === "inline") {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mb-1 select-none">
                    Publicidade
                </span>
                <button
                    type="button"
                    onClick={handleClick}
                    className="group relative w-full text-left rounded-xl overflow-hidden border border-gray-200/80 bg-gray-50 hover:opacity-95 transition-all duration-200 shadow-xs aspect-[3.2/1] sm:aspect-[3.6/1]"
                >
                    <img
                        src={ad.image_url}
                        alt={ad.title || "Publicidade"}
                        className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
                        loading="lazy"
                    />
                </button>
            </div>
        )
    }

    // Default: "banner"
    return (
        <div className={`w-full flex flex-col ${className}`}>
            <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mb-1.5 select-none">
                Publicidade
            </span>
            <button
                type="button"
                onClick={handleClick}
                className="group relative w-full text-left rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200/80 bg-gray-50 hover:opacity-95 transition-all duration-200 shadow-xs aspect-[3.2/1] sm:aspect-[3.6/1]"
            >
                <img
                    src={ad.image_url}
                    alt={ad.title || "Publicidade"}
                    className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
                    loading="lazy"
                />
            </button>
        </div>
    )
}



