"use client"

import { useCallback, useRef, useEffect } from "react"
import { NotificationItem } from "./NotificationItem"
import type { NotificationRecord } from "@/lib/notifications/types"
import { Loader2 } from "lucide-react"

interface Group {
  label: string
  items: NotificationRecord[]
}

export function NotificationPanel({
  grouped,
  isLoading,
  isFetchingMore,
  hasMore,
  onLoadMore,
  onVisible,
  onNavigate,
  onMarkAllAsRead,
  unreadCount,
}: {
  grouped: Group[]
  isLoading: boolean
  isFetchingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  onVisible: (id: string, visible: boolean) => void
  onNavigate?: () => void
  onMarkAllAsRead?: () => void
  unreadCount?: number
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !isFetchingMore) {
        onLoadMore()
      }
    },
    [hasMore, isFetchingMore, onLoadMore],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(handleIntersect, { rootMargin: "80px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleIntersect])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-brand-inactive-text">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <div className="py-10 px-4 text-center text-sm text-brand-inactive-text dark:text-dark-body">
        Nenhuma notificação por aqui.
      </div>
    )
  }

  return (
    <>
      {unreadCount && unreadCount > 0 && onMarkAllAsRead && (
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-4 py-2 border-b border-brand-border dark:border-dark-border">
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="text-xs font-medium text-brand-green hover:text-brand-green/80 transition-colors"
          >
            Marcar todas como lidas
          </button>
        </div>
      )}
      {grouped.map((group) => (
        <div key={group.label} className="px-2 py-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-inactive-text dark:text-dark-body px-2 py-1.5">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NotificationItem
                key={item.id}
                notification={item}
                onVisible={onVisible}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
      <div ref={sentinelRef} className="h-6 flex items-center justify-center">
        {isFetchingMore && <Loader2 className="w-4 h-4 animate-spin text-brand-inactive-text" />}
      </div>
    </>
  )
}
