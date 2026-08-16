"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    FilterIcon,
    GridIcon,
    ListIcon,
    ShoppingCartIcon,
    CheckCircleIcon,
    ClockIcon,
    CancelCircleIcon,
    TruckIcon,
    CalendarIcon,
    InfoIcon,
    StoreIcon,
} from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"

export interface OrderFilterState {
    status: string[]
    deliveryStatus: string[]
    paymentMethod: string[]
    channel: string[]
    datePeriod: DatePeriodFilterValue
}

interface OrdersPageControlsProps {
    activeTab: string
    setActiveTab: (tab: string) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    filters: OrderFilterState
    setFilters: React.Dispatch<React.SetStateAction<OrderFilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    tabCounts?: {
        total: number
        pending: number
        paid: number
        delivered: number
        cancelled: number
    }
}

export default function OrdersPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
    tabCounts,
}: OrdersPageControlsProps) {
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
                    icon={<InfoIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
            {filters.deliveryStatus.length > 0 && (
                <FilterChip
                    label="Entrega"
                    value={filters.deliveryStatus.join(", ")}
                    icon={<TruckIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, deliveryStatus: [] }))}
                />
            )}
            {filters.paymentMethod.length > 0 && (
                <FilterChip
                    label="Pagamento"
                    value={filters.paymentMethod.join(", ")}
                    icon={<InfoIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, paymentMethod: [] }))}
                />
            )}
            {filters.channel.length > 0 && (
                <FilterChip
                    label="Canal"
                    value={filters.channel.join(", ")}
                    icon={<StoreIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, channel: [] }))}
                />
            )}
            {isDatePeriodFilterActive(filters.datePeriod) && (
                <FilterChip
                    label="Período"
                    value={summarizeDatePeriodFilter(filters.datePeriod) || ""}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() =>
                        setFilters((prev) => ({ ...prev, datePeriod: { ...EMPTY_DATE_PERIOD } }))
                    }
                />
            )}
        </AnimatePresence>
    )

    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="all"
                            icon={ShoppingCartIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.total} variant="gray" />}
                        >
                            Todos
                        </TabsTrigger>
                        <TabsTrigger
                            value="pending"
                            icon={ClockIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.pending} variant="yellow" />}
                        >
                            Pendentes
                        </TabsTrigger>
                        <TabsTrigger
                            value="paid"
                            icon={CheckCircleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.paid} variant="green" />}
                        >
                            Pagos
                        </TabsTrigger>
                        <TabsTrigger
                            value="delivered"
                            icon={TruckIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.delivered} variant="blue" />}
                        >
                            Entregues
                        </TabsTrigger>
                        <TabsTrigger
                            value="cancelled"
                            icon={CancelCircleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.cancelled} variant="red" />}
                        >
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
                            placeholder="Buscar pedido, cliente..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0 shrink-0">
                        <FilterIcon className="w-4 h-4" />
                    </Button>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                placeholder="Buscar por número, cliente ou loja..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
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

                    {/* View Toggles */}
                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Lista"
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("grid")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Grade"
                        >
                            <GridIcon className="w-[18px] h-[18px]" />
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
