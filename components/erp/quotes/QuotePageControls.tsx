import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input, Dropdown, DropdownItem } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"

import {
    SearchIcon,
    FilterIcon,
    GridIcon,
    ListIcon,
    PlusIcon,
    CheckCircleIcon,
    ClockIcon,
    CancelCircleIcon,
    ExportFileIcon,
    CalendarIcon,
    InfoIcon
} from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"

interface FilterState {
    status: string[]
    issuePeriod: DatePeriodFilterValue
}

interface QuotePageControlsProps {
    activeTab: "Todos" | "Enviados" | "Aprovados" | "Rejeitados" | "Expirados"
    setActiveTab: (tab: "Todos" | "Enviados" | "Aprovados" | "Rejeitados" | "Expirados") => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onExport: () => void
    onAddQuote?: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    tabCounts?: { Todos: number; Enviados: number; Aprovados: number; Rejeitados: number; Expirados: number }
}

const QuotePageControls: React.FC<QuotePageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    onExport,
    onAddQuote,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
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
                    icon={<InfoIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
            {isDatePeriodFilterActive(filters.issuePeriod) && (
                <FilterChip
                    label="Emissão"
                    value={summarizeDatePeriodFilter(filters.issuePeriod) || ""}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() =>
                        setFilters((prev) => ({ ...prev, issuePeriod: { ...EMPTY_DATE_PERIOD } }))
                    }
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
                        <TabsTrigger value="Todos" icon={ListIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Todos} variant="gray" />}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="Enviados" icon={ExportFileIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Enviados} variant="blue" />}>
                            Enviados
                        </TabsTrigger>
                        <TabsTrigger value="Aprovados" icon={CheckCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Aprovados} variant="green" />}>
                            Aprovados
                        </TabsTrigger>
                        <TabsTrigger value="Rejeitados" icon={CancelCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Rejeitados} variant="red" />}>
                            Rejeitados
                        </TabsTrigger>
                        <TabsTrigger value="Expirados" icon={ClockIcon} badge={tabCounts && <TabCountBadge count={tabCounts.Expirados} variant="orange" />}>
                            Expirados
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR (Responsive) --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">

                {/* MOBILE/TABLET CONTROLS ROW */}
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
                                    className="text-brand-inactive-text shrink-0"
                                />
                            }
                            label=""
                        />
                    </div>
                    <div className="flex-none flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            className="w-[42px] h-[42px] p-0 rounded-full"
                        >
                            <FilterIcon className="w-4 h-4" />
                        </Button>
                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0 rounded-full">
                                    <ExportFileIcon className="w-4 h-4" />
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                        >
                            <DropdownItem onClick={onExport}>
                                <ExportFileIcon size={14} className="mr-2" /> Exportar Planilha
                            </DropdownItem>
                        </Dropdown>
                        {onAddQuote && (
                            <Button
                                onClick={onAddQuote}
                                leftIcon={<PlusIcon className="w-5 h-5" strokeWidth={3} />}
                                className="h-[42px]"
                            />
                        )}
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar orçamentos..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={
                                    <SearchIcon
                                        size={18}
                                        className="text-brand-inactive-text shrink-0"
                                    />
                                }
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
                            <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>
                        )}
                    </div>

                    {/* Scrollable Badges Area (Desktop) */}
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

                    {/* View Toggles (Desktop) */}
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

            {/* MOBILE BADGES CAROUSEL */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </>
    )
}

export default QuotePageControls
