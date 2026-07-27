"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

interface Store {
  id: string
  partner_id: string
  name: string
  slug: string | null
  description: string | null
  phone: string | null
  city?: string | null
  state?: string | null
  opening_hours: Record<string, unknown> | null
  banner_url: string | null
  logo_url: string | null
  gallery: unknown[] | null
  image_url?: string | null
  whatsapp_phone?: string | null
  is_headquarters: boolean
  is_active: boolean
  business_type: string | null
  cnpj: string | null
  cpf: string | null
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
  hasError: boolean
  selectStore: (storeId: string) => void
  refreshStores: () => Promise<void>
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({
  children,
  partnerId: propPartnerId,
  activeStoreId: propActiveStoreId,
}: {
  children: React.ReactNode
  partnerId?: string
  activeStoreId?: string | null
}) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const router = useRouter()
  const [partnerId, setPartnerId] = useState<string | null>(propPartnerId || null)
  const hasSyncedCookie = useRef(false)

  useEffect(() => {
    const cached = localStorage.getItem("cachedStores")
    const cachedTime = localStorage.getItem("cachedStoresTimestamp")
    const cachedSelected = localStorage.getItem("selectedStoreId")

    // M3: Invalidate cache after 5 minutes
    const isCacheValid = cachedTime && (Date.now() - Number(cachedTime)) < 5 * 60 * 1000

    if (cached && cachedSelected && isCacheValid) {
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
      let data: Store[] = []
      try {
        const { listStoresAction } = await import("@/app/actions/erp/stores")
        data = (await listStoresAction(partnerId)) as Store[]
      } catch {
        const { data: resData, error } = await supabase
          .from("stores")
          .select("*, addresses!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: true })
        if (error) throw error
        data = (resData || []) as Store[]
      }

      setHasError(false)
      setStores(data || [])
      if (data && data.length > 0) {
        localStorage.setItem("cachedStores", JSON.stringify(data))
        localStorage.setItem("cachedStoresTimestamp", String(Date.now()))
      }

      const savedStoreId = localStorage.getItem("selectedStoreId")

      if (propActiveStoreId && data?.find((s: any) => s.id === propActiveStoreId)) {
        setSelectedStore(data.find((s: any) => s.id === propActiveStoreId) || null)
        localStorage.setItem("selectedStoreId", propActiveStoreId)
      } else if (savedStoreId && data?.find((s: any) => s.id === savedStoreId)) {
        setSelectedStore(data.find((s: any) => s.id === savedStoreId) || null)
      } else if (data && data.length > 0) {
        setSelectedStore(data[0])
        localStorage.setItem("selectedStoreId", data[0].id)
      } else {
        setSelectedStore(null)
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [partnerId, propActiveStoreId])

  useEffect(() => {
    fetchStores()
  }, [partnerId, fetchStores])

  const queryClient = useQueryClient()

  const selectStore = (storeId: string) => {
    const store = stores.find((s) => s.id === storeId)
    if (store) {
      setSelectedStore(store)
      localStorage.setItem("selectedStoreId", storeId)

      import("@/app/actions/erp/stores").then(({ setActiveStoreAction }) => {
        setActiveStoreAction(storeId, store.partner_id).then(() => {
          queryClient.invalidateQueries()
          router.refresh()
        }).catch((e) => {
          console.warn("setActiveStoreAction failed", e)
          queryClient.invalidateQueries()
          router.refresh()
        })
      }).catch((e) => {
        console.warn("dynamic import stores failed", e)
        queryClient.invalidateQueries()
        router.refresh()
      })
    }
  }

  const refreshStores = async () => {
    await fetchStores()
  }

  const contextValue = useMemo(() => ({
    selectedStore,
    stores,
    isLoading,
    hasError,
    selectStore,
    refreshStores
  }), [selectedStore, stores, isLoading, hasError, selectStore])

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
