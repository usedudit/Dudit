"use client"

import { useEffect, useRef, useState } from "react"

type RoutePoint = {
  orderId: string
  displayId: string
  position: number
  latitude: number
  longitude: number
  address?: string
  customerName?: string
}

type RouteOrigin = { lat: number; lng: number } | null | undefined

const STORE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/></svg>`

const escapeHtml = (value: any) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function buildPopupHtml(title: string, subtitle: string, tag?: string) {
  const tagHtml = tag
    ? `<span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:#059669;color:#fff;font-size:11px;font-weight:700">${escapeHtml(tag)}</span>`
    : ""
  return `<div style="padding:4px;font-family:system-ui,sans-serif;min-width:140px"><strong style="font-size:13px">${escapeHtml(title)}</strong><p style="margin:2px 0 0;font-size:12px;color:#4B5563">${escapeHtml(subtitle)}</p>${tagHtml}</div>`
}

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
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const rawToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  const token = rawToken ? rawToken.replace(/['"]/g, "").trim() : ""

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      if (cancelled || !mapContainerRef.current || !token) return

      try {
        if (!document.getElementById("mapbox-gl-css")) {
          const link = document.createElement("link")
          link.id = "mapbox-gl-css"
          link.rel = "stylesheet"
          link.href = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css"
          document.head.appendChild(link)
        }

        if (!(window as any).mapboxgl) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script")
            script.src = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js"
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

        map.on("load", () => {
          if (cancelled) return
          setReady(true)
        })

        // Erro no carregamento do estilo/tiles (ex.: token sem permissão de tiles)
        map.on("error", (e: any) => {
          if (cancelled || ready) return
          setMapError((prev) => prev || e?.error?.message || e?.message || "Falha ao carregar o mapa.")
        })
      } catch (err) {
        console.error("[DeliveryRouteMap] map init error:", err)
        if (!cancelled) setMapError("Falha ao carregar o mapa.")
      }
    }

    init()

    return () => {
      cancelled = true
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
    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const bounds = new mapboxgl.LngLatBounds()

    const hasOrigin = origin?.lat != null && origin?.lng != null
      && Number.isFinite(Number(origin.lat)) && Number.isFinite(Number(origin.lng))

    const validPoints = (points || []).filter(
      (p) => p?.latitude != null && p?.longitude != null
        && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)),
    )

    // Pin da loja (início da rota)
    if (hasOrigin) {
      const el = document.createElement("div")
      el.className = "flex items-center justify-center rounded-full w-10 h-10 bg-brand-green text-white shadow-md border-2 border-white"
      el.innerHTML = STORE_PIN_SVG

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([Number(origin.lng), Number(origin.lat)])
        .addTo(mapRef.current)
      marker.setPopup(
        new mapboxgl.Popup({ offset: 28, closeButton: false })
          .setHTML(buildPopupHtml("Loja", "Início da rota", "Início")),
      )
      markersRef.current.push(marker)
      bounds.extend([Number(origin.lng), Number(origin.lat)])
    }

    // Pins numerados dos pedidos, na ordem da rota
    validPoints.forEach((p, idx) => {
      const isLast = idx === validPoints.length - 1
      const el = document.createElement("div")
      el.className = "flex items-center justify-center rounded-full w-9 h-9 border-2 border-white bg-brand-dark text-white font-bold shadow-md"
      el.style.backgroundColor = isLast && validPoints.length > 1 ? "#7C3AED" : ""
      el.innerText = String(p.position || idx + 1)

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([Number(p.longitude), Number(p.latitude)])
        .addTo(mapRef.current)

      const tag = validPoints.length === 1 ? "Início / Fim" : isLast ? "Fim" : `Passo ${idx + 1}`
      marker.setPopup(
        new mapboxgl.Popup({ offset: 28, closeButton: false })
          .setHTML(buildPopupHtml(p.displayId || `Pedido ${p.position || idx + 1}`, p.address || p.customerName || "", tag)),
      )
      markersRef.current.push(marker)
      bounds.extend([Number(p.longitude), Number(p.latitude)])
    })

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 })
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
    <div className="w-full h-full rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden relative">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {mapError && !ready && (
        <div className="absolute inset-0 z-10 bg-white/95 dark:bg-dark-surface/95 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
            Não foi possível carregar o mapa.
          </p>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body max-w-[320px] leading-relaxed">
            {mapError}
          </p>
          <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
            Verifique se o token do Mapbox tem permissão de tiles (tilesets:read).
          </p>
        </div>
      )}

      {ready && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-lg bg-white/90 dark:bg-dark-surface/90 backdrop-blur px-3 py-2 shadow-md border border-brand-border dark:border-dark-border text-[11px] text-brand-dark dark:text-dark-heading">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-brand-green border-2 border-white shadow-sm shrink-0" />
            Loja (Início)
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-brand-dark border border-white shadow-sm shrink-0" />
            Pedidos na ordem da rota
          </span>
        </div>
      )}
    </div>
  )
}
