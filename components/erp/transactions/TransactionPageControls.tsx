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
    PlusIcon,
    ArrowDownIcon,
    ArrowUpIcon,
    MoneyIcon,
    RepeatIcon,
    InstallmentIcon,
    CalendarIcon,
    InfoIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
} from "@/lib/icons"
import type { TransactionTab } from "../../../lib/services/transactions.types"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"

interface TransactionFilterState {
    recurringOnly: boolean
    installmentOnly: boolean
    datePeriod: DatePeriodFilterValue
    status: string[]
    category: string[]
    paymentType: string[]
}

interface TransactionPageControlsProps {
    activeTab: TransactionTab
    setActiveTab: (tab: TransactionTab) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onAddTransaction?: () => void
    filters: TransactionFilterState
    setFilters: React.Dispatch<React.SetStateAction<TransactionFilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    addDisabled?: boolean
    /** When true, hides the tab selector (used when the tab is forced by the route) */
    hideTabs?: boolean
    tabCounts?: { "Transações": number; "A pagar": number; "A receber": number; "Vencidos": number; "Cancelados": number }
    /** Monetary values for each tab (used when forcedTab is set for Receber/Pagar pages) */
    tabValues?: { "A pagar"?: { pending: number; overdue: number; completed: number }; "A receber"?: { pending: number; overdue: number; completed: number }; "Vencidos"?: { total: number }; "Cancelados"?: { total: number } }
}

const TransactionPageControls: React.FC<TransactionPageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    onAddTransaction,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
    addDisabled = false,
    hideTabs = false,
    tabCounts,
    tabValues,
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

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    }

    const getTabBadge = (tab: TransactionTab) => {
        if (!tabValues) return null
        if (tab === "Cancelados") {
            const values = tabValues["Cancelados"]
            if (!values || values.total <= 0) return null
            return (
                <TabCountBadge
                    value={formatCurrency(values.total)}
                    variant="gray"
                />
            )
        }
        if (tab === "Vencidos") {
            const values = tabValues["Vencidos"]
            if (!values || values.total <= 0) return null
            return (
                <TabCountBadge
                    value={formatCurrency(values.total)}
                    variant="red"
                />
            )
        }
        // tabValues for "A pagar" and "A receber"
        if (tab !== "A pagar" && tab !== "A receber") return null
        const values = tabValues[tab]
        if (!values) return null
        
        // Show pending + overdue value (everything left to pay/receive) as the main badge
        const tabTotal = values.pending + values.overdue
        if (tabTotal <= 0) return null
        return (
            <TabCountBadge 
                value={formatCurrency(tabTotal)} 
                variant={tab === "A receber" ? "green" : "red"} 
            />
        )
    }

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
            {filters.category.length > 0 && (
                <FilterChip
                    label="Categoria"
                    value={filters.category.join(", ")}
                    icon={<GridIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, category: [] }))}
                />
            )}
            {filters.paymentType.length > 0 && (
                <FilterChip
                    label="Pagamento"
                    value={filters.paymentType.join(", ")}
                    icon={<MoneyIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, paymentType: [] }))}
                />
            )}
            {filters.recurringOnly && (
                <FilterChip
                    label="Recorrente"
                    value="Apenas recorrentes"
                    icon={<RepeatIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, recurringOnly: false }))}
                />
            )}
            {filters.installmentOnly && (
                <FilterChip
                    label="Parcelado"
                    value="Apenas parceladas"
                    icon={<InstallmentIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, installmentOnly: false }))}
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
            {!hideTabs && (
                <div className="mb-6 px-4 md:px-8">
                    <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TransactionTab)}>
                        <TabsList className="px-0">
                            <TabsTrigger value="Transações" icon={ListIcon} badge={tabCounts && <TabCountBadge count={tabCounts["Transações"]} variant="gray" />}>
                                Transações
                            </TabsTrigger>
                            <TabsTrigger value="A pagar" icon={ArrowDownIcon} badge={getTabBadge("A pagar") || (tabCounts && <TabCountBadge count={tabCounts["A pagar"]} variant="red" />)}>
                                A pagar
                            </TabsTrigger>
                            <TabsTrigger value="A receber" icon={ArrowUpIcon} badge={getTabBadge("A receber") || (tabCounts && <TabCountBadge count={tabCounts["A receber"]} variant="green" />)}>
                                A receber
                            </TabsTrigger>
                            <TabsTrigger value="Vencidos" icon={AlertTriangleIcon} badge={getTabBadge("Vencidos") || (tabCounts && <TabCountBadge count={tabCounts["Vencidos"]} variant="red" />)}>
                                Vencidos
                            </TabsTrigger>
                            <TabsTrigger value="Cancelados" icon={CancelCircleIcon} badge={getTabBadge("Cancelados") || (tabCounts && <TabCountBadge count={tabCounts["Cancelados"]} variant="gray" />)}>
                                Cancelados
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            )}

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar..."
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
                            onClick={onAddTransaction}
                            disabled={addDisabled}
                            className={`w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green text-white shadow-sm shadow-brand-green/20 ${addDisabled ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
                        >
                            <PlusIcon className="w-5 h-5" strokeWidth={3} />
                        </Button>
                    </div>
                </div>

                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar transações..."
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
                        {hasActiveFilters && <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />}
                    </div>

                    <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                        <div className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.left ? "opacity-100" : "opacity-0"}`} />
                        <div
                            ref={filtersContainerRef}
                            onScroll={checkFilterScroll}
                            className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
                        >
                            <BadgeList />
                        </div>
                        <div className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`} />
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
    )
}

export default React.memo(TransactionPageControls)
