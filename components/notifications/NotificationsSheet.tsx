"use client"

import { useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { NotificationPanel } from "./NotificationPanel"
import type { NotificationsController } from "@/hooks/use-notifications"

interface NotificationsSheetProps {
  isOpen: boolean
  onClose: () => void
  notifications: NotificationsController
}

export function NotificationsSheet({ isOpen, onClose, notifications }: NotificationsSheetProps) {
  const {
    grouped,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
    registerVisible,
    markAllAsRead,
    unreadCount,
  } = notifications

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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[110] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          >
            <motion.div
              className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
              initial={{ x: "120%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "120%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
