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

interface RouteStats {
  distanceKm: number
  durationMinutes: number
}

// Cache em memória para evitar chamadas duplicadas à Directions API na mesma sessão
const routeCache = new Map<string, { geometry: any; stats: RouteStats }>()

const STORE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>`
const ROUTE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`

export function DeliveryRouteMap({
  points,
  origin,
  initialLat,
  initialLng,
  onRouteStatsChange,
}: {
  points: RoutePoint[]
  origin?: RouteOrigin
  initialLat?: number | null
  initialLng?: number | null
  onRouteStatsChange?: (stats: RouteStats | null) => void
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<{ message: string; status: number | null } | null>(null)
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null)
  const [isRouteLoading, setIsRouteLoading] = useState(false)

  const onRouteStatsChangeRef = useRef(onRouteStatsChange)
  onRouteStatsChangeRef.current = onRouteStatsChange

  useEffect(() => {
    onRouteStatsChangeRef.current?.(routeStats)
  }, [routeStats])

  const rawToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  const token = rawToken ? rawToken.replace(/['"]/g, "").trim() : ""

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let resizeTimers: ReturnType<typeof setTimeout>[] = []
    let styleElement: HTMLStyleElement | null = null

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

        // Custom navigation controls styling
        const navControl = new mapboxgl.NavigationControl({
          showCompass: false,
          visualizePitch: false,
        })
        map.addControl(navControl, "top-right")

        // Add custom styles for navigation buttons
        styleElement = document.createElement("style")
        styleElement.textContent = `
          .mapboxgl-ctrl-group {
            background: rgba(255, 255, 255, 0.95) !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 12px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
            backdrop-filter: blur(8px) !important;
          }
          .mapboxgl-ctrl-group button {
            background: transparent !important;
            border-color: #e5e7eb !important;
            width: 36px !important;
            height: 36px !important;
          }
          .mapboxgl-ctrl-group button:hover {
            background: #f3f4f6 !important;
          }
          .mapboxgl-ctrl-group button + button {
            border-top: 1px solid #e5e7eb !important;
          }
          .mapboxgl-ctrl-zoom-in, .mapboxgl-ctrl-zoom-out {
            width: 36px !important;
            height: 36px !important;
          }
          .mapboxgl-ctrl-icon {
            filter: invert(0.3) !important;
          }
        `
        document.head.appendChild(styleElement)
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
        for (const ms of [100, 200, 400, 600, 1000, 1500]) {
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
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement)
      }
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
      } catch { }
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
    } catch { }

    const clearRouteLayer = () => {
      if (!mapRef.current) return
      const map = mapRef.current
      try {
        if (map.getLayer("delivery-route-line")) map.removeLayer("delivery-route-line")
        if (map.getLayer("delivery-route-casing")) map.removeLayer("delivery-route-casing")
        if (map.getSource("delivery-route")) map.removeSource("delivery-route")
      } catch { }
    }

    const renderRoute = (geometry: any) => {
      if (!mapRef.current || !readyRef.current) return
      const map = mapRef.current

      const applyLayers = () => {
        try {
          // Ensure map is properly sized before adding layers
          try {
            map.resize()
          } catch { }

          const geojson: any = {
            type: "Feature",
            properties: {},
            geometry,
          }

          if (map.getSource("delivery-route")) {
            (map.getSource("delivery-route") as any).setData(geojson)
          } else {
            map.addSource("delivery-route", {
              type: "geojson",
              data: geojson,
            })

            // Casing para contraste da linha sobre o mapa
            map.addLayer({
              id: "delivery-route-casing",
              type: "line",
              source: "delivery-route",
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#14532d",
                "line-width": 6,
                "line-opacity": 0.4,
              },
            })

            // Linha principal com cor verde da Dudit
            map.addLayer({
              id: "delivery-route-line",
              type: "line",
              source: "delivery-route",
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#16a34a",
                "line-width": 4,
              },
            })
          }

          if (geometry?.coordinates && geometry.coordinates.length > 1) {
            const bounds = new mapboxgl.LngLatBounds(
              geometry.coordinates[0],
              geometry.coordinates[0],
            )
            for (let i = 1; i < geometry.coordinates.length; i++) {
              bounds.extend(geometry.coordinates[i])
            }
            map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 })
          }

          // Force multiple resize calls after rendering
          setTimeout(() => {
            try { map.resize() } catch { }
          }, 100)
          setTimeout(() => {
            try { map.resize() } catch { }
          }, 500)
        } catch (layerErr) {
          console.warn("[DeliveryRouteMap] renderRoute error:", layerErr)
        }
      }

      if (map.isStyleLoaded()) {
        applyLayers()
      } else {
        map.once("style.load", applyLayers)
      }
    }

    let cancelled = false
    const abortCtrl = new AbortController()

    if (allCoords.length === 1) {
      clearRouteLayer()
      setRouteStats(null)
      try {
        mapRef.current.easeTo({ center: allCoords[0], zoom: 14, duration: 500 })
      } catch { }
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

      const fetchRoute = async () => {
        // Mapbox Directions API suporta até 25 waypoints por chamada
        const coordsForApi = allCoords.length <= 25 ? allCoords : allCoords.slice(0, 25)
        const coordsString = coordsForApi.map(([lng, lat]) => `${lng},${lat}`).join(";")
        const cacheKey = coordsString

        if (routeCache.has(cacheKey)) {
          const cached = routeCache.get(cacheKey)!
          if (!cancelled) {
            renderRoute(cached.geometry)
            setRouteStats(cached.stats)
          }
          return
        }

        try {
          if (!cancelled) setIsRouteLoading(true)
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsString}?geometries=geojson&overview=full&access_token=${token}`
          const res = await fetch(url, { signal: abortCtrl.signal })
          if (!res.ok) throw new Error(`Directions API ${res.status}`)
          const data = await res.json()
          if (cancelled) return

          if (data.code === "Ok" && data.routes?.[0]?.geometry) {
            const r = data.routes[0]
            const stats: RouteStats = {
              distanceKm: Number((r.distance / 1000).toFixed(1)),
              durationMinutes: Math.max(1, Math.round(r.duration / 60)),
            }
            routeCache.set(cacheKey, { geometry: r.geometry, stats })
            renderRoute(r.geometry)
            setRouteStats(stats)
          } else {
            throw new Error("No route geometry")
          }
        } catch (err: any) {
          if (err.name !== "AbortError") {
            console.warn("[DeliveryRouteMap] Falha ao traçar rota via Directions API, usando fallback linear:", err)
            // Fallback suave: traça linha direta entre os pontos sem quebrar a tela
            const fallbackGeometry = {
              type: "LineString",
              coordinates: allCoords,
            }
            renderRoute(fallbackGeometry)
          }
        } finally {
          if (!cancelled) setIsRouteLoading(false)
        }
      }

      void fetchRoute()
    } else {
      clearRouteLayer()
      setRouteStats(null)
    }

    return () => {
      cancelled = true
      abortCtrl.abort()
    }
  }, [points, origin, ready, token])

  if (!token) {
    return (
      <div className="w-full h-full rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-surface flex items-center justify-center">
        <span className="text-sm text-brand-inactive-text">Mapa indisponível.</span>
      </div>
    )
  }

  const hasMultipleStops = (origin?.lat != null && points && points.length > 0) || (points && points.length > 1)

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
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-2 rounded-xl bg-white/95 dark:bg-dark-surface/95 px-3 py-2.5 shadow-md border border-brand-border dark:border-dark-border text-[11px] text-brand-dark dark:text-dark-heading backdrop-blur-sm max-w-[240px]">
          <div className="flex flex-col gap-1.5">
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
            {hasMultipleStops && (
              <span className="flex items-center gap-2 font-medium text-brand-inactive-text dark:text-dark-body">
                <span className="w-3.5 h-1 rounded-full bg-brand-green shrink-0" />
                Traçado da rota
              </span>
            )}
          </div>

          {(routeStats || isRouteLoading) && (
            <div className="pt-2 border-t border-brand-border dark:border-dark-border flex flex-col gap-1">
              {isRouteLoading && !routeStats ? (
                <span className="text-[10px] text-brand-inactive-text flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                  Traçando rota...
                </span>
              ) : routeStats ? (
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <div className="flex items-center gap-1.5 font-semibold text-brand-dark dark:text-dark-heading">
                    <span dangerouslySetInnerHTML={{ __html: ROUTE_ICON_SVG }} className="text-brand-green shrink-0 inline-flex items-center" />
                    <span>{routeStats.distanceKm} km</span>
                  </div>
                  <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                    ~{routeStats.durationMinutes} min
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

