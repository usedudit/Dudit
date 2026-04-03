import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"

import {
    SearchIcon,
    FilterIcon,
    DashboardIcon,
    ListIcon,
    PlusIcon,
    CheckCircleIcon,
    ClockIcon,
    CancelCircleIcon,
    ExportFileIcon
} from "@/lib/icons"

interface FilterState {
    status: string[]
    period: string[]
    expiration: string[]
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
                    // @ts-ignore
                    onRemove={() => setFilters((prev) => ({ ...prev, status: [] }))}
                />
            )}
            {filters.period.length > 0 && (
                <FilterChip
                    label="Período"
                    value={filters.period.join(", ")}
                    // @ts-ignore
                    onRemove={() => setFilters((prev) => ({ ...prev, period: [] }))}
                />
            )}
            {filters.expiration.length > 0 && (
                <FilterChip
                    label="Vencimento"
                    value={filters.expiration.join(", ")}
                    // @ts-ignore
                    onRemove={() => setFilters((prev) => ({ ...prev, expiration: [] }))}
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
                        <TabsTrigger value="Todos" icon={ListIcon}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="Enviados" icon={ExportFileIcon}>
                            Enviados
                        </TabsTrigger>
                        <TabsTrigger value="Aprovados" icon={CheckCircleIcon}>
                            Aprovados
                        </TabsTrigger>
                        <TabsTrigger value="Rejeitados" icon={CancelCircleIcon}>
                            Rejeitados
                        </TabsTrigger>
                        <TabsTrigger value="Expirados" icon={ClockIcon}>
                            Expirados
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR (Desktop) --- */}
            <div className="hidden md:flex flex-row items-center justify-between gap-4 mb-4 flex-none px-8">
                <div className="flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
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
                                        className="text-brand-inactive-text flex-shrink-0"
                                    />
                                }
                                label=""
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
                        >
                            Filtros
                        </Button>
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

                    {/* View Toggles */}
                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] flex-shrink-0">
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
                            <DashboardIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>
            </div>

            {/* --- CONTROLS BAR (Mobile/Tablet) --- */}
            <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border mb-4">
                {/* Search Row */}
                <div className="px-4 py-4">
                    <Input
                        name="search"
                        placeholder="Buscar orçamentos..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-[46px] w-full"
                        variant="full-rounded"
                        prefix={
                            <SearchIcon
                                size={18}
                                className="text-brand-inactive-text flex-shrink-0"
                            />
                        }
                        label=""
                    />
                </div>
                {/* Actions Row */}
                <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            className="h-[40px] px-3 gap-2 text-sm font-bold"
                        >
                            <FilterIcon size={16} />
                            Filtros
                        </Button>
                        <Button
                            variant="outline"
                            onClick={onExport}
                            className="h-[40px] px-3 gap-2 text-sm font-bold"
                        >
                            <ExportFileIcon size={16} />
                            Exportar
                        </Button>
                    </div>
                    {onAddQuote && (
                        <Button
                            onClick={onAddQuote}
                            className="h-[40px] px-4 gap-2 text-sm font-bold bg-brand-primary text-white"
                        >
                            <PlusIcon size={16} strokeWidth={3} />
                            Novo
                        </Button>
                    )}
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

export default QuotePageControls
