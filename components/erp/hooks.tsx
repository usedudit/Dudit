"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useQueryClient, useQuery, keepPreviousData, UseQueryOptions, UseQueryResult } from "@tanstack/react-query"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    if (media.matches !== matches) {
      setMatches(media.matches)
    }
    const listener = () => setMatches(media.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [matches, query])

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

export function useERPData<TData = any, TError = Error>(
  queryKey: any[], 
  queryFn: () => Promise<TData>, 
  options?: Omit<UseQueryOptions<TData, TError, TData, any[]>, 'queryKey' | 'queryFn'> & { isCritical?: boolean }
): UseQueryResult<TData, TError> {
  const { isCritical = false, ...restOptions } = options || {}

  return useQuery({
    queryKey,
    queryFn,
    staleTime: isCritical ? 3000 : 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: isCritical ? 'always' : true,
    // Keep showing previous data during background refetch to avoid loading flash
    placeholderData: keepPreviousData,
    ...restOptions
  })
}

// ─── PRODUCT BUCKET (instant client-side search) ────────────────────────────

export interface ProductBucketItem {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  allow_sell_without_stock?: boolean
  image: string | null
  has_variants: boolean
  variants?: Array<{
    id: string
    name: string
    sku: string
    price: number
    stock: number
    image?: string | null
  }>
}

/**
 * Hook that loads ALL partner products on first interaction and filters them
 * instantly on the client. Eliminates the slow debounced server roundtrip.
 * 
 * Pattern: loads bucket on first focus → filters with useMemo → instant results
 */
export function useProductBucket(loadFn: () => Promise<ProductBucketItem[]>) {
  const [bucket, setBucket] = useState<ProductBucketItem[]>([])
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
      console.error("[useProductBucket] Error loading bucket:", err)
    } finally {
      setIsLoading(false)
    }
  }, [loadFn, isLoaded, isLoading])

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const search = searchQuery.toLowerCase().trim()
    return bucket
      .filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.sku.toLowerCase().includes(search)
      )
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
  const pageSize = options?.pageSize ?? 8
  const postFilter = options?.postFilter
  const resetPagingKey = options?.resetPagingKey

  const [bucket, setBucket] = useState<T[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const loadBucket = useCallback(async () => {
    if (isLoaded || isLoading) return
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
    searchQuery,
    setSearchQuery,
    filtered,
    displayed,
    hasMore,
    loadMore,
    isLoadingBucket: isLoading && !isLoaded,
    isLoaded,
    totalInBucket: bucket.length,
  }
}
