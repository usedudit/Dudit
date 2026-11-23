"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { MapPinIcon } from "@/lib/icons"
import { upsertMyDriverLocationAction } from "@/app/actions/delivery-drivers"

export type DriverPositionQuality = "live" | "address" | "unknown"

export interface DriverLocationBeaconState {
    quality: DriverPositionQuality
    permission: "prompt" | "granted" | "denied" | "unsupported"
    lastSentAt: string | null
    error?: string | null
}

export const DRIVER_LOCATION_EVENT = "dudit:driver-location-status"
export const DRIVER_AVAILABILITY_EVENT = "dudit:driver-availability-changed"

const HEARTBEAT_INTERVAL_MS = 20_000

interface DriverLocationBeaconProps {
    isOnline: boolean
    className?: string
}

export default function DriverLocationBeacon({ isOnline, className = "" }: DriverLocationBeaconProps) {
    const [state, setState] = useState<DriverLocationBeaconState>({
        quality: "unknown",
        permission: "prompt",
        lastSentAt: null,
        error: null,
    })
    const [retryTick, setRetryTick] = useState(0)

    const watchIdRef = useRef<number | null>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const latestCoordsRef = useRef<GeolocationCoordinates | null>(null)
    const lastSentMsRef = useRef<number>(0)
    const inFlightRef = useRef<boolean>(false)
    const fallbackSentRef = useRef<boolean>(false)

    const emitState = useCallback((next: DriverLocationBeaconState) => {
        setState(next)
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent<DriverLocationBeaconState>(DRIVER_LOCATION_EVENT, { detail: next }))
        }
    }, [])

    const flushCoords = useCallback(
        async (coords: GeolocationCoordinates, force = false) => {
            const now = Date.now()
            if (!force && now - lastSentMsRef.current < HEARTBEAT_INTERVAL_MS) return
            if (inFlightRef.current) return

            inFlightRef.current = true
            lastSentMsRef.current = now
            try {
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
                    emitState({
                        quality: res.data.position_quality,
                        permission: "granted",
                        lastSentAt: res.data.updated_at,
                        error: null,
                    })
                }
            } catch {
                // Silencioso para não poluir UI em oscilações de rede
            } finally {
                inFlightRef.current = false
            }
        },
        [emitState]
    )

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
                emitState({
                    quality: res.success && res.data ? res.data.position_quality : "address",
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

    useEffect(() => {
        const stopWatching = () => {
            if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current)
                watchIdRef.current = null
            }
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            latestCoordsRef.current = null
        }

        // Bateria + LGPD: só coleta GPS enquanto o entregador estiver online/em rota
        if (!isOnline) {
            stopWatching()
            fallbackSentRef.current = false
            return
        }

        if (typeof window === "undefined" || !("geolocation" in navigator)) {
            void sendAddressFallback("unsupported", "GPS indisponível neste navegador")
            return
        }

        // Envio imediato na primeira leitura; demais a cada 20s
        lastSentMsRef.current = 0

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                latestCoordsRef.current = pos.coords
                const isFirstFix = lastSentMsRef.current === 0
                void flushCoords(pos.coords, isFirstFix)
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    void sendAddressFallback("denied", "Permissão de GPS negada — usando endereço de cadastro")
                } else {
                    void sendAddressFallback("unsupported", "Sinal de GPS indisponível — usando endereço de cadastro")
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 15_000,
                timeout: 15_000,
            }
        )

        // Heartbeat garantido a cada 20s mesmo quando o entregador está parado
        intervalRef.current = setInterval(() => {
            if (latestCoordsRef.current) {
                void flushCoords(latestCoordsRef.current, true)
            }
        }, HEARTBEAT_INTERVAL_MS)

        return stopWatching
    }, [isOnline, retryTick, flushCoords, sendAddressFallback])

    if (!isOnline) return null

    const isLive = state.quality === "live"
    const isDenied = state.permission === "denied"

    return (
        <button
            type="button"
            onClick={() => {
                if (!isLive) {
                    fallbackSentRef.current = false
                    setRetryTick((t) => t + 1)
                }
            }}
            title={
                isLive
                    ? "Localização GPS ao vivo ativa (atualizada a cada 20s)"
                    : state.error || "Usando endereço de cadastro. Clique para ativar GPS ao vivo."
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors ${
                isLive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-default"
                    : isDenied
                    ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300 hover:opacity-90 cursor-pointer"
                    : "border-brand-border bg-brand-gray text-brand-inactive-text dark:border-dark-border dark:bg-dark-border/40 dark:text-dark-body hover:opacity-90 cursor-pointer"
            } ${className}`}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full ${
                    isLive ? "bg-emerald-500 animate-pulse" : isDenied ? "bg-orange-500" : "bg-gray-400"
                }`}
            />
            <MapPinIcon size={12} />
            <span className="hidden sm:inline">
                {isLive ? "GPS ao vivo" : isDenied ? "GPS negado (endereço)" : "Posição por endereço"}
            </span>
        </button>
    )
}
