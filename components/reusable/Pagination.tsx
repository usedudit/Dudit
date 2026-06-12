"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/reusable"
import { ArrowLeftDoubleIcon, ArrowRightDoubleIcon, ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  inline?: boolean
}

export type CompactPaginationModel = {
  currentPage: number
  totalPages: number
  pages: number[]
  showFirstNav: boolean
  showLastNav: boolean
  showFirstPage: boolean
  showLastPage: boolean
  showLeadingEllipsis: boolean
  showTrailingEllipsis: boolean
}

/**
 * Builds a compact pagination model:
 * - keeps a small centered window (default 3 pages)
 * - exposes flags for first/last nav buttons and ellipsis
 */
export function getCompactPaginationModel(
  currentPage: number,
  totalPages: number,
  maxVisiblePages = 3
): CompactPaginationModel {
  const safeTotal = Math.max(1, Math.floor(totalPages || 1))
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(currentPage || 1)))
  const visibleCount = Math.max(1, Math.floor(maxVisiblePages || 3))

  const half = Math.floor(visibleCount / 2)
  let start = Math.max(1, safeCurrent - half)
  let end = Math.min(safeTotal, start + visibleCount - 1)

  if (end - start + 1 < visibleCount) {
    start = Math.max(1, end - visibleCount + 1)
  }

  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const hiddenBeforeWindow = start > 1
  const hiddenAfterWindow = end < safeTotal

  const showFirstPage = hiddenBeforeWindow && start > 1
  const showLastPage = hiddenAfterWindow && end < safeTotal
  const showLeadingEllipsis = start > 2
  const showTrailingEllipsis = end < safeTotal - 1

  return {
    currentPage: safeCurrent,
    totalPages: safeTotal,
    pages,
    showFirstNav: hiddenBeforeWindow,
    showLastNav: hiddenAfterWindow,
    showFirstPage,
    showLastPage,
    showLeadingEllipsis,
    showTrailingEllipsis,
  }
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange, inline = false }) => {
  const model = getCompactPaginationModel(currentPage, totalPages, 3)

  return (
    <div
      className={cn(
        "flex-none pb-4 pt-4 flex justify-center z-40",
        inline
          ? "relative bg-transparent w-full"
          : "bg-white dark:bg-dark-background md:relative md:bg-transparent fixed bottom-0 left-0 w-full border-t border-brand-border dark:border-dark-border md:border-0 shadow-lg md:shadow-none"
      )}
    >
      <AnimatePresence>
        {model.totalPages > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex items-center gap-2">
            {model.showFirstNav && (
              <Button
                variant="ghost"
                onClick={() => onPageChange(1)}
                className="w-9 h-9 text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
              >
                <ArrowLeftDoubleIcon className="w-5 h-5" />
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.max(1, model.currentPage - 1))}
              disabled={model.currentPage === 1}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Button>

            {model.showFirstPage && (
              <Button
                variant="ghost"
                onClick={() => onPageChange(1)}
                className={cn(
                  "w-9 h-9 p-0",
                  model.currentPage === 1
                    ? "bg-brand-gray dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border"
                    : "bg-transparent text-brand-inactive-text dark:text-dark-body border-transparent hover:bg-brand-gray dark:hover:bg-dark-border"
                )}
              >
                1
              </Button>
            )}

            {model.showLeadingEllipsis && <span className="px-1 text-brand-inactive-text">...</span>}

            {model.pages.map((page) => {
              const isActive = model.currentPage === page
              return (
                <Button
                  key={page}
                  variant="ghost"
                  onClick={() => onPageChange(page)}
                  className={cn(
                    "w-9 h-9 p-0",
                    isActive
                      ? "bg-brand-gray dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border"
                      : "bg-transparent text-brand-inactive-text dark:text-dark-body border-transparent hover:bg-brand-gray dark:hover:bg-dark-border"
                  )}
                >
                  {page}
                </Button>
              )
            })}

            {model.showTrailingEllipsis && <span className="px-1 text-brand-inactive-text">...</span>}

            {model.showLastPage && (
              <Button
                variant="ghost"
                onClick={() => onPageChange(model.totalPages)}
                className={cn(
                  "w-9 h-9 p-0",
                  model.currentPage === model.totalPages
                    ? "bg-brand-gray dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border"
                    : "bg-transparent text-brand-inactive-text dark:text-dark-body border-transparent hover:bg-brand-gray dark:hover:bg-dark-border"
                )}
              >
                {model.totalPages}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.min(model.totalPages, model.currentPage + 1))}
              disabled={model.currentPage === model.totalPages}
              className="w-9 h-9 text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </Button>

            {model.showLastNav && (
              <Button
                variant="ghost"
                onClick={() => onPageChange(model.totalPages)}
                className="w-9 h-9 text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
              >
                <ArrowRightDoubleIcon className="w-5 h-5" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Pagination
