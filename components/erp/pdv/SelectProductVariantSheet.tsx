"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"

import { Button, IconPlaceholder, Input } from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { BoxIcon, XIcon, SearchIcon, FilterIcon, ArrowUpDownIcon, MoneyIcon, InfoIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

const INITIAL_FILTERS = {
    status: [],
    priceRange: { min: "", max: "" },
    stockRange: { min: "", max: "" }
}

type Props = {
    isOpen: boolean
    product: any
    onClose: () => void
    onConfirm: (selections: Array<{ variantId: string; qty: number }>) => void
}

export default function SelectProductVariantSheet({ isOpen, product, onClose, onConfirm }: Props) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [qtyByVariantId, setQtyByVariantId] = useState<Record<string, number>>({})

    // Filtering, search, and sorting states
    const [search, setSearch] = useState("")
    const [filters, setFilters] = useState<any>(INITIAL_FILTERS)
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [sortConfig, setSortConfig] = useState<{ key: "name" | "price" | "stock"; direction: "asc" | "desc" } | null>(null)

    // Paging state
    const [visibleCount, setVisibleCount] = useState(10)
    const listScrollRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const loadMoreLock = useRef(false)

    // Reset states when opening
    useEffect(() => {
        if (isOpen) {
            setSearch("")
            setFilters(INITIAL_FILTERS)
            setSortConfig(null)
            setVisibleCount(10)
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || !product) return
        const next: Record<string, number> = {}
        const variantsList = product.product_variants || product.variants || []
        for (const variant of variantsList) {
            next[variant.id] = 0
        }
        setQtyByVariantId(next)
    }, [isOpen, product])

    const selections = useMemo(() => {
        return Object.entries(qtyByVariantId)
            .map(([variantId, qty]) => ({ variantId, qty: Math.max(0, Number(qty || 0)) }))
            .filter((item) => item.qty > 0)
    }, [qtyByVariantId])

    // Dynamic filter configuration
    const filterConfig = useMemo<FilterSectionConfig[]>(() => {
        if (!product) return []
        const attrMap = new Map<string, Set<string>>()
        const variantsList = product.product_variants || product.variants || []
        const SPLIT_SEPARATOR = " / "

        variantsList.forEach((v: any) => {
            const typeStr = v.variant_type || v.type || ""
            const nameStr = v.variant_name || v.name || ""
            const types = typeStr.includes(SPLIT_SEPARATOR) ? typeStr.split(SPLIT_SEPARATOR) : [typeStr]
            const names = nameStr.includes(SPLIT_SEPARATOR) ? nameStr.split(SPLIT_SEPARATOR) : [nameStr]

            types.forEach((t: string, idx: number) => {
                const val = names[idx] || names[0]
                if (!t.trim()) return
                if (!attrMap.has(t)) attrMap.set(t, new Set())
                if (val) attrMap.get(t)?.add(val)
            })
        })

        const dynamicSections = Array.from(attrMap.entries()).map(([key, values]) => ({
            id: `attr_${key}`,
            title: key,
            type: "checkbox-list" as const,
            options: Array.from(values).sort()
        })).sort((a, b) => a.title.localeCompare(b.title))

        return [
            { id: "status", title: "Status", type: "checkbox-list" as const, options: ["Ativo", "Inativo"] },
            { id: "priceRange", title: "Preço", type: "range" as const, rangeConfig: { minKey: "minPrice", maxKey: "maxPrice", minPlaceholder: "R$ Min", maxPlaceholder: "R$ Max" } },
            { id: "stockRange", title: "Estoque", type: "range" as const, rangeConfig: { minKey: "minStock", maxKey: "maxStock", minPlaceholder: "Qtd Min", maxPlaceholder: "Qtd Max" } },
            ...dynamicSections
        ]
    }, [product])

    // Filtered and sorted variants
    const sortedAndFilteredVariants = useMemo(() => {
        if (!product) return []
        let result = (product.product_variants || product.variants || []).map((variant: any) => {
            const stock = Math.max(0, Number(variant.stock_available ?? variant.stock ?? 0))
            const variantImage = (variant.variant_options?.image as string | undefined) || variant.image || product.images?.[0] || product.image || null
            const variantPrice = variant.price !== undefined ? Number(variant.price) : (Number(product.price || 0) + Number(variant.price_adjustment || 0))
            const variantName = variant.variant_name || variant.name || ""
            return {
                ...variant,
                name: variantName,
                price: variantPrice,
                stock,
                image: variantImage
            }
        })

        // 1. Text search
        if (search.trim()) {
            const q = search.toLowerCase().trim()
            result = result.filter(
                (v: any) =>
                    v.name.toLowerCase().includes(q) ||
                    (v.sku && v.sku.toLowerCase().includes(q))
            )
        }

        // 2. Status filter
        if (filters.status && filters.status.length > 0) {
            result = result.filter((v: any) => {
                const isActive = v.is_active !== undefined ? v.is_active : v.status !== undefined ? v.status : true
                const statusLabel = isActive ? "Ativo" : "Inativo"
                return filters.status.includes(statusLabel)
            })
        }

        // 3. Price range filter
        if (filters.priceRange) {
            const { min, max } = filters.priceRange
            if (min) result = result.filter((v: any) => v.price >= parseFloat(min))
            if (max) result = result.filter((v: any) => v.price <= parseFloat(max))
        }

        // 4. Stock range filter
        if (filters.stockRange) {
            const { min, max } = filters.stockRange
            if (min) result = result.filter((v: any) => v.stock >= parseFloat(min))
            if (max) result = result.filter((v: any) => v.stock <= parseFloat(max))
        }

        // 5. Attributes filter
        const attrFilters = Object.keys(filters).filter(k => k.startsWith("attr_") && filters[k].length > 0)
        if (attrFilters.length > 0) {
            const SPLIT_SEPARATOR = " / "
            result = result.filter((v: any) => {
                const typeStr = v.variant_type || v.type || ""
                const nameStr = v.variant_name || v.name || ""
                const types = typeStr.split(SPLIT_SEPARATOR)
                const names = nameStr.split(SPLIT_SEPARATOR)

                return attrFilters.every(filterKey => {
                    const targetAttr = filterKey.replace("attr_", "")
                    const selectedValues = filters[filterKey] as string[]
                    const typeIndex = types.indexOf(targetAttr)

                    if (typeIndex === -1) return false
                    const val = names[typeIndex] || names[0]
                    return selectedValues.includes(val)
                })
            })
        }

        // 6. Sorting
        if (sortConfig) {
            result.sort((a: any, b: any) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]

                if (sortConfig.key === "price" || sortConfig.key === "stock") {
                    aVal = Number(aVal) || 0
                    bVal = Number(bVal) || 0
                } else {
                    aVal = String(aVal || "").toLowerCase()
                    bVal = String(bVal || "").toLowerCase()
                }

                if (aVal === bVal) return 0
                const comp = aVal > bVal ? 1 : -1
                return sortConfig.direction === "asc" ? comp : -comp
            })
        }

        return result
    }, [product, search, filters, sortConfig])

    // Pagination slicing
    useEffect(() => {
        setVisibleCount(10)
    }, [search, filters])

    const displayedVariants = useMemo(() => {
        return sortedAndFilteredVariants.slice(0, visibleCount)
    }, [sortedAndFilteredVariants, visibleCount])

    const hasMore = sortedAndFilteredVariants.length > visibleCount

    const loadMore = useCallback(() => {
        setVisibleCount((prev) => prev + 10)
    }, [])

    // Infinite scroll intersection observer
    useEffect(() => {
        const root = listScrollRef.current
        const target = sentinelRef.current
        if (!isOpen || !root || !target || !hasMore) return

        const obs = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting || loadMoreLock.current) return
                loadMoreLock.current = true
                loadMore()
                window.setTimeout(() => {
                    loadMoreLock.current = false
                }, 120)
            },
            { root, rootMargin: "100px", threshold: 0 }
        )
        obs.observe(target)
        return () => obs.disconnect()
    }, [isOpen, hasMore, loadMore, displayedVariants.length])

    if (!product) return null

    const canConfirm = selections.length > 0

    const updateVariantQty = (variantId: string, qty: number, stockLimit?: number | null) => {
        const parsedQty = Math.max(0, Number(qty || 0))
        const maxQty = product.allow_sell_without_stock ? parsedQty : Math.min(parsedQty, Math.max(0, Number(stockLimit || 0)))
        setQtyByVariantId((prev) => ({ ...prev, [variantId]: maxQty }))
    }

    // Active filter chip renders
    const hasActiveFilters = filters.status.length > 0 ||
        !!filters.priceRange.min || !!filters.priceRange.max ||
        !!filters.stockRange.min || !!filters.stockRange.max ||
        Object.keys(filters).some(k => k.startsWith("attr_") && (filters[k] as string[]).length > 0)

    const renderRangeBadge = (key: "priceRange" | "stockRange", label: string, prefix: string = "") => {
        const { min, max } = filters[key] || {}
        if (!min && !max) return null
        return (
            <FilterChip
                key={key}
                label={label}
                icon={<MoneyIcon size={12} />}
                value={`${min ? `${prefix}${min}` : "0"} - ${max ? `${prefix}${max}` : "∞"}`}
                onRemove={() => setFilters((p: any) => ({ ...p, [key]: { min: "", max: "" } }))}
            />
        )
    }

    const renderListBadge = (key: string, label: string) => {
        const items = filters[key] as string[]
        if (!items || items.length === 0) return null
        return (
            <FilterChip
                key={key}
                label={label}
                icon={<InfoIcon size={12} />}
                value={items.length <= 3 ? items.join(", ") : `${items.slice(0, 3).join(", ")}...`}
                tooltip={`${label}: ${items.join(", ")}`}
                onRemove={() => setFilters((p: any) => ({ ...p, [key]: [] }))}
            />
        )
    }

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar variações</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Search and Filters Controls */}
            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <Input
                            label=""
                            name="variantSearch"
                            placeholder="Buscar por nome ou SKU..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            className="mb-0 h-[42px]"
                            variant="full-rounded"
                        />
                    </div>
                    <Button
                        variant="outline"
                        className="w-[42px] h-[42px] p-0 shrink-0 flex items-center justify-center rounded-full"
                        onClick={() => setIsFilterOpen(true)}
                    >
                        <FilterIcon className="w-[18px] h-[18px]" />
                    </Button>
                    <Dropdown
                        fullWidth={false}
                        align="right"
                        showChevron={false}
                        trigger={
                            <Button
                                variant="outline"
                                className="w-[42px] h-[42px] p-0 shrink-0 flex items-center justify-center rounded-full"
                            >
                                <ArrowUpDownIcon className="w-[18px] h-[18px]" />
                            </Button>
                        }
                    >
                        <DropdownItem onClick={() => setSortConfig({ key: "name", direction: "asc" })}>
                            Nome (A-Z)
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortConfig({ key: "name", direction: "desc" })}>
                            Nome (Z-A)
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortConfig({ key: "price", direction: "asc" })}>
                            Menor preço
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortConfig({ key: "price", direction: "desc" })}>
                            Maior preço
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortConfig({ key: "stock", direction: "asc" })}>
                            Menor estoque
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortConfig({ key: "stock", direction: "desc" })}>
                            Maior estoque
                        </DropdownItem>
                    </Dropdown>
                </div>

                {hasActiveFilters && (
                    <div className="flex flex-wrap items-center gap-2">
                        {renderListBadge("status", "Status")}
                        {renderRangeBadge("priceRange", "Preço", "R$")}
                        {renderRangeBadge("stockRange", "Estoque")}
                        {Object.keys(filters).filter(k => k.startsWith("attr_")).map(k => renderListBadge(k, k.replace("attr_", "")))}
                    </div>
                )}
            </div>

            <div ref={listScrollRef} className="custom-scrollbar flex-1 overflow-y-auto p-0">
                <div className="border-b border-brand-border px-4 py-4 dark:border-dark-border">
                    <div className="flex gap-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                            <img
                                src={getR2ImageUrl(product.images?.[0] || product.image || null, "thumbnail") || PLACEHOLDER_IMAGE}
                                alt={product.name}
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-bold text-brand-dark dark:text-dark-heading">{product.name}</h3>
                        </div>
                    </div>
                </div>

                {displayedVariants.length === 0 ? (
                    <div className="px-4 py-10">
                        <IconPlaceholder
                            icon={BoxIcon}
                            title={hasActiveFilters || search.trim() ? "Nenhuma variação encontrada" : "Sem variações"}
                            subtitle={hasActiveFilters || search.trim() ? "Tente limpar os filtros ou alterar a busca." : "Este produto não possui variações para seleção."}
                            itemButton={hasActiveFilters || search.trim() ? {
                                text: "Limpar filtros",
                                action: () => setFilters(INITIAL_FILTERS),
                                variant: "outline"
                            } : undefined}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col px-2 pb-2">
                        {displayedVariants.map((variant: any) => {
                            const stock = variant.stock
                            const currentQty = Math.max(0, Number(qtyByVariantId[variant.id] || 0))
                            const variantImage = variant.image
                            const variantPrice = variant.price
                            const outOfStock = !product.allow_sell_without_stock && stock <= 0
                            const isSelected = currentQty > 0

                            return (
                                <div
                                    key={variant.id}
                                    className={`group flex items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border transition-colors ${isSelected ? "bg-brand-primary/5 dark:bg-brand-primary/10" : "hover:bg-gray-50 dark:hover:bg-dark-border/40"}`}
                                >
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                                        <img
                                            src={getR2ImageUrl(variantImage, "thumbnail") || PLACEHOLDER_IMAGE}
                                            alt={variant.name}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{variant.name}</p>
                                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">SKU: {variant.sku || "-"}</p>
                                        <p className="mt-0.5 text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(variantPrice)}</p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className={`text-sm font-bold ${outOfStock ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                                                {stock}
                                            </p>
                                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Estoque</p>
                                        </div>

                                        <QuantitySelector
                                            value={currentQty}
                                            min={0}
                                            max={product.allow_sell_without_stock ? undefined : stock}
                                            onChange={(value) => updateVariantQty(variant.id, value, stock)}
                                            disabled={outOfStock}
                                            size="sm"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                        {hasMore && <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />}
                    </div>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        disabled={!canConfirm}
                        onClick={() => {
                            if (canConfirm) {
                                onConfirm(selections)
                            }
                        }}
                    >
                        Salvar
                    </Button>
                </div>
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={isOpen} onClose={onClose}>
                    {content}
                </BottomSheet>
                <FilterSheet
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    sections={filterConfig}
                    filters={filters}
                    setFilters={setFilters}
                    onClear={() => setFilters(INITIAL_FILTERS)}
                />
            </>
        )
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onClick={onClose}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {content}
                    </div>
                </div>
            </Portal>
            <FilterSheet
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                sections={filterConfig}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters(INITIAL_FILTERS)}
                zIndexClass="z-[60]"
            />
        </>
    )
}
