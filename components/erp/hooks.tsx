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

export function useDeliberatePrefetch(queryKey: any[], queryFn: () => Promise<any>, staleTime: number = 10000) {
  const queryClient = useQueryClient()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const onMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const state = queryClient.getQueryState(queryKey)
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
    }, 1000) // Deliberate 1s hover
  }, [queryClient, queryKey, queryFn, staleTime])

  const onMouseLeave = useCallback(() => {
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
  options?: Omit<UseQueryOptions<TData, TError, TData, any[]>, 'queryKey' | 'queryFn'>
): UseQueryResult<TData, TError> {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: 10000, // Default 10s for ERP lists
    refetchOnWindowFocus: true, // Critical for ERP
    ...options
  })
}
