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
    CalendarIcon,
    InfoIcon,
} from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"

export interface PurchaseFilterState {
    status: string[]
    purchaseType: string[]
    datePeriod: DatePeriodFilterValue
}

interface PurchasesPageControlsProps {
    activeTab: string
    setActiveTab: (tab: string) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    filters: PurchaseFilterState
    setFilters: React.Dispatch<React.SetStateAction<PurchaseFilterState>>
    hasActiveFilters: boolean
    tabCounts?: {
        total: number
        completed: number
        pending: number
        failed: number
        refunded: number
        cancelled: number
    }
    getTabLabel: (tab: string) => string
    getTabCount: (tab: string) => number
}

const tabConfigs = [
    { value: "all", icon: "📋", variant: "gray" as const },
    { value: "completed", icon: "✅", variant: "green" as const },
    { value: "pending", icon: "⏳", variant: "orange" as const },
    { value: "failed", icon: "❌", variant: "red" as const },
    { value: "refunded", icon: "🔄", variant: "yellow" as const },
    { value: "cancelled", icon: "🚫", variant: "gray" as const },
] as const

export default function PurchasesPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    filters,
    setFilters,
    hasActiveFilters,
    tabCounts,
    getTabLabel,
    getTabCount,
}: PurchasesPageControlsProps) {
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
            {filters.purchaseType.length > 0 && (
                <FilterChip
                    label="Tipo"
                    value={filters.purchaseType.join(", ")}
                    icon={<InfoIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, purchaseType: [] }))}
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
                    <TabsList className="px-0 gap-1 md:gap-2 overflow-x-auto hide-scrollbar pb-1">
                        {tabConfigs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                badge={tabCounts && <TabCountBadge count={getTabCount(tab.value)} variant={tab.variant} />}
                            >
                                {getTabLabel(tab.value)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            placeholder="Buscar por loja, plano, tipo ou protocolo..."
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
                                placeholder="Buscar por loja, plano, tipo ou protocolo..."
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