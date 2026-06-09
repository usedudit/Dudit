"use client"

import { NotificationIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import { NotificationPanel } from "./NotificationPanel"
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
  const {
    user,
    panelOpen,
    setPanelOpen,
    unreadCount,
    grouped,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
    registerVisible,
  } = useNotifications()

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

  const trigger = (
    <Button
      variant="outline"
      className={cn(
        "rounded-full w-9 h-9 p-0 flex items-center justify-center relative",
        variant === "marketplace" &&
          "border-white/30 bg-white/10 hover:bg-white/20 text-white border",
        buttonClassName,
      )}
      aria-label="Notificações"
    >
      <NotificationIcon
        className={cn(
          "w-4 h-4",
          variant === "marketplace"
            ? "text-white"
            : "text-brand-dark dark:text-dark-heading",
        )}
      />
      {badge}
    </Button>
  )

  return (
    <div className={className}>
      <Dropdown
        trigger={trigger}
        align="right"
        width="w-[min(100vw-2rem,380px)]"
        contentClasses="p-0"
        showChevron={false}
        fullWidth={false}
        onToggle={setPanelOpen}
      >
        <div className="border-b border-brand-border dark:border-dark-border px-3 py-2.5">
          <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
            Notificações
          </h3>
        </div>
        <NotificationPanel
          grouped={grouped}
          isLoading={isLoading && panelOpen}
          isFetchingMore={isFetchingMore}
          hasMore={hasMore}
          onLoadMore={() => fetchMore()}
          onVisible={registerVisible}
          onNavigate={() => setPanelOpen(false)}
        />
      </Dropdown>
    </div>
  )
}
