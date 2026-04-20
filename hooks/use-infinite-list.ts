"use client"

import { useInfiniteQuery, type InfiniteData, type QueryKey } from "@tanstack/react-query"
import { useMemo } from "react"
import type { InfiniteListPage } from "@/lib/services/infinite-list.types"

type CursorGetter<TPage, TCursor> = (page: TPage) => TCursor | null | undefined

export type UseInfiniteListOptions<TItem, TCursor, TPage extends InfiniteListPage<TItem, TCursor>> = {
  queryKey: QueryKey
  fetchFn: (args: { cursor: TCursor | null }) => Promise<TPage>
  getCursor?: CursorGetter<TPage, TCursor>
  /**
   * Key used for client-side deduplication across pages.
   * Defaults to `item.id` when present, else the item JSON string.
   */
  dedupeKey?: (item: TItem) => string
  /**
   * Initial page for SSR/route-level prefetch.
   * Shape matches the standardized backend response.
   */
  initialPage?: TPage
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnMount?: boolean
}

function defaultDedupeKey(item: any): string {
  if (item && (typeof item.id === "string" || typeof item.id === "number")) return String(item.id)
  try {
    return JSON.stringify(item)
  } catch {
    return String(item)
  }
}

export function useInfiniteList<
  TItem,
  TCursor,
  TPage extends InfiniteListPage<TItem, TCursor> = InfiniteListPage<TItem, TCursor>,
>(options: UseInfiniteListOptions<TItem, TCursor, TPage>) {
  const {
    queryKey,
    fetchFn,
    getCursor,
    dedupeKey = defaultDedupeKey,
    initialPage,
    enabled = true,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
  } = options

  const query = useInfiniteQuery<TPage>({
    queryKey,
    enabled,
    initialPageParam: null as TCursor | null,
    queryFn: async ({ pageParam }) => fetchFn({ cursor: (pageParam ?? null) as TCursor | null }),
    getNextPageParam: (lastPage) => {
      const cursor = (getCursor ? getCursor(lastPage) : lastPage.nextCursor) ?? null
      if (!lastPage.hasMore) return undefined
      return cursor ?? undefined
    },
    ...(initialPage
      ? ({
          initialData: {
            pages: [initialPage],
            pageParams: [null],
          } satisfies InfiniteData<TPage, TCursor | null>,
        } as const)
      : null),
    staleTime,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
  })

  const items = useMemo(() => {
    const pages = query.data?.pages ?? []
    const flat = pages.flatMap((p) => p.items)
    const seen = new Set<string>()
    const out: TItem[] = []
    for (const item of flat) {
      const key = dedupeKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }, [query.data?.pages, dedupeKey])

  return {
    ...query,
    items,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

