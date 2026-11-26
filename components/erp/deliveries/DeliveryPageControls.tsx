"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Dropdown, DropdownItem, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    FilterIcon,
    PlusIcon,
    SparklesIcon,
    Settings2Icon,
    CalendarIcon,
    ClockIcon,
    MotorbikeIcon,
    TruckIcon,
    GridIcon,
    ListIcon,
    ColumnsIcon,
} from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, summarizeDatePeriodFilter } from "@/lib/utils/filter-date-period"
import { useMediaQuery } from "@/components/erp/hooks"

interface DeliveryFiltersState {
    status: string[]
    timing?: string[]
    driverType?: string[]
    grouping?: string[]
    carrierName?: string[]
    hasTracking?: string[]
    feeMin?: string
    feeMax?: string
    datePeriod: DatePeriodFilterValue
}

interface BadgeListProps {
    filters: DeliveryFiltersState
    setFilters: React.Dispatch<React.SetStateAction<any>>
}

function BadgeList({ filters, setFilters }: BadgeListProps) {
    return (
        <AnimatePresence>
            {filters.status && filters.status.length > 0 && (
                <FilterChip
                    key="status"
                    label="Status"
                    value={filters.status.join(", ")}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, status: [] }))}
                />
            )}
            {filters.timing && filters.timing.length > 0 && (
                <FilterChip
                    key="timing"
                    label="Pontualidade"
                    value={filters.timing.join(", ")}
                    icon={<ClockIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, timing: [] }))}
                />
            )}
            {filters.driverType && filters.driverType.length > 0 && (
                <FilterChip
                    key="driverType"
                    label="Entregador"
                    value={filters.driverType.join(", ")}
                    icon={<MotorbikeIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, driverType: [] }))}
                />
            )}
            {filters.grouping && filters.grouping.length > 0 && (
                <FilterChip
                    key="grouping"
                    label="Agrupamento"
                    value={filters.grouping.join(", ")}
                    icon={<TruckIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, grouping: [] }))}
                />
            )}
            {filters.carrierName && filters.carrierName.length > 0 && (
                <FilterChip
                    key="carrierName"
                    label="Transportadora"
                    value={filters.carrierName.join(", ")}
                    icon={<TruckIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, carrierName: [] }))}
                />
            )}
            {filters.hasTracking && filters.hasTracking.length > 0 && (
                <FilterChip
                    key="hasTracking"
                    label="Rastreio"
                    value={filters.hasTracking.join(", ")}
                    icon={<TruckIcon size={12} />}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, hasTracking: [] }))}
                />
            )}
            {(filters.feeMin || filters.feeMax) && (
                <FilterChip
                    key="fee"
                    label="Taxa/Frete"
                    value={filters.feeMin && filters.feeMax ? `R$ ${filters.feeMin} - R$ ${filters.feeMax}` : filters.feeMin ? `>= R$ ${filters.feeMin}` : `<= R$ ${filters.feeMax}`}
                    onRemove={() => setFilters((prev: any) => ({ ...prev, feeMin: "", feeMax: "" }))}
                />
            )}
            {isDatePeriodFilterActive(filters.datePeriod) && (
                <FilterChip
                    key="period"
                    label="Período"
                    value={summarizeDatePeriodFilter(filters.datePeriod) || ""}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() =>
                        setFilters((prev: any) => ({ ...prev, datePeriod: { ...EMPTY_DATE_PERIOD } }))}
                />
            )}
        </AnimatePresence>
    )
}

interface DeliveryPageControlsProps {
    search: string
    onSearchChange: (v: string) => void
    onOpenFilter: () => void
    onAdd: () => void
    onOpenSuggestions?: () => void
    canSmartSuggest?: boolean
    addDisabled?: boolean
    userRole?: string | null
    filters: any
    setFilters: React.Dispatch<React.SetStateAction<any>>
    hasActiveFilters: boolean
    mode: "deliveries" | "carriers"
    setMode: (mode: "deliveries" | "carriers") => void
    tabCounts?: { Delivery: number; Transportadora: number }
    viewMode?: "list" | "grid" | "kanban"
    onViewModeChange?: (mode: "list" | "grid" | "kanban") => void
    isTabletOrMobile?: boolean
}

