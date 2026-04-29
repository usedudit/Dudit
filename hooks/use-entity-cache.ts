"use client"

import { useCallback, useRef, useSyncExternalStore } from "react"
import { useQueryClient } from "@tanstack/react-query"

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
    data: T
    timestamp: number
}

export interface UseEntityCacheOptions<TListItem, TDetail> {
    /** Unique entity type key, e.g. 'products', 'services' */
    entityType: string
    /** Partner scope */
    partnerId: string
    /** Server action that fetches full entity detail */
    getDetailFn: (id: string) => Promise<TDetail | null>
    /** Map a list item to a partial detail (used to pre-populate cache from list data) */
    listToDetail?: (item: TListItem) => Partial<TDetail>
    /** How long cached data is considered fresh (ms). Default: 60000 */
    staleTime?: number
    /** React Query key prefix for list invalidation */
    listQueryKey?: readonly unknown[]
}

// ── Global cache stores (shared across hook instances) ───────────────────────

// Per entity-type + partner, a Map of id → cached data
const globalCaches = new Map<string, Map<string, CacheEntry<any>>>()
// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<any>>()
// Subscriber notification for useSyncExternalStore
const subscribers = new Map<string, Set<() => void>>()

function getCacheKey(entityType: string, partnerId: string) {
    return `${entityType}:${partnerId}`
}

function getEntityCacheMap(cacheKey: string): Map<string, CacheEntry<any>> {
    let map = globalCaches.get(cacheKey)
    if (!map) {
        map = new Map()
        globalCaches.set(cacheKey, map)
    }
    return map
}

function notifySubscribers(cacheKey: string) {
    const subs = subscribers.get(cacheKey)
    if (subs) subs.forEach((fn) => fn())
}

function subscribe(cacheKey: string, callback: () => void) {
    let subs = subscribers.get(cacheKey)
    if (!subs) {
        subs = new Set()
        subscribers.set(cacheKey, subs)
    }
    subs.add(callback)
    return () => {
        subs!.delete(callback)
        if (subs!.size === 0) subscribers.delete(cacheKey)
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEntityCache<TListItem extends { id: string }, TDetail extends { id: string }>(
    options: UseEntityCacheOptions<TListItem, TDetail>,
) {
    const {
        entityType,
        partnerId,
        getDetailFn,
        listToDetail,
        staleTime = 60_000,
        listQueryKey,
    } = options

    const queryClient = useQueryClient()
    const cacheKey = getCacheKey(entityType, partnerId)
    const cacheMap = getEntityCacheMap(cacheKey)

    // Snapshot for useSyncExternalStore — changes when cache is mutated
    const versionRef = useRef(0)
    const getSnapshot = useCallback(() => versionRef.current, [])
    const subscribeFn = useCallback(
        (cb: () => void) => subscribe(cacheKey, cb),
        [cacheKey],
    )
    useSyncExternalStore(subscribeFn, getSnapshot, getSnapshot)

    // ── Populate cache from list data ────────────────────────────────────

    const populateFromList = useCallback(
        (items: TListItem[]) => {
            let changed = false
            for (const item of items) {
                if (!item.id) continue
                const existing = cacheMap.get(item.id)
                // Don't overwrite a fresh full-detail entry with partial list data
                if (existing && Date.now() - existing.timestamp < staleTime) continue
                const detail = listToDetail ? listToDetail(item) : item
                cacheMap.set(item.id, { data: detail as TDetail, timestamp: Date.now() })
                changed = true
            }
            if (changed) {
                versionRef.current++
                notifySubscribers(cacheKey)
            }
        },
        [cacheMap, cacheKey, listToDetail, staleTime],
    )

    // ── Get entity (cache-first, fetch if stale/missing) ─────────────────

    const getEntity = useCallback(
        (
            id: string | null,
        ): { data: TDetail | null; isLoading: boolean; isStale: boolean } => {
            if (!id) return { data: null, isLoading: false, isStale: false }

            const entry = cacheMap.get(id)
            const isFresh = entry && Date.now() - entry.timestamp < staleTime
            const isStale = entry && !isFresh

            // If fresh, return immediately — no fetch
            if (isFresh) {
                return { data: entry!.data, isLoading: false, isStale: false }
            }

            // If stale or missing, trigger background fetch (deduplicated)
            const flightKey = `${cacheKey}:${id}`
            if (!inFlightRequests.has(flightKey)) {
                const promise = getDetailFn(id)
                    .then((detail) => {
                        if (detail) {
                            cacheMap.set(id, { data: detail, timestamp: Date.now() })
                            versionRef.current++
                            notifySubscribers(cacheKey)
                        }
                    })
                    .catch(() => {
                        // Silently fail — stale data is still shown
                    })
                    .finally(() => {
                        inFlightRequests.delete(flightKey)
                    })
                inFlightRequests.set(flightKey, promise)
            }

            // Return stale data immediately (SWR), or null if nothing cached
            return {
                data: entry?.data ?? null,
                isLoading: !entry, // Only "loading" if we have NO data at all
                isStale: !!isStale,
            }
        },
        [cacheMap, cacheKey, getDetailFn, staleTime],
    )

    // ── Prefetch entity (for hover/touch) ────────────────────────────────

    const prefetchEntity = useCallback(
        (id: string) => {
            if (!id) return
            const entry = cacheMap.get(id)
            if (entry && Date.now() - entry.timestamp < staleTime) return // Already fresh

            const flightKey = `${cacheKey}:${id}`
            if (inFlightRequests.has(flightKey)) return // Already fetching

            const promise = getDetailFn(id)
                .then((detail) => {
                    if (detail) {
                        cacheMap.set(id, { data: detail, timestamp: Date.now() })
                        versionRef.current++
                        notifySubscribers(cacheKey)
                    }
                })
                .catch(() => {})
                .finally(() => {
                    inFlightRequests.delete(flightKey)
                })
            inFlightRequests.set(flightKey, promise)
        },
        [cacheMap, cacheKey, getDetailFn, staleTime],
    )

    // ── Invalidation ─────────────────────────────────────────────────────

    const invalidateEntity = useCallback(
        (id: string) => {
            cacheMap.delete(id)
            versionRef.current++
            notifySubscribers(cacheKey)
        },
        [cacheMap, cacheKey],
    )

    const invalidateList = useCallback(() => {
        if (listQueryKey) {
            queryClient.invalidateQueries({ queryKey: listQueryKey as unknown[] })
        }
    }, [queryClient, listQueryKey])

    const invalidateAll = useCallback(() => {
        cacheMap.clear()
        versionRef.current++
        notifySubscribers(cacheKey)
        invalidateList()
    }, [cacheMap, cacheKey, invalidateList])

    // ── Optimistic update ────────────────────────────────────────────────

    const optimisticUpdate = useCallback(
        (id: string, updater: (prev: TDetail) => TDetail) => {
            const entry = cacheMap.get(id)
            if (!entry) return
            cacheMap.set(id, { data: updater(entry.data), timestamp: Date.now() })
            versionRef.current++
            notifySubscribers(cacheKey)
        },
        [cacheMap, cacheKey],
    )

    // ── Set entity directly (after create/update response) ───────────────

    const setEntity = useCallback(
        (id: string, data: TDetail) => {
            cacheMap.set(id, { data, timestamp: Date.now() })
            versionRef.current++
            notifySubscribers(cacheKey)
        },
        [cacheMap, cacheKey],
    )

    return {
        populateFromList,
        getEntity,
        prefetchEntity,
        invalidateEntity,
        invalidateList,
        invalidateAll,
        optimisticUpdate,
        setEntity,
    }
}
