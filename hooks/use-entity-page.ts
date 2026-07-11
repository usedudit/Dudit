"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useEntityState } from "./use-entity-state"
import { useEntityCache } from "./use-entity-cache"
import { createPrefetchPropsFactory } from "./use-prefetch"
import { useInfiniteList } from "./use-infinite-list"
import type { DataPriority } from "@/components/erp/hooks"

const PRIORITY_STALE_TIME: Record<DataPriority, number> = {
  live: 5000,
  normal: 30000,
  low: 120000,
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseEntityPageOptions<
    TListItem extends { id: string },
    TDetail extends { id: string },
    TCursor,
> {
    /** Entity type key: 'products', 'services', etc. */
    entityType: string
    partnerId: string
    /** React Query key for the infinite list */
    queryKey: readonly unknown[]

    // ── List ──
    initialItems: TListItem[]
    initialNextCursor: TCursor | null
    initialHasMore: boolean
    fetchPageFn: (args: { cursor: TCursor | null }) => Promise<{
        items: TListItem[]
        nextCursor: TCursor | null
        hasMore: boolean
    }>
    dedupeKey: (item: TListItem) => string

    // ── Detail ──
    getDetailFn: (id: string) => Promise<TDetail | null>
    /** Map list item to partial detail for cache seeding */
    listToDetail?: (item: TListItem) => Partial<TDetail>
    /** Stale time for cache entries (ms). Default: derived from priority (30000 for normal) */
    staleTime?: number
    /** Priority tier for cache freshness. Default: 'normal'. Overridden by explicit staleTime if provided. */
    priority?: DataPriority
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEntityPage<
    TListItem extends { id: string },
    TDetail extends { id: string },
    TCursor,
>(options: UseEntityPageOptions<TListItem, TDetail, TCursor>) {
    const {
        entityType,
        partnerId,
        queryKey,
        initialItems,
        initialNextCursor,
        initialHasMore,
        fetchPageFn,
        dedupeKey,
        getDetailFn,
        listToDetail,
        staleTime: staleTimeProp,
        priority,
    } = options

    const staleTime = staleTimeProp ?? (priority ? PRIORITY_STALE_TIME[priority] : 30000)

    const queryClient = useQueryClient()

    // ── Entity State (URL-driven) ────────────────────────────────────────

    const entityState = useEntityState()

    // ── Infinite List ────────────────────────────────────────────────────

    const {
        items,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading: isListLoading,
    } = useInfiniteList<TListItem, TCursor>({
        queryKey,
        initialPage: {
            items: initialItems,
            nextCursor: initialNextCursor,
            hasMore: initialHasMore,
        },
        fetchFn: fetchPageFn,
        dedupeKey,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    })

    // ── Entity Cache ─────────────────────────────────────────────────────

    const cache = useEntityCache<TListItem, TDetail>({
        entityType,
        partnerId,
        getDetailFn,
        listToDetail,
        staleTime,
        listQueryKey: queryKey,
    })

    // Populate cache when list data arrives
    const prevItemsRef = useRef(items)
    useEffect(() => {
        if (items !== prevItemsRef.current && items.length > 0) {
            cache.populateFromList(items)
            prevItemsRef.current = items
        }
    }, [items, cache.populateFromList])

    // Also populate on initial mount
    useEffect(() => {
        if (initialItems.length > 0) {
            cache.populateFromList(initialItems as TListItem[])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Current Entity (derived from URL state + cache) ──────────────────

    const currentEntityResult = cache.getEntity(entityState.state.entityId)

    // ── Prefetch Factory ─────────────────────────────────────────────────

    const getPrefetchProps = useMemo(
        () => createPrefetchPropsFactory(cache.prefetchEntity),
        [cache.prefetchEntity],
    )

    // ── Search (built-in debounce) ───────────────────────────────────────

    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    // ── Mutation helpers ─────────────────────────────────────────────────

    const afterMutation = useCallback(
        (entityId?: string, invalidateList = false) => {
            if (entityId) {
                cache.invalidateEntity(entityId)
                if (invalidateList) cache.invalidateList()
            } else {
                cache.invalidateAll()
            }
        },
        [cache],
    )

    return {
        // URL state
        entityState: entityState.state,
        openEntity: entityState.open,
        closeEntity: entityState.close,
        isViewing: entityState.isViewing,
        isEditing: entityState.isEditing,
        isCreating: entityState.isCreating,
        isDuplicating: entityState.isDuplicating,

        // List
        items,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isListLoading,

        // Current entity
        currentEntity: currentEntityResult.data,
        isLoadingDetail: currentEntityResult.isLoading,
        isDetailStale: currentEntityResult.isStale,

        // Cache operations
        cache,
        getPrefetchProps,

        // Search
        search,
        setSearch,
        debouncedSearch,

        // Mutations
        afterMutation,
        queryClient,
    }
}
