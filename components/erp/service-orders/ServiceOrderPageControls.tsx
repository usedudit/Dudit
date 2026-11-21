"use client"

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
    WrenchIcon,
    ExportFileIcon,
    Settings2Icon,
    CalendarIcon,
    InfoIcon,
    ClockIcon,
    CheckCircleIcon,
    BlockedIcon,
} from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"

interface FilterState {
    status: string[]
    total: { min: string; max: string }
    expected_completion_date: DatePeriodFilterValue
}

interface ServiceOrderPageControlsProps {
    activeTab: "all" | "aberta" | "em_andamento" | "concluida" | "cancelada"
    setActiveTab: (tab: "all" | "aberta" | "em_andamento" | "concluida" | "cancelada") => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onExport: () => void
    onAddOrder: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    tabCounts?: { Todas: number; Abertas: number; "Em Andamento": number; Concluidas: number; Canceladas: number }
    hideSearch?: boolean
    extraChips?: React.ReactNode
}

const TAB_CONFIG: Record<ServiceOrderPageControlsProps["activeTab"], { label: string; icon: typeof WrenchIcon; variant: "gray" | "green" | "yellow" | "blue" | "red" }> = {
    all: { label: "Todas", icon: WrenchIcon, variant: "gray" },
    aberta: { label: "Abertas", icon: PlusIcon, variant: "blue" },
    em_andamento: { label: "Em Andamento", icon: ClockIcon, variant: "yellow" },
    concluida: { label: "Concluídas", icon: CheckCircleIcon, variant: "green" },
    cancelada: { label: "Canceladas", icon: BlockedIcon, variant: "red" },
}

const ServiceOrderPageControls: React.FC<ServiceOrderPageControlsProps> = ({
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
    tabCounts,
    hideSearch = false,
    extraChips,
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
            {extraChips}
            {filters.status.length > 0 && (
                <FilterChip
                    label="Status"
                    value={filters.status.join(", ")}
                    icon={<InfoIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
            {filters.total.min && filters.total.max && (
                <FilterChip
                    label="Valor"
                    value={`${filters.total.min ? `R$ ${filters.total.min}` : "R$ 0"} - ${filters.total.max ? `R$ ${filters.total.max}` : "∞"}`}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, total: { min: "", max: "" } }))}
                />
            )}
            {isDatePeriodFilterActive(filters.expected_completion_date) && (
                <FilterChip
                    label="Data Prevista"
                    value={summarizeDatePeriodFilter(filters.expected_completion_date) || ""}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, expected_completion_date: { ...EMPTY_DATE_PERIOD } }))}
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
                    onValueChange={(val) => setActiveTab(val as ServiceOrderPageControlsProps["activeTab"])}
                >
                    <TabsList className="px-0">
                        {(
                            ["all", "aberta", "em_andamento", "concluida", "cancelada"] as const
                        ).map((tab) => {
                            const config = TAB_CONFIG[tab]
                            const Icon = config.icon
                            const countKey = tab === "all" ? "Todas" : tab === "aberta" ? "Abertas" : tab === "em_andamento" ? "Em Andamento" : tab === "concluida" ? "Concluidas" : "Canceladas"
                            return (
                                <TabsTrigger
                                    key={tab}
                                    value={tab}
                                    icon={Icon}
                                    badge={tabCounts && <TabCountBadge count={tabCounts[countKey as keyof typeof tabCounts]} variant={config.variant} />}
                                >
                                    {config.label}
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    {!hideSearch && (
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
                    )}
                    <div className="flex-none flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            className={hideSearch ? "h-[42px]" : "w-[42px] h-[42px] p-0"}
                            leftIcon={hideSearch ? <FilterIcon size={16} /> : undefined}
                        >
                            {hideSearch ? "Filtros e Busca" : <FilterIcon className="w-4 h-4" />}
                        </Button>
                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0">
                                    <Settings2Icon className="w-4 h-4" />
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            className="w-fit"
                        >
                            <DropdownItem onClick={onExport}>
                                <ExportFileIcon size={14} /> Exportar
                            </DropdownItem>
                        </Dropdown>
                        <Button
                            onClick={onAddOrder}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                            leftIcon={<PlusIcon size={18} />}
                        />
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        {!hideSearch && (
                            <div className="w-80">
                                <Input
                                    name="search"
                                    placeholder="Buscar por nº, título ou cliente..."
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
                        )}
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon size={18} />}
                        >
                            {hideSearch ? "Filtros e Busca" : "Filtros"}
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

                    {/* View Toggles */}
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

            {/* MOBILE CHIPS */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </>
    )
}

export default ServiceOrderPageControls