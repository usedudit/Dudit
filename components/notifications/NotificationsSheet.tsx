"use client"

import { useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { NotificationPanel } from "./NotificationPanel"
import type { NotificationsController } from "@/hooks/use-notifications"

interface NotificationsSheetProps {
  isOpen: boolean
  onClose: () => void
  notifications: NotificationsController
}

const OPEN_SETTLE_MS = 600

export function NotificationsSheet({ isOpen, onClose, notifications }: NotificationsSheetProps) {
  const {
    grouped,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
    registerVisible,
    markAllAsRead,
    deleteAll,
    unreadCount,
    erpOptions,
    erpFilter,
    setErpFilter,
    activePartnerId,
  } = notifications

  const isMobile = useMediaQuery("(max-width: 1023px)")

  // z-index dinâmico: abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  // Enter-settle guard: a sheet aberta ainda está executando a animação de
  // slide-in (spring ~300-400ms). Um toque/drag nesse janela vence o backdrop
  // ou o drag-to-close e a sheet some em menos de 1s. Ignoramos qualquer
  // tentativa de fechamento - inclusive via backdrop/overlay - até que a
  // animação de entrada tenha finalizado, deixando o foco no conteúdo.
  const settledRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      settledRef.current = false
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => {
        settledRef.current = true
      }, OPEN_SETTLE_MS)
    } else {
      settledRef.current = false
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [isOpen])

  const guardedClose = useCallback(() => {
    if (!settledRef.current) return
    onClose()
  }, [onClose])

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
          onDeleteAll={deleteAll}
          unreadCount={unreadCount}
          erpOptions={erpOptions}
          erpFilter={erpFilter}
          onErpFilter={setErpFilter}
          activePartnerId={activePartnerId}
        />
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={guardedClose}>
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
            style={{ zIndex }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={guardedClose}
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
