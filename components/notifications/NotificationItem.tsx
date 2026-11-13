"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { NotificationRecord } from "@/lib/notifications/types"
import { getNotificationHref } from "@/lib/notifications/navigation"
import type { NotificationAudience } from "@/lib/notifications/types"
import { switchNotificationContextAction } from "@/app/actions/notifications"
import { useStoreOrNull } from "@/lib/store-context"
import { cn } from "@/lib/utils"

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

const TRUNCATED_NAME = 24

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
  const store = useStoreOrNull()
  const [originLoading, setOriginLoading] = useState(false)

  const data = (notification.data as Record<string, unknown>) || {}
  const audience = (data.audience as NotificationAudience) || "customer"
  const scope = (data.scope as string | undefined) || (data.partner_id ? "partner" : "platform")
  const partnerId = (data.partner_id as string | undefined) || (data.partnerId as string | undefined) || null
  const storeId = (data.store_id as string | undefined) || (data.storeId as string | undefined) || null
  const storeName = (data.store_name as string | undefined) || (data.storeName as string | undefined) || null
  const partnerName =
    (data.partner_name as string | undefined) || (data.partnerName as string | undefined) || null

  const href =
    (typeof data.href === "string" && data.href) ||
    getNotificationHref({
      type: notification.type,
      entityType: notification.entity_type,
      entityId: notification.entity_id,
      data: notification.data,
      audience,
    })

  const isErpRoute = typeof href === "string" && href.startsWith("/erp/")
  const activePartnerId = store?.selectedStore?.partner_id ?? null
  const needsContextSwitch =
    isErpRoute && !!partnerId && activePartnerId !== null && activePartnerId !== partnerId

  function originLabel(): string | null {
    if (scope === "platform") return "Plataforma Dudit"
    if (storeName) {
      return storeName.length > TRUNCATED_NAME
        ? `${storeName.slice(0, TRUNCATED_NAME - 1)}…`
        : storeName
    }
    if (partnerName) {
      return partnerName.length > TRUNCATED_NAME
        ? `${partnerName.slice(0, TRUNCATED_NAME - 1)}…`
        : partnerName
    }
    return null
  }

  const origin = originLabel()

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

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!needsContextSwitch) {
      onNavigate?.()
      return
    }
    e.preventDefault()
    setOriginLoading(true)
    switchNotificationContextAction({
      partnerId: partnerId!,
      storeId,
      targetHref: href,
    }).then((res) => {
      onNavigate?.()
      if (res.success) {
        window.location.href = res.url
      } else {
        setOriginLoading(false)
      }
    })
  }

  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false}
      onClick={handleClick}
      aria-busy={originLoading}
      className={cn(
        "block px-3 py-2.5 rounded-lg transition-colors hover:bg-brand-gray/60 dark:hover:bg-dark-border/60",
        originLoading && "pointer-events-none opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-brand-dark dark:text-dark-heading line-clamp-1">
              {notification.title}
            </p>
            {origin ? (
              <span
                title={scope === "platform" ? "Notificação da plataforma Dudit" : `Loja: ${origin}`}
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  scope === "platform"
                    ? "bg-brand-gray/20 text-brand-inactive-text"
                    : "bg-brand-green/10 text-brand-green",
                )}
              >
                {scope === "platform" ? "Dudit" : origin}
              </span>
            ) : null}
          </div>
          {notification.message ? (
            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 line-clamp-2">
              {notification.message}
            </p>
          ) : notification.type === "cart_abandoned" ? (
            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 line-clamp-2">
              Seu carrinho está te esperando. Volte e finalize sua compra!
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xs text-brand-dark dark:text-dark-heading">
            {formatTime(notification.created_at)}
          </span>
          {!notification.is_read && (
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
          )}
        </div>
      </div>
    </Link>
  )
}
