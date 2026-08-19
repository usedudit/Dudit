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
    TruckIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    Package,
    XIcon,
} from "@/lib/icons"

export type DeliveryTab = "todas" | "pending" | "in_progress" | "completed" | "failed"

interface FilterState {
    partnerName?: string
    paymentMethod?: string
}

interface DeliveryPageControlsProps {
    activeTab: DeliveryTab
    setActiveTab: (tab: DeliveryTab) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter?: () => void
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    tabCounts?: {
        todas?: number
        pending?: number
        in_progress?: number
        completed?: number
        failed?: number
    }
    filters?: FilterState
    setFilters?: React.Dispatch<React.SetStateAction<FilterState>>
    hasActiveFilters?: boolean
}

export default function DeliveryPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    viewMode,
    onViewModeChange,
    tabCounts = {},
    filters = {},
    setFilters,
    hasActiveFilters = false,
}: DeliveryPageControlsProps) {
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
            {filters.partnerName && (
                <FilterChip
                    label="Loja"
                    value={filters.partnerName}
                    icon={<Package size={12} />}
                    onRemove={() => setFilters?.((prev) => ({ ...prev, partnerName: undefined }))}
                />
            )}
            {filters.paymentMethod && (
                <FilterChip
                    label="Pagamento"
                    value={filters.paymentMethod}
                    onRemove={() => setFilters?.((prev) => ({ ...prev, paymentMethod: undefined }))}
                />
            )}
        </AnimatePresence>
    )

    return (
        <div className="w-full flex-none px-4 md:px-8 mb-4">
            {/* TABS HEADER */}
            <div className="mb-4">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as DeliveryTab)}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="todas"
                            icon={Package}
                            badge={<TabCountBadge count={tabCounts.todas || 0} variant="gray" />}
                        >
                            Todas
                        </TabsTrigger>
                        <TabsTrigger
                            value="pending"
                            icon={ClockIcon}
                            badge={<TabCountBadge count={tabCounts.pending || 0} variant="yellow" />}
                        >
                            Pendentes
                        </TabsTrigger>
                        <TabsTrigger
                            value="in_progress"
                            icon={TruckIcon}
                            badge={<TabCountBadge count={tabCounts.in_progress || 0} variant="blue" />}
                        >
                            Em Andamento
                        </TabsTrigger>
                        <TabsTrigger
                            value="completed"
                            icon={CheckCircleIcon}
                            badge={<TabCountBadge count={tabCounts.completed || 0} variant="green" />}
                        >
                            Concluídas
                        </TabsTrigger>
                        <TabsTrigger
                            value="failed"
                            icon={AlertTriangleIcon}
                            badge={<TabCountBadge count={tabCounts.failed || 0} variant="red" />}
                        >
                            Falhas / Problemas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* MOBILE CONTROLS */}
            <div className="flex md:hidden items-center gap-2 mb-3">
                <div className="flex-1 relative">
                    <Input
                        name="search"
                        placeholder="Buscar entregas..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-[42px] w-full"
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        label=""
                    />
                    {search && (
                        <button
                            onClick={() => onSearchChange("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                        >
                            <XIcon size={14} />
                        </button>
                    )}
                </div>
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "list"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        aria-label="Visualização em lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "grid"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        aria-label="Visualização em grid"
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>

            {/* DESKTOP CONTROLS */}
            <div className="hidden md:flex items-center w-full gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="w-80 relative">
                        <Input
                            name="search"
                            placeholder="Buscar por pedido, cliente, endereço ou loja..."
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px]"
                            variant="full-rounded"
                            label=""
                        />
                        {search && (
                            <button
                                onClick={() => onSearchChange("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                            >
                                <XIcon size={14} />
                            </button>
                        )}
                    </div>
                    {onOpenFilter && (
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon size={18} />}
                        >
                            Filtros
                        </Button>
                    )}
                    {hasActiveFilters && (
                        <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />
                    )}
                </div>

                {/* Scrollable Badges Area */}
                <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                    <div
                        className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
                            filterScrollState.left ? "opacity-100" : "opacity-0"
                        }`}
                    />
                    <div
                        ref={filtersContainerRef}
                        onScroll={checkFilterScroll}
                        className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
                    >
                        <BadgeList />
                    </div>
                    <div
                        className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
                            filterScrollState.right ? "opacity-100" : "opacity-0"
                        }`}
                    />
                </div>

                {/* View Mode Toggles */}
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "list"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em lista/tabela"
                        aria-label="Visualização em lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "grid"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em cards/grid"
                        aria-label="Visualização em grid"
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>

            {/* MOBILE ACTIVE CHIPS */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-2 flex-none">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </div>
    )
}
