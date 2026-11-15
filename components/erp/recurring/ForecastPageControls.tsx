"use client"

import React from "react"
import { GridIcon, ListIcon } from "@/lib/icons"
import { SectionFilterBar } from "./SectionFilterBar"

interface ForecastPageControlsProps {
  search: string
  onSearchChange: (value: string) => void
  viewMode: "list" | "grid"
  onViewModeChange: (mode: "list" | "grid") => void
  onOpenFilter: () => void
  hasActiveFilters: boolean
  chips?: React.ReactNode
  placeholder?: string
}

/**
 * Barra de controles da seção Demanda de Estoque:
 * busca + botão "Filtros" + chips + toggle lista/grid (mesmo padrão das outras seções).
 */
export const ForecastPageControls: React.FC<ForecastPageControlsProps> = ({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onOpenFilter,
  hasActiveFilters,
  chips,
  placeholder = "Buscar produto...",
}) => {
  return (
    <SectionFilterBar
      onOpenFilter={onOpenFilter}
      hasActiveFilters={hasActiveFilters}
      chips={chips}
      search={{
        value: search,
        onChange: onSearchChange,
        placeholder,
      }}
      extraRight={
        <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
          <button
            onClick={() => onViewModeChange("list")}
            aria-label="Visualização em lista"
            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
          >
            <ListIcon className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            aria-label="Visualização em grade"
            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
          >
            <GridIcon className="w-[18px] h-[18px]" />
          </button>
        </div>
      }
    />
  )
}

export default ForecastPageControls
