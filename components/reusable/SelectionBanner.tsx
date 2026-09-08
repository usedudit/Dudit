"use client"

import React, { useContext, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { SidebarContext } from "@/lib/sidebar-context"
import { cn } from "@/lib/utils"

interface SelectionBannerProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  itemName?: string
  singularItemName?: string
}

export const SelectionBanner: React.FC<SelectionBannerProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  itemName = "itens",
  singularItemName = "item"
}) => {
  const isAllSelected = selectedCount >= totalCount
  const sidebar = useContext(SidebarContext)
  const isExpanded = sidebar ? sidebar.isExpanded : false
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: -56, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -56, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "fixed top-0 right-0 z-40 bg-brand-dark dark:bg-dark-surface shadow-md transition-[left] duration-300 ease-in-out",
            isExpanded ? "left-0 md:left-64" : "left-0 md:left-[68px]"
          )}
        >
          <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white text-xs font-bold">
                {selectedCount === 1 ? (
                  <>{selectedCount} {singularItemName} selecionado</>
                ) : (
                  <>{selectedCount} {itemName} selecionados</>
                )}
                {" de "}
                <span className="text-white/60">{totalCount}</span>
              </span>

              {!isAllSelected && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors cursor-pointer"
                >
                  Selecionar todos
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClearSelection}
              className="px-3 py-1.5 rounded-full bg-white text-brand-dark dark:text-dark-heading text-xs font-bold hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
