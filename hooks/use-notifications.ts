"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  getUserStoreAccessAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
  deleteAllNotificationsAction,
} from "@/app/actions/notifications"
import type {
  NotificationPageCursor,
  NotificationRecord,
  NotificationsPageResult,
} from "@/lib/notifications/types"
import { useSupabase } from "@/providers/supabase-provider"
import { useStoreOrNull } from "@/lib/store-context"

const READ_DELAY_MS = 2000
const READ_INTERVAL_MS = 10000

function groupNotificationsByDate(items: NotificationRecord[]) {
  const groups: { label: string; items: NotificationRecord[] }[] = []
  const map = new Map<string, NotificationRecord[]>()

  for (const item of items) {
    const date = new Date(item.created_at)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    let label: string
    if (date.toDateString() === today.toDateString()) {
      label = "Hoje"
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = "Ontem"
    } else {
      label = date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    }

    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(item)
  }

  for (const [label, groupItems] of map) {
    groups.push({ label, items: groupItems })
  }
  return groups
}

export function useNotifications() {
  const { user } = useSupabase()
  const queryClient = useQueryClient()
  const store = useStoreOrNull()
  const [panelOpen, setPanelOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const visibleTimestampsRef = useRef<Map<string, number>>(new Map())
  const unreadQueryKey = useMemo(
    () => ["notifications", "unread-count", user?.id] as const,
    [user?.id],
  )
  const listQueryKey = useMemo(
    () => ["notifications", "list", user?.id] as const,
    [user?.id],
  )

  const unreadQuery = useQuery({
    queryKey: unreadQueryKey,
    queryFn: async () => {
      const result = await getUnreadNotificationCountAction()
      return result.count ?? 0
    },
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })

  const listQuery = useInfiniteQuery({
    queryKey: listQueryKey,
    queryFn: async ({ pageParam }) => {
      const result = await getNotificationsAction({
        cursor: (pageParam as NotificationPageCursor | null) ?? null,
      })
      if ("error" in result && result.error) throw new Error(result.error)
      return result.data!
    },
    initialPageParam: null as NotificationPageCursor | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: Boolean(user?.id) && panelOpen,
    staleTime: 60_000,
  })

  const updateReadCache = useCallback(
    (ids: string[] | null, updatedCount?: number) => {
      const readAt = new Date().toISOString()
      const idSet = ids ? new Set(ids) : null

      queryClient.setQueryData<number>(unreadQueryKey, (current) => {
        if (!idSet) return 0
        return Math.max(0, (current ?? 0) - (updatedCount ?? idSet.size))
      })

      queryClient.setQueryData<
        InfiniteData<NotificationsPageResult, NotificationPageCursor | null> | undefined
      >(listQueryKey, (current) => {
        if (!current) return current

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => {
              if (idSet && !idSet.has(item.id)) return item
              return {
                ...item,
                is_read: true,
                read_at: item.read_at ?? readAt,
              }
            }),
          })),
        }
      })
    },
    [listQueryKey, queryClient, unreadQueryKey],
  )

  const allItems = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data],
  )

  const activePartnerId = store?.selectedStore?.partner_id ?? null

  const storeAccessQueryKey = useMemo(
    () => ["notifications", "store-access", user?.id] as const,
    [user?.id],
  )

  const storeAccessQuery = useQuery({
    queryKey: storeAccessQueryKey,
    queryFn: async () => {
      const result = await getUserStoreAccessAction()
      if ("error" in result) throw new Error(result.error)
      return result.stores ?? []
    },
    enabled: Boolean(user?.id),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  })

  // Mapa de lojas às quais o usuário tem acesso, indexado por storeId.
  const accessByStore = useMemo(() => {
    const access = storeAccessQuery.data ?? []
    const map = new Map<string, { label: string; partnerId: string }>()
    for (const a of access) {
      if (!a.storeId) continue
      if (map.has(a.storeId)) continue
      const base = a.storeName || a.partnerName || "Loja"
      const label = base.length > 24 ? `${base.slice(0, 23)}…` : base
      map.set(a.storeId, { label, partnerId: a.partnerId })
    }
    return map
  }, [storeAccessQuery.data])

  // Mapeia um partnerId para uma loja de acesso (usado quando a notificação
  // traz apenas o partner_id, sem store_id explícito).
  const partnerToStoreId = useMemo(() => {
    const entry = new Map<string, string>()
    for (const [storeId, info] of accessByStore) {
      if (!entry.has(info.partnerId)) entry.set(info.partnerId, storeId)
    }
    return entry
  }, [accessByStore])

  // As abas de ERP/loja só aparecem quando o usuário tem acesso a elas E
  // existe ao menos uma notificação associada. Fora isso, só a aba "Todos".
  const erpOptions = useMemo(() => {
    const total = new Map<string, number>()
    const unread = new Map<string, number>()

    for (const n of allItems) {
      const d = (n.data as Record<string, unknown> | null) || {}
      const storeId = (d.store_id as string | undefined) || (d.storeId as string | undefined)

      let targetStore = storeId
      if (!targetStore) {
        const pid = (d.partner_id as string | undefined) || (d.partnerId as string | undefined)
        if (pid) targetStore = partnerToStoreId.get(pid)
      }

      if (!targetStore || !accessByStore.has(targetStore)) continue

      total.set(targetStore, (total.get(targetStore) ?? 0) + 1)
      if (!n.is_read) unread.set(targetStore, (unread.get(targetStore) ?? 0) + 1)
    }

    return Array.from(accessByStore, ([storeId, info]) => ({
      id: storeId,
      label: info.label,
      count: total.get(storeId) ?? 0,
      unread: unread.get(storeId) ?? 0,
    })).filter((o) => o.count > 0)
  }, [allItems, accessByStore, partnerToStoreId])

  const [erpFilter, setErpFilter] = useState<string>("all")

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("notifications.erpFilter")
    if (saved === "all" || (saved && erpOptions.some((o) => o.id === saved))) {
      setErpFilter(saved)
    } else {
      setErpFilter("all")
    }
  }, [erpOptions])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("notifications.erpFilter", String(erpFilter))
  }, [erpFilter])

  const validErpFilter = erpFilter === "all" || erpOptions.some((o) => o.id === erpFilter)

  const filteredItems = useMemo(() => {
    if (!validErpFilter || erpFilter === "all") {
      return allItems
    }
    const info = accessByStore.get(erpFilter)
    if (!info) return allItems
    return allItems.filter((n) => {
      const d = (n.data as Record<string, unknown> | null) || {}
      const storeId = (d.store_id as string | undefined) || (d.storeId as string | undefined)
      if (storeId === erpFilter) return true
      const pid = (d.partner_id as string | undefined) || (d.partnerId as string | undefined)
      return pid === info.partnerId
    })
  }, [allItems, erpFilter, accessByStore, validErpFilter])

  const grouped = useMemo(() => groupNotificationsByDate(filteredItems), [filteredItems])

  const unreadMapRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    unreadMapRef.current = new Set(
      filteredItems.filter((n) => !n.is_read).map((n) => n.id),
    )
  }, [filteredItems])

  const registerVisible = useCallback((id: string, visible: boolean) => {
    if (visible) {
      if (!visibleTimestampsRef.current.has(id)) {
        visibleTimestampsRef.current.set(id, Date.now())
      }
    } else {
      visibleTimestampsRef.current.delete(id)
    }
  }, [])

  const markAsRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      const result = await markNotificationsReadAction(ids)
      if ("success" in result && result.success) {
        updateReadCache(ids, result.updated)
      }
    } catch (e) {
      console.error("[notifications] markAsRead error:", e)
    }
  }, [updateReadCache])

  useEffect(() => {
    if (!panelOpen) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      visibleTimestampsRef.current.clear()
      return
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const toMark: string[] = []

      visibleTimestampsRef.current.forEach((timestamp, id) => {
        if (unreadMapRef.current.has(id) && now - timestamp >= READ_DELAY_MS) {
          toMark.push(id)
        }
      })

      for (const id of toMark) {
        visibleTimestampsRef.current.delete(id)
      }

      if (toMark.length > 0) {
        markAsRead(toMark)
      }
    }, READ_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [panelOpen, markAsRead])

  const markAllAsRead = useCallback(async () => {
    try {
      const result = await markAllNotificationsReadAction()
      if ("success" in result && result.success) {
        updateReadCache(null, result.updated)
      }
    } catch (e) {
      console.error("[notifications] markAllAsRead error:", e)
    }
  }, [updateReadCache])

  const deleteAll = useCallback(async (): Promise<{ success: boolean; deleted: number }> => {
    try {
      const result = await deleteAllNotificationsAction()
      if (result.success) {
        queryClient.setQueryData<InfiniteData<NotificationsPageResult, NotificationPageCursor | null>>(listQueryKey, {
          pages: [],
          pageParams: [],
        })
        queryClient.setQueryData(unreadQueryKey, 0)
        return { success: true, deleted: result.deleted ?? 0 }
      }
      return { success: false, deleted: 0 }
    } catch (e) {
      console.error("[notifications] deleteAll error:", e)
      return { success: false, deleted: 0 }
    }
  }, [listQueryKey, unreadQueryKey, queryClient])

  return {
    user,
    panelOpen,
    setPanelOpen,
     unreadCount: unreadQuery.data ?? 0,
     grouped,
     allItems,
     erpOptions,
     erpFilter,
     setErpFilter,
     activePartnerId,
     isLoading: listQuery.isLoading,
    isFetchingMore: listQuery.isFetchingNextPage,
    hasMore: listQuery.hasNextPage ?? false,
    fetchMore: () => listQuery.fetchNextPage(),
     registerVisible,
     markAllAsRead,
     deleteAll,
   }
 }

export type NotificationsController = ReturnType<typeof useNotifications>
