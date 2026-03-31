import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"

import {
  SearchIcon,
  FilterIcon,
  DashboardIcon,
  ListIcon,
  PlusIcon,
  ShoppingCart,
  CheckCircleIcon,
  ClockIcon,
  CancelCircleIcon,
  TruckIcon,
  ExportFileIcon,
} from "@/lib/icons"

interface FilterState {
  status: string[]
  channel: string[]
}

interface OrderPageControlsProps {
  activeTab: "Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado"
  setActiveTab: (tab: "Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado") => void
  search: string
  onSearchChange: (value: string) => void
  onOpenFilter: () => void
  onExport: () => void
  onAddOrder?: () => void
  filters: FilterState
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
  viewMode: "list" | "grid"
  onViewModeChange: (mode: "list" | "grid") => void
  hasActiveFilters: boolean
}

const OrderPageControls: React.FC<OrderPageControlsProps> = ({
  activeTab,
  setActiveTab,
  search,
  onSearchChange,
  onOpenFilter,
  onExport,
  onAddOrder,
  filters,
  setFilters,
  viewMode,
  onViewModeChange,
  hasActiveFilters,
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
  }, [checkFilterScroll, filters])

  const BadgeList = () => (
    <AnimatePresence>
      {filters.status.length > 0 && (
        <FilterChip
          label="Status"
          value={filters.status.join(", ")}
          // @ts-ignore
          onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
        />
      )}
      {filters.channel.length > 0 && (
        <FilterChip
          label="Canal"
          value={filters.channel.join(", ")}
          // @ts-ignore
          onRemove={() => setFilters((prev) => ({ ...prev, channel: [] }))}
        />
      )}
    </AnimatePresence>
  )

  return (
    <>
      {/* --- TABS --- */}
      <div className="mb-6 px-4 md:px-8">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as any)}
        >
          <TabsList className="px-0">
            <TabsTrigger value="Todos" icon={ShoppingCart}>
              Todos
            </TabsTrigger>
            <TabsTrigger value="Pendente" icon={ClockIcon}>
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="Pago" icon={CheckCircleIcon}>
              Pagos
            </TabsTrigger>
            <TabsTrigger value="Enviado" icon={TruckIcon}>
              Enviados
            </TabsTrigger>
             <TabsTrigger value="Cancelado" icon={CancelCircleIcon}>
              Cancelados
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* --- CONTROLS BAR --- */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
        {/* MOBILE CONTROLS */}
        <div className="md:hidden flex items-center gap-2 w-full">
          <div className="flex-1 min-w-0">
            <Input
              name="search"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-[42px] w-full"
              variant="full-rounded"
              prefix={
                <SearchIcon
                  size={18}
                  className="text-brand-inactive-text flex-shrink-0"
                />
              }
              label=""
            />
          </div>
          <div className="flex-none flex items-center gap-2">
            <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0">
              <FilterIcon className="w-4 h-4" />
            </Button>
            {onAddOrder && (
              <Button
                onClick={onAddOrder}
                className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green text-white shadow-sm shadow-brand-green/20"
              >
                <PlusIcon className="w-5 h-5" strokeWidth={3} />
              </Button>
            )}
          </div>
        </div>

        {/* DESKTOP CONTROLS */}
        <div className="hidden md:flex items-center w-full gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-80">
              <Input
                name="search"
                placeholder="Buscar pedidos..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-[42px]"
                variant="full-rounded"
                label=""
              />
            </div>
            <Button
              variant="outline"
              onClick={onOpenFilter}
              leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
            >
              Filtros
            </Button>
            {hasActiveFilters && (
              <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>
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

          {/* View Toggles */}
          <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] flex-shrink-0">
            <button
              onClick={() => onViewModeChange("list")}
              className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
            >
              <ListIcon className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
            >
              <DashboardIcon className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE CHIPS */}
      <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
        <div className="flex items-center gap-2">
          <BadgeList />
        </div>
      </div>
    </>
  )
}

export default OrderPageControls
