"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useQueryClient, useQuery, keepPreviousData, UseQueryOptions, UseQueryResult } from "@tanstack/react-query"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches
    }
    return false
  })

  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const listener = () => setMatches(media.matches)
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener)
      return () => media.removeEventListener("change", listener)
    } else if (typeof media.addListener === "function") {
      media.addListener(listener)
      return () => media.removeListener(listener)
    }
  }, [query])

  return matches
}

export function useDeliberatePrefetch(
  queryKey: any[], 
  queryFn: () => Promise<any>, 
  staleTime: number = 10000, 
  delayMs: number = 350
) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const onMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const state = queryClient.getQueryState(queryKey)
      
      // Cancel if already fetching to avoid duplicate concurrent requests
      if (state?.fetchStatus === 'fetching') return

      // Check freshness: if there's data and it's newer than staleTime, skip prefetch
      if (state?.data && state.dataUpdatedAt) {
        const age = Date.now() - state.dataUpdatedAt
        if (age < staleTime) return 
      }
      
      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime
      })
    }, delayMs) // Now defaults to 350ms for responsive but non-spammy UX
  }, [queryClient, queryKey, queryFn, staleTime, delayMs])

  const onMouseLeave = useCallback(() => {
    // If the timeout hasn't fired yet, cancel it. Protects against "swipe overs".
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { onMouseEnter, onMouseLeave }
}

export type DataPriority = 'live' | 'normal' | 'low'

const PRIORITY_CONFIG: Record<DataPriority, { staleTime: number; refetchOnWindowFocus: boolean; refetchOnMount: boolean }> = {
  live: { staleTime: 5000, refetchOnWindowFocus: true, refetchOnMount: true },
  normal: { staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: true },
  low: { staleTime: 120000, refetchOnWindowFocus: false, refetchOnMount: false },
}

export function useERPData<TData = any, TError = Error>(
  queryKey: any[], 
  queryFn: () => Promise<TData>, 
  options?: Omit<UseQueryOptions<TData, TError, TData, any[]>, 'queryKey' | 'queryFn'> & { priority?: DataPriority }
): UseQueryResult<TData, TError> {
  const { priority = 'normal', ...restOptions } = options || {}
  const config = PRIORITY_CONFIG[priority]

  return useQuery({
    queryKey,
    queryFn,
    staleTime: config.staleTime,
    refetchOnWindowFocus: config.refetchOnWindowFocus,
    refetchOnReconnect: true,
    refetchOnMount: config.refetchOnMount,
    placeholderData: keepPreviousData,
    ...restOptions
  })
}

// ─── PRODUCT BUCKET (instant client-side search) ────────────────────────────

export interface ProductBucketItem {
  id: string
  name: string
  sku: string
  gtin: string | null
  price: number
  stock: number
  allow_sell_without_stock?: boolean
  image: string | null
  has_variants: boolean
  addon_groups?: any[]
  variants?: Array<{
    id: string
    name: string
    sku: string
    price: number
    stock: number
    image?: string | null
  }>
  product_type?: string
  isService?: boolean
  is_service?: boolean
  promotional_price?: number | null
  category_id?: string | null
  fallback_variant_image?: string | null
}

export interface ProductBucketOptions {
  pageSize?: number
  /** Preloads the bucket on mount so the first search is instant. Defaults to true. */
  preload?: boolean
  /** Returns the whole bucket while the query is empty (useful for picker modals). */
  showAllWhenEmpty?: boolean
}

function normalizeBucketSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function getBucketVariants(item: any): any[] {
  if (Array.isArray(item?.variants)) return item.variants
  if (Array.isArray(item?.product_variants)) return item.product_variants
  return []
}

/**
 * Hook that loads ALL partner products ahead of time and filters them instantly
 * on the client. Eliminates the slow debounced server roundtrip.
 *
 * Pattern: preload on mount → filter with useMemo (name/SKU/GTIN/variant SKU) → instant results
 */
export function useProductBucket<T extends { name: string; sku?: string; gtin?: string | null }>(
  loadFn: () => Promise<T[]>,
  options?: ProductBucketOptions
) {
  const pageSize = options?.pageSize ?? 10
  const preload = options?.preload ?? true
  const showAllWhenEmpty = options?.showAllWhenEmpty ?? false
  const [bucket, setBucket] = useState<T[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const loadBucket = useCallback(async () => {
    if (isLoaded || isLoading) return
    setIsLoading(true)
    try {
      const data = await loadFn()
      setBucket(data)
      setIsLoaded(true)
      setHasError(false)
    } catch (err) {
      setHasError(true)
      console.error("[useProductBucket] Error loading bucket:", err)
    } finally {
      setIsLoading(false)
    }
  }, [loadFn, isLoaded, isLoading])

  useEffect(() => {
    if (preload && !hasError) void loadBucket()
  }, [preload, hasError, loadBucket])

  const searchIndex = useMemo(
    () => bucket.map((item) => {
      const variants = getBucketVariants(item)
      const searchable = [
        item.name,
        item.sku,
        item.gtin,
        ...variants.flatMap((variant: any) => [
          variant?.name,
          variant?.variant_name,
          variant?.sku,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
      return { item, text: normalizeBucketSearch(searchable) }
    }),
    [bucket]
  )

  const filtered = useMemo(() => {
    const search = normalizeBucketSearch(searchQuery)
    if (!search) return showAllWhenEmpty ? bucket : []
    return searchIndex
      .filter((entry) => entry.text.includes(search))
      .map((entry) => entry.item)
  }, [bucket, searchIndex, searchQuery, showAllWhenEmpty])

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [searchQuery, pageSize])

  const filteredResults = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = filtered.length > visibleCount
  const loadMore = useCallback(() => {
    setVisibleCount((c) => c + pageSize)
  }, [pageSize])

  return {
    searchQuery,
    setSearchQuery,
    filteredResults,
    isLoading: isLoading && !isLoaded,
    isLoaded,
    loadBucket,
    bucket,
    hasMore,
    loadMore,
  }
}

// ─── COUPON BUCKET (instant client-side search) ─────────────────────────────

export type CouponBucketItem = {
  id: string
  code: string
  discount_type: string
  discount_value: number | null
  is_active: boolean
  is_automatic?: boolean
}

export function useCouponBucket(loadFn: () => Promise<CouponBucketItem[]>) {
  const [bucket, setBucket] = useState<CouponBucketItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const loadBucket = useCallback(async () => {
    if (isLoaded || isLoading) return
    setIsLoading(true)
    try {
      const data = await loadFn()
      setBucket(data)
      setIsLoaded(true)
    } catch (err) {
      console.error("[useCouponBucket] Error loading bucket:", err)
    } finally {
      setIsLoading(false)
    }
  }, [loadFn, isLoaded, isLoading])

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const search = searchQuery.toLowerCase().trim()
    return bucket
      .filter((c) => c.code.toLowerCase().includes(search))
      .slice(0, 12)
  }, [bucket, searchQuery])

  return {
    searchQuery,
    setSearchQuery,
    filteredResults,
    isLoading: isLoading && !isLoaded,
    isLoaded,
    loadBucket,
  }
}

// ─── PICKER BUCKET (cache once + filtro local + paginação por fatias) ───────

export type PickerBucketOptions<T extends { id: string }> = {
  pageSize?: number
  /** Reordena / injeta itens após o filtro de busca (ex.: cliente selecionado primeiro). */
  postFilter?: (items: T[]) => T[]
  /** Quando muda, volta a mostrar só a primeira página. */
  resetPagingKey?: string
}

/**
 * Carrega a lista uma vez, filtra no cliente (rápido) e pagina de N em N para scroll infinito.
 */
export function usePickerBucket<T extends { id: string }>(
  loadFn: () => Promise<T[]>,
  matchesSearch: (item: T, searchLower: string) => boolean,
  options?: PickerBucketOptions<T>
) {
  const pageSize = options?.pageSize ?? 10
  const postFilter = options?.postFilter
  const resetPagingKey = options?.resetPagingKey

  const [bucket, setBucket] = useState<T[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const loadBucket = useCallback(async (force = false) => {
    if ((isLoaded && !force) || isLoading) return
    setIsLoading(true)
    try {
      const data = await loadFn()
      setBucket(data)
      setIsLoaded(true)
    } catch (err) {
      console.error("[usePickerBucket] Error loading bucket:", err)
    } finally {
      setIsLoading(false)
    }
  }, [loadFn, isLoaded, isLoading])

  const prependItem = useCallback((item: T) => {
    setBucket((prev) => {
      const filtered = prev.filter((i) => i.id !== item.id)
      return [item, ...filtered]
    })
  }, [])

  const updateBucket = useCallback((updater: (prev: T[]) => T[]) => {
    setBucket(updater)
  }, [])

  const baseFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return bucket
    return bucket.filter((item) => matchesSearch(item, q))
  }, [bucket, searchQuery, matchesSearch])

  const filtered = useMemo(() => {
    if (!postFilter) return baseFiltered
    return postFilter(baseFiltered)
  }, [baseFiltered, postFilter])

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [searchQuery, pageSize, resetPagingKey])

  const displayed = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  const hasMore = filtered.length > visibleCount

  const loadMore = useCallback(() => {
    setVisibleCount((c) => c + pageSize)
  }, [pageSize])

  return {
    loadBucket,
    prependItem,
    updateBucket,
    searchQuery,
    setSearchQuery,
    filtered,
    displayed,
    hasMore,
    loadMore,
    isLoadingBucket: isLoading && !isLoaded,
    isLoaded,
    totalInBucket: bucket.length,
    bucket,
  }
}
