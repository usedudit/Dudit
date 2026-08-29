import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"

import {
    SearchIcon,
    FilterIcon,
    GridIcon,
    ListIcon,
    PlusIcon,
    ExportFileIcon,
    Settings2Icon,
    UploadIcon,
    PackageIcon,
    MoneyIcon,
    InfoIcon,
    GridIcon as CategoryIcon,
    ArchiveIcon,
    CancelCircleIcon,
    CheckCircleIcon
} from "@/lib/icons"

// Tipos necessários
interface FilterState {
    categories: string[]
    status: string[]
    priceRange: { min: string; max: string }
    hasCostPrice: boolean
    durationRange: { min: string; max: string }
    [key: string]: any
}

interface ServicePageControlsProps {
    activeTab: "all" | "active" | "inactive" | "archived"
    setActiveTab: (tab: "all" | "active" | "inactive" | "archived") => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onOpenImport: () => void
    onOpenExport: () => void
    onAddService: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    tabCounts?: { all: number; active: number; inactive: number; archived: number }
    isDesapego?: boolean
}

const ServicePageControls: React.FC<ServicePageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    onOpenImport,
    onOpenExport,
    onAddService,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
    tabCounts,
    isDesapego = false,
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
    }, [checkFilterScroll])

    const renderGroupedBadge = (label: string, items: string[], key: string, icon?: any) => {
        if (!items || items.length === 0) return null
        const displayValue = items.length === 1 ? items[0] : `${items[0]} +${items.length - 1}`
        const fullValue = items.join(", ")

        return (
            <FilterChip
                key={key}
                label={label}
                icon={icon}
                value={displayValue}
                tooltip={`${label}: ${fullValue}`}
                // @ts-ignore
                onRemove={() => setFilters((prev) => ({ ...prev, [key]: [] }))}
            />
        )
    }

    const renderPriceBadge = () => {
        const { min, max } = filters.priceRange
        if (!min && !max) return null
        return (
            <FilterChip
                key="price"
                label="Preço"
                icon={<MoneyIcon size={12} />}
                value={`${min ? `R$${min}` : "R$0"} - ${max ? `R$${max}` : "∞"}`}
                onRemove={() => setFilters((p: FilterState): FilterState => ({ ...p, priceRange: { min: "", max: "" } }))}
            />
        )
    }

    const BadgeList = () => (
        <AnimatePresence>
            {renderGroupedBadge("Status", filters.status, "status", <InfoIcon size={12} />)}
            {renderGroupedBadge("Categoria", filters.categories, "categories", <CategoryIcon size={12} />)}
            {renderPriceBadge()}
            {filters.hasCostPrice && (
                <FilterChip
                    key="hasCostPrice"
                    label="Preço de Custo"
                    value="Sim"
                    onRemove={() => setFilters((p: FilterState): FilterState => ({ ...p, hasCostPrice: false }))}
                />
            )}
            {filters.durationRange.min && (
                <FilterChip
                    key="durationRange"
                    label="Duração (min)"
                    value={`${filters.durationRange.min ? `${filters.durationRange.min} min` : "0 min"} - ${filters.durationRange.max ? `${filters.durationRange.max} min` : "∞"}`}
                    onRemove={() => setFilters((p: FilterState): FilterState => ({ ...p, durationRange: { min: "", max: "" } }))}
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
                    onValueChange={(val) => setActiveTab(val as "all" | "active" | "inactive" | "archived")}
                >
                    <TabsList className="px-0">
                        <TabsTrigger value="all" icon={PackageIcon} badge={tabCounts && <TabCountBadge count={tabCounts.all} variant="gray" />}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="active" icon={CheckCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="green" />}>
                            Ativos
                        </TabsTrigger>
                        <TabsTrigger value="inactive" icon={CancelCircleIcon} badge={tabCounts && <TabCountBadge count={tabCounts.inactive} variant="gray" />}>
                            Inativos
                        </TabsTrigger>
                        <TabsTrigger value="archived" icon={ArchiveIcon} badge={tabCounts && <TabCountBadge count={tabCounts.archived} variant="orange" />}>
                            Arquivados
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">

                {/* MOBILE CONTROLS ROW */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar serviço..."
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
                            className="w-[42px] h-[42px] p-0"
                        >
                            <FilterIcon className="w-4 h-4" />
                        </Button>
                        {!isDesapego && (
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
                                <DropdownItem onClick={onOpenImport}>
                                    <UploadIcon size={14} /> Importar XML
                                </DropdownItem>
                                <DropdownItem onClick={onOpenExport}>
                                    <ExportFileIcon size={14} /> Exportar
                                </DropdownItem>
                            </Dropdown>
                        )}
                        <Button
                            onClick={onAddService}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                        >
                            <PlusIcon size={18} />
                        </Button>
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">

                    {/* Search + Filter Button (Fixed Group) */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar serviço..."
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

                    {/* View Toggles (Fixed Right) */}
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

            {/* MOBILE CHIPS CAROUSEL */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </>
    )
}

export default ServicePageControls
