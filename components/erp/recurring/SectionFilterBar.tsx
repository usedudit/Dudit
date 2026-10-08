"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button, Input } from "@/components/reusable"
import { FilterIcon, SearchIcon } from "@/lib/icons"

interface SectionFilterBarProps {
  onOpenFilter: () => void
  hasActiveFilters: boolean
  chips?: React.ReactNode
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }
  /** Botão extra ao lado do botão de filtros (ex.: exportar) */
  extra?: React.ReactNode
  /** Elemento alinhado à direita da barra (ex.: toggle de visualização) */
  extraRight?: React.ReactNode
  /** Elemento extra exibido apenas no mobile (ex.: botão de adicionar) */
  mobileExtra?: React.ReactNode
}

/**
 * Barra de controles padrão das seções recorrentes:
 * busca (opcional) + botão "Filtros" + chips de filtros ativos (desktop e mobile).
 */
export const SectionFilterBar: React.FC<SectionFilterBarProps> = ({
  onOpenFilter,
  hasActiveFilters,
  chips,
  search,
  extra,
  extraRight,
  mobileExtra,
}) => {
  const filtersContainerRef = useRef<HTMLDivElement>(null)
  const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false })

  const checkFilterScroll = useCallback(() => {
    if (!filtersContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = filtersContainerRef.current
    setFilterScrollState({
      left: scrollLeft > 0,
      right: scrollLeft < scrollWidth - clientWidth - 2,
    })
  }, [])

  useEffect(() => {
    checkFilterScroll()
    window.addEventListener("resize", checkFilterScroll)
    return () => window.removeEventListener("resize", checkFilterScroll)
  }, [checkFilterScroll, chips])

  return (
    <>
      {/* DESKTOP */}
      <div className="hidden md:flex items-center w-full gap-4 mb-4">
        <div className="flex items-center gap-3 shrink-0">
          {search && (
            <div className="w-80">
              <Input
                name="section-search"
                placeholder={search.placeholder || "Buscar..."}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                variant="full-rounded"
                label=""
                className="h-[42px]"
                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
              />
            </div>
          )}
          <Button variant="outline" onClick={onOpenFilter} leftIcon={<FilterIcon size={18} />}>
            Filtros
          </Button>
          {extra}
          {hasActiveFilters && <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />}
        </div>

        <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
          <div
            className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.left ? "opacity-100" : "opacity-0"}`}
          />
          <div
            ref={filtersContainerRef}
            onScroll={checkFilterScroll}
            className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
          >
            {chips}
          </div>
          <div
            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
          />
        </div>

        {extraRight && <div className="shrink-0">{extraRight}</div>}
      </div>

      {/* MOBILE */}
      <div className="md:hidden flex items-center gap-2 w-full mb-4">
        {search && (
          <div className="flex-1 min-w-0">
            <Input
              name="section-search"
              placeholder={search.placeholder || "Buscar..."}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              variant="full-rounded"
              label=""
              className="h-[42px] w-full"
              prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
            />
          </div>
        )}
        <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0 shrink-0">
          <FilterIcon className="w-4 h-4" />
        </Button>
        {extra}
        {mobileExtra}
      </div>
      <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none">
        <div className="flex items-center gap-2">{chips}</div>
      </div>
    </>
  )
}

export default SectionFilterBar
