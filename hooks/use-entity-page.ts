"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useEntityState, type EntityAction } from "./use-entity-state"
import { useEntityCache, type UseEntityCacheOptions } from "./use-entity-cache"
import { createPrefetchPropsFactory, type PrefetchProps } from "./use-prefetch"
import { useInfiniteList } from "./use-infinite-list"
import type { InfiniteListPage } from "@/lib/services/infinite-list.types"

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
    /** Stale time for cache entries (ms). Default: 60000 */
    staleTime?: number
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
        staleTime,
    } = options

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
        (entityId?: string) => {
            if (entityId) cache.invalidateEntity(entityId)
            cache.invalidateList()
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
