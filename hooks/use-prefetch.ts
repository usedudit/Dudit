"use client"

import { useCallback, useRef, useEffect } from "react"

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsePrefetchOptions {
    /** Function to call when prefetch is triggered */
    prefetchFn: () => void
    /** Whether prefetch is enabled. Default: true */
    enabled?: boolean
    /** Hover debounce delay in ms. Default: 150 */
    hoverDelay?: number
}

export interface PrefetchProps {
    onMouseEnter: () => void
    onMouseLeave: () => void
    onTouchStart: () => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns event handlers for triggering prefetch on hover (debounced) and touch.
 *
 * Usage:
 * ```tsx
 * const prefetch = usePrefetch({
 *   prefetchFn: () => cache.prefetchEntity(product.id),
 * })
 *
 * <div {...prefetch}>...</div>
 * // or
 * <div onMouseEnter={prefetch.onMouseEnter} onMouseLeave={prefetch.onMouseLeave} onTouchStart={prefetch.onTouchStart}>
 * ```
 */
export function usePrefetch(options: UsePrefetchOptions): PrefetchProps {
    const { prefetchFn, enabled = true, hoverDelay = 150 } = options
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hasPrefetchedRef = useRef(false)

    // Reset prefetched flag when prefetchFn changes (entity ID changed)
    useEffect(() => {
        hasPrefetchedRef.current = false
    }, [prefetchFn])

    const doPrefetch = useCallback(() => {
        if (!enabled || hasPrefetchedRef.current) return
        hasPrefetchedRef.current = true
        prefetchFn()
    }, [enabled, prefetchFn])

    const onMouseEnter = useCallback(() => {
        if (!enabled || hasPrefetchedRef.current) return
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(doPrefetch, hoverDelay)
    }, [enabled, doPrefetch, hoverDelay])

    const onMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
    }, [])

    const onTouchStart = useCallback(() => {
        doPrefetch()
    }, [doPrefetch])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        }
    }, [])

    return { onMouseEnter, onMouseLeave, onTouchStart }
}

/**
 * Factory that creates prefetch props for a specific entity ID.
 * Used to avoid creating N hook instances in a list — instead creates lightweight handlers.
 *
 * Usage:
 * ```tsx
 * const getPrefetchProps = createPrefetchPropsFactory(cache.prefetchEntity)
 * // In render:
 * <ProductGridCard {...getPrefetchProps(product.id)} />
 * ```
 */
export function createPrefetchPropsFactory(
    prefetchEntity: (id: string) => void,
    hoverDelay = 150,
): (id: string) => PrefetchProps {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const prefetched = new Set<string>()

    return (id: string): PrefetchProps => ({
        onMouseEnter: () => {
            if (prefetched.has(id)) return
            const existing = timers.get(id)
            if (existing) clearTimeout(existing)
            timers.set(
                id,
                setTimeout(() => {
                    prefetched.add(id)
                    timers.delete(id)
                    prefetchEntity(id)
                }, hoverDelay),
            )
        },
        onMouseLeave: () => {
            const timer = timers.get(id)
            if (timer) {
                clearTimeout(timer)
                timers.delete(id)
            }
        },
        onTouchStart: () => {
            if (prefetched.has(id)) return
            prefetched.add(id)
            prefetchEntity(id)
        },
    })
}
