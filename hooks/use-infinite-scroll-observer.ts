"use client"

import { useEffect, useRef } from "react"

export type UseInfiniteScrollObserverOptions = {
  enabled?: boolean
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage: () => void | Promise<unknown>
  /**
   * Preload earlier by increasing rootMargin (e.g. "320px").
   */
  rootMargin?: string
  threshold?: number
}

/**
 * Shared IntersectionObserver for infinite scroll.
 * Guards against double-fire by using an internal "in flight" ref and `isFetchingNextPage`.
 */
export function useInfiniteScrollObserver(
  targetRef: React.RefObject<Element | null>,
  options: UseInfiniteScrollObserverOptions,
) {
  const inFlightRef = useRef(false)

  const {
    enabled = true,
    hasNextPage = false,
    isFetchingNextPage = false,
    fetchNextPage,
    rootMargin = "320px",
    threshold = 0,
  } = options

  useEffect(() => {
    if (!enabled) return
    if (!hasNextPage) return
    const el = targetRef.current
    if (!el) return

    // Reset local gate when outer fetching state is idle.
    if (!isFetchingNextPage) inFlightRef.current = false

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) return
        if (inFlightRef.current) return
        if (isFetchingNextPage) return

        inFlightRef.current = true
        void Promise.resolve(fetchNextPage()).finally(() => {
          inFlightRef.current = false
        })
      },
      { rootMargin, threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin, threshold, targetRef])
}

