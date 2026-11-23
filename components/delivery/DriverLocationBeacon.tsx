"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { MapPinIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"
import { upsertMyDriverLocationAction } from "@/app/actions/delivery-drivers"

export type DriverPositionQuality = "live" | "address" | "unknown"

export interface DriverLocationBeaconState {
    quality: DriverPositionQuality
    permission: "prompt" | "granted" | "denied" | "unsupported"
    lastSentAt: string | null
    error?: string | null
}

export type DriverLocationTriggerReason = "init" | "manual" | "accept" | "status_change"

export const DRIVER_LOCATION_EVENT = "dudit:driver-location-status"
export const DRIVER_AVAILABILITY_EVENT = "dudit:driver-availability-changed"
export const DRIVER_LOCATION_TRIGGER_EVENT = "dudit:driver-location-trigger"

const MANUAL_COOLDOWN_MS = 5 * 60 * 1000
const LAST_SENT_STORAGE_KEY = "dudit_driver_loc_last_sent_ms"
const LAST_QUALITY_STORAGE_KEY = "dudit_driver_loc_last_quality"

export function triggerDriverLocationCapture(reason: DriverLocationTriggerReason) {
    if (typeof window === "undefined") return
    window.dispatchEvent(
        new CustomEvent<{ reason: DriverLocationTriggerReason }>(DRIVER_LOCATION_TRIGGER_EVENT, {
            detail: { reason },
        })
    )
}

function readStoredLastSentMs(): number {
    if (typeof window === "undefined") return 0
    try {
        const raw = window.sessionStorage.getItem(LAST_SENT_STORAGE_KEY)
        const n = raw ? Number(raw) : 0
        return Number.isFinite(n) ? n : 0
    } catch {
        return 0
    }
}

function writeStoredLastSent(ms: number, quality: DriverPositionQuality) {
    if (typeof window === "undefined") return
    try {
        window.sessionStorage.setItem(LAST_SENT_STORAGE_KEY, String(ms))
        window.sessionStorage.setItem(LAST_QUALITY_STORAGE_KEY, quality)
    } catch { }
}

function readStoredQuality(): DriverPositionQuality {
    if (typeof window === "undefined") return "unknown"
    try {
        const raw = window.sessionStorage.getItem(LAST_QUALITY_STORAGE_KEY)
        if (raw === "live" || raw === "address" || raw === "unknown") return raw
        return "unknown"
    } catch {
        return "unknown"
    }
}

interface DriverLocationBeaconProps {
    isOnline: boolean
    className?: string
}

/**
 * Captura de localização orientada a eventos (sem rastreamento contínuo / sem polling):
 * - Dispara 1x ao entrar online no portal (com cooldown de 5 min via sessionStorage)
 * - Dispara ao clicar manualmente no selo de GPS (respeitando cooldown de 5 min se já estiver live)
 * - Dispara imediatamente ao aceitar uma entrega ou mudar status (retirado, saiu para entrega, entregue)
 */
