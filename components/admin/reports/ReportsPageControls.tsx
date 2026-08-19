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
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    PackageIcon,
    ShieldIcon,
    XIcon,
} from "@/lib/icons"

export interface ReportFilterState {
    targetType: string[]
    reason: string[]
    status: string[]
}

export const INITIAL_REPORT_FILTERS: ReportFilterState = {
    targetType: [],
    reason: [],
    status: [],
}

interface ReportsPageControlsProps {
    activeTab: string
    setActiveTab: (status: string) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    filters: ReportFilterState
    setFilters: React.Dispatch<React.SetStateAction<ReportFilterState>>
    hasActiveFilters: boolean
    stats?: {
        total: number
        pending: number
        validated: number
        dismissed: number
        spam: number
    }
}

export default function ReportsPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    filters,
    setFilters,
    hasActiveFilters,
    stats,
}: ReportsPageControlsProps) {
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

    const totalActiveFilterCount =
        filters.targetType.length + filters.reason.length + filters.status.length

    const BadgeList = () => (
        <AnimatePresence>
            {filters.targetType.length > 0 && (
                <FilterChip
                    label="Alvo"
                    value={filters.targetType.join(", ")}
                    icon={<PackageIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, targetType: [] }))}
                />
            )}
            {filters.reason.length > 0 && (
                <FilterChip
                    label="Motivo"
                    value={filters.reason.join(", ")}
                    icon={<AlertTriangleIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, reason: [] }))}
                />
            )}
            {filters.status.length > 0 && (
                <FilterChip
                    label="Status"
                    value={filters.status.join(", ")}
                    icon={<ShieldIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
        </AnimatePresence>
    )

    return (
        <div className="w-full flex-none px-4 md:px-8 mb-4">
            {/* TABS HEADER */}
            <div className="mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="pending"
                            icon={ClockIcon}
                            badge={<TabCountBadge count={stats?.pending || 0} variant="yellow" />}
                        >
                            Pendentes
                        </TabsTrigger>
                        <TabsTrigger
                            value="validated"
                            icon={CheckCircleIcon}
                            badge={<TabCountBadge count={stats?.validated || 0} variant="green" />}
                        >
                            Validadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="dismissed"
                            icon={CancelCircleIcon}
                            badge={<TabCountBadge count={stats?.dismissed || 0} variant="gray" />}
                        >
                            Descartadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="spam"
                            icon={AlertTriangleIcon}
                            badge={<TabCountBadge count={stats?.spam || 0} variant="red" />}
                        >
                            Spam
                        </TabsTrigger>
                        <TabsTrigger
                            value="all"
                            icon={PackageIcon}
                            badge={<TabCountBadge count={stats?.total || 0} variant="gray" />}
                        >
                            Todas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* MOBILE CONTROLS */}
            <div className="flex md:hidden items-center gap-2 mb-3">
                <div className="flex-1 relative">
                    <Input
                        name="search"
                        placeholder="Buscar por alvo ou denunciante..."
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

                <Button
                    variant="outline"
                    onClick={onOpenFilter}
                    className="w-[42px] h-[42px] p-0 flex items-center justify-center relative shrink-0"
                    aria-label="Abrir filtros"
                >
                    <FilterIcon className="w-4 h-4" />
                    {hasActiveFilters && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-green" />
                    )}
                </Button>
            </div>

            {/* DESKTOP CONTROLS */}
            <div className="hidden md:flex items-center w-full gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="w-80 relative">
                        <Input
                            name="search"
                            placeholder="Buscar por alvo ou denunciante..."
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

                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                        className="relative"
                    >
                        Filtros
                        {totalActiveFilterCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-green text-white text-[10px] font-bold">
                                {totalActiveFilterCount}
                            </span>
                        )}
                    </Button>

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
