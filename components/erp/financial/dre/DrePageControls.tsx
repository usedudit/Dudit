"use client"

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { Button } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
  FileIcon,
  AnalyticsIcon,
  FilterIcon,
  ArrowUpDownIcon,
  CalendarIcon,
  StoreIcon,
  MoneyIcon,
  ArrowLeftRightIcon,
} from "@/lib/icons"
import type { DreRegime } from "@/lib/services/dre.service"
import {
  EMPTY_DATE_PERIOD,
  isDatePeriodFilterActive,
  summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"

export type PeriodPreset =
  | "current_month"
  | "last_month"
  | "last_30_days"
  | "current_quarter"
  | "current_year"
  | "custom"

export type DreViewTab = "structure" | "indicators"

interface StoreOption {
  id: string
  name: string
}

export interface DreFilterState {
  datePeriod: DatePeriodFilterValue
  stores: string[]
  regime: DreRegime[]
  comparePrevious: boolean
}

interface DrePageControlsProps {
  activeTab: DreViewTab
  setActiveTab: (tab: DreViewTab) => void
  stores: StoreOption[]
  filters: DreFilterState
  setFilters: React.Dispatch<React.SetStateAction<DreFilterState>>
  isAllExpanded: boolean
  onToggleExpandAll: () => void
}

const PERIOD_PRESET_LABELS: Record<string, string> = {
  current_month: "Mês Atual",
  last_month: "Mês Anterior",
  last_30_days: "Últimos 30 Dias",
  current_quarter: "Trimestre Atual",
  current_year: "Ano Completo",
  custom: "Personalizado",
}

export function DrePageControls({
  activeTab,
  setActiveTab,
  stores,
  filters,
  setFilters,
  isAllExpanded,
  onToggleExpandAll,
}: DrePageControlsProps) {
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
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
  }, [checkFilterScroll, filters])

  const hasActiveFilters = useMemo(() => {
    return (
      isDatePeriodFilterActive(filters.datePeriod) ||
      filters.stores.length > 0 ||
      filters.regime.length > 0 ||
      filters.comparePrevious !== true
    )
  }, [filters])

  const filterSections: FilterSectionConfig[] = useMemo(
    () => [
      {
        id: "datePeriod",
        title: "Período",
        type: "date-period",
        datePresetOptions: ["current_month", "last_month", "last_30_days", "current_quarter", "current_year", "custom"],
      },
      {
        id: "stores",
        title: "Loja",
        type: "checkbox-list",
        options: stores.map((s) => s.id),
        optionLabels: Object.fromEntries(stores.map((s) => [s.id, s.name])),
      },
      {
        id: "regime",
        title: "Regime Contábil",
        type: "checkbox-list",
        options: ["competencia", "caixa"],
        optionLabels: {
          competencia: "Competência",
          caixa: "Caixa",
        },
      },
      {
        id: "comparePrevious",
        title: "Comparativo",
        type: "switch",
        switchLabel: "Comparar com período anterior",
      },
    ],
    [stores],
  )

  const clearAllFilters = useCallback(() => {
    setFilters({
      datePeriod: { ...EMPTY_DATE_PERIOD },
      stores: [],
      regime: [],
      comparePrevious: true,
    })
  }, [setFilters])

  const removeFilter = useCallback(
    (key: string) => {
      setFilters((prev) => {
        switch (key) {
          case "datePeriod":
            return { ...prev, datePeriod: { ...EMPTY_DATE_PERIOD } }
          case "stores":
            return { ...prev, stores: [] }
          case "regime":
            return { ...prev, regime: [] }
          case "comparePrevious":
            return { ...prev, comparePrevious: true }
          default:
            return prev
        }
      })
    },
    [setFilters],
  )

  const BadgeList = () => (
    <AnimatePresence>
      {isDatePeriodFilterActive(filters.datePeriod) && (
        <FilterChip
          label="Período"
          value={summarizeDatePeriodFilter(filters.datePeriod) || ""}
          icon={<CalendarIcon size={12} />}
          onRemove={() => removeFilter("datePeriod")}
        />
      )}
      {filters.stores.length > 0 && (
        <FilterChip
          label="Loja"
          value={filters.stores.length === 1 ? stores.find((s) => s.id === filters.stores[0])?.name || filters.stores[0] : `${filters.stores.length} lojas`}
          icon={<StoreIcon size={12} />}
          onRemove={() => removeFilter("stores")}
        />
      )}
      {filters.regime.length > 0 && (
        <FilterChip
          label="Regime"
          value={filters.regime.map((r) => (r === "competencia" ? "Competência" : "Caixa")).join(", ")}
          icon={<MoneyIcon size={12} />}
          onRemove={() => removeFilter("regime")}
        />
      )}
      {filters.comparePrevious !== true && (
        <FilterChip
          label="Comparativo"
          value="Desativado"
          icon={<ArrowLeftRightIcon size={12} />}
          onRemove={() => removeFilter("comparePrevious")}
        />
      )}
    </AnimatePresence>
  )

  return (
    <>
      {/* ── Tabs de Navegação ────────────────────────────────────────────── */}
      <div className="mb-6 px-4 md:px-8 print:hidden">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as DreViewTab)}>
          <TabsList className="px-0">
            <TabsTrigger value="structure" icon={FileIcon}>
              Demonstração DRE
            </TabsTrigger>
            <TabsTrigger value="indicators" icon={AnalyticsIcon}>
              Indicadores & Margens
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Barra de Controles e Filtros ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8 print:hidden">
        {/* MOBILE CONTROLS */}
        <div className="md:hidden flex items-center gap-2 w-full">
          <Button variant="outline" onClick={() => setIsFilterSheetOpen(true)} className="flex-1 h-[42px]">
            <FilterIcon className="w-4 h-4 mr-2" />
            Filtros
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpandAll}
            className="h-[42px] px-3"
          >
            <ArrowUpDownIcon size={16} />
          </Button>
        </div>

        {/* DESKTOP CONTROLS */}
        <div className="hidden md:flex items-center w-full gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsFilterSheetOpen(true)}
              leftIcon={<FilterIcon size={18} />}
            >
              Filtros
            </Button>
            {hasActiveFilters && (
              <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />
            )}
          </div>

          {/* Scrollable Badges Area */}
          <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
            <div
              className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.left ? "opacity-100" : "opacity-0"}`}
            />
            <div
              ref={filtersContainerRef}
              onScroll={checkFilterScroll}
              className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
            >
              <BadgeList />
            </div>
            <div
              className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
            />
          </div>

          {/* Expand/Collapse Button */}
          <div className="shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleExpandAll}
              className="text-xs h-[42px]"
            >
              <ArrowUpDownIcon size={16} className="mr-1.5" />
              {isAllExpanded ? "Recolher tudo" : "Expandir tudo"}
            </Button>
          </div>
        </div>
      </div>

      {/* MOBILE CHIPS */}
      <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
        <div className="flex items-center gap-2">
          <BadgeList />
        </div>
      </div>

      {/* ── FilterSheet ──────────────────────────────────────────────────── */}
      <FilterSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        sections={filterSections}
        filters={filters}
        setFilters={setFilters as any}
        onClear={clearAllFilters}
      />
    </>
  )
}
