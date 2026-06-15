"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Checkbox, Button, IconPlaceholder, Input, ActionsDropdown, SelectionBanner } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { Spinner } from "@/components/reusable/Spinner"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import AlertModal from "@/components/reusable/AlertModal"
import AddVariantSheet from "./AddVariantSheet"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FilterChip from "@/components/reusable/FilterChip"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import { useNotification } from "@/hooks/use-notification"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    getProductVariantsAction,
    deleteProductVariantAction,
    updateProductVariantAction,
    batchUpdateVariantsAction,
    batchDeleteVariantsAction
} from "@/app/actions/erp/products"
import {
    PlusIcon,
    ArrowUpDownIcon,
    Package,
    TrashIcon,
    ThreeDotsIcon,
    Settings2Icon,
    CheckCircleIcon,
    BlockedIcon,
    SearchIcon,
    FilterIcon,
    MoneyIcon,
    InfoIcon
} from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

// --- Utils & Constants ---
const SPLIT_SEPARATOR = " / "
const ITEMS_PER_PAGE_DESKTOP = 8
const ITEMS_PER_PAGE_MOBILE = 12

const INITIAL_FILTERS = {
    status: [],
    priceRange: { min: "", max: "" },
    stockRange: { min: "", max: "" }
}

interface ColumnDef {
    label: string
    width: string
    align?: "left" | "center" | "right"
    sortable?: boolean
    key?: string
}

const VARIANTS_COLUMNS: ColumnDef[] = [
    { label: "Variante", width: "auto", align: "left", sortable: true, key: "name" },
    { label: "Preço", width: "120px", align: "left", sortable: true, key: "price" },
    { label: "Estoque", width: "120px", align: "left", sortable: true, key: "stock" },
    { label: "Status", width: "100px", align: "center", sortable: false },
    { label: "Ações", width: "80px", align: "center", sortable: false }
]

// --- Components ---

const VariationRow = React.memo(({ item, isSelected, isEditing, onSelect, onToggleStatus, onEdit, onDelete }: any) => {
    const rowHoverClass = isEditing
        ? "hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 cursor-pointer"
        : ""

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`group ${rowHoverClass} transition-colors bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border`}
        >
            <td className="p-3 pl-6 w-12 border-b border-brand-border dark:border-dark-border">
                <Checkbox checked={isSelected} onChange={() => onSelect(item.id)} disabled={!isEditing} />
            </td>
            <td className="p-3 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <img
                            src={getR2ImageUrl(item.variant_options?.image || item.image) || "https://img.dudit.com.br/static/Placeholder.png"}
                            alt="Variant"
                            className="w-full h-full object-cover rounded-full"
                            loading="lazy"
                        />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
                            {item.name || "-"}
                        </span>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                            {item.sku || "-"} • {item.type || "Variação"}
                        </span>
                    </div>
                </div>
            </td>
            <td className="p-3 border-b border-brand-border dark:border-dark-border">
                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {item.price ? formatCurrency(item.price) : "-"}
                </span>
            </td>
            <td className="p-3 border-b border-brand-border dark:border-dark-border">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                    {item.stock || 0} {item.unit || "UN"}
                </span>
            </td>
            <td className="p-3 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    <Switch
                        checked={item.status}
                        onCheckedChange={(checked) => onToggleStatus(item.id, checked)}
                        className={!isEditing ? "opacity-50 pointer-events-none" : ""}
                    />
                </div>
            </td>
            <td className="p-3 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center action-btn">
                    <ActionsDropdown
                        onDelete={() => onDelete(item)}
                        trigger={
                            <Button variant="outline" size="icon" className="w-[40px] h-[40px] p-0 flex items-center justify-center bg-transparent" disabled={!isEditing}>
                                <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                            </Button>
                        }
                    />
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) => prev.item === next.item && prev.isSelected === next.isSelected && prev.isEditing === next.isEditing)

VariationRow.displayName = "VariationRow"

