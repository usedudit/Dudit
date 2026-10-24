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
    NormalProductsIcon,
    LowProductsIcon,
    OutProductsIcon,
    MoneyIcon,
    InfoIcon,
    TagIcon,
    CameraIcon,
    StarIcon,
    ArchiveIcon,
} from "@/lib/icons"

// Tipos necessários
interface FilterState {
    categories: string[]
    brands: string[]
    stocks: string[]
    status: string[]
    productTypes: string[]
    priceRange: { min: string; max: string }
    hasCostPrice: boolean
    isOnPromotion: boolean
}

interface ProductPageControlsProps {
    activeTab: "all" | "normal" | "low" | "out_of_stock" | "archived"
    setActiveTab: (tab: "all" | "normal" | "low" | "out_of_stock" | "archived") => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onOpenImport: () => void
    onOpenExport: () => void
    onAddProduct: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
    onScanBarcode?: (code: string) => void
    onOpenCamera?: () => void
    onOpenReplenishment?: () => void
    hasEscalarPlan?: boolean
    tabCounts?: { all: number; normal: number; low: number; out_of_stock: number; archived: number }
    isDesapego?: boolean
}

const ProductPageControls: React.FC<ProductPageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    onOpenImport,
    onOpenExport,
    onAddProduct,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
    onScanBarcode,
    onOpenCamera,
    onOpenReplenishment,
    hasEscalarPlan,
    tabCounts,
    isDesapego = false,
}) => {
    // Estado local para o scroll dos filtros (badges)
    const filtersContainerRef = useRef<HTMLDivElement>(null)
    const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false })

    // Estado local para foco travado
    const [focusLock, setFocusLock] = useState(false)
    const desktopInputRef = useRef<HTMLInputElement>(null)
    const mobileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (focusLock) {
            const interval = setInterval(() => {
                const activeRef = window.innerWidth >= 768 ? desktopInputRef : mobileInputRef
                if (activeRef.current && document.activeElement !== activeRef.current) {
                    activeRef.current.focus()
                }
            }, 500)
            return () => clearInterval(interval)
        }
    }, [focusLock])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault()
            const scannedValue = search.trim()
            if (scannedValue && onScanBarcode) {
                onScanBarcode(scannedValue)
            }
        }
    }

    // Lógica de Scroll dos Badges
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

    // Helpers de Renderização
    const renderGroupedBadge = (label: string, items: string[], key: keyof FilterState, icon?: any) => {
        if (items.length === 0) return null
        const displayValue = items.length <= 3 ? items.join(", ") : `${items.slice(0, 3).join(", ")}...`
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
                onRemove={() => setFilters((p) => ({ ...p, priceRange: { min: "", max: "" } }))}
            />
        )
    }

    // Componente interno para a lista de badges
    const BadgeList = () => (
        <AnimatePresence>
            {renderGroupedBadge("Status", filters.status, "status", <InfoIcon size={12} />)}
            {renderGroupedBadge("Estoque", filters.stocks, "stocks", <PackageIcon size={12} />)}
            {renderGroupedBadge("Categoria", filters.categories, "categories", <GridIcon size={12} />)}
            {renderGroupedBadge("Marca", filters.brands, "brands", <TagIcon size={12} />)}
            {renderGroupedBadge("Tipo", filters.productTypes, "productTypes", <GridIcon size={12} />)}
            {renderPriceBadge()}
            {filters.hasCostPrice && (
                <FilterChip
                    key="hasCostPrice"
                    label="Preço de Custo"
                    value="Sim"
                    onRemove={() => setFilters((p) => ({ ...p, hasCostPrice: false }))}
                />
            )}
            {filters.isOnPromotion && (
                <FilterChip
                    key="isOnPromotion"
                    label="Promoção"
                    value="Sim"
                    onRemove={() => setFilters((p) => ({ ...p, isOnPromotion: false }))}
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
                    onValueChange={(val) => setActiveTab(val as "all" | "normal" | "low" | "out_of_stock" | "archived")}
                >
                    <TabsList className="px-0">
                        <TabsTrigger value="all" icon={PackageIcon} badge={tabCounts && <TabCountBadge count={tabCounts.all} variant="gray" />}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="normal" icon={NormalProductsIcon} badge={tabCounts && <TabCountBadge count={tabCounts.normal} variant="green" />}>
                            Normal
                        </TabsTrigger>
                        <TabsTrigger value="low" icon={LowProductsIcon} badge={tabCounts && <TabCountBadge count={tabCounts.low} variant="yellow" />}>
                            Baixo
                        </TabsTrigger>
                        <TabsTrigger value="out_of_stock" icon={OutProductsIcon} badge={tabCounts && <TabCountBadge count={tabCounts.out_of_stock} variant="red" />}>
                            Esgotado
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
                            ref={mobileInputRef}
                            name="search"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            onKeyDown={handleKeyDown}
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
                                <DropdownItem onClick={onOpenReplenishment}>
                                    <div className="flex items-center gap-2">
                                        <StarIcon size={14} className={hasEscalarPlan ? "" : "text-brand-inactive-text"} />
                                        <span>Sugestões</span>
                                        {!hasEscalarPlan && (
                                            <span className="text-[10px] font-bold text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded ml-auto">Premium</span>
                                        )}
                                    </div>
                                </DropdownItem>
                                <DropdownItem onClick={onOpenCamera}>
                                    <CameraIcon size={14} /> Escanear Câmera
                                </DropdownItem>
                                <DropdownItem onClick={onOpenImport}>
                                    <UploadIcon size={14} /> Importar XML
                                </DropdownItem>
                                <DropdownItem onClick={onOpenExport}>
                                    <ExportFileIcon size={14} /> Exportar
                                </DropdownItem>
                            </Dropdown>
                        )}
                        <Button
                            onClick={onAddProduct}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                            leftIcon={<PlusIcon size={18} />}
                        />
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">

                    {/* Search + Filter Button (Fixed Group) */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                ref={desktopInputRef}
                                name="search"
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                onKeyDown={handleKeyDown}
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
                        {/* Fade Left */}
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

                        {/* Fade Right */}
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

export default ProductPageControls
