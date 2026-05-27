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
          initial={{ height: 0, opacity: 0, marginBottom: 0 }}
          animate={{ height: "auto", opacity: 1, marginBottom: 16 }}
          exit={{ height: 0, opacity: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden w-full"
        >
          <div className="bg-brand-green-light dark:bg-brand-green/10 border border-brand-green/20 dark:border-brand-green/30 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-brand-dark dark:text-dark-heading transition-all">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                {selectedCount === 1 ? (
                  <>
                    <strong className="text-brand-green">{selectedCount}</strong> {singularItemName} selecionado
                  </>
                ) : (
                  <>
                    <strong className="text-brand-green">{selectedCount}</strong> {itemName} selecionados
                  </>
                )}
                {" de "}
                <strong className="text-brand-inactive-text dark:text-dark-body">{totalCount}</strong> no total.
              </span>

              {!isAllSelected && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="text-brand-green hover:underline hover:text-brand-green/90 focus:outline-none focus:ring-2 focus:ring-brand-green/25 rounded-md px-1.5 py-0.5 transition-colors font-bold cursor-pointer"
                >
                  Selecionar todos os {totalCount} {itemName}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClearSelection}
              className="text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading hover:underline focus:outline-none focus:ring-2 focus:ring-brand-inactive-text/25 rounded-md px-1.5 py-0.5 transition-colors font-bold cursor-pointer"
            >
              Limpar seleção
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
