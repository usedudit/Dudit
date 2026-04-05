"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQueryClient, useQuery, UseQueryOptions, UseQueryResult } from "@tanstack/react-query"

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
    staleTime: isCritical ? 3000 : 15000, // Shorter stale time for critical data (3s) vs normal lists (15s)
    refetchOnWindowFocus: true, // Silently refetches when user returns to app
    refetchOnReconnect: true,
    // Critical data always triggers a background refetch on mount, while UI immediately shows cached data.
    // Non-critical data trusts the default 'true' behavior (only refetches if stale).
    refetchOnMount: isCritical ? 'always' : true,
    ...restOptions
  })
}
