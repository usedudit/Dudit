"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useQueryClient } from "@tanstack/react-query"

const FETCH_TIMEOUT_MS = 20_000 // 20s timeout for background detail fetches

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
    data: T
    timestamp: number
    /** True when data came from list mapping (incomplete). getEntity will always fetch full detail. */
    partial?: boolean
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
// Global version counter per cache key (ensures useSyncExternalStore works across all instances)
const globalVersions = new Map<string, number>()

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

function getVersion(cacheKey: string): number {
    return globalVersions.get(cacheKey) ?? 0
}

function incrementVersion(cacheKey: string): void {
    globalVersions.set(cacheKey, getVersion(cacheKey) + 1)
}

function notifySubscribers(cacheKey: string) {
    incrementVersion(cacheKey)
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

// ── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Fetch timed out after ${ms}ms`)), ms),
        ),
    ])
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

    // Snapshot for useSyncExternalStore - uses global version counter
    const getSnapshot = useCallback(() => getVersion(cacheKey), [cacheKey])
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
                // NEVER overwrite a full-detail entry with partial list data,
                // regardless of staleTime. A full entry is always more complete.
                if (existing && !existing.partial) continue
                const detail = listToDetail ? listToDetail(item) : item
                cacheMap.set(item.id, { data: detail as TDetail, timestamp: Date.now(), partial: !!listToDetail })
                changed = true
            }
            if (changed) {
                notifySubscribers(cacheKey)
            }
        },
        [cacheMap, cacheKey, listToDetail],
    )

    // ── Get entity (cache-first, fetch if stale/missing/partial) ─────────

    const getEntity = useCallback(
        (
            id: string | null,
        ): { data: TDetail | null; isLoading: boolean; isStale: boolean } => {
            if (!id) return { data: null, isLoading: false, isStale: false }

            const entry = cacheMap.get(id)
            const isFresh = entry && !entry.partial && Date.now() - entry.timestamp < staleTime
            const needsFetch = !entry || entry.partial || Date.now() - entry.timestamp >= staleTime

            // If fresh AND full (not partial), return immediately - no fetch
            if (isFresh) {
                return { data: entry!.data, isLoading: false, isStale: false }
            }

            // If partial, stale, or missing → trigger background fetch (deduplicated)
            if (needsFetch) {
                const flightKey = `${cacheKey}:${id}`
                if (!inFlightRequests.has(flightKey)) {
                    const promise = withTimeout(getDetailFn(id), FETCH_TIMEOUT_MS)
                        .then((detail) => {
                            if (detail) {
                                // Full detail: set partial=false so it won't refetch
                                cacheMap.set(id, { data: detail, timestamp: Date.now(), partial: false })
                                notifySubscribers(cacheKey)
                            } else {
                                const existing = cacheMap.get(id)
                                cacheMap.set(id, { data: (existing?.data ?? null) as any, timestamp: Date.now(), partial: false })
                                notifySubscribers(cacheKey)
                            }
                        })
                        .catch(() => {
                            // Silently fail - but mark partial = false so we don't get stuck loading
                            const existing = cacheMap.get(id)
                            cacheMap.set(id, { data: (existing?.data ?? null) as any, timestamp: Date.now(), partial: false })
                            notifySubscribers(cacheKey)
                        })
                        .finally(() => {
                            inFlightRequests.delete(flightKey)
                        })
                    inFlightRequests.set(flightKey, promise)
                }
            }

            // Return cached data immediately (SWR pattern), or null if nothing cached
            return {
                data: entry?.data ?? null,
                // isLoading only when NO data at all (not even partial).
                // If partial data exists, show it immediately while background fetch completes.
                isLoading: !entry,
                isStale: !!entry?.partial || (!!entry && Date.now() - entry.timestamp >= staleTime),
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

            const promise = withTimeout(getDetailFn(id), FETCH_TIMEOUT_MS)
                .then((detail) => {
                    if (detail) {
                        cacheMap.set(id, { data: detail, timestamp: Date.now() })
                        notifySubscribers(cacheKey)
                    }
                })
                .catch(() => { })
                .finally(() => {
                    inFlightRequests.delete(flightKey)
                })
            inFlightRequests.set(flightKey, promise)
        },
        [cacheMap, cacheKey, getDetailFn, staleTime],
    )

    // ── List Cache Updaters ────────────────────────────────────────────────
    
    const updateItemInListCache = useCallback(
        (id: string, data: any) => {
            if (!listQueryKey) return
            queryClient.setQueryData<any>(
                listQueryKey as unknown[],
                (old: any) => {
                    if (!old || !old.pages) return old
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            items: page.items.map((item: any) =>
                                String(item.id) === String(id)
                                    ? { ...item, ...data }
                                    : item
                            ),
                        })),
                    }
                }
            )
        },
        [queryClient, listQueryKey]
    )

    const removeItemFromListCache = useCallback(
        (id: string) => {
            if (!listQueryKey) return
            queryClient.setQueryData<any>(
                listQueryKey as unknown[],
                (old: any) => {
                    if (!old || !old.pages) return old
                    return {
                        ...old,
                        pages: old.pages.map((page: any) => ({
                            ...page,
                            items: page.items.filter((item: any) => String(item.id) !== String(id)),
                        })),
                    }
                }
            )
        },
        [queryClient, listQueryKey]
    )

    // ── Invalidation ─────────────────────────────────────────────────────

    const invalidateEntity = useCallback(
        (id: string) => {
            cacheMap.delete(id)
            notifySubscribers(cacheKey)

            getDetailFn(id)
                .then((detail) => {
                    if (detail) {
                        cacheMap.set(id, { data: detail, timestamp: Date.now(), partial: false })
                        notifySubscribers(cacheKey)
                        updateItemInListCache(id, detail as any)
                    } else {
                        removeItemFromListCache(id)
                    }
                })
                .catch(() => {
                    // Fail silently, preserving existing state or letting query cache stay as is.
                })
        },
        [cacheMap, cacheKey, getDetailFn, updateItemInListCache, removeItemFromListCache],
    )

    const invalidateList = useCallback(() => {
        if (listQueryKey) {
            queryClient.invalidateQueries({ queryKey: listQueryKey as unknown[] })
        }
    }, [queryClient, listQueryKey])

    const invalidateAll = useCallback(() => {
        cacheMap.clear()
        notifySubscribers(cacheKey)
        invalidateList()
    }, [cacheMap, cacheKey, invalidateList])

    // ── Optimistic update ────────────────────────────────────────────────

    const optimisticUpdate = useCallback(
        (id: string, updater: (prev: TDetail) => TDetail) => {
            const entry = cacheMap.get(id)
            if (!entry) return
            const nextData = updater(entry.data)
            cacheMap.set(id, { data: nextData, timestamp: Date.now(), partial: false })
            notifySubscribers(cacheKey)
            updateItemInListCache(id, nextData as any)
        },
        [cacheMap, cacheKey, updateItemInListCache],
    )

    // ── Set entity directly (after create/update response) ───────────────

    const setEntity = useCallback(
        (id: string, data: TDetail) => {
            cacheMap.set(id, { data, timestamp: Date.now(), partial: false })
            notifySubscribers(cacheKey)
            updateItemInListCache(id, data as any)
        },
        [cacheMap, cacheKey, updateItemInListCache],
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
        removeItemFromListCache,
    }
}
