"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input, Tabs, TabsList, TabsTrigger, FormDropdown, DatePicker } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import FilterChip from "@/components/reusable/FilterChip"
import { SearchIcon, PlusIcon, GridIcon, ListIcon, AwardIcon, RankingIcon, FilterIcon, CheckCircleIcon } from "@/lib/icons"

type Tab = "Metas" | "Ranking"

type FilterState = {
    status: string[]
    periodType: string[]
}

interface GoalsPageControlsProps {
    activeTab: Tab
    onTabChange: (tab: Tab) => void
    search: string
    onSearchChange: (value: string) => void
    onCreate: () => void
    onOpenFilter: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    // Ranking filters
    rankingPeriodMode?: "monthly" | "weekly" | "custom"
    onRankingPeriodModeChange?: (val: "monthly" | "weekly" | "custom") => void
    rankingStartDate?: string
    onRankingStartDateChange?: (val: string) => void
    rankingEndDate?: string
    onRankingEndDateChange?: (val: string) => void
    onApplyRankingFilter?: () => void
    rankingLoading?: boolean
    tabCounts?: { Metas: number; Ranking: number }
}

function toDateString(date: Date | undefined | null) {
    if (!date) return ""
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

const GoalsPageControls: React.FC<GoalsPageControlsProps> = ({
    activeTab,
    onTabChange,
    search,
    onSearchChange,
    onCreate,
    onOpenFilter,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
    rankingPeriodMode,
    onRankingPeriodModeChange,
    rankingStartDate,
    onRankingStartDateChange,
    rankingEndDate,
    onRankingEndDateChange,
    onApplyRankingFilter,
    rankingLoading,
    tabCounts,
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
                    icon={<CheckCircleIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
            {filters.periodType.length > 0 && (
                <FilterChip
                    label="Recorrência"
                    value={filters.periodType.join(", ")}
                    onRemove={() => setFilters((prev) => ({ ...prev, periodType: [] }))}
                />
            )}
        </AnimatePresence>
    )

    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={(val) => onTabChange(val as Tab)}>
                    <TabsList className="px-0">
                        <TabsTrigger value="Metas" icon={AwardIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Metas} variant="gray" />}>Metas</TabsTrigger>
                        <TabsTrigger value="Ranking" icon={RankingIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Ranking} variant="gray" />}>Ranking</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {activeTab === "Metas" ? (
                <>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                        <div className="md:hidden flex items-center gap-2 w-full">
                            <div className="flex-1 min-w-0">
                                <Input
                                    name="search-goals"
                                    placeholder="Buscar metas..."
                                    value={search}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                    className="h-[42px] w-full"
                                    variant="full-rounded"
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                    label=""
                                />
                            </div>
                            <div className="flex-none flex items-center gap-2">
                                <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0">
                                    <FilterIcon className="w-4 h-4" />
                                </Button>
                                <Button
                                    onClick={onCreate}
                                    className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                                >
                                    <PlusIcon size={18} />
                                </Button>
                            </div>
                        </div>

                        <div className="hidden md:flex items-center w-full gap-4">
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="w-80">
                                    <Input
                                        name="search-goals"
                                        placeholder="Buscar metas..."
                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
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
                                    leftIcon={<FilterIcon size={18} />}
                                >
                                    Filtros
                                </Button>
                                {hasActiveFilters && (
                                    <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />
                                )}
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
                                    <BadgeList />
                                </div>
                                <div
                                    className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
                                />
                            </div>

                            <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
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
                                    <GridIcon className="w-[18px] h-[18px]" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                        <div className="flex items-center gap-2">
                            <BadgeList />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col md:flex-row items-center gap-3 w-full mb-4 flex-none px-4 md:px-8">
                    <div className="w-full md:w-40">
                        <FormDropdown
                            value={rankingPeriodMode || "monthly"}
                            setValue={(val) => onRankingPeriodModeChange?.(val as any)}
                            options={[
                                { value: "monthly", label: "Mensal" },
                                { value: "weekly", label: "Semanal" },
                                { value: "custom", label: "Personalizado" },
                            ]}
                            className="h-[42px]"
                        />
                    </div>
                    {rankingPeriodMode === "custom" && (
                        <>
                            <div className="w-full md:w-44">
                                <DatePicker
                                    value={rankingStartDate || ""}
                                    onChange={(date) => onRankingStartDateChange?.(toDateString(date as Date | null))}
                                    placeholder="Data inicial"
                                />
                            </div>
                            <div className="w-full md:w-44">
                                <DatePicker
                                    value={rankingEndDate || ""}
                                    onChange={(date) => onRankingEndDateChange?.(toDateString(date as Date | null))}
                                    placeholder="Data final"
                                />
                            </div>
                        </>
                    )}
                    <Button
                        variant="outline"
                        className="h-[42px] px-6 rounded-full"
                        onClick={onApplyRankingFilter}
                        disabled={rankingLoading}
                    >
                        {rankingLoading ? "..." : "Filtrar"}
                    </Button>
                </div>
            )}
        </>
    )
}

export default GoalsPageControls