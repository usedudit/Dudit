"use client"

import React, { useContext } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, ThreeDotsLoader } from "@/components/reusable"
import { CheckCircleIcon, XIcon } from "@/lib/icons"
import { SidebarContext } from "@/lib/sidebar-context"
import { cn } from "@/lib/utils"

interface UndoGracePeriodToastProps {
  isOpen: boolean
  title: string
  description?: string
  remainingSeconds: number
  progressPct: number
  isExecuting?: boolean
  onUndo: () => void
  onConfirmNow: () => void
}

export const UndoGracePeriodToast: React.FC<UndoGracePeriodToastProps> = ({
  isOpen,
  title,
  description,
  remainingSeconds,
  progressPct,
  isExecuting = false,
  onUndo,
  onConfirmNow,
}) => {
  const sidebar = useContext(SidebarContext)
  const isExpanded = sidebar ? sidebar.isExpanded : false

  return (
    <div
      className={cn(
        "fixed top-0 right-0 z-[9999] flex flex-col items-center pt-4 px-4 pointer-events-none transition-[left] duration-300 ease-in-out",
        isExpanded ? "left-0 md:left-64" : "left-0 md:left-[68px]"
      )}
    >
      <div className="w-full max-w-2xl space-y-2">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "pointer-events-auto w-full rounded-lg border-1 backdrop-blur-lg shadow-2xl overflow-hidden",
                "bg-background/95 dark:bg-background/95 border-border dark:border-border"
              )}
            >
              <div className="flex items-center gap-4 px-6 py-4">
                {/* Icon */}
                <div className="flex items-center justify-center rounded-full p-2 bg-green-100 dark:bg-green-950 shrink-0">
                  {isExecuting ? (
                    <ThreeDotsLoader className="p-0 h-5 w-5" dotClassName="bg-green-600 dark:bg-green-400 w-1.5 h-1.5" />
                  ) : (
                    <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground dark:text-foreground truncate">
                    {title}
                  </p>
                  {description && (
                    <p className="text-xs mt-0.5 text-muted-foreground dark:text-muted-foreground truncate">
                      {description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onUndo}
                    disabled={isExecuting}
                  >
                    Desfazer
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={onConfirmNow}
                    disabled={isExecuting}
                  >
                    {isExecuting ? "Processando..." : `Confirmar (${remainingSeconds}s)`}
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-[40px] h-[40px] p-0 shrink-0"
                    onClick={onUndo}
                    disabled={isExecuting}
                    title="Desfazer e fechar"
                  >
                    <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>
              </div>

              {/* Progress bar at the bottom */}
              {!isExecuting && (
                <div className="w-full bg-border/40 h-1 overflow-hidden">
                  <div
                    className="h-full bg-brand-green transition-all duration-100 ease-linear"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
