"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"

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

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="sticky top-14 z-20 w-full bg-brand-dark dark:bg-dark-surface shadow-md"
        >
          <div className="px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between">
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
                  className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors cursor-pointer"
                >
                  Selecionar todos
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClearSelection}
              className="px-3 py-1 rounded-full bg-white text-brand-dark dark:text-dark-heading text-xs font-bold hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
