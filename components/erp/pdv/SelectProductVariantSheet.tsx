"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button, IconPlaceholder, Input } from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { BoxIcon, XIcon, SearchIcon, FilterIcon, ArrowUpDownIcon, MoneyIcon, InfoIcon, ChevronDownIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { useNotification } from "@/hooks/use-notification"

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
    onConfirm: (
        selections: Array<{ variantId: string; qty: number }>,
        selectedAddons?: Array<{
            groupId: string
            groupName: string
            optionId: string
            optionName: string
            price: number
        }>,
        baseQuantity?: number
    ) => void
}

export default function SelectProductVariantSheet({ isOpen, product, onClose, onConfirm }: Props) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { error: notifyError } = useNotification()

    // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    // Variants and Addons detection
    const rawVariants = useMemo<any[]>(() => {
        if (!product) return []
        return product.product_variants || product.variants || []
    }, [product])

    const hasVariants = rawVariants.length > 0

    const productAddons = useMemo<any[]>(() => {
        if (!product) return []
        const raw = (Array.isArray(product.addon_groups) && product.addon_groups.length > 0)
            ? product.addon_groups
            : (Array.isArray(product.technical_specs?.addon_groups) && product.technical_specs.addon_groups.length > 0)
                ? product.technical_specs.addon_groups
                : []

        return raw.map((grp: any, gIdx: number) => {
            const groupId = String(grp.id || `addon_grp_${gIdx}`)
            const isRequired = grp.required === true || grp.required === "true"
            const maxQty = Number(grp.max_quantity) || grp.options?.length || 1
            const minQty = isRequired ? Math.max(1, Number(grp.min_quantity) || 1) : Math.max(0, Number(grp.min_quantity) || 0)
            return {
                ...grp,
                id: groupId,
                name: grp.name || "Complementos",
                required: isRequired,
                min_quantity: minQty,
                max_quantity: maxQty,
                options: (grp.options || []).map((opt: any, oIdx: number) => ({
                    ...opt,
                    id: String(opt.id || `opt_${groupId}_${oIdx}`),
                    name: opt.name || "Opção",
                    price: Number(opt.price) || 0,
                    available: opt.available !== false && opt.is_available !== false,
                })),
            }
        })
    }, [product])

    const hasAddons = productAddons.length > 0
    const hasBoth = hasVariants && hasAddons

    // Tabs state
    const [activeTab, setActiveTab] = useState<"variants" | "addons">("variants")
    const [hasVariantError, setHasVariantError] = useState(false)
    const [hasAddonError, setHasAddonError] = useState(false)

    // Variant Quantities
    const [qtyByVariantId, setQtyByVariantId] = useState<Record<string, number>>({})

    // Base quantity when product has only complements (no variants)
    const [baseQuantity, setBaseQuantity] = useState(1)

    // Addons state
    const [selectedAddonOptionIds, setSelectedAddonOptionIds] = useState<Record<string, string[]>>({})
    const [expandedAddonGroups, setExpandedAddonGroups] = useState<Record<string, boolean>>({})

    // Filtering, search, and sorting states for variants
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
        if (isOpen && product) {
            setSearch("")
            setFilters(INITIAL_FILTERS)
            setSortConfig(null)
            setVisibleCount(10)
            setHasVariantError(false)
            setHasAddonError(false)
            setBaseQuantity(1)

            // Select initial tab
            setActiveTab(hasVariants ? "variants" : "addons")

            // Initialize variant quantities
            const nextQty: Record<string, number> = {}
            for (const variant of rawVariants) {
                nextQty[variant.id] = 0
            }
            setQtyByVariantId(nextQty)

            // Initialize addon options and expansions
            setSelectedAddonOptionIds({})
            const nextExpanded: Record<string, boolean> = {}
            productAddons.forEach((grp) => {
                nextExpanded[grp.id] = Boolean(grp.required)
            })
            setExpandedAddonGroups(nextExpanded)
        }
    }, [isOpen, product, hasVariants, rawVariants, productAddons])

    const selections = useMemo(() => {
        return Object.entries(qtyByVariantId)
            .map(([variantId, qty]) => ({ variantId, qty: Math.max(0, Number(qty || 0)) }))
            .filter((item) => item.qty > 0)
    }, [qtyByVariantId])

    const toggleAddonGroup = useCallback((groupId: string) => {
        setExpandedAddonGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
    }, [])

    const handleToggleAddonOption = useCallback((groupId: string, optionId: string, maxQuantity: number) => {
        setSelectedAddonOptionIds((prev) => {
            const currentList = prev[groupId] || []
            if (currentList.includes(optionId)) {
                const next = { ...prev, [groupId]: currentList.filter((id) => id !== optionId) }
                return next
            }
            if (maxQuantity === 1) {
                return { ...prev, [groupId]: [optionId] }
            }
            if (currentList.length < maxQuantity) {
                return { ...prev, [groupId]: [...currentList, optionId] }
            }
            return prev
        })
        // Clear error indicator once user interacts
        setHasAddonError(false)
    }, [])

    const selectedAddonsList = useMemo(() => {
        const list: Array<{
            groupId: string
            groupName: string
            optionId: string
            optionName: string
            price: number
        }> = []
        productAddons.forEach((grp) => {
            const selectedIds = selectedAddonOptionIds[grp.id] || []
            grp.options?.forEach((opt: any) => {
                if (selectedIds.includes(opt.id)) {
                    list.push({
                        groupId: grp.id,
                        groupName: grp.name,
                        optionId: opt.id,
                        optionName: opt.name,
                        price: Number(opt.price) || 0,
                    })
                }
            })
        })
        return list
    }, [productAddons, selectedAddonOptionIds])

    const addonsUnitPrice = useMemo(() => {
        return selectedAddonsList.reduce((sum, item) => sum + (Number(item.price) || 0), 0)
    }, [selectedAddonsList])

    // Dynamic filter configuration for variants
    const filterConfig = useMemo<FilterSectionConfig[]>(() => {
        if (!product || !hasVariants) return []
        const attrMap = new Map<string, Set<string>>()
        const SPLIT_SEPARATOR = " / "

        rawVariants.forEach((v: any) => {
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
            options: Array.from(values).sort(),
        })).sort((a, b) => a.title.localeCompare(b.title))

        return [
            { id: "status", title: "Status", type: "checkbox-list" as const, options: ["Ativo", "Inativo"] },
            { id: "priceRange", title: "Preço", type: "range" as const, rangeConfig: { minKey: "minPrice", maxKey: "maxPrice", minPlaceholder: "R$ Min", maxPlaceholder: "R$ Max" } },
            { id: "stockRange", title: "Estoque", type: "range" as const, rangeConfig: { minKey: "minStock", maxKey: "maxStock", minPlaceholder: "Qtd Min", maxPlaceholder: "Qtd Max" } },
            ...dynamicSections,
        ]
    }, [product, hasVariants, rawVariants])

    // Filtered and sorted variants
    const sortedAndFilteredVariants = useMemo(() => {
        if (!product || !hasVariants) return []
        let result = rawVariants.map((variant: any) => {
            const stock = Math.max(0, Number(variant.stock_available ?? variant.stock_quantity ?? variant.stock ?? 0))
            const variantImage = (variant.variant_options?.image as string | undefined) || variant.image || product.images?.[0] || product.image || null
            const variantPrice = variant.price !== undefined ? Number(variant.price) : (Number(product.price || 0) + Number(variant.price_adjustment || 0))
            const variantName = variant.variant_name || variant.name || ""
            return {
                ...variant,
                name: variantName,
                price: variantPrice,
                stock,
                image: variantImage,
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
        const attrFilters = Object.keys(filters).filter((k) => k.startsWith("attr_") && filters[k].length > 0)
        if (attrFilters.length > 0) {
            const SPLIT_SEPARATOR = " / "
            result = result.filter((v: any) => {
                const typeStr = v.variant_type || v.type || ""
                const nameStr = v.variant_name || v.name || ""
                const types = typeStr.split(SPLIT_SEPARATOR)
                const names = nameStr.split(SPLIT_SEPARATOR)

                return attrFilters.every((filterKey) => {
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
    }, [product, hasVariants, rawVariants, search, filters, sortConfig])

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
        if (!isOpen || !root || !target || !hasMore || activeTab !== "variants") return

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
    }, [isOpen, hasMore, loadMore, displayedVariants.length, activeTab])

    const updateVariantQty = (variantId: string, qty: number) => {
        const parsedQty = Math.max(0, Number(qty || 0))
        setQtyByVariantId((prev) => ({ ...prev, [variantId]: parsedQty }))
        setHasVariantError(false)
    }

    const handleSave = () => {
        // 1. Validate variants
        if (hasVariants) {
            if (selections.length === 0) {
                setHasVariantError(true)
                setActiveTab("variants")
                notifyError("Variação obrigatória", "Selecione pelo menos uma variação do produto.")
                return
            }
        }

        // 2. Validate addons
        if (hasAddons) {
            for (const grp of productAddons) {
                if (grp.required) {
                    const selected = selectedAddonOptionIds[grp.id] || []
                    const minReq = grp.min_quantity || 1
                    if (selected.length < minReq) {
                        setHasAddonError(true)
                        setActiveTab("addons")
                        setExpandedAddonGroups((prev) => ({ ...prev, [grp.id]: true }))
                        notifyError(
                            "Complemento obrigatório",
                            `Por favor, selecione as opções obrigatórias no grupo: "${grp.name || "Complementos"}".`
                        )
                        return
                    }
                }
            }
        }

        setHasVariantError(false)
        setHasAddonError(false)

        onConfirm(selections, selectedAddonsList, baseQuantity)
        onClose()
    }

    // Active filter chip renders
    const hasActiveFilters = filters.status.length > 0 ||
        !!filters.priceRange.min || !!filters.priceRange.max ||
        !!filters.stockRange.min || !!filters.stockRange.max ||
        Object.keys(filters).some((k) => k.startsWith("attr_") && (filters[k] as string[]).length > 0)

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

    const titleText = hasBoth
        ? "Opções do produto"
        : hasVariants
            ? "Selecionar variações"
            : "Selecionar complementos"

    const content = !product ? null : (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{titleText}</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Tabs (quando possui variantes E complementos) */}
            {hasBoth && (
                <div className="z-10 shrink-0 border-b border-brand-border bg-white px-6 pt-2 dark:border-dark-border dark:bg-dark-surface">
                    <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "variants" | "addons")}>
                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                            <TabsTrigger
                                value="variants"
                                badge={
                                    hasVariantError ? (
                                        <span className="inline-block w-2 h-2 rounded-full bg-brand-red shrink-0" aria-hidden />
                                    ) : selections.length > 0 ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-brand-green/10 text-brand-green border border-brand-green/20">
                                            {selections.reduce((sum, s) => sum + s.qty, 0)}
                                        </span>
                                    ) : undefined
                                }
                            >
                                Variações
                            </TabsTrigger>
                            <TabsTrigger
                                value="addons"
                                badge={
                                    hasAddonError ? (
                                        <span className="inline-block w-2 h-2 rounded-full bg-brand-red shrink-0" aria-hidden />
                                    ) : selectedAddonsList.length > 0 ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-brand-green/10 text-brand-green border border-brand-green/20">
                                            {selectedAddonsList.length}
                                        </span>
                                    ) : undefined
                                }
                            >
                                Complementos
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {/* Product Summary Header Card */}
            <div className="border-b border-brand-border px-6 py-4 dark:border-dark-border bg-gray-50/50 dark:bg-dark-border/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                        <img
                            src={getPrimaryProductDisplayImage(product, "thumbnail")}
                            alt={product.name}
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(product.price)}
                            </span>
                            {addonsUnitPrice > 0 && (
                                <span className="text-xs font-bold text-brand-green">
                                    + {formatCurrency(addonsUnitPrice)} (adicionais)
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Variants Tab Content */}
            {activeTab === "variants" && hasVariants && (
                <>
                    {/* Search and Filters Controls */}
                    <div className="z-10 shrink-0 border-b border-brand-border bg-white px-6 py-3 dark:border-dark-border dark:bg-dark-surface flex flex-col gap-2">
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
                                leftIcon={<FilterIcon size={18} />}
                            />
                            <Dropdown
                                fullWidth={false}
                                align="right"
                                showChevron={false}
                                trigger={
                                    <Button
                                        variant="outline"
                                        className="w-[42px] h-[42px] p-0 shrink-0 flex items-center justify-center rounded-full"
                                        leftIcon={<ArrowUpDownIcon size={18} />}
                                    />
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
                                {Object.keys(filters).filter((k) => k.startsWith("attr_")).map((k) => renderListBadge(k, k.replace("attr_", "")))}
                            </div>
                        )}
                    </div>

                    {/* Variants List */}
                    <div ref={listScrollRef} className="custom-scrollbar flex-1 overflow-y-auto p-0">
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
                                                <p className="truncate text-xs font-medium text-brand-inactive-text dark:text-dark-body">SKU: {variant.sku || "-"}</p>
                                                <p className="mt-0.5 text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(variantPrice)}</p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className={`text-sm font-bold ${outOfStock ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                                                        {stock}
                                                    </p>
                                                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Estoque</p>
                                                </div>

                                                <QuantitySelector
                                                    value={currentQty}
                                                    min={0}
                                                    onChange={(value) => updateVariantQty(variant.id, value)}
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
                </>
            )}

            {/* Addons / Complements Tab Content */}
            {activeTab === "addons" && hasAddons && (
                <div className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                            Grupos de complementos
                        </span>
                        {addonsUnitPrice > 0 && (
                            <span className="text-xs font-bold text-brand-green">
                                + {formatCurrency(addonsUnitPrice)}
                            </span>
                        )}
                    </div>

                    {productAddons.map((grp: any) => {
                        const selectedIds = selectedAddonOptionIds[grp.id] || []
                        const maxQty = grp.max_quantity || grp.options?.length || 1
                        const isRadio = maxQty === 1
                        const isExpanded = expandedAddonGroups[grp.id] ?? grp.required
                        const isSatisfied = grp.required ? selectedIds.length >= (grp.min_quantity || 1) : true
                        const selectedOptions = (grp.options || []).filter((o: any) => selectedIds.includes(o.id))

                        return (
                            <div
                                key={grp.id}
                                className={`border rounded-xl overflow-hidden transition-all duration-200 ${grp.required && !isSatisfied
                                    ? "border-amber-400/80 bg-amber-50/10 dark:border-amber-500/40"
                                    : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleAddonGroup(grp.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors"
                                >
                                    <div className="flex-1 min-w-0 pr-3">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                {grp.name || "Complementos"}
                                            </h4>
                                            {grp.required ? (
                                                <span
                                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSatisfied
                                                        ? "bg-brand-green/10 text-brand-green border border-brand-green/20"
                                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700/40"
                                                        }`}
                                                >
                                                    {isSatisfied ? "✓ Selecionado" : "Obrigatório"}
                                                </span>
                                            ) : selectedIds.length > 0 ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green border border-brand-green/20">
                                                    {selectedIds.length} selecionado{selectedIds.length > 1 ? "s" : ""}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-border text-brand-inactive-text dark:text-dark-body">
                                                    Opcional
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            {grp.required ? `Escolha no mínimo ${grp.min_quantity || 1}` : "Opcional"} · {isRadio ? "1 opção" : `até ${maxQty} opções`}
                                            {!isExpanded && selectedOptions.length > 0 && (
                                                <span className="text-brand-dark dark:text-dark-heading font-medium ml-1.5">
                                                    ({selectedOptions.map((o: any) => o.name).join(", ")})
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <ChevronDownIcon
                                        size={18}
                                        className={`text-brand-inactive-text dark:text-dark-body shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""
                                            }`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                            className="overflow-hidden border-t border-brand-border/60 dark:border-dark-border/60 divide-y divide-brand-border/40 dark:divide-dark-border/40"
                                        >
                                            {(grp.options || []).filter((o: any) => o.available !== false).map((opt: any) => {
                                                const isSelected = selectedIds.includes(opt.id)
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 ${isSelected ? "bg-brand-green/5 dark:bg-brand-green/10" : ""
                                                            }`}
                                                        onClick={() => handleToggleAddonOption(grp.id, opt.id, maxQty)}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0 pr-2">
                                                            <div
                                                                className={`w-4 h-4 flex items-center justify-center shrink-0 border-2 transition-colors ${isRadio ? "rounded-full" : "rounded"
                                                                    } ${isSelected
                                                                        ? "border-brand-green bg-brand-green text-white"
                                                                        : "border-brand-border dark:border-dark-border"
                                                                    }`}
                                                            >
                                                                {isSelected && (
                                                                    <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
                                                                        <path
                                                                            d="M2.5 6L5 8.5L9.5 3.5"
                                                                            stroke="currentColor"
                                                                            strokeWidth="2"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {opt.name}
                                                            </span>
                                                        </div>
                                                        {(Number(opt.price) || 0) > 0 && (
                                                            <span className="text-xs font-bold text-brand-green shrink-0 ml-2">
                                                                + {formatCurrency(Number(opt.price))}
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )
                    })}

                    {/* Quantidade base se o produto NÃO tiver variações */}
                    {!hasVariants && (
                        <div className="mt-6 flex items-center justify-between rounded-xl border border-brand-border bg-gray-50/50 p-4 dark:border-dark-border dark:bg-dark-border/20">
                            <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Quantidade</p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Quantidade de unidades deste item</p>
                            </div>
                            <QuantitySelector
                                value={baseQuantity}
                                min={1}
                                onChange={(val) => setBaseQuantity(Math.max(1, val))}
                                size="md"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        onClick={handleSave}
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
                    style={{ zIndex }}
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
