"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { OptimizedMapbox } from "./OptimizedMapbox"
import { PartnerBottomSheet } from "./PartnerBottomSheet"
import { getPartnersInBoundsAction, BoundingBox } from "@/app/actions/marketplace/map"
import { Search } from "lucide-react"

interface MapPageClientProps {
  initialUserLocation?: string | null
}

export function MapPageClient({ initialUserLocation }: MapPageClientProps) {
  const [partners, setPartners] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activePartner, setActivePartner] = useState<any | null>(null)
  
  // Ref para guardar o timeout do debounce e evitar fetch em cascata
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchPartners = useCallback(async (bounds: BoundingBox) => {
    setIsLoading(true)
    
    // Server action
    const { success, data } = await getPartnersInBoundsAction(bounds, 150)
    
    if (success && data) {
      setPartners(data)
    }
    
    setIsLoading(false)
  }, [])

  const handleBoundsChange = useCallback((bounds: BoundingBox) => {
    // Limpa o timer anterior se existir
    if (debounceRef.current) clearTimeout(debounceRef.current)
    
    // Debounce de 350ms antes de disparar a query de bounding box
    debounceRef.current = setTimeout(() => {
      fetchPartners(bounds)
    }, 350)

  }, [fetchPartners])

  const handleMarkerClick = useCallback((partner: any) => {
    setActivePartner(partner)
  }, [])

  return (
    <div className="relative w-full h-full flex flex-col lg:flex-row">
      
      {/* Search Header Overlay */}
      <div className="absolute top-4 left-4 right-4 lg:w-[400px] lg:right-auto z-10 pointer-events-none">
        <div className="bg-white/95 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] rounded-full h-14 flex items-center px-5 pointer-events-auto border border-gray-100">
          <Search size={20} className="text-brand-inactive-text mr-3" />
          <div className="flex flex-col flex-1 pl-1 border-l border-gray-100/50">
            <span className="text-[13px] font-semibold text-brand-dark leading-tight">{initialUserLocation || "Qualquer lugar"}</span>
            <span className="text-[11px] text-gray-500 font-medium">Lojas, restaurantes e serviços</span>
          </div>
        </div>
        
        <div className="mt-3 flex gap-2 w-full overflow-x-auto no-scrollbar pointer-events-auto pb-2">
            {["Lojas", "Alimentação", "Serviços"].map(tag => (
              <button key={tag} className="bg-white hover:bg-brand-gray transition-colors border border-gray-200 px-4 py-1.5 rounded-full text-[13px] font-medium text-brand-dark shrink-0 whitespace-nowrap shadow-sm">
                {tag}
              </button>
            ))}
        </div>
      </div>

      {/* Area do mapa do Mapbox (Full Width) */}
      <div className="w-full h-full lg:flex-1 relative z-0">
        <OptimizedMapbox 
           address={initialUserLocation}
           partners={partners}
           onBoundsChange={handleBoundsChange}
           onMarkerClick={handleMarkerClick}
           activePartnerId={activePartner?.id}
        />

        {/* Loading overlay discreto tipo Airbnb */}
        {isLoading && (
          <div className="absolute top-[88px] lg:top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md z-30 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
            <span className="text-[12px] font-semibold text-brand-dark">Buscando nesta área...</span>
          </div>
        )}
      </div>

      {/* Floating Card para Parceiro Ativo (Mobile Bottom, Desktop Overlay) */}
      {activePartner && (
        <div className="absolute bottom-0 w-full lg:w-auto z-50 pointer-events-none">
          <div className="pointer-events-auto w-full w-full-container">
            <PartnerBottomSheet
              partner={activePartner}
              onClose={() => setActivePartner(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
