"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { BoundingBox } from "@/app/actions/marketplace/map"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface PartnerMapData {
  id: string
  store_name: string
  store_image_url?: string
  latitude: number
  longitude: number
  store_description?: string
  opening_hours?: any
  rating?: number
}

interface OptimizedMapboxProps {
  initialLat?: number
  initialLng?: number
  address?: string | null
  partners: PartnerMapData[]
  onBoundsChange: (bounds: BoundingBox) => void
  onMarkerClick: (partner: PartnerMapData) => void
  activePartnerId?: string | null
}

const CUSTOM_POINTER_IMG = "https://img.dudit.com.br/static/Pointer.png"

export function OptimizedMapbox({
  initialLat = -23.5505, // SP def
  initialLng = -46.6333,
  address,
  partners,
  onBoundsChange,
  onMarkerClick,
  activePartnerId
}: OptimizedMapboxProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<{ [key: string]: any }>({})
  const [isMapping, setIsMapping] = useState(true)

  // Dispara onBoundsChange para o componente pai
  const fireBoundsChange = useCallback(() => {
    if (!mapRef.current) return
    const bounds = mapRef.current.getBounds()
    onBoundsChange({
      minLng: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLng: bounds.getEast(),
      maxLat: bounds.getNorth()
    })
  }, [onBoundsChange])

  // Inicializa o Mapbox
  useEffect(() => {
    let cancelled = false
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

    const initMap = async () => {
      if (cancelled || !mapContainerRef.current || !token) return

      try {
        let finalLat = initialLat
        let finalLng = initialLng

        // Geocoding reverso caso tenha endereço
        if (address && !address.startsWith(" - ") && address.length > 5) {
          try {
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&country=BR`
            const res = await fetch(geocodeUrl)
            const data = await res.json()
            if (data.features && data.features.length > 0) {
              [finalLng, finalLat] = data.features[0].center
            }
          } catch (err) {
            console.warn("Geocoding failed:", err)
          }
        }

        // Carrega assets do mapbox
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

        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: [finalLng, finalLat],
          zoom: 14,
          attributionControl: false
        })

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
        mapRef.current = map

        map.on("load", () => {
          if (cancelled) return
          fireBoundsChange()

          // Listeners para requisições de bounds
          map.on("moveend", () => fireBoundsChange())
          map.on("zoomend", () => fireBoundsChange())
        })

      } catch (err) {
        console.error("Mapbox init err:", err)
        setIsMapping(false)
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
      }
    }
  }, [initialLat, initialLng, address, fireBoundsChange])

  // Gerencia marcadores reativamente sem recriar o mapa
  useEffect(() => {
    if (!mapRef.current || !(window as any).mapboxgl) return
    const mapboxgl = (window as any).mapboxgl

    // Guardar os IDs que vieram na nova request
    const currentIds = new Set(partners.map(p => p.id))

    // Remover markers que não voltaram no bounds
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    // Adiciona marcadores novos
    partners.forEach(partner => {
      if (!markersRef.current[partner.id]) {
        // Criar elemento de Marker DOM customizado
        const el = document.createElement("div")
        el.className = "cursor-pointer group relative transition-transform duration-300 transform-gpu hover:scale-110 hover:z-50"
        el.style.width = "48px"
        el.style.height = "60px"

        const imageUrl = partner.store_image_url ? getR2ImageUrl(partner.store_image_url) : "https://img.dudit.com.br/static/Placeholder.png"

        el.innerHTML = `
          <div class="relative w-full h-full flex items-center justify-center flex-col origin-bottom">
            <!-- Imagem de Fundo (o seu Pointer.png) -->
            <img src="${CUSTOM_POINTER_IMG}" alt="Pointer" class="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-md" />
            
            <!-- Imagem do parceiro (No centro) -->
            <div class="absolute top-[6px] left-1/2 -translate-x-1/2 w-[34px] h-[34px] rounded-full overflow-hidden bg-white border border-transparent">
               <img src="${imageUrl}" class="w-full h-full object-cover pointer-events-none" />
            </div>
          </div>
        `

        el.addEventListener("click", () => {
          onMarkerClick(partner)
        })

        const markerInstance = new mapboxgl.Marker({ element: el, anchor: "bottom", pitchAlignment: "map" })
          .setLngLat([partner.longitude, partner.latitude])
          .addTo(mapRef.current)

        markersRef.current[partner.id] = markerInstance
      }
    })

    // Highlight visual no marker active
    Object.keys(markersRef.current).forEach(id => {
      const markerEl = markersRef.current[id].getElement()
      if (id === activePartnerId) {
        markerEl.style.zIndex = "100"
        markerEl.classList.add("scale-110")
        markerEl.querySelector('.rounded-full')?.classList.add("border-brand-green", "border-2")
        // Pan to marker
        const p = partners.find(p => p.id === id)
        if (p) {
            mapRef.current.flyTo({ center: [p.longitude, p.latitude], zoom: Math.max(mapRef.current.getZoom(), 15), speed: 1.2 })
        }
      } else {
        markerEl.style.zIndex = ""
        markerEl.classList.remove("scale-110")
        markerEl.querySelector('.rounded-full')?.classList.remove("border-brand-green", "border-2")
      }
    })

  }, [partners, activePartnerId, onMarkerClick])

  if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || !isMapping) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <span className="text-brand-inactive-text text-sm">Mapa indisponível.</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative z-0">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
