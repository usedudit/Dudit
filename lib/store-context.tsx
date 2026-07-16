"use client"

import type React from "react"

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

interface Store {
  id: string
  partner_id: string
  name: string
  slug: string | null
  description: string | null
  phone: string | null
  city: string | null
  state: string | null
  opening_hours: Record<string, unknown> | null
  banner_url: string | null
  logo_url: string | null
  gallery: unknown[] | null
  image_url: string | null
  whatsapp_phone: string | null
  is_headquarters: boolean
  is_active: boolean
  address_id: string | null
  crt: string | null
  contribuinte: string | null
  inscricao_estadual: string | null
  ie_isento: boolean | null
  inscricao_municipal: string | null
  created_at: string
  updated_at: string
}

interface StoreContextType {
  selectedStore: Store | null
  stores: Store[]
  isLoading: boolean
  selectStore: (storeId: string) => void
  refreshStores: () => Promise<void>
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children, partnerId: propPartnerId }: { children: React.ReactNode; partnerId?: string }) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [partnerId, setPartnerId] = useState<string | null>(propPartnerId || null)
  // supabase singleton imported directly

  useEffect(() => {
    const cached = localStorage.getItem("cachedStores")
    const cachedSelected = localStorage.getItem("selectedStoreId")
    if (cached && cachedSelected) {
      try {
        const parsedStores = JSON.parse(cached)
        const selected = parsedStores.find((s: Store) => s.id === cachedSelected)
        if (selected) {
          setStores(parsedStores)
          setSelectedStore(selected)
        }
      } catch (e) {
        console.error("Error loading cached stores:", e)
      }
    }
  }, [])

  // Sync propPartnerId when it changes (e.g. user switches ERPs without a full page reload)
  useEffect(() => {
    if (propPartnerId && propPartnerId !== partnerId) {
      setPartnerId(propPartnerId)
    }
  }, [propPartnerId, partnerId])

  const fetchStores = useCallback(async () => {
    if (!partnerId) {
      setIsLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: true })

      if (error) throw error

      setStores(data || [])
      localStorage.setItem("cachedStores", JSON.stringify(data || []))

      const savedStoreId = localStorage.getItem("selectedStoreId")
      if (savedStoreId && data?.find((s: any) => s.id === savedStoreId)) {
        setSelectedStore(data.find((s: any) => s.id === savedStoreId) || null)
      } else if (data && data.length > 0) {
        setSelectedStore(data[0])
        localStorage.setItem("selectedStoreId", data[0].id)
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    } finally {
      setIsLoading(false)
    }
    // supabase ref is stable via useRef - no need to include it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId])

  useEffect(() => {
    fetchStores()
  }, [partnerId, fetchStores])

  const selectStore = (storeId: string) => {
    const store = stores.find((s) => s.id === storeId)
    if (store) {
      setSelectedStore(store)
      localStorage.setItem("selectedStoreId", storeId)
    }
  }

  const refreshStores = async () => {
    await fetchStores()
  }

  const contextValue = useMemo(() => ({
    selectedStore,
    stores,
    isLoading,
    selectStore,
    refreshStores
  }), [selectedStore, stores, isLoading, selectStore])

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error("useStore deve ser usado dentro de um StoreProvider")
  }
  return context
}
