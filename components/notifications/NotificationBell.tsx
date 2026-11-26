"use client"

import { NotificationIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { NotificationsSheet } from "./NotificationsSheet"
import { useNotifications } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

interface NotificationBellProps {
  className?: string
  buttonClassName?: string
  variant?: "erp" | "marketplace" | "admin"
}

export function NotificationBell({
  className,
  buttonClassName,
  variant = "erp",
}: NotificationBellProps) {
  const notifications = useNotifications()
  const { user, panelOpen, setPanelOpen, unreadCount } = notifications

  if (!user) return null

  const badge =
    unreadCount > 0 ? (
      <span
        className={cn(
          "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
          variant === "marketplace"
            ? "bg-white text-brand-dark"
            : "bg-brand-green text-white",
        )}
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null

  return (
    <div className={className}>
      <button
        className={cn(
          "relative w-10 h-10 rounded-full border flex items-center justify-center transition-all group",
          variant === "marketplace" &&
          "border border-white/10 hover:bg-white/5 hover:border-white/30 text-gray-400 dark:text-dark-body group-hover:text-white",
          buttonClassName,
        )}
        aria-label="Notificações"
        onClick={() => setPanelOpen(true)}
      >
        <NotificationIcon
          className={cn(
            "w-5 h-5",
            variant === "marketplace"
              ? "text-white"
              : "text-brand-dark dark:text-dark-heading",
          )}
        />
        {badge}
      </button>
      <NotificationsSheet
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        notifications={notifications}
      />
    </div>
  )
}
