"use client"

import { useEffect, useRef, useState } from "react"

type RoutePoint = {
  orderId: string
  displayId: string
  position: number
  latitude: number
  longitude: number
}

export function DeliveryRouteMap({
  points,
  initialLat,
  initialLng,
}: {
  points: RoutePoint[]
  initialLat?: number | null
  initialLng?: number | null
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [ready, setReady] = useState(false)

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
      } catch (err) {
        console.error("[DeliveryRouteMap] map init error:", err)
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
    }
  }, [initialLat, initialLng, token])

  useEffect(() => {
    if (!ready || !mapRef.current || !(window as any).mapboxgl) return
    const mapboxgl = (window as any).mapboxgl

    // clear old markers
    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const bounds = new mapboxgl.LngLatBounds()

    for (const p of (points || [])) {
      if (!p?.latitude || !p?.longitude) continue

      const el = document.createElement("div")
      el.className = "flex items-center justify-center rounded-full w-9 h-9 border border-brand-border bg-white text-brand-dark font-bold shadow-md"
      el.innerText = String(p.position || "")

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.longitude, p.latitude])
        .addTo(mapRef.current)
      markersRef.current.push(marker)
      bounds.extend([p.longitude, p.latitude])
    }

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 })
    }
  }, [points, ready])

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
    </div>
  )
}

