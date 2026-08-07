"use client"

import React from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input, Tabs, TabsList, TabsTrigger, FormDropdown } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import FilterChip from "@/components/reusable/FilterChip"
import { SearchIcon, PlusIcon, GridIcon, AwardIcon, RankingIcon, FilterIcon, CheckCircleIcon } from "@/lib/icons"

type Tab = "Metas" | "Ranking"

type FilterState = {
    status: string[]
    periodType: string[]
    goalType: string[]
}

export default function GoalsPageControls(props: {
    activeTab: Tab
    onTabChange: (tab: Tab) => void
    search: string
    onSearchChange: (value: string) => void
    onCreate: () => void
    onOpenFilter: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
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
}) {
    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={props.activeTab} onValueChange={(val) => props.onTabChange(val as Tab)}>
                    <TabsList className="px-0">
                        <TabsTrigger value="Metas" icon={AwardIcon} badge={props.tabCounts && <TabCountBadge count={props.tabCounts.Metas} variant="gray" />}>Metas</TabsTrigger>
                        <TabsTrigger value="Ranking" icon={RankingIcon} badge={props.tabCounts && <TabCountBadge count={props.tabCounts.Ranking} variant="gray" />}>Ranking</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 px-4 md:px-8">
                {props.activeTab === "Metas" && (
                    <>
                        {/* Mobile Search & Action Bar */}
                        <div className="md:hidden flex items-center gap-2 w-full">
                            <div className="flex-1 min-w-0">
                                <Input
                                    name="search-goals"
                                    placeholder="Buscar metas..."
                                    value={props.search}
                                    onChange={(e) => props.onSearchChange(e.target.value)}
                                    className="h-[42px] w-full"
                                    variant="full-rounded"
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                    label=""
                                />
                            </div>
                            <div className="flex-none flex items-center gap-2">
                                <Button variant="outline" onClick={props.onOpenFilter} className="w-[42px] h-[42px] p-0 flex items-center justify-center">
                                    <FilterIcon className="w-4 h-4" />
                                </Button>
                                <Button
                                    onClick={props.onCreate}
                                    className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                                >
                                    <PlusIcon size={18} />
                                </Button>
                            </div>
                        </div>

                        {/* Desktop Search & Filters Bar */}
                        <div className="hidden md:flex items-center w-full gap-4">
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="w-80">
                                    <Input
                                        name="search-goals"
                                        placeholder="Buscar metas..."
                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                        value={props.search}
                                        onChange={(e) => props.onSearchChange(e.target.value)}
                                        className="h-[42px]"
                                        variant="full-rounded"
                                        label=""
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={props.onOpenFilter}
                                    leftIcon={<FilterIcon size={18} />}
                                >
                                    Filtros
                                </Button>
                                {props.hasActiveFilters && (
                                    <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />
                                )}
                            </div>

                            {/* Filter Badges Horizontal Slider */}
                            <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                                <div className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full">
                                    <AnimatePresence>
                                        {props.filters.status.length > 0 && (
                                            <FilterChip
                                                label="Status"
                                                value={props.filters.status.join(", ")}
                                                icon={<CheckCircleIcon size={12} />}
                                                onRemove={() => props.setFilters((prev) => ({ ...prev, status: [] }))}
                                            />
                                        )}
                                        {props.filters.periodType.length > 0 && (
                                            <FilterChip
                                                label="Recorrência"
                                                value={props.filters.periodType.join(", ")}
                                                onRemove={() => props.setFilters((prev) => ({ ...prev, periodType: [] }))}
                                            />
                                        )}
                                        {props.filters.goalType.length > 0 && (
                                            <FilterChip
                                                label="Tipo"
                                                value={props.filters.goalType.join(", ")}
                                                onRemove={() => props.setFilters((prev) => ({ ...prev, goalType: [] }))}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {props.activeTab === "Ranking" && (
                    <div className="flex flex-col md:flex-row items-center gap-3 w-full">
                        <div className="w-full md:w-40">
                            <FormDropdown
                                value={props.rankingPeriodMode || "monthly"}
                                setValue={(val) => props.onRankingPeriodModeChange?.(val as any)}
                                options={[
                                    { value: "monthly", label: "Mensal" },
                                    { value: "weekly", label: "Semanal" },
                                    { value: "custom", label: "Personalizado" },
                                ]}
                                className="h-[42px]"
                            />
                        </div>
                        {props.rankingPeriodMode === "custom" && (
                            <>
                                <div className="w-full md:w-40">
                                    <Input
                                        type="date"
                                        value={props.rankingStartDate || ""}
                                        onChange={(e) => props.onRankingStartDateChange?.(e.target.value)}
                                        className="h-[42px]"
                                        variant="full-rounded"
                                    />
                                </div>
                                <div className="w-full md:w-40">
                                    <Input
                                        type="date"
                                        value={props.rankingEndDate || ""}
                                        onChange={(e) => props.onRankingEndDateChange?.(e.target.value)}
                                        className="h-[42px]"
                                        variant="full-rounded"
                                    />
                                </div>
                            </>
                        )}
                        <Button
                            variant="outline"
                            className="h-[42px] px-6 rounded-full"
                            onClick={props.onApplyRankingFilter}
                            disabled={props.rankingLoading}
                        >
                            {props.rankingLoading ? "..." : "Filtrar"}
                        </Button>
                    </div>
                )}
            </div>

            {/* Mobile Filter Badges Container */}
            {props.activeTab === "Metas" && (
                <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                    <div className="flex items-center gap-2">
                        <AnimatePresence>
                            {props.filters.status.length > 0 && (
                                <FilterChip
                                    label="Status"
                                    value={props.filters.status.join(", ")}
                                    icon={<CheckCircleIcon size={12} />}
                                    onRemove={() => props.setFilters((prev) => ({ ...prev, status: [] }))}
                                />
                            )}
                            {props.filters.periodType.length > 0 && (
                                <FilterChip
                                    label="Recorrência"
                                    value={props.filters.periodType.join(", ")}
                                    onRemove={() => props.setFilters((prev) => ({ ...prev, periodType: [] }))}
                                />
                            )}
                            {props.filters.goalType.length > 0 && (
                                <FilterChip
                                    label="Tipo"
                                    value={props.filters.goalType.join(", ")}
                                    onRemove={() => props.setFilters((prev) => ({ ...prev, goalType: [] }))}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </>
    )
}
