"use client"

import React, { createContext, useContext, useState, useCallback, useRef, useMemo, type FC, type ReactNode } from "react"
import { getProductMetadataAction } from "@/app/actions/erp/product-metadata"

interface MetadataState {
    categories: any[]
    brands: any[]
    locations: any[]
}

interface MetadataContextValue {
    metadata: MetadataState
    isLoading: boolean
    /** Loads metadata if not already cached. Subsequent calls are no-ops unless force=true. */
    loadMetadata: (partnerId: string, force?: boolean) => Promise<void>
    /** Forces a fresh fetch from the server */
    refreshMetadata: (partnerId: string) => Promise<void>
}

const EMPTY_METADATA: MetadataState = { categories: [], brands: [], locations: [] }

const MetadataContext = createContext<MetadataContextValue>({
    metadata: EMPTY_METADATA,
    isLoading: false,
    loadMetadata: async () => {},
    refreshMetadata: async () => {},
})

export const useProductMetadata = () => useContext(MetadataContext)

interface ProductMetadataProviderProps {
    children: ReactNode
    /** Override da action de leitura (ex.: ação admin com service role). */
    loadAction?: (partnerId: string) => Promise<{ success?: boolean; data?: MetadataState; error?: string }>
}

export const ProductMetadataProvider: FC<ProductMetadataProviderProps> = ({ children, loadAction }) => {
    const [metadata, setMetadata] = useState<MetadataState>(EMPTY_METADATA)
    const [isLoading, setIsLoading] = useState(false)
    const loadedForPartnerRef = useRef<string | null>(null)
    const hasDataRef = useRef(false)

    const fetchMetadata = useCallback(async (partnerId: string) => {
        setIsLoading(true)
        try {
            const result = loadAction ? await loadAction(partnerId) : await getProductMetadataAction(partnerId)
            if (result.success && result.data) {
                setMetadata(result.data)
                loadedForPartnerRef.current = partnerId
                hasDataRef.current = true
            }
        } catch (err) {
            console.error("[MetadataContext] Error fetching metadata:", err)
        } finally {
            setIsLoading(false)
        }
    }, [loadAction])

    const loadMetadata = useCallback(async (partnerId: string, force = false) => {
        // Skip if already loaded for this partner (quasi-static data)
        if (!force && loadedForPartnerRef.current === partnerId && hasDataRef.current) {
            return
        }
        await fetchMetadata(partnerId)
    }, [fetchMetadata])

    const refreshMetadata = useCallback(async (partnerId: string) => {
        await fetchMetadata(partnerId)
    }, [fetchMetadata])

    return (
        <MetadataContext.Provider value={useMemo(() => ({ metadata, isLoading, loadMetadata, refreshMetadata }), [metadata, isLoading, loadMetadata, refreshMetadata])}>
            {children}
        </MetadataContext.Provider>
    )
}