export default function DriverLocationBeacon({ isOnline, className = "" }: DriverLocationBeaconProps) {
    const [state, setState] = useState<DriverLocationBeaconState>(() => ({
        quality: readStoredQuality(),
        permission: readStoredQuality() === "live" ? "granted" : "prompt",
        lastSentAt: readStoredLastSentMs() > 0 ? new Date(readStoredLastSentMs()).toISOString() : null,
        error: null,
    }))
    const [isCapturing, setIsCapturing] = useState(false)

    const inFlightRef = useRef(false)
    const fallbackSentRef = useRef(false)

    const emitState = useCallback((next: DriverLocationBeaconState) => {
        setState(next)
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent<DriverLocationBeaconState>(DRIVER_LOCATION_EVENT, { detail: next }))
        }
    }, [])

    const sendAddressFallback = useCallback(
        async (permission: "denied" | "unsupported", errorMsg?: string) => {
            if (fallbackSentRef.current) {
                emitState({
                    quality: "address",
                    permission,
                    lastSentAt: null,
                    error: errorMsg || null,
                })
                return
            }
            fallbackSentRef.current = true
            try {
                const res = await upsertMyDriverLocationAction({ source: "address_fallback" })
                const quality = res.success && res.data ? res.data.position_quality : "address"
                writeStoredLastSent(Date.now(), quality)
                emitState({
                    quality,
                    permission,
                    lastSentAt: res.success && res.data ? res.data.updated_at : null,
                    error: errorMsg || null,
                })
            } catch {
                emitState({
                    quality: "address",
                    permission,
                    lastSentAt: null,
                    error: errorMsg || null,
                })
            }
        },
        [emitState]
    )

    const captureOnce = useCallback(
        (reason: DriverLocationTriggerReason) => {
            if (!isOnline && reason !== "accept" && reason !== "status_change") return
            if (inFlightRef.current) return

            const now = Date.now()
            const lastSentMs = readStoredLastSentMs()
            const elapsed = now - lastSentMs
            const isEventForced = reason === "accept" || reason === "status_change"

            // Cooldown de 5 min para init e clique manual (exceto se ainda não estiver live no clique manual)
            if (!isEventForced && lastSentMs > 0 && elapsed < MANUAL_COOLDOWN_MS) {
                if (reason === "manual" && state.quality === "live") {
                    const remainingMin = Math.max(1, Math.ceil((MANUAL_COOLDOWN_MS - elapsed) / 60000))
                    toast.info(`Localização já atualizada. Nova atualização manual em ${remainingMin} min.`)
                    return
                }
                if (reason === "init") {
                    return
                }
            }

            if (typeof window === "undefined" || !("geolocation" in navigator)) {
                void sendAddressFallback("unsupported", "GPS indisponível neste navegador")
                return
            }

            inFlightRef.current = true
            setIsCapturing(true)

            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    try {
                        const coords = pos.coords
                        const speedKmh =
                            coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0
                                ? Math.round(coords.speed * 3.6 * 100) / 100
                                : null
                        const headingDeg =
                            coords.heading != null && Number.isFinite(coords.heading) && coords.heading >= 0
                                ? Math.round(coords.heading * 100) / 100
                                : null
                        const accuracyM =
                            coords.accuracy != null && Number.isFinite(coords.accuracy) && coords.accuracy >= 0
                                ? Math.round(coords.accuracy * 100) / 100
                                : null

                        const res = await upsertMyDriverLocationAction({
                            lat: coords.latitude,
                            lng: coords.longitude,
                            accuracy: accuracyM,
                            heading: headingDeg,
                            speed: speedKmh,
                            source: accuracyM != null && accuracyM > 150 ? "network" : "gps",
                        })

                        if (res.success && res.data) {
                            fallbackSentRef.current = false
                            writeStoredLastSent(Date.now(), res.data.position_quality)
                            emitState({
                                quality: res.data.position_quality,
                                permission: "granted",
                                lastSentAt: res.data.updated_at,
                                error: null,
                            })
                            if (reason === "manual") {
                                toast.success("Localização atualizada!")
                            }
                        }
                    } catch {
                        // Silencioso em oscilações de rede
                    } finally {
                        inFlightRef.current = false
                        setIsCapturing(false)
                    }
                },
                (err) => {
                    inFlightRef.current = false
                    setIsCapturing(false)
                    if (err.code === err.PERMISSION_DENIED) {
                        void sendAddressFallback("denied", "Permissão de GPS negada — usando endereço de cadastro")
                    } else {
                        void sendAddressFallback("unsupported", "Sinal de GPS indisponível — usando endereço de cadastro")
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 60_000,
                    timeout: 12_000,
                }
            )
        },
        [isOnline, state.quality, emitState, sendAddressFallback]
    )

    // 1. Dispara 1x ao entrar online (respeitando cooldown de 5 min)
    useEffect(() => {
        if (!isOnline) {
            fallbackSentRef.current = false
            return
        }
        captureOnce("init")
    }, [isOnline, captureOnce])

    // 2. Escuta eventos operacionais (aceite de corrida e mudança de status)
    useEffect(() => {
        const handler = (event: Event) => {
            const reason = (event as CustomEvent<{ reason: DriverLocationTriggerReason }>).detail?.reason || "status_change"
            captureOnce(reason)
        }
        window.addEventListener(DRIVER_LOCATION_TRIGGER_EVENT, handler)
        return () => window.removeEventListener(DRIVER_LOCATION_TRIGGER_EVENT, handler)
    }, [captureOnce])

    if (!isOnline) return null

    const isLive = state.quality === "live"
    const isDenied = state.permission === "denied"

    return (
        <button
            type="button"
            disabled={isCapturing}
            onClick={() => {
                fallbackSentRef.current = false
                captureOnce("manual")
            }}
            title={
                isLive
                    ? "Localização atualizada. Clique para atualizar novamente (intervalo mínimo de 5 min)."
                    : state.error || "Usando endereço de cadastro. Clique para atualizar pelo GPS."
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors cursor-pointer disabled:opacity-60 ${
                isLive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 hover:opacity-90"
                    : isDenied
                    ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 hover:opacity-90"
                    : "border-brand-border bg-brand-gray text-brand-inactive-text dark:border-dark-border dark:bg-dark-border/40 dark:text-dark-body hover:opacity-90"
            } ${className}`}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full ${
                    isLive ? "bg-emerald-500" : isDenied ? "bg-orange-500" : "bg-gray-400"
                }`}
            />
            <MapPinIcon size={12} />
            <span className="hidden sm:inline">
                {isCapturing
                    ? "Atualizando..."
                    : isLive
                    ? "GPS ativo"
                    : isDenied
                    ? "GPS negado (endereço)"
                    : "Posição por endereço"}
            </span>
        </button>
    )
}
