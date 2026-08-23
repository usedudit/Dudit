"use client"

import { useCallback, useRef, useEffect } from "react"
import { NotificationItem } from "./NotificationItem"
import type { NotificationRecord } from "@/lib/notifications/types"
import { Bell, BellRing, Loader2 } from "lucide-react"
import { IconPlaceholder, ThreeDotsLoader } from "../reusable"
import { usePushNotificationStatus } from "./PushNotificationManager"

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

  const { isSupported, permission, isEnabling, requestEnable } = usePushNotificationStatus()

  const pushBanner = isSupported && permission === "default" && (
    <div className="mx-3 mt-3 mb-2 p-3 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center shrink-0 text-brand-green">
          <BellRing className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-dark dark:text-dark-heading leading-tight">
            Receber alertas no aparelho
          </p>
          <p className="text-[11px] text-brand-muted-text dark:text-dark-muted-text truncate">
            Ative para ser avisado sobre pedidos e vendas
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => requestEnable()}
        disabled={isEnabling}
        className="shrink-0 px-3 py-1.5 bg-brand-green hover:bg-brand-green/90 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {isEnabling ? "Ativando..." : "Ativar"}
      </button>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center">
        <ThreeDotsLoader />
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <>
        {pushBanner}
        <IconPlaceholder
          placeholderType="image"
          imageSrc="https://img.dudit.com.br/static/mascots/Notificacoes.png"
          imageAlt="Nenhuma notificação por aqui"
          title="Nenhuma notificação por aqui"
          subtitle="Quando tiver novidades, elas aparecerão aqui"
        />
      </>
    )
  }

  return (
    <>
      {pushBanner}
      {(unreadCount ?? 0) > 0 && onMarkAllAsRead && (
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
          <p className="text-xs font-medium text-brand-dark dark:text-dark-heading px-2 py-2">
            {group.label}
          </p>
          <div className="space-y-2">
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
