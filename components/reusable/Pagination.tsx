"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/reusable"
import { ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  const getPaginationGroup = () => {
    let start = Math.max(currentPage - 2, 1)
    let end = Math.min(start + 4, totalPages)
    if (end === totalPages) start = Math.max(end - 4, 1)
    if (start === 1) end = Math.min(5, totalPages)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }

  return (
    <div className="flex-none pb-6 pt-2 flex justify-center z-40 bg-white dark:bg-dark-background md:relative md:bg-transparent fixed bottom-0 left-0 w-full border-t border-brand-border dark:border-dark-border md:border-0 shadow-lg md:shadow-none">
      <AnimatePresence>
        {totalPages > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </Button>

            {getPaginationGroup().map((page) => {
              const isActive = currentPage === page
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

            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="w-9 h-9 text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border hover:text-brand-dark dark:hover:text-dark-heading transition-colors disabled:opacity-50 p-0"
            >
              <ChevronRightIcon className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Pagination
