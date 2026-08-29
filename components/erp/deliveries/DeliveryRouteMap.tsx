"use client"

import { useEffect, useRef, useState } from "react"
import {
  buildDeliveryStopPopupHtml,
  buildStoreOriginPopupHtml,
} from "@/lib/map/mapbox-popup"

export type RoutePoint = {
  orderId: string
  displayId: string
  position: number
  latitude: number
  longitude: number
  address?: string
  customerName?: string
  orderNumber?: string | null
  distanceKm?: number | null
  totalAmount?: number | null
  deliveryStatus?: string | null
  situation?: string | null
  paymentMethod?: string | null
}

export type RouteOrigin = {
  lat: number
  lng: number
  name?: string
  address?: string
} | null | undefined

const STORE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>`

export function DeliveryRouteMap({
  points,
  origin,
  initialLat,
  initialLng,
}: {
  points: RoutePoint[]
  origin?: RouteOrigin
  initialLat?: number | null
  initialLng?: number | null
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<{ message: string; status: number | null } | null>(null)

  const rawToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  const token = rawToken ? rawToken.replace(/['"]/g, "").trim() : ""

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let resizeTimers: ReturnType<typeof setTimeout>[] = []

    const init = async () => {
      if (cancelled || !mapContainerRef.current || !token) return

      try {
        if (!document.getElementById("mapbox-gl-css")) {
          const link = document.createElement("link")
          link.id = "mapbox-gl-css"
          link.rel = "stylesheet"
          link.href = "https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.css"
          document.head.appendChild(link)
        }

        if (!(window as any).mapboxgl) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script")
            script.src = "https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.js"
            script.async = true
            script.onload = resolve
            script.onerror = reject
            document.head.appendChild(script)
          })
        }

        if (cancelled || !mapContainerRef.current) return

        const mapboxgl = (window as any).mapboxgl
        mapboxgl.accessToken = token

        const center = initialLat != null && initialLng != null
          ? [initialLng, initialLat]
          : [-46.6333, -23.5505]

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center,
          zoom: 12,
          attributionControl: false,
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
        mapRef.current = map

        // Container pode inicializar durante animações (FadeIn / DefaultModal scale).
        // O Mapbox lê o tamanho no init; resize pós-montagem garante o paint dos tiles.
        const resizeMap = () => {
          if (cancelled || !mapRef.current) return
          try {
            mapRef.current.resize()
          } catch {
            /* noop */
          }
        }

        if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
          resizeObserver = new ResizeObserver(() => resizeMap())
          resizeObserver.observe(mapContainerRef.current)
        }

        resizeTimers = []
        for (const ms of [200, 600, 1500]) {
          resizeTimers.push(setTimeout(resizeMap, ms))
        }

        map.on("load", () => {
          if (cancelled) return
          readyRef.current = true
          setReady(true)
          resizeMap()
        })

        let idleLogged = false
        map.on("idle", () => {
          if (cancelled || idleLogged) return
          idleLogged = true
        })

        map.on("error", (e: any) => {
          const err = e?.error || e
          const status = Number(err?.status ?? err?.code)
          if (cancelled) return
          if (readyRef.current && status !== 401 && status !== 403) return
          setMapError((prev) => prev || { message: err?.message || "Falha ao carregar o mapa.", status: status || null })
        })
      } catch (err) {
        if (!cancelled) setMapError({ message: "Falha ao carregar o mapa.", status: null })
      }
    }

    init()

    return () => {
      cancelled = true
      readyRef.current = false
      resizeObserver?.disconnect()
      for (const t of resizeTimers) clearTimeout(t)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      setReady(false)
      setMapError(null)
    }
  }, [initialLat, initialLng, token])

  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).mapboxgl) return
    const mapboxgl = (window as any).mapboxgl

    // clear old markers
    for (const m of markersRef.current) {
      try {
        m.remove()
      } catch {}
    }
    markersRef.current = []

    const hasOrigin = origin?.lat != null && origin?.lng != null
      && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng))

    const validPoints = (points || []).filter(
      (p) => p?.latitude != null && p?.longitude != null
        && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)),
    )

    const allCoords: [number, number][] = []

    // Pin da loja (início da rota)
    if (hasOrigin) {
      const originLng = Number(origin.lng)
      const originLat = Number(origin.lat)
      allCoords.push([originLng, originLat])

      const el = document.createElement("div")
      el.className = "flex items-center justify-center rounded-full w-9 h-9 bg-brand-green text-white shadow-sm border-2 border-white dark:border-dark-surface cursor-pointer"
      el.innerHTML = STORE_PIN_SVG

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([originLng, originLat])
        .addTo(mapRef.current)

      marker.setPopup(
        new mapboxgl.Popup({ offset: 20, closeButton: true, maxWidth: "270px" })
          .setHTML(buildStoreOriginPopupHtml({
            storeName: origin.name || "Sua Loja",
            address: origin.address || "Ponto de partida da entrega",
            latitude: originLat,
            longitude: originLng,
            tag: "Início",
          })),
      )
      markersRef.current.push(marker)
    }

    // Pins numerados dos pedidos, na ordem da rota
    validPoints.forEach((p, idx) => {
      const isLast = idx === validPoints.length - 1
      const isSingle = validPoints.length === 1
      const posNumber = p.position || idx + 1
      const pointLng = Number(p.longitude)
      const pointLat = Number(p.latitude)
      allCoords.push([pointLng, pointLat])

      const el = document.createElement("div")
      const bgClass = isLast && !isSingle ? "bg-purple-600" : "bg-brand-dark"
      el.className = `flex items-center justify-center rounded-full w-8 h-8 ${bgClass} text-white font-bold text-xs shadow-sm border-2 border-white dark:border-dark-surface cursor-pointer`
      el.innerText = String(posNumber)

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([pointLng, pointLat])
        .addTo(mapRef.current)

      marker.setPopup(
        new mapboxgl.Popup({ offset: 20, closeButton: true, maxWidth: "270px" })
          .setHTML(buildDeliveryStopPopupHtml({
            orderId: p.orderId,
            displayId: p.displayId,
            position: posNumber,
            totalPoints: validPoints.length,
            customerName: p.customerName,
            address: p.address,
            latitude: pointLat,
            longitude: pointLng,
            distanceKm: p.distanceKm,
            totalAmount: p.totalAmount,
            deliveryStatus: p.deliveryStatus,
            situation: p.situation,
            paymentMethod: p.paymentMethod,
          })),
      )
      markersRef.current.push(marker)
    })

    try {
      mapRef.current?.resize()
    } catch {}

    if (allCoords.length === 1) {
      try {
        mapRef.current.easeTo({ center: allCoords[0], zoom: 14, duration: 500 })
      } catch {}
    } else if (allCoords.length >= 2) {
      try {
        const bounds = new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
        for (let i = 1; i < allCoords.length; i++) {
          bounds.extend(allCoords[i])
        }
        mapRef.current.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 })
      } catch (boundsErr) {
        console.warn("[DeliveryRouteMap] fitBounds error:", boundsErr)
      }
    }
  }, [points, origin, ready])

  if (!token) {
    return (
      <div className="w-full h-full rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-surface flex items-center justify-center">
        <span className="text-sm text-brand-inactive-text">Mapa indisponível.</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden relative min-h-[250px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {mapError && (!ready || mapError.status === 401 || mapError.status === 403) && (
        <div className="absolute inset-0 z-10 bg-white/95 dark:bg-dark-surface/95 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
            Não foi possível carregar o mapa.
          </p>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body max-w-[320px] leading-relaxed">
            {mapError.message}
          </p>
          {mapError.status === 401 || mapError.status === 403 ? (
            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
              Tiles retornando {mapError.status}: confira se o token tem permissão de tiles (tilesets:read) e se a URL
              restriction (Allowed URLs) do token no console Mapbox não está bloqueando o domínio.
            </p>
          ) : (
            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
              Verifique se o token do Mapbox tem permissão de tiles (tilesets:read).
            </p>
          )}
        </div>
      )}

      {ready && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-lg bg-white/95 dark:bg-dark-surface/95 px-3 py-2 shadow-sm border border-brand-border dark:border-dark-border text-[11px] text-brand-dark dark:text-dark-heading">
          <span className="flex items-center gap-2 font-medium">
            <span className="w-3 h-3 rounded-full bg-brand-green border border-white dark:border-dark-surface shadow-sm shrink-0" />
            Loja (Início)
          </span>
          <span className="flex items-center gap-2 font-medium">
            <span className="w-3 h-3 rounded-full bg-brand-dark border border-white dark:border-dark-surface shadow-sm shrink-0" />
            Pedidos na rota
          </span>
          {points && points.length > 1 && (
            <span className="flex items-center gap-2 font-medium">
              <span className="w-3 h-3 rounded-full bg-purple-600 border border-white dark:border-dark-surface shadow-sm shrink-0" />
              Destino final
            </span>
          )}
        </div>
      )}
    </div>
  )
}

