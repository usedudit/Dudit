"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import type { NotificationRecord } from "@/lib/notifications/types"
import { getNotificationHref } from "@/lib/notifications/navigation"
import type { NotificationAudience } from "@/lib/notifications/types"
import { cn } from "@/lib/utils"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export function NotificationItem({
  notification,
  onVisible,
  onNavigate,
}: {
  notification: NotificationRecord
  onVisible: (id: string, visible: boolean) => void
  onNavigate?: () => void
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const audience = (notification.data?.audience as NotificationAudience) || "customer"
  const href =
    (typeof notification.data?.href === "string" && notification.data.href) ||
    getNotificationHref({
      type: notification.type,
      entityType: notification.entity_type,
      entityId: notification.entity_id,
      data: notification.data,
      audience,
    })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        onVisible(notification.id, entry.isIntersecting)
      },
      { threshold: 0.5 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [notification.id, onVisible])

  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className={cn(
        "block px-3 py-2.5 rounded-lg transition-colors hover:bg-brand-gray/60 dark:hover:bg-dark-border/60",
        !notification.is_read && "bg-brand-green/5 dark:bg-brand-green/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-brand-dark dark:text-dark-heading line-clamp-1">
          {notification.title}
        </p>
        <span className="text-[10px] text-brand-inactive-text dark:text-dark-body shrink-0">
          {formatTime(notification.created_at)}
        </span>
      </div>
      <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 line-clamp-2">
        {notification.message}
      </p>
      {!notification.is_read && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-green mt-1.5" />
      )}
    </Link>
  )
}
