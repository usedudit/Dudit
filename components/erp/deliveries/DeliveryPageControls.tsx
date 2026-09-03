import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Dropdown, DropdownItem, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { SearchIcon, FilterIcon, PlusIcon, TruckIcon, BlockedIcon, SparklesIcon, Settings2Icon, CalendarIcon } from "@/lib/icons"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, summarizeDatePeriodFilter } from "@/lib/utils/filter-date-period"

interface DeliveryPageControlsProps {
    activeTab: "active" | "closed"
    onActiveTabChange: (tab: "active" | "closed") => void
    search: string
    onSearchChange: (v: string) => void
    onOpenFilter: () => void
    onAdd: () => void
    onOpenSuggestions?: () => void
    canSmartSuggest?: boolean
    addDisabled?: boolean
    tabCounts?: { active: number; closed: number }
    userRole?: string | null
    filters: { status: string[]; datePeriod: DatePeriodFilterValue }
    setFilters: React.Dispatch<React.SetStateAction<{ status: string[]; datePeriod: DatePeriodFilterValue }>>
    hasActiveFilters: boolean
}

export default function DeliveryPageControls({
    activeTab,
    onActiveTabChange,
    search,
    onSearchChange,
    onOpenFilter,
    onAdd,
    onOpenSuggestions,
    canSmartSuggest = false,
    addDisabled = false,
    tabCounts,
    userRole,
    filters,
    setFilters,
    hasActiveFilters,
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
            {filters.status.length > 0 && (
                <FilterChip
                    label="Status"
                    value={filters.status.join(", ")}
                    icon={<CalendarIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
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
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => onActiveTabChange(val as any)}
                >
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="active"
                            icon={TruckIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="blue" />}
                        >
                            Entregas Ativas
                        </TabsTrigger>
                        <TabsTrigger
                            value="closed"
                            icon={BlockedIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.closed} variant="gray" />}
                        >
                            Canceladas / Falhas
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
                    {userRole !== "delivery" && (
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
                    {userRole !== "delivery" && (
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
                                placeholder="Buscar por pedido ou cliente..."
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
