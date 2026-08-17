"use client"

import { useCallback, useEffect } from "react"
import { XIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { NotificationPanel } from "./NotificationPanel"
import { useNotifications } from "@/hooks/use-notifications"

interface NotificationsSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationsSheet({ isOpen, onClose }: NotificationsSheetProps) {
  const {
    grouped,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
    registerVisible,
    setPanelOpen,
    markAllAsRead,
    unreadCount,
  } = useNotifications()

  useEffect(() => {
    setPanelOpen(isOpen)
  }, [isOpen, setPanelOpen])

  const isMobile = useMediaQuery("(max-width: 1023px)")

  const handleNavigate = useCallback(() => {
    onClose()
  }, [onClose])

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="flex shrink-0 items-center justify-between border-b border-brand-border bg-white px-6 py-4 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
          Notificações
        </h2>
        <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <NotificationPanel
          grouped={grouped}
          isLoading={isLoading && isOpen}
          isFetchingMore={isFetchingMore}
          hasMore={hasMore}
          onLoadMore={() => fetchMore()}
          onVisible={registerVisible}
          onNavigate={handleNavigate}
          onMarkAllAsRead={markAllAsRead}
          unreadCount={unreadCount}
        />
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {content}
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}
