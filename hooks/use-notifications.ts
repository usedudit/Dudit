"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/app/actions/notifications"
import type { NotificationPageCursor, NotificationRecord } from "@/lib/notifications/types"
import { useNotificationsRealtime } from "./use-notifications-realtime"
import { useSupabase } from "@/providers/supabase-provider"

const READ_DELAY_MS = 2000
const READ_INTERVAL_MS = 1000

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
  const [panelOpen, setPanelOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const visibleTimestampsRef = useRef<Map<string, number>>(new Map())

  const unreadQuery = useQuery({
    queryKey: ["notifications", "unread-count", user?.id],
    queryFn: async () => {
      const result = await getUnreadNotificationCountAction()
      return result.count ?? 0
    },
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  })

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", "list", user?.id],
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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", user?.id] })
    queryClient.invalidateQueries({ queryKey: ["notifications", "list", user?.id] })
  }, [queryClient, user?.id])

  useNotificationsRealtime({
    userId: user?.id,
    enabled: Boolean(user?.id),
    onChange: invalidate,
  })

  const allItems = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data],
  )

  const grouped = useMemo(() => groupNotificationsByDate(allItems), [allItems])

  const unreadMapRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    unreadMapRef.current = new Set(
      allItems.filter((n) => !n.is_read).map((n) => n.id),
    )
  }, [allItems])

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
      await markNotificationsReadAction(ids)
      invalidate()
    } catch (e) {
      console.error("[notifications] markAsRead error:", e)
    }
  }, [invalidate])

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
      await markAllNotificationsReadAction()
      invalidate()
    } catch (e) {
      console.error("[notifications] markAllAsRead error:", e)
    }
  }, [invalidate])

  return {
    user,
    panelOpen,
    setPanelOpen,
    unreadCount: unreadQuery.data ?? 0,
    grouped,
    allItems,
    isLoading: listQuery.isLoading,
    isFetchingMore: listQuery.isFetchingNextPage,
    hasMore: listQuery.hasNextPage ?? false,
    fetchMore: () => listQuery.fetchNextPage(),
    registerVisible,
    invalidate,
    markAllAsRead,
  }
}
