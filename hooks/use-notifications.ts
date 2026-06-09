"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markNotificationsReadAction,
} from "@/app/actions/notifications"
import type { NotificationPageCursor, NotificationRecord } from "@/lib/notifications/types"
import { useNotificationsRealtime } from "./use-notifications-realtime"
import { useSupabase } from "@/providers/supabase-provider"

const READ_DELAY_MS = 2000

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
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleIdsRef = useRef<Set<string>>(new Set())

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

  const registerVisible = useCallback((id: string, visible: boolean) => {
    if (visible) visibleIdsRef.current.add(id)
    else visibleIdsRef.current.delete(id)
  }, [])

  const markVisibleAsRead = useCallback(async () => {
    const ids = [...visibleIdsRef.current].filter((id) => {
      const item = allItems.find((n) => n.id === id)
      return item && !item.is_read
    })
    if (ids.length === 0) return

    await markNotificationsReadAction(ids)
    visibleIdsRef.current.clear()
    invalidate()
  }, [allItems, invalidate])

  useEffect(() => {
    if (!panelOpen) {
      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current)
        readTimerRef.current = null
      }
      return
    }

    readTimerRef.current = setTimeout(() => {
      markVisibleAsRead()
    }, READ_DELAY_MS)

    return () => {
      if (readTimerRef.current) clearTimeout(readTimerRef.current)
    }
  }, [panelOpen, allItems, markVisibleAsRead])

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
  }
}
