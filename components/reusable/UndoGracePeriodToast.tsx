"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, ThreeDotsLoader } from "@/components/reusable"
import { CheckIcon, ClockIcon } from "@/lib/icons"

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
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: 50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-lg shadow-2xl rounded-2xl bg-brand-dark dark:bg-dark-surface border border-white/10 dark:border-dark-border text-white overflow-hidden backdrop-blur-md"
        >
          {/* Main Content Row */}
          <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-brand-primary shrink-0">
                {isExecuting ? (
                  <ThreeDotsLoader className="p-0 h-4 w-6" dotClassName="bg-white w-1.5 h-1.5" />
                ) : (
                  <ClockIcon className="w-5 h-5 animate-pulse text-amber-400" />
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white truncate">
                    {title}
                  </span>
                  {!isExecuting && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-white font-mono font-medium">
                      {remainingSeconds}s
                    </span>
                  )}
                </div>
                {description && (
                  <span className="text-xs text-white/70 truncate mt-0.5">
                    {description}
                  </span>
                )}
              </div>
            </div>

            {/* Actions Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="filled"
                onClick={onUndo}
                disabled={isExecuting}
                className="h-8 px-3 text-xs font-bold bg-white text-brand-dark hover:bg-gray-100 dark:bg-white dark:text-brand-dark transition-all shadow-sm"
              >
                Desfazer
              </Button>

              <button
                type="button"
                onClick={onConfirmNow}
                disabled={isExecuting}
                title="Confirmar imediatamente sem esperar"
                className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Confirmar</span>
              </button>
            </div>
          </div>

          {/* Countdown Progress Bar */}
          {!isExecuting && (
            <div className="w-full h-1 bg-white/10 relative overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-brand-primary transition-all duration-100 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
