"use client"

import { useEffect, useRef } from "react"
import type { AdSlot } from "@/lib/ads/types"
import { getExternalAdFallbackConfig } from "@/lib/ads/fallback"

interface GoogleAdSenseFallbackProps {
    slot: AdSlot
    format?: "auto" | "rectangle" | "horizontal"
    className?: string
}

declare global {
    interface Window {
        adsbygoogle?: { [key: string]: unknown }[]
    }
}

export function GoogleAdSenseFallback({
    slot,
    format = "auto",
    className = "",
}: GoogleAdSenseFallbackProps) {
    const config = getExternalAdFallbackConfig(slot)
    const adRef = useRef<HTMLModElement | null>(null)
    const initializedRef = useRef(false)

    useEffect(() => {
        if (!config.enabled || !config.publisherId || initializedRef.current) return

        // 1. Injetar o script do Google AdSense de forma assíncrona se não estiver presente
        const scriptId = "google-adsense-script"
        if (!document.getElementById(scriptId)) {
            const script = document.createElement("script")
            script.id = scriptId
            script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisherId}`
            script.async = true
            script.crossOrigin = "anonymous"
            document.head.appendChild(script)
        }

        // 2. Executar o push do AdSense após o elemento estar no DOM
        try {
            if (typeof window !== "undefined" && adRef.current) {
                ;(window.adsbygoogle = window.adsbygoogle || []).push({})
                initializedRef.current = true
            }
        } catch (e) {
            console.error("AdSense push error:", e)
        }
    }, [config.enabled, config.publisherId])

    if (!config.enabled || !config.publisherId) {
        return null
    }

    return (
        <div className={`overflow-hidden rounded-2xl bg-gray-50 border border-gray-100 p-2 text-center ${className}`}>
            <span className="block text-[10px] font-medium text-gray-400 mb-1">Publicidade</span>
            <ins
                ref={adRef}
                className="adsbygoogle"
                style={{ display: "block" }}
                data-ad-client={config.publisherId}
                data-ad-slot={config.adUnitId || undefined}
                data-ad-format={format}
                data-full-width-responsive="true"
            />
        </div>
    )
}
