"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
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

function getPartnerId(notification: { data: Record<string, unknown> | null }): string | null {
  const d = (notification.data as Record<string, unknown> | null) || {}
  return (d.partner_id as string | undefined) || (d.partnerId as string | undefined) || null
}

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

  const erpOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    for (const n of allItems) {
      const pid = getPartnerId(n)
      if (!pid) continue
      if (!map.has(pid)) {
        const d = (n.data as Record<string, unknown>) || {}
        const label =
          (d.store_name as string | undefined) ||
          (d.storeName as string | undefined) ||
          (d.partner_name as string | undefined) ||
          (d.partnerName as string | undefined) ||
          "ERP"
        const truncated =
          label.length > 24 ? `${label.slice(0, 23)}…` : label
        map.set(pid, { id: pid, label: truncated })
      }
    }
    return Array.from(map.values())
  }, [allItems, activePartnerId])

  const [erpFilter, setErpFilter] = useState<"all" | "current" | string>("all")

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("notifications.erpFilter")
    if (saved === "all" || saved === "current" || (saved && erpOptions.some((o) => o.id === saved))) {
      setErpFilter(saved)
    }
  }, [erpOptions])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("notifications.erpFilter", String(erpFilter))
  }, [erpFilter])

  const filteredItems = useMemo(() => {
    if (erpFilter === "all" || !activePartnerId && erpFilter === "current") {
      return allItems
    }
    if (erpFilter === "current") {
      return allItems.filter((n) => getPartnerId(n) === activePartnerId)
    }
    return allItems.filter((n) => getPartnerId(n) === erpFilter)
  }, [allItems, erpFilter, activePartnerId])

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
  }
}

export type NotificationsController = ReturnType<typeof useNotifications>