const TAB_CONFIG: Record<DeliveryPageControlsProps["mode"], { label: string; icon: typeof MotorbikeIcon; variant: "gray" | "green" | "red" | "blue" }> = {
    deliveries: { label: "Delivery", icon: MotorbikeIcon, variant: "blue" },
    carriers: { label: "Transportadora", icon: TruckIcon, variant: "green" },
}

export default function DeliveryPageControls({
    search,
    onSearchChange,
    onOpenFilter,
    onAdd,
    onOpenSuggestions,
    canSmartSuggest = false,
    addDisabled = false,
    userRole,
    filters,
    setFilters,
    hasActiveFilters,
    mode,
    setMode,
    tabCounts,
    viewMode,
    onViewModeChange,
    isTabletOrMobile: propIsTabletOrMobile,
}: DeliveryPageControlsProps) {
    const hookIsTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const isTabletOrMobile = propIsTabletOrMobile ?? hookIsTabletOrMobile
    const isDelivery = String(userRole || "").toLowerCase() === "delivery"
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

    return (
        <>
            {/* --- TABS --- */}
            {!isDelivery && (
                <div className="mb-6 px-4 md:px-8">
                    <Tabs
                        value={mode}
                        onValueChange={(val) => setMode(val as "deliveries" | "carriers")}
                    >
                        <TabsList className="px-0">
                            {(
                                ["deliveries", "carriers"] as const
                            ).map((tab) => {
                                const config = TAB_CONFIG[tab]
                                const Icon = config.icon
                                const countKey = tab === "deliveries" ? "Delivery" : "Transportadora"
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
            )}

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar entregas..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            variant="full-rounded"
                            label=""
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        className="w-[42px] h-[42px] p-0"
                    >
                        <FilterIcon className="w-4 h-4" />
                    </Button>
                    {!isTabletOrMobile && onViewModeChange && viewMode && (
                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0">
                                    {viewMode === "list" ? <ListIcon className="w-4 h-4" /> : viewMode === "grid" ? <GridIcon className="w-4 h-4" /> : <ColumnsIcon className="w-4 h-4" />}
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            className="w-fit"
                        >
                            <DropdownItem onClick={() => onViewModeChange("list")}>
                                <ListIcon size={14} /> Lista
                            </DropdownItem>
                            <DropdownItem onClick={() => onViewModeChange("grid")}>
                                <GridIcon size={14} /> Grade
                            </DropdownItem>
                            <DropdownItem onClick={() => onViewModeChange("kanban")}>
                                <ColumnsIcon size={14} /> Kanban
                            </DropdownItem>
                        </Dropdown>
                    )}
                    {!isDelivery && mode === "deliveries" && (
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
                            <DropdownItem onClick={onOpenSuggestions}>
                                <SparklesIcon size={14} /> Gerar sugestões
                            </DropdownItem>
                        </Dropdown>
                    )}
                    {!isDelivery && mode === "deliveries" && (
                        <Button
                            onClick={onAdd}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                            leftIcon={<PlusIcon size={18} />}
                        />
                    )}
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder={mode === "carriers" ? "Buscar por pedido, cliente ou rastreio..." : "Buscar por pedido ou cliente..."}
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                variant="full-rounded"
                                label=""
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                        </div>
                        <Button variant="outline" onClick={onOpenFilter} leftIcon={<FilterIcon size={18} />}>Filtros</Button>
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
                            <BadgeList filters={filters} setFilters={setFilters} />
                        </div>
                        <div
                            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
                        />
                    </div>

                    {/* View Toggles */}
                    {!isTabletOrMobile && onViewModeChange && viewMode && (
                        <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                            <button
                                type="button"
                                onClick={() => onViewModeChange("list")}
                                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                                title="Visualização em Lista"
                            >
                                <ListIcon className="w-[18px] h-[18px]" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onViewModeChange("grid")}
                                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                                title="Visualização em Grade"
                            >
                                <GridIcon className="w-[18px] h-[18px]" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onViewModeChange("kanban")}
                                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "kanban" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                                title="Visualização em Kanban"
                            >
                                <ColumnsIcon className="w-[18px] h-[18px]" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* MOBILE CHIPS */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList filters={filters} setFilters={setFilters} />
                </div>
            </div>
        </>
    )
}