const VariationMobileItem = React.memo(({ item, isSelected, isEditing, onSelect, onToggleStatus, onEdit, onDelete }: any) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`py-5 border-b border-brand-border dark:border-dark-border last:border-0 ${isEditing ? "cursor-pointer" : ""}`}
            onClick={() => isEditing && onEdit(item)}
        >
            <div className="flex items-start gap-4 h-auto">
                {/* Imagem */}
                <div className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 overflow-hidden">
                    <img
                        src={getR2ImageUrl(item.variant_options?.image || item.image) || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Detalhes */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    {/* Linha 1: Nome + Bolinha Status */}
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                            {item.name || "-"}
                        </h3>
                        <div
                            className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${item.status ? "bg-brand-green" : "bg-brand-red"}`}
                        ></div>
                    </div>

                    {/* Linha 2: SKU */}
                    <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                        {item.sku || "-"}
                    </div>

                    {/* Linha 3: Preço • Estoque + Checkbox */}
                    <div className="flex items-end justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(item.price || 0)}
                            </span>
                            <span className="text-brand-inactive-text dark:text-dark-border">•</span>
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                {item.stock || 0} {item.unit || "un"}
                            </span>
                        </div>

                        {/* Selection Checkbox (Mobile Editing) */}
                        {isEditing && (
                            <div className="flex-none -mb-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={isSelected} onChange={() => onSelect(item.id)} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}, (prev, next) => prev.item === next.item && prev.isSelected === next.isSelected && prev.isEditing === next.isEditing)

VariationMobileItem.displayName = "VariationMobileItem"

// --- Main Component ---

interface ProductVariationsTabProps {
    productData?: any
    isEditing: boolean
    onRemoveVariant?: (id: string | number) => void
    onUpdateVariant?: (id: string | number, field: string, value: any) => void
    onSavePendingVariants?: (variants: any[]) => void
    suppliers?: any[]
}

export const ProductVariationsTab: React.FC<ProductVariationsTabProps> = ({
    productData,
    isEditing,
    onRemoveVariant,
    onUpdateVariant,
    onSavePendingVariants,
    suppliers = []
}) => {
    // UI States
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE_DESKTOP)
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
            setItemsPerPage(mobile ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP)
        }
        handleResize()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    // Data States
    const [variations, setVariations] = useState<any[]>(() => {
        const existing = productData?.variants || productData?.product_variants
        if (Array.isArray(existing) && existing.length > 0) {
            // Mapeia do formato DB (snake_case) para UI (camelCase) se necessário
            if (existing[0].variant_name !== undefined) {
                return existing.map((v: any) => ({
                    id: v.id,
                    name: v.variant_name,
                    type: v.variant_type,
                    value: v.variant_value,
                    sku: v.sku,
                    price: v.price_adjustment,
                    stock: v.stock_quantity,
                    image: v.variant_options?.image || null,
                    status: v.is_active,
                    unit: v.unit
                }))
            }
            return existing
        }
        if (productData?.pending_variants && Array.isArray(productData?.pending_variants)) {
            // Pending variants are stored as UI objects, but need formatting if they come straight from AddVariantSheet
            return productData.pending_variants.map((v: any, index: number) => ({
                id: `pending-${index}`,
                name: v.variantName || v.name,
                type: v.variantType || v.type,
                value: v.variantValue || v.value,
                sku: v.sku,
                price: v.price !== undefined ? v.price : v.price_adjustment,
                stock: v.stockQuantity !== undefined ? v.stockQuantity : v.stock,
                image: v.image || null,
                status: v.isActive !== undefined ? v.isActive : v.status,
                unit: v.unit
            }))
        }
        return []
    })
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [filters, setFilters] = useState<any>(INITIAL_FILTERS)
    const [currentPage, setCurrentPage] = useState(1)

    // Selection & Confirmation
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [itemToDelete, setItemToDelete] = useState<any | null>(null)
    const [modalState, setModalState] = useState({ delete: false, bulkDelete: false, bulkStatus: false })

    // Scroll Indicators Logic
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const { success: notifySuccess, error: notifyError } = useNotification()

    // --- Scroll Detection ---
    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, variations, isSheetOpen]) // Re-check on data change

    // --- Data Loading ---
    const loadVariants = useCallback(async () => {
        if (!productData?.id) {
            if (productData?.pending_variants) {
                setVariations(productData.pending_variants.map((v: any, index: number) => ({
                    id: `pending-${index}`,
                    name: v.variantName || v.name,
                    type: v.variantType || v.type,
                    value: v.variantValue || v.value,
                    sku: v.sku,
                    price: v.price !== undefined ? v.price : v.price_adjustment,
                    stock: v.stockQuantity !== undefined ? v.stockQuantity : v.stock,
                    image: v.image || null,
                    status: v.isActive !== undefined ? v.isActive : v.status,
                    unit: v.unit
                })))
            }
            return
        }
        setIsLoading(true)
        try {
            const result = await getProductVariantsAction(productData.id)
            if (result.success && result.data) {
                setVariations(result.data)
            } else {
                setVariations([])
            }
        } catch (err) {
            console.error(err)
            setVariations([])
        } finally {
            setIsLoading(false)
        }
    }, [productData?.id, productData?.pending_variants?.length])

    // CARREGA VARIANTES TODA VEZ QUE O COMPONENTE MONTA OU PRODUCT_ID MUDA
    useEffect(() => {
        loadVariants()
    }, [loadVariants])

    // --- Search & Filtering ---
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(handler)
    }, [search])

    useEffect(() => { setCurrentPage(1) }, [debouncedSearch, filters])

    const filterConfig = useMemo<FilterSectionConfig[]>(() => {
        const attrMap = new Map<string, Set<string>>()
        variations.forEach(v => {
            const typeStr = v.type || "Outros"
            const nameStr = v.name || "Sem nome"
            const types = typeStr.includes(SPLIT_SEPARATOR) ? typeStr.split(SPLIT_SEPARATOR) : [typeStr]
            const names = nameStr.includes(SPLIT_SEPARATOR) ? nameStr.split(SPLIT_SEPARATOR) : [nameStr]

            types.forEach((t: string, idx: number) => {
                const val = names[idx] || names[0]
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
            { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo"] },
            { id: "priceRange", title: "Preço", type: "range", rangeConfig: { minKey: "minPrice", maxKey: "maxPrice", minPlaceholder: "R$ Min", maxPlaceholder: "R$ Max" } },
            { id: "stockRange", title: "Estoque", type: "range", rangeConfig: { minKey: "minStock", maxKey: "maxStock", minPlaceholder: "Qtd Min", maxPlaceholder: "Qtd Max" } },
            ...dynamicSections
        ]
    }, [variations])

    const filteredVariations = useMemo(() => {
        return variations.filter(v => {
            // 1. Text Search
            if (debouncedSearch) {
                const term = debouncedSearch.toLowerCase()
                if (!v.name?.toLowerCase().includes(term) && !v.sku?.toLowerCase().includes(term)) return false
            }

            // 2. Status
            if (filters.status.length > 0) {
                const statusLabel = v.status ? "Ativo" : "Inativo"
                if (!filters.status.includes(statusLabel)) return false
            }

            // 3. Ranges
            const priceVal = parseFloat(v.price || 0)
            const stockVal = parseFloat(v.stock || 0)

            if (filters.priceRange.min && priceVal < parseFloat(filters.priceRange.min)) return false
            if (filters.priceRange.max && priceVal > parseFloat(filters.priceRange.max)) return false
            if (filters.stockRange.min && stockVal < parseFloat(filters.stockRange.min)) return false
            if (filters.stockRange.max && stockVal > parseFloat(filters.stockRange.max)) return false

            // 4. Attributes
            const attrFilters = Object.keys(filters).filter(k => k.startsWith("attr_") && filters[k].length > 0)
            if (attrFilters.length > 0) {
                const typeStr = v.type || "Outros"
                const nameStr = v.name || "Sem nome"
                const types = typeStr.split(SPLIT_SEPARATOR)
                const names = nameStr.split(SPLIT_SEPARATOR)

                const allMatch = attrFilters.every(filterKey => {
                    const targetAttr = filterKey.replace("attr_", "")
                    const selectedValues = filters[filterKey] as string[]
                    const typeIndex = types.indexOf(targetAttr)

                    if (typeIndex === -1) return false
                    const productValue = names[typeIndex] || names[0]
                    return selectedValues.includes(productValue)
                })
                if (!allMatch) return false
            }
            return true
        })
    }, [variations, debouncedSearch, filters])

    // --- Pagination & Selection ---
    const sortedVariations = useMemo(() => {
        const sorted = [...filteredVariations]
        if (sortConfig) {
            sorted.sort((a, b) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]

                // Garante que valores numéricos sejam tratados como números
                if (sortConfig.key === 'price' || sortConfig.key === 'stock') {
                    aVal = Number(aVal) || 0
                    bVal = Number(bVal) || 0
                }

                if (aVal === bVal) return 0

                let result = 0
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    result = aVal - bVal
                } else {
                    result = String(aVal || "").localeCompare(String(bVal || ""))
                }

                return sortConfig.direction === 'asc' ? result : -result
            })
        }
        return sorted
    }, [filteredVariations, sortConfig])

    const totalPages = Math.ceil(sortedVariations.length / itemsPerPage)
    const paginatedVars = useMemo(() =>
        sortedVariations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
        [sortedVariations, currentPage, itemsPerPage])

    const handleSelectAll = useCallback(() => {
        setSelectedIds(prev =>
            prev.size === paginatedVars.length && paginatedVars.length > 0
                ? new Set()
                : new Set(paginatedVars.map(v => v.id))
        )
    }, [paginatedVars])

    const handleSelectRow = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])

    // --- Actions ---
    const handleUpdateStatus = useCallback(async (id: string, active: boolean) => {
        if (!isEditing) return

        // Optimistic Update
        setVariations(p => p.map(v => v.id === id ? { ...v, status: active } : v))

        const res = await updateProductVariantAction(String(id), { isActive: active })
        if (!res.success) {
            setVariations(p => p.map(v => v.id === id ? { ...v, status: !active } : v)) // Rollback
            notifyError(res.error || "Erro ao atualizar")
        } else {
            onUpdateVariant?.(id, "status", active)
        }
    }, [isEditing, notifyError, onUpdateVariant])

    const handleDelete = async () => {
        if (!itemToDelete) return
        const res = await deleteProductVariantAction(String(itemToDelete.id))
        if (res.success) {
            setVariations(p => p.filter(v => v.id !== itemToDelete.id))
            setSelectedIds(p => { const n = new Set(p); n.delete(itemToDelete.id); return n })
            notifySuccess("Removido com sucesso")
            onRemoveVariant?.(itemToDelete.id)
        } else {
            notifyError("Erro ao remover")
        }
        setModalState(p => ({ ...p, delete: false }))
        setItemToDelete(null)
    }

    // --- Bulk Edit Actions ---
    const handleBulkEditApply = async (payload: BulkActionPayload) => {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) return

        // 1. Delete Bulk
        if (payload.type === 'delete') {
            const result = await batchDeleteVariantsAction(ids)
            if (result.success) {
                setVariations(p => p.filter(v => !selectedIds.has(v.id)))
                setSelectedIds(new Set())
                notifySuccess(`${ids.length} variações excluídas`)
            } else {
                notifyError(result.error || "Erro ao excluir variações")
            }
            return
        }

        // 2. Remove Image Handler
        if (payload.type === 'remove_image') {
            const updates = ids.map(id => ({ id, image: undefined }))
            const result = await batchUpdateVariantsAction(updates)
            if (result.success) {
                setVariations(prev => prev.map(v => {
                    if (selectedIds.has(v.id)) return { ...v, image: null }
                    return v
                }))
                notifySuccess(`Imagem removida de ${ids.length} variante(s)`)
                setSelectedIds(new Set())
            } else {
                notifyError(result.error || "Erro ao remover imagens")
            }
            return
        }

        // 3. Image Upload Handler
        let uploadedImageId: string | undefined = undefined
        let uploadPromise: Promise<Response> | null = null;
        if (payload.type === 'image' && payload.imageFile) {
            try {
                const formData = new FormData()
                const extension = payload.imageFile.type === "image/png" ? "png" : payload.imageFile.type === "image/webp" ? "webp" : "jpg"
                formData.append("file", payload.imageFile, `variant-image.${extension}`)

                // Passar productId na query para cache específico do produto
                const uploadUrlObj = new URL("/api/upload-image", window.location.origin)
                if (productData?.id) {
                    uploadUrlObj.searchParams.set("productId", productData.id)
                }

                const response = await fetchWithCSRF(uploadUrlObj.toString(), { method: "POST", body: formData })
                const result = await response.json()

                if (!result.success || !result.key) {
                    notifyError(result.error || "Erro ao fazer upload da imagem")
                    return
                }

                uploadedImageId = result.key
            } catch (e) {
                console.error("Erro ao fazer upload:", e)
                notifyError("Erro ao fazer upload da imagem")
                return
            }
        }

        // 4. Prepare Updates
        const updates = ids.map((id) => {
            const currentVar = variations.find(v => v.id === id)
            if (!currentVar) return null

            const updateData: any = { id }

            if (payload.type === 'price') {
                if (payload.priceOnlyPublished && !currentVar.status) return null
                const currentPrice = Number(currentVar.price) || 0
                let newPrice = currentPrice

                if (payload.priceMode === 'fixed') newPrice = payload.priceValue || 0
                else if (payload.priceMode === 'percent_inc') newPrice = currentPrice + (currentPrice * (payload.priceValue || 0) / 100)
                else if (payload.priceMode === 'percent_dec') newPrice = Math.max(0, currentPrice - (currentPrice * (payload.priceValue || 0) / 100))

                updateData.price = newPrice
            } else if (payload.type === 'stock') {
                const currentStock = Number(currentVar.stock) || 0
                if (payload.stockIgnoreNegative && currentStock < 0) return null

                let newStock = currentStock
                if (payload.stockMode === 'fixed') newStock = payload.stockValue || 0
                else if (payload.stockMode === 'zero') newStock = 0
                else if (payload.stockMode === 'add') newStock = currentStock + (payload.stockValue || 0)
                else if (payload.stockMode === 'sub') newStock = currentStock - (payload.stockValue || 0)

                updateData.stock = newStock
            } else if (payload.type === 'visibility') {
                updateData.active = payload.visibilityMode === 'publish'
            } else if (payload.type === 'image' && uploadedImageId) {
                updateData.image = uploadedImageId
            }
            return updateData
        }).filter(Boolean)

        if (updates.length > 0) {
            const [result] = await Promise.all([batchUpdateVariantsAction(updates)]);

            if (result.success) {
                setVariations(prev => prev.map(v => {
                    const update = updates.find((u: any) => u.id === v.id)
                    if (!update) return v
                    return {
                        ...v,
                        price: update.price !== undefined ? update.price : v.price,
                        stock: update.stock !== undefined ? update.stock : v.stock,
                        status: update.active !== undefined ? update.active : v.status,
                        image: update.image !== undefined ? update.image : v.image
                    }
                }))
                notifySuccess("Alterações aplicadas com sucesso")
                setSelectedIds(new Set())
            } else {
                notifyError(result.error || "Erro ao salvar alterações")
            }
        }
    }

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
            }
            return { key, direction: 'asc' }
        })
    }

    // --- Helper Renders ---
    const hasActiveFilters = useMemo(() =>
        filters.status.length > 0 || !!filters.priceRange.min || !!filters.priceRange.max ||
        !!filters.stockRange.min || !!filters.stockRange.max ||
        Object.keys(filters).some(k => k.startsWith("attr_") && (filters[k] as string[]).length > 0),
        [filters])

    const supplierName = useMemo(() =>
        productData?.supplier || suppliers?.find((s: any) => s.id === productData?.partner_id)?.name || "N/A",
        [productData, suppliers])

    const renderRangeBadge = (key: "priceRange" | "stockRange", label: string, prefix: string = "") => {
        const { min, max } = filters[key]
        if (!min && !max) return null
        return <FilterChip key={key} label={label} icon={<MoneyIcon size={12} />} value={`${min ? `${prefix}${min}` : "0"} - ${max ? `${prefix}${max}` : "∞"}`} onRemove={() => setFilters((p: any) => ({ ...p, [key]: { min: "", max: "" } }))} />
    }

    const renderListBadge = (key: string, label: string) => {
        const items = filters[key] as string[]
        if (!items || items.length === 0) return null
        return <FilterChip key={key} label={label} icon={<InfoIcon size={12} />} value={items.length <= 3 ? items.join(", ") : `${items.slice(0, 3).join(", ")}...`} tooltip={`${label}: ${items.join(", ")}`} onRemove={() => setFilters((p: any) => ({ ...p, [key]: [] }))} />
    }

    // --- Render ---
    return (
        <>
            <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 ">
                    <Spinner size={36} color="text-brand-dark dark:text-dark-heading" />
                    <p className="text-sm text-brand-inactive-text mt-2">Carregando variações...</p>
                </div>
            ) : variations.length === 0 && !hasActiveFilters && !search ? (
                <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface">
                        <IconPlaceholder
                            icon={Package}
                            title="Não há variações"
                            subtitle="Adicione cores, tamanhos ou outros atributos."
                            itemButton={{
                                text: "Adicionar variante",
                                action: () => setIsSheetOpen(true),
                                variant: "outline",
                                className: !isEditing ? "opacity-50 pointer-events-none" : ""
                            }}
                        />
                    </div>
                </div>
            ) : (
                <div className="max-w-[1300px] mx-auto pb-20 relative">

                    {/* Header Section */}
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Variações ({filteredVariations.length})</h3>
                            <Button variant="link" className="flex items-center hidden md:flex" onClick={() => setIsSheetOpen(true)} disabled={!isEditing}>
                                {variations.length === 0 ? "+ Adicionar Variação" : "+ Adicionar/Editar variações"}
                            </Button>
                    </div>

                    {/* MOBILE CONTROLS ROW */}
                    <div className="md:hidden flex items-center gap-2 w-full mb-4">
                        <div className="flex-1 min-w-0">
                            <Input
                                name="searchVar"
                                placeholder="Buscar variação..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
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
                                onClick={() => setIsFilterOpen(true)}
                                className="w-[42px] h-[42px] p-0"
                            >
                                <FilterIcon className="w-4 h-4" />
                            </Button>
                            <Button
                                onClick={() => setIsSheetOpen(true)}
                                disabled={!isEditing}
                                className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green hover:bg-brand-green/90 text-white shadow-sm shadow-brand-green/20"
                            >
                                <PlusIcon className="w-5 h-5" strokeWidth={3} />
                            </Button>
                        </div>
                    </div>

                    {/* Filter Controls (Desktop/Tablets) */}
                    <div className={`hidden md:flex flex-col gap-4 mb-4 w-full ${!isEditing ? "opacity-60 pointer-events-none" : ""}`}>
                        <div className="flex items-center gap-2 w-full">
                            <Input
                                name="searchVar"
                                placeholder="Buscar..."
                                value={search} onChange={(e) => setSearch(e.target.value)}
                                className="h-[42px] flex-1"
                                variant="full-rounded"
                                prefix={
                                    <SearchIcon
                                        size={18}
                                        className="text-brand-inactive-text shrink-0"
                                    />
                                }
                                label="" />
                            <Button variant="outline" onClick={() => setIsFilterOpen(true)} leftIcon={<FilterIcon size={18} />}>
                                Filtros
                            </Button>
                            {hasActiveFilters && <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>}
                        </div>
                        <AnimatePresence>
                            {hasActiveFilters && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-2 overflow-hidden">
                                    {renderListBadge("status", "Status")}
                                    {renderRangeBadge("priceRange", "Preço", "R$")}
                                    {renderRangeBadge("stockRange", "Estoque")}
                                    {Object.keys(filters).filter(k => k.startsWith("attr_")).map(k => renderListBadge(k, k.replace("attr_", "")))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Table/Grid Container */}
                    <SelectionBanner
                        selectedCount={selectedIds.size}
                        totalCount={filteredVariations.length}
                        onSelectAll={() => setSelectedIds(new Set(filteredVariations.map(v => v.id)))}
                        onClearSelection={() => setSelectedIds(new Set())}
                        itemName="variantes"
                        singularItemName="variante"
                    />
                    <div className="w-full bg-white dark:bg-dark-surface rounded-xl relative border border-transparent dark:border-dark-border/20">

                        {/* Mobile Grid/List View */}
                        <div className="md:hidden">
                            <AnimatePresence mode="wait">
                                {paginatedVars.length === 0 ? (
                                    <motion.div key="empty-mobile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 text-center">
                                        <IconPlaceholder
                                            icon={SearchIcon}
                                            title="Nenhuma variante encontrada"
                                            subtitle="Limpe os filtros para ver mais."
                                            itemButton={{
                                                text: "Limpar filtros",
                                                action: () => setFilters(INITIAL_FILTERS),
                                                variant: "outline"
                                            }}
                                        />
                                    </motion.div>
                                ) : (
                                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                                        {paginatedVars.map(item => (
                                            <VariationMobileItem
                                                key={item.id}
                                                item={item}
                                                isSelected={selectedIds.has(item.id)}
                                                isEditing={isEditing}
                                                onSelect={handleSelectRow}
                                                onToggleStatus={handleUpdateStatus}
                                                onEdit={() => setTimeout(() => setIsSheetOpen(true), 50)}
                                                onDelete={(itm: any) => { setItemToDelete(itm); setModalState(p => ({ ...p, delete: true })) }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Desktop Table Container */}
                        <div className="hidden md:block overflow-hidden rounded-xl relative">
                            {/* Left Scroll Fade */}
                            <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />

                            {/* Right Scroll Fade */}
                            <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                            <div className="overflow-x-auto custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                <AnimatePresence mode="wait">
                                    {paginatedVars.length === 0 ? (
                                        <motion.div key="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 text-center min-w-[800px]">
                                            <IconPlaceholder
                                                icon={SearchIcon}
                                                title="Nenhuma variante encontrada"
                                                subtitle="Nenhuma variante encontrada com os filtros atuais."
                                                itemButton={{
                                                    text: "Limpar filtros",
                                                    action: () => setFilters(INITIAL_FILTERS),
                                                    variant: "outline"
                                                }}
                                            />
                                        </motion.div>
                                    ) : (
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    {/* Checkbox Column with Rounded Left */}
                                                    <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 sticky left-0 z-20">
                                                        <Checkbox
                                                            checked={selectedIds.size === paginatedVars.length && paginatedVars.length > 0}
                                                            onChange={handleSelectAll}
                                                            disabled={!isEditing}
                                                            className="bg-white dark:bg-dark-background"
                                                        />
                                                    </th>
                                                    {/* Dynamic Columns */}
                                                    {VARIANTS_COLUMNS.map((col, idx) => {
                                                        const isLast = idx === VARIANTS_COLUMNS.length - 1
                                                        const isSorted = sortConfig?.key === col.key
                                                        return (
                                                            <th
                                                                key={idx}
                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body relative bg-brand-gray dark:bg-dark-border/50 ${isLast ? "rounded-r-lg" : ""} ${col.sortable ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-dark-border transition-colors select-none group" : ""}`}
                                                                style={{ width: col.width }}
                                                                onClick={() => col.sortable && col.key && handleSort(col.key)}
                                                            >
                                                                <div className={`flex items-center gap-1 ${col.align === "center" ? "justify-center" : col.align === "right" ? "justify-end" : ""}`}>
                                                                    <span>
                                                                        {col.label}
                                                                    </span>
                                                                    {col.sortable && (
                                                                        <div className="flex flex-col items-center">
                                                                            <ArrowUpDownIcon className={`w-3.5 h-3.5 transition-all duration-200 ${isSorted ? "text-brand-primary block" : "text-gray-400 hidden group-hover:block opacity-40"}`} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        )
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedVars.map(item => (
                                                    <VariationRow
                                                        key={item.id}
                                                        item={item}
                                                        isSelected={selectedIds.has(item.id)}
                                                        isEditing={isEditing}
                                                        onSelect={handleSelectRow}
                                                        onToggleStatus={handleUpdateStatus}
                                                        onEdit={() => setTimeout(() => setIsSheetOpen(true), 50)}
                                                        onDelete={(itm: any) => { setItemToDelete(itm); setModalState(p => ({ ...p, delete: true })) }}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {filteredVariations.length > 0 && (
                        <div className={`mt-4 ${isMobile ? "sticky bottom-0 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm py-4 z-20 border-t border-brand-border dark:border-dark-border -mx-4 px-4" : ""} ${!isEditing ? "opacity-60 pointer-events-none" : ""}`}>
                            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                        </div>
                    )}
                </div>
            )}

            {/* Action Bars & Modals */}
            <FloatingActionBar selectedCount={selectedIds.size} onClearSelection={() => setSelectedIds(new Set())}>
                <Button variant="ghost" onClick={() => setModalState(p => ({ ...p, bulkStatus: true }))} className="h-10 px-3" leftIcon={
                    variations.filter(v => selectedIds.has(v.id)).every(v => !v.status)
                        ? <CheckCircleIcon size={18} />
                        : <BlockedIcon size={18} />
                }>
                    {variations.filter(v => selectedIds.has(v.id)).every(v => !v.status) ? "Ativar" : "Desativar"}
                </Button>
                <Button variant="ghost" leftIcon={<Settings2Icon size={18} />} className="h-10 px-3" onClick={() => setIsBulkEditOpen(true)}>
                    Editar em Massa
                </Button>
                <Button variant="ghostred" onClick={() => setModalState(p => ({ ...p, bulkDelete: true }))} leftIcon={<TrashIcon size={18} />} className="h-10 px-3">Excluir</Button>
            </FloatingActionBar>

            <AddVariantSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                product={productData}
                onSaveSuccess={loadVariants}
                onSavePendingVariants={onSavePendingVariants}
            />
            <FilterSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} sections={filterConfig} filters={filters} setFilters={setFilters} onClear={() => setFilters(INITIAL_FILTERS)} />

            <BulkEditActionsModal
                isOpen={isBulkEditOpen}
                onClose={() => setIsBulkEditOpen(false)}
                selectedCount={selectedIds.size}
                targetType="variation"
                onApply={handleBulkEditApply}
            />

            <AlertModal isOpen={modalState.delete} onClose={() => setModalState(p => ({ ...p, delete: false }))} onConfirm={handleDelete} title="Excluir variante?" message={`Tem certeza que deseja excluir a variante "${itemToDelete?.name || ''}"? Esta ação não pode ser desfeita.`} confirmText="Excluir" variant="danger" icon={<TrashIcon />} />
            <AlertModal isOpen={modalState.bulkDelete} onClose={() => setModalState(p => ({ ...p, bulkDelete: false }))} onConfirm={() => handleBulkEditApply({ type: 'delete' })} title="Excluir variações" description="Ação irreversível." confirmText="Excluir Seleção" variant="danger" />
            <AlertModal isOpen={modalState.bulkStatus} onClose={() => setModalState(p => ({ ...p, bulkStatus: false }))} onConfirm={() => handleBulkEditApply({ type: 'visibility', visibilityMode: variations.filter(v => selectedIds.has(v.id)).every(v => !v.status) ? 'publish' : 'hide' })} title="Atualizar Status" message={`Tem certeza que deseja alterar o status de ${selectedIds.size} variante(s)?`} confirmText="Confirmar" variant="warning" />
        </>
    )
}
