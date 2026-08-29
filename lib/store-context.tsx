"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

interface Store {
  id: string
  short_id?: string | null
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
  person_type: string | null
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

function getStoreStorageKey(name: string, partnerId: string | null) {
  return `${name}:${partnerId || "unknown"}`
}

export function StoreProvider({
  children,
  partnerId: propPartnerId,
  activeStoreId: propActiveStoreId,
  initialStores,
}: {
  children: React.ReactNode
  partnerId?: string
  activeStoreId?: string | null
  initialStores?: Store[]
}) {
  // When the ERP layout supplies initialStores, it has already performed the
  // authenticated/authorized server fetch. Treat even an empty array as a
  // valid snapshot so the provider does not immediately fetch the same data
  // again after hydration.
  const hasInitialStores = initialStores !== undefined
  const initialStoreList = initialStores ?? []

  const initialSelected = useMemo(() => {
    if (initialStoreList.length > 0) {
      if (propActiveStoreId) {
        const found = initialStoreList.find((s) => s.id === propActiveStoreId)
        if (found) return found
      }
      return initialStoreList[0]
    }
    return null
  }, [initialStoreList, propActiveStoreId])

  const [selectedStore, setSelectedStore] = useState<Store | null>(initialSelected)
  const [stores, setStores] = useState<Store[]>(initialStoreList)
  const [isLoading, setIsLoading] = useState(!hasInitialStores)
  const [hasError, setHasError] = useState(false)
  const router = useRouter()
  const [partnerId, setPartnerId] = useState<string | null>(propPartnerId || null)

  useEffect(() => {
    if (hasInitialStores) return
    if (!partnerId) return

    const cached = localStorage.getItem(getStoreStorageKey("cachedStores", partnerId))
    const cachedTime = localStorage.getItem(getStoreStorageKey("cachedStoresTimestamp", partnerId))
    const cachedSelected = localStorage.getItem(getStoreStorageKey("selectedStoreId", partnerId))

    // M3: Invalidate cache after 5 minutes
    const isCacheValid = cachedTime && (Date.now() - Number(cachedTime)) < 5 * 60 * 1000

    if (cached && cachedSelected && isCacheValid) {
      try {
        const parsedStores = JSON.parse(cached)
        const selected = parsedStores.find((s: Store) => s.id === cachedSelected)
        if (selected) {
          setStores(parsedStores)
          setSelectedStore(selected)
          setIsLoading(false)
        }
      } catch (e) {
        console.error("Error loading cached stores:", e)
      }
    }
  }, [hasInitialStores, partnerId])

  useEffect(() => {
    if (propPartnerId && propPartnerId !== partnerId) {
      setPartnerId(propPartnerId)
    }
  }, [propPartnerId, partnerId])

  // Sync propActiveStoreId or initialStores when props change from SSR
  useEffect(() => {
    if (hasInitialStores) {
      setStores(initialStoreList)
      const selectedStoreKey = getStoreStorageKey("selectedStoreId", partnerId)
      const savedStoreId = typeof window !== "undefined" ? localStorage.getItem(selectedStoreKey) : null
      const targetId = savedStoreId || propActiveStoreId

      if (targetId && initialStoreList.some((s) => s.id === targetId)) {
        const found = initialStoreList.find((s) => s.id === targetId)
        if (found) {
          setSelectedStore(found)
        }
      } else if (!selectedStore || !initialStoreList.some((s) => s.id === selectedStore.id)) {
        const firstStore = initialStoreList[0] || null
        setSelectedStore(firstStore)
        if (typeof window !== "undefined" && firstStore) {
          localStorage.setItem(selectedStoreKey, firstStore.id)
        }
      }
      setIsLoading(false)
    }
  }, [hasInitialStores, initialStoreList, propActiveStoreId, partnerId, selectedStore])

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
          .select("*, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: true })
        if (error) throw error
        data = (resData || []) as Store[]
      }

      setHasError(false)
      setStores(data || [])
      const selectedStoreKey = getStoreStorageKey("selectedStoreId", partnerId)
      const cachedStoresKey = getStoreStorageKey("cachedStores", partnerId)
      const cachedStoresTimestampKey = getStoreStorageKey("cachedStoresTimestamp", partnerId)
      if (data && data.length > 0) {
        localStorage.setItem(cachedStoresKey, JSON.stringify(data))
        localStorage.setItem(cachedStoresTimestampKey, String(Date.now()))
      }

      const savedStoreId = localStorage.getItem(selectedStoreKey)

      if (savedStoreId && data?.find((s: any) => s.id === savedStoreId)) {
        setSelectedStore(data.find((s: any) => s.id === savedStoreId) || null)
      } else if (propActiveStoreId && data?.find((s: any) => s.id === propActiveStoreId)) {
        setSelectedStore(data.find((s: any) => s.id === propActiveStoreId) || null)
        localStorage.setItem(selectedStoreKey, propActiveStoreId)
      } else if (data && data.length > 0) {
        setSelectedStore(data[0])
        localStorage.setItem(selectedStoreKey, data[0].id)
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
    if (!hasInitialStores) {
      fetchStores()
    }
  }, [hasInitialStores, partnerId, fetchStores])

  const storeChangeInFlight = useRef<string | null>(null)

  const selectStore = (storeId: string) => {
    if (stores.length <= 1) return
    const store = stores.find((s) => s.id === storeId)
    if (store && selectedStore?.id !== storeId && storeChangeInFlight.current !== storeId) {
      storeChangeInFlight.current = storeId
      setSelectedStore(store)
      localStorage.setItem(getStoreStorageKey("selectedStoreId", store.partner_id), storeId)

      import("@/app/actions/erp/stores").then(({ setActiveStoreAction }) => {
        return setActiveStoreAction(storeId, store.partner_id).then(() => {
          if (typeof window !== "undefined") {
            window.location.reload()
          } else {
            router.refresh()
          }
        }).catch((e) => {
          console.warn("setActiveStoreAction failed", e)
          if (typeof window !== "undefined") {
            window.location.reload()
          } else {
            router.refresh()
          }
        })
      }).catch((e) => {
        console.warn("dynamic import stores failed", e)
        if (typeof window !== "undefined") {
          window.location.reload()
        } else {
          router.refresh()
        }
      }).finally(() => {
        if (storeChangeInFlight.current === storeId) {
          storeChangeInFlight.current = null
        }
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
