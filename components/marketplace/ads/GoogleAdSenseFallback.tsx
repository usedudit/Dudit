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

        const el = adRef.current
        if (!el) return

        const triggerAdPush = () => {
            if (initializedRef.current) return
            initializedRef.current = true

            // Injetar o script do Google AdSense se não estiver presente
            const scriptId = "google-adsense-script"
            if (!document.getElementById(scriptId)) {
                const script = document.createElement("script")
                script.id = scriptId
                script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisherId}`
                script.async = true
                script.crossOrigin = "anonymous"
                document.head.appendChild(script)
            }

            try {
                if (typeof window !== "undefined") {
                    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
                }
            } catch (e) {
                console.error("AdSense push error:", e)
            }
        }

        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0]?.isIntersecting) {
                        triggerAdPush()
                        observer.disconnect()
                    }
                },
                { rootMargin: "300px" }
            )
            observer.observe(el)
            return () => observer.disconnect()
        }

        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            const handle = (window as any).requestIdleCallback(triggerAdPush, { timeout: 3000 })
            return () => (window as any).cancelIdleCallback(handle)
        }

        const timer = setTimeout(triggerAdPush, 2000)
        return () => clearTimeout(timer)
    }, [config.enabled, config.publisherId])

    if (!config.enabled || !config.publisherId) {
        return null
    }

    return (
        <div className={`overflow-hidden rounded-xl bg-gray-50 border border-gray-200/80 p-2 text-center flex flex-col items-center justify-center min-h-[72px] sm:min-h-[90px] ${className}`}>
            <span className="block text-[9px] font-bold text-gray-400 mb-0.5 tracking-wider uppercase">Publicidade</span>
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
