"use client"

import React from "react"
import { getHouseBannerConfig } from "@/lib/ads/fallback"

interface HouseAdBannerProps {
    variant?: "banner" | "compact"
    className?: string
}

export function HouseAdBanner({ variant = "banner", className = "" }: HouseAdBannerProps) {
    const config = getHouseBannerConfig()

    const handleClick = () => {
        if (!config.contactUrl) return
        window.open(config.contactUrl, "_blank", "noopener,noreferrer")
    }

    if (variant === "compact") {
        return (
            <div className={`w-full flex flex-col ${className}`}>
                <span className="text-[9px] font-semibold tracking-wider text-brand-inactive-text uppercase mb-1 select-none">
                    Publicidade
                </span>
                <button
                    type="button"
                    onClick={handleClick}
                    className="group relative w-full text-left rounded-xl overflow-hidden p-3.5 bg-gradient-to-br from-[#003229] via-[#054437] to-[#00221c] text-white border border-[#0d5e49]/40 shadow-xs hover:border-[#10b981]/50 transition-all duration-300 flex items-center justify-between gap-2.5"
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="inline-block bg-[#10b981]/20 text-[#6ee7b7] text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">
                                Anuncie Aqui
                            </span>
                        </div>
                        <p className="font-bold text-xs text-white leading-tight line-clamp-1 group-hover:text-[#6ee7b7] transition-colors">
                            Divulgue seu negócio aqui
                        </p>
                        <p className="text-[10px] text-gray-300 line-clamp-1 mt-0.5">
                            Alcance clientes na sua região
                        </p>
                    </div>
                    <div className="shrink-0 bg-[#10b981] text-[#003229] p-1.5 rounded-lg group-hover:scale-105 transition-transform">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </div>
                </button>
            </div>
        )
    }

    return (
        <div className={`w-full flex flex-col ${className}`}>
            <span className="text-[10px] font-semibold tracking-wider text-brand-inactive-text uppercase mb-1.5 select-none">
                Publicidade
            </span>
            <button
                type="button"
                onClick={handleClick}
                className="group relative w-full text-left rounded-xl sm:rounded-2xl overflow-hidden p-4 sm:p-5 bg-gradient-to-r from-[#003229] via-[#054437] to-[#00221c] text-white border border-[#0d5e49]/40 shadow-sm hover:border-[#10b981]/50 transition-all duration-300 flex items-center justify-between gap-4"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block bg-[#10b981]/20 text-[#6ee7b7] text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase">
                            Dudit Ads
                        </span>
                        <span className="text-[11px] text-gray-300 hidden sm:inline">
                            Espaço exclusivo
                        </span>
                    </div>
                    <h3 className="font-bold text-sm sm:text-base text-white line-clamp-1 group-hover:text-[#6ee7b7] transition-colors">
                        Quer anunciar seu negócio na sua região?
                    </h3>
                    <p className="text-xs text-gray-300 line-clamp-1 mt-0.5">
                        Destaque sua marca para milhares de pessoas todos os dias.
                    </p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5 bg-[#10b981] group-hover:bg-[#059669] text-[#002820] font-bold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-xl transition-all shadow-xs group-hover:scale-[1.02]">
                    <span>Anunciar</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </div>
            </button>
        </div>
    )
}
