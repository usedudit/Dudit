"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "../hooks"
import { useStore } from "@/lib/store-context"
import { generateSKUBase } from "@/lib/utils/code-generators"
import type { Product } from "@/lib/types/product"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { UNITS } from "@/lib/constants/product-constants"
import { getERPProductsPageAction, type ERPProductListCursor } from "@/app/actions/erp/products"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade"
import { useErpExport } from "@/hooks/use-erp-export"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"

// Actions
import {
    createProductComprehensiveAction,
    createProductVariantsBatchAction,
    updateProductAction,
    deleteProductAction,
    deleteProductsInBatchAction,
    toggleProductsStatusAction,
    getProductWithDetailsAction,
    batchUpdateProductsAction,
    searchProductByBarcodeAction,
} from "@/app/actions/erp/products"

// Components
import { Button, Checkbox, IconPlaceholder, SelectionBanner, ThreeDotsLoader } from "@/components/reusable"
import { playBeepSound, vibrateMobile } from "@/lib/utils/barcode"
import Dropdown from "../../reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import AlertModal from "../../reusable/AlertModal"
import AddProductPage from "./AddProductPage"
import { ImportXmlModal } from "@/components/erp/import-xml-modal"

import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import Pagination from "@/components/reusable/Pagination"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { getProductUrl } from "@/lib/utils/url-generator"
import { LabelPrintModal } from "@/components/erp/labels/LabelPrintModal"

// New Component Imports
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import ProductGridCard from "./ProductGridCard"
import ProductListItem from "./ProductListRow"
import ProductPageControls from "./ProductPageControls"
import { getStockStatus } from "./product-utils"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    Settings2Icon,
    UploadIcon,
    ArrowUpDownIcon,
    TrashIcon,
    CheckCircleIcon,
    BlockedIcon,
    SearchIcon,
    EditIcon,
    CameraIcon,
    PackageIcon,
    UploadSheetIcon,
    TagIcon,
    StarIcon,
} from "@/lib/icons"

import { CameraScannerModal } from "@/components/reusable/CameraScannerModal"
import { ReplenishmentSheet } from "./ReplenishmentSheet"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"

// --- CONSTANTES ---
const UNIDADES_MEDIDA = UNITS.map(unit => ({ codigo: unit, descricao: unit }))

// --- TYPES & INTERFACES ---

type ColumnId =
    | "name"
    | "category"
    | "price"
    | "stock"
    | "status"
    | "actions"
    | "gtin"
    | "unit"
    | "ncm"
    | "brand"
    | "visibility"

interface ColumnDef {
    id: ColumnId
    label: string
    align?: "left" | "center" | "right"
    width: string
    minWidth?: string
}

interface FilterState {
    categories: string[]
    brands: string[]
    units: string[]
    stocks: string[]
    status: string[]
    priceRange: { min: string; max: string }
    [key: string]: any
}

const INITIAL_FILTERS: FilterState = {
    categories: [],
    brands: [],
    units: [],
    stocks: [],
    status: [],
    priceRange: { min: "", max: "" },
}

// --- CONFIGURAÇÃO DE COLUNAS ---
const FIXED_COLUMNS: ColumnDef[] = [
    { id: "name", label: "Produto", align: "left", width: "300px" },
    { id: "category", label: "Categoria", align: "left", width: "130px", minWidth: "120px" },
    { id: "brand", label: "Marca", align: "left", width: "110px", minWidth: "100px" },
    { id: "stock", label: "Estoque", align: "left", width: "160px", minWidth: "140px" },
    { id: "price", label: "Preço", align: "left", width: "110px", minWidth: "100px" },
    { id: "visibility", label: "Visibilidade", align: "center", width: "90px", minWidth: "90px" },
    { id: "status", label: "Status", align: "center", width: "90px", minWidth: "90px" },
    { id: "actions", label: "Ações", align: "center", width: "70px", minWidth: "70px" },
]

// --- EMPTY STATE COMPONENT ---
interface EmptyStateProps {
    type: "no-data" | "no-results" | "empty-tab"
    onAddFirst: () => void
    onClearFilters: () => void
}

const EmptyState = React.memo(({ type, onAddFirst, onClearFilters }: EmptyStateProps) => {
    let title = ""
    let description = ""
    let imageAlt = ""
    let image = type === "no-data" ? "https://img.dudit.com.br/static/mascots/Estoque.png" : "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"

    if (type === "no-data") {
        title = "Você ainda não tem produtos"
        description = "Comece adicionando produtos ao seu inventário para gerenciar seu estoque."
        imageAlt = "Sem produtos"
    } else if (type === "no-results") {
        title = "Nenhum produto encontrado"
        description = "Tente ajustar seus filtros ou termos de busca para encontrar o que procura."
        imageAlt = "Nenhum produto encontrado"
    } else {
        title = "Nenhum produto nesta seção"
        description = "Não há produtos com este status de estoque no momento."
        imageAlt = "Nenhum produto nesta seção"
    }

    return (
        <FadeIn
            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
        >
            <IconPlaceholder
                placeholderType="image"
                imageSrc={image}
                imageAlt={imageAlt}
                title={title}
                subtitle={description}
                itemButton={type === "no-data" ? {
                    text: "Adicionar primeiro produto",
                    action: onAddFirst,
                } : type === "no-results" ? {
                    text: "Limpar filtros",
                    action: onClearFilters,
                    variant: "outline"
                } : undefined}
            />
        </FadeIn>
    )
})
EmptyState.displayName = "EmptyState"


// --- MAIN COMPONENT ---

export default function ProductsPage({
    products: initialProducts,
    initialNextCursor,
    initialHasMore,
    partnerId,
    partner,
    suppliers,
}: { products: Product[]; initialNextCursor: ERPProductListCursor | null; initialHasMore: boolean; partnerId: string; partner?: any; suppliers: any[] }) {
    const router = useRouter()
    const { error: notifyError, success: notifySuccess } = useNotification()
    const { selectedStore } = useStore()
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()

    const productsQueryKey = useMemo(() => ['erp', 'products', partnerId] as const, [partnerId])

    // ── Entity Page Hook (URL state + cache + infinite list) ──────────
    const entityPage = useEntityPage<Product & { id: string }, Product & { id: string }, ERPProductListCursor>({
        entityType: 'products',
        partnerId,
        queryKey: productsQueryKey,
        initialItems: initialProducts as (Product & { id: string })[],
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPProductsPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar produtos.")
            return { items: res.items as (Product & { id: string })[], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((p: any) => String(p?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getProductWithDetailsAction(id)
            if (res.success && res.product) return res.product as Product & { id: string }
            return null
        },
        listToDetail: (item) => item,
    })

    const {
        items: effectiveBaseProducts, fetchNextPage, hasNextPage, isFetchingNextPage,
        entityState, openEntity, closeEntity, isViewing, isEditing, isCreating, isDuplicating,
        currentEntity, isLoadingDetail,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation, queryClient,
    } = entityPage

    const observerTarget = useRef<HTMLDivElement>(null)

    // ── Local products state (for optimistic updates after mutations) ──
    const [products, setProducts] = useState<Product[]>(effectiveBaseProducts as Product[])
    const [page, setPage] = useState(1)
    const [showLabelModal, setShowLabelModal] = useState(false)

    // Sync local products when query data changes
    const prevProductsRef = useRef(effectiveBaseProducts)
    useEffect(() => {
        if (prevProductsRef.current !== effectiveBaseProducts) {
            setProducts(effectiveBaseProducts as Product[])
            prevProductsRef.current = effectiveBaseProducts
        }
    }, [effectiveBaseProducts])

    // Sidebar reset → close entity view
    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [closeEntity])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    // ── UI State (non-URL) ────────────────────────────────────────────
    const [selection, setSelection] = useState({ ids: new Set<string>(), delete: null as Product | null })
    const [actionModal, setActionModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
    const [sharingProduct, setSharingProduct] = useState<Product | null>(null)
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const [filters, setFilters] = useState<FilterState>({
        stocks: [],
        categories: [],
        brands: [],
        units: [],
        status: [],
        priceRange: { min: "", max: "" },
    })
    const [activeTab, setActiveTab] = useState<"all" | "normal" | "low" | "out_of_stock">("all")
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [confirmations, setConfirmations] = useState({
        delete: false,
        inactivate: false,
        bulkDelete: false,
        bulkInactive: false
    })
    const [modals, setModals] = useState({ filter: false, import: false })
    const [showReplenishment, setShowReplenishment] = useState(false)
    const { exportData, isExporting, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport()
    const [bulkEditModal, setBulkEditModal] = useState({ isOpen: false })
    const [isCameraOpen, setIsCameraOpen] = useState(false)

    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode
    const itemsPerPage = 8

    // Initialize refs for container scrolling
    const containerRef = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)

    // ── Derived: Map entityState action to AddProductPage mode ────────
    const formMode = useMemo((): "add" | "edit" | "details" | "duplicate" | null => {
        if (!entityState.isOpen) return null
        switch (entityState.action) {
            case 'view': return 'details'
            case 'edit': return 'edit'
            case 'create': return 'add'
            case 'duplicate': return 'add'
            default: return null
        }
    }, [entityState])

    // ── Derived: Product for form (from cache, with duplicate transform) ─
    const formProduct = useMemo(() => {
        if (!entityState.isOpen) return null
        if (entityState.action === 'create') return null
        if (!currentEntity) return null
        if (isDuplicating) {
            const sku = generateSKUBase(currentEntity.name ? `${currentEntity.name} Copy` : undefined)
            return { ...currentEntity, id: undefined, sku, images: (currentEntity as any).images || [] } as any
        }
        return currentEntity as any
    }, [entityState, currentEntity, isDuplicating])

    const hasProducts = products.length > 0
    const hasActiveFilters =
        filters.stocks.length > 0 ||
        filters.categories.length > 0 ||
        filters.brands.length > 0 ||
        filters.units.length > 0 ||
        filters.status.length > 0 ||
        !!filters.priceRange.min ||
        !!filters.priceRange.max

    const isFiltered = search.length > 0 || hasActiveFilters

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "products",
            format: "xlsx",
            filters: {
                search: debouncedSearch,
                activeTab,
                status: filters.status,
                categories: filters.categories,
                stockStatus: filters.stocks,
            },
        }, { selectedIds: selection.ids, totalCount: products.length })
    }, [exportData, partnerId, debouncedSearch, activeTab, filters, selection.ids, products.length])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const nextLeft = scrollLeft > 0
            const nextRight = scrollLeft < scrollWidth - clientWidth - 2
            if (prev.left === nextLeft && prev.right === nextRight) return prev
            return { left: nextLeft, right: nextRight }
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => {
            window.removeEventListener("resize", checkScroll)
        }
    }, [checkScroll, effectiveViewMode, products])

    // Data Logic for Filter Sections
    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[]
        const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[]
        const units = [...new Set(products.map((p) => p.unit).filter(Boolean))] as string[]
        const stockLabels = [...new Set(products.map((p) => getStockStatus(p.stock_quantity ?? (p as any).stock ?? 0, p.min_stock ?? undefined).label))] as string[]

        return [
            { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo"] },
            { id: "priceRange", title: "Preço", type: "range", rangeConfig: { minKey: "minPrice", maxKey: "maxPrice" } },
            { id: "categories", title: "Categoria", type: "checkbox-list", options: categories },
            { id: "brands", title: "Marca", type: "checkbox-list", options: brands },
            { id: "units", title: "Unidade", type: "checkbox-list", options: units },
            { id: "stocks", title: "Situação de Estoque", type: "checkbox-list", options: stockLabels },
        ]
    }, [products])

    const filteredProducts = useMemo(() => {
        return products.filter((p) => {
            const term = debouncedSearch.toLowerCase()
            const stock = p.stock_quantity ?? (p as any).stock ?? 0
            const stockInfo = getStockStatus(stock, p.min_stock ?? undefined)
            const stockLabel = stockInfo.label
            const minPrice = filters.priceRange.min ? Number.parseFloat(filters.priceRange.min) : 0
            const maxPrice = filters.priceRange.max ? Number.parseFloat(filters.priceRange.max) : Number.POSITIVE_INFINITY

            let tabMatch = true
            if (activeTab === "normal") tabMatch = stockInfo.label === "Normal"
            else if (activeTab === "low") tabMatch = stockInfo.label === "Baixo"
            else if (activeTab === "out_of_stock") tabMatch = stockInfo.label === "Esgotado"

            const statusLabel = p.is_active ? "Ativo" : "Inativo"
            const statusMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

            return (
                tabMatch &&
                statusMatch &&
                (p.name.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term)) &&
                (filters.categories.length === 0 || filters.categories.includes((p.category || "") as any)) &&
                (filters.brands.length === 0 || filters.brands.includes((p.brand || "") as any)) &&
                (filters.stocks.length === 0 || filters.stocks.includes(stockLabel)) &&
                p.price >= minPrice &&
                p.price <= maxPrice
            )
        })
    }, [products, debouncedSearch, filters, activeTab])

    const sortedProducts = useMemo(() => {
        if (!sortConfig) return filteredProducts
        return [...filteredProducts].sort((a, b) => {
            let valA: any = a[sortConfig!.key as keyof Product]
            let valB: any = b[sortConfig!.key as keyof Product]

            if (sortConfig!.key === "stock") {
                valA = a.stock_quantity ?? (a as any).stock ?? 0
                valB = b.stock_quantity ?? (b as any).stock ?? 0
            }

            if (valA === valB) return 0
            const comparison = valA < valB ? -1 : 1
            return sortConfig!.direction === "asc" ? comparison : -comparison
        })
    }, [filteredProducts, sortConfig])

    const totalPages = Math.ceil(sortedProducts.length / itemsPerPage)
    const paginated = useMemo(() =>
        sortedProducts.slice((page - 1) * itemsPerPage, page * itemsPerPage),
        [sortedProducts, page, itemsPerPage])

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    // --- Handlers ---

    const handleSelectRow = useCallback((id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ...p, ids: s }
        })
    }, [])

    // ── Entity Navigation (instant via cache) ───────────────────────
    const handleEditProduct = useCallback((product: Product) => {
        openEntity('edit', product.id)
    }, [openEntity])

    const handleDetailsProduct = useCallback((product: Product) => {
        openEntity('view', product.id)
    }, [openEntity])

    const handleDuplicateProduct = useCallback((product: Product) => {
        openEntity('duplicate', product.id)
    }, [openEntity])

    const handleDeleteProduct = useCallback((product: Product) => {
        setSelection((s) => ({ ...s, delete: product }))
        setConfirmations((c) => ({ ...c, delete: true }))
    }, [])

    const handleSaveProduct = async (formData: any) => {
        setIsSaving(true)
        try {
            const isNewProduct = formMode === 'add'
            const action = isNewProduct ? createProductComprehensiveAction : updateProductAction
            const payload = isNewProduct
                ? { ...formData, partnerId, storeId: selectedStore?.id }
                : { productId: entityState.entityId || formProduct?.id, ...formData }
            const res = await action(payload)
            if (res.success) {
                if (isNewProduct && res.data?.id && formData.pending_variants?.length > 0) {
                    const variantsResult = await createProductVariantsBatchAction({
                        productId: res.data.id,
                        variants: formData.pending_variants,
                        csrf_token: formData.csrf_token,
                        deletedImages: [],
                    })
                    if (!variantsResult.success) {
                        notifyError("Produto criado com ressalvas", "O produto foi salvo, mas houve erro ao salvar as variações.")
                    }
                }

                notifySuccess("Sucesso")

                // Invalidate caches
                if (entityState.entityId) cache.invalidateEntity(entityState.entityId)
                afterMutation(entityState.entityId || undefined)

                if (isNewProduct && res.data) {
                    const addedProduct = res.data
                    queryClient.setQueryData(productsQueryKey, (oldData: any) => {
                        if (!oldData || !oldData.pages) return oldData
                        const newPages = [...oldData.pages]
                        if (newPages.length > 0) {
                            newPages[0] = { ...newPages[0], items: [addedProduct, ...newPages[0].items] }
                        }
                        return { ...oldData, pages: newPages }
                    })
                    setProducts((p) => [addedProduct, ...p])
                }

                closeEntity()
                return { success: true }
            } else {
                const errorMsg = res.error || "Erro ao salvar produto"
                if (isPlanLimitReachedError(errorMsg)) {
                    const target = getNextPlanTarget(planSlug)
                    if (target) openPlanUpgrade(target)
                    return { success: false, error: errorMsg }
                }
                notifyError("Erro", errorMsg)
                return { success: false, error: errorMsg }
            }
        } catch (e: any) {
            notifyError("Erro", "Erro interno")
            return { success: false, error: "Erro interno" }
        } finally {
            setIsSaving(false)
        }
    }

    const confirmDelete = async () => {
        if (selection.delete) {
            const deleteId = selection.delete.id
            setActionModal({ open: true, text: "Excluindo produto..." })
            const result = await deleteProductAction(deleteId)
            setActionModal({ open: false, text: "" })
            if (result.success) {
                afterMutation(deleteId)
                setProducts((p) => p.filter((prod) => prod.id !== deleteId))
                notifySuccess("Excluído")
            } else {
                const isPermission = result.error?.includes("permissão")
                notifyError(isPermission ? "Sem permissão" : "Erro", result.error || "Erro ao excluir produto")
            }
            setConfirmations((p) => ({ ...p, delete: false }))
        }
    }

    const confirmBulk = async (action: "delete" | "inactive") => {
        const ids = Array.from(selection.ids)
        if (action === "delete") {
            setActionModal({ open: true, text: "Excluir produtos..." })
            const result = await deleteProductsInBatchAction(ids)
            setActionModal({ open: false, text: "" })
            if (result.error) {
                const isPermission = result.error?.includes("permissão")
                notifyError(isPermission ? "Sem permissão" : "Erro", result.error)
            } else {
                afterMutation()
                const idSet = new Set(ids)
                setProducts((p) => p.filter((prod) => !idSet.has(prod.id)))
                notifySuccess("Excluído")
            }
            setConfirmations((p) => ({ ...p, bulkDelete: false }))
        } else {
            setActionModal({ open: true, text: "Atualizando status..." })
            const allInactive = products.filter((p) => selection.ids.has(p.id)).every((p) => !p.is_active)
            await toggleProductsStatusAction(ids, allInactive)
            afterMutation()
            setActionModal({ open: false, text: "" })
            const idSet = new Set(ids)
            setProducts((p) => p.map((prod) => idSet.has(prod.id) ? { ...prod, is_active: allInactive } : prod))
            setConfirmations((p) => ({ ...p, bulkInactive: false }))
            notifySuccess("Atualizado")
        }
        setSelection((p) => ({ ...p, ids: new Set() }))
    }

    const handleBulkEditApply = async (payload: BulkActionPayload) => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        setActionModal({ open: true, text: "Aplicando alterações..." })

        try {
            // 1. Delete Bulk handled by payload.type === 'delete'
            if (payload.type === 'delete') {
                const result = await deleteProductsInBatchAction(ids)
                if (result.success) {
                    afterMutation()
                    setProducts(p => p.filter(prod => !selection.ids.has(prod.id)))
                    setSelection(p => ({ ...p, ids: new Set() }))
                    notifySuccess("Sucesso", `${ids.length} produtos excluídos`)
                    setBulkEditModal({ isOpen: false })
                } else {
                    notifyError("Erro", result.error)
                }
                return
            }

            // 2. Image Upload if needed
            let uploadedImageUrl: string | undefined = undefined
            if (payload.type === 'image' && payload.imageFile) {
                const formData = new FormData()
                formData.append("file", payload.imageFile)
                const uploadRes = await fetchWithCSRF("/api/upload-image", { method: "POST", body: formData })
                const uploadData = await uploadRes.json()
                if (uploadData.success && uploadData.key) {
                    uploadedImageUrl = uploadData.key
                } else {
                    notifyError("Erro", "Falha no upload da imagem")
                    return
                }
            }

            // 3. Prepare Updates - O(1) lookup via Map (was O(n²) with .find())
            const productsMap = new Map(products.map(p => [p.id, p]))
            const updates = ids.map(id => {
                const product = productsMap.get(id)
                if (!product) return null

                const update: any = { id }

                if (payload.type === 'price') {
                    if (payload.priceOnlyPublished && !product.is_active) return null
                    let newPrice = product.price
                    if (payload.priceMode === 'percent_inc') newPrice *= (1 + (payload.priceValue || 0) / 100)
                    else if (payload.priceMode === 'percent_dec') newPrice *= (1 - (payload.priceValue || 0) / 100)
                    else if (payload.priceMode === 'fixed') newPrice = payload.priceValue || 0
                    update.price = newPrice
                } else if (payload.type === 'stock') {
                    const currentStock = product.stock_quantity || (product as any).stock || 0
                    if (payload.stockIgnoreNegative && currentStock < 0) return null
                    let newStock = currentStock
                    if (payload.stockMode === 'add') newStock += (payload.stockValue || 0)
                    else if (payload.stockMode === 'sub') newStock -= (payload.stockValue || 0)
                    else if (payload.stockMode === 'fixed') newStock = payload.stockValue || 0
                    else if (payload.stockMode === 'zero') newStock = 0
                    update.stock_quantity = newStock
                } else if (payload.type === 'visibility') {
                    update.is_active = payload.visibilityMode === 'publish'
                } else if (payload.type === 'image' && uploadedImageUrl) {
                    update.images = [uploadedImageUrl, ...(product.images || [])]
                } else if (payload.type === 'remove_image') {
                    update.images = []
                }

                return update
            }).filter(Boolean) as any[]

            if (updates.length > 0) {
                const result = await batchUpdateProductsAction(updates)
                if (result.success) {
                    afterMutation()
                    const updatesMap = new Map(updates.map(u => [u.id, u]))
                    setProducts(p => p.map(prod => updatesMap.has(prod.id) ? { ...prod, ...updatesMap.get(prod.id) } : prod))
                    notifySuccess("Sucesso", "Alterações aplicadas com sucesso")
                    setBulkEditModal({ isOpen: false })
                    setSelection(p => ({ ...p, ids: new Set() }))
                } else {
                    notifyError("Erro", result.error || "Falha ao aplicar alterações")
                }
            }

        } catch (error) {
            console.error(error)
            notifyError("Erro", "Ocorreu um erro ao processar a solicitação")
        } finally {
            setActionModal({ open: false, text: "" })
        }
    }

    const handleScanBarcode = useCallback(async (code: string) => {
        const cleanCode = code.trim();
        if (!cleanCode) return;

        // 1. Search locally in the loaded products
        const localMatch = products.find(p =>
            (p.gtin && p.gtin.toLowerCase() === cleanCode.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase() === cleanCode.toLowerCase())
        );

        if (localMatch) {
            playBeepSound();
            vibrateMobile();
            openEntity('view', localMatch.id);
            setSearch("");
            return;
        }

        // 2. Search server-side
        try {
            const res = await searchProductByBarcodeAction(partnerId, cleanCode);
            if (res && res.success) {
                if (res.data) {
                    playBeepSound();
                    vibrateMobile();
                    openEntity('view', res.data.id);
                    setSearch("");
                } else {
                    setSearch(cleanCode);
                    notifyError("Produto não encontrado. Filtrando lista por código...");
                }
            } else {
                setSearch(cleanCode);
                notifyError("Produto não encontrado. Filtrando lista por código...");
            }
        } catch (err: any) {
            setSearch(cleanCode);
            notifyError("Erro ao buscar produto. Filtrando lista por código...");
        }
    }, [products, partnerId, openEntity, setSearch, notifyError]);

    const handleAddFirstProduct = useCallback(() => {
        openEntity('create')
    }, [openEntity])

    const handleClearFilters = useCallback(() => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
    }, [setSearch])

    const updateViewMode = useCallback((mode: "list" | "grid") => {
        // Implement the logic to update view mode here
    }, [])

    const selectedProds = useMemo(() =>
        products.filter((p) => selection.ids.has(p.id)),
        [products, selection.ids])

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && formMode ? (
                    isLoadingDetail ? (
                        <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                            <ThreeDotsLoader />
                        </div>
                    ) : (
                        <AddProductPage
                            key="form"
                            mode={formMode as any}
                            setMode={(m) => {
                                // Map AddProductPage mode changes to URL updates
                                if (m === 'edit' && entityState.entityId) openEntity('edit', entityState.entityId)
                                else if (m === 'details' && entityState.entityId) openEntity('view', entityState.entityId)
                            }}
                            product={formProduct}
                            onBack={closeEntity}
                            onClose={closeEntity}
                            onSave={handleSaveProduct}
                            isSaving={isSaving}
                            suppliers={suppliers}
                            unidadesMedida={UNIDADES_MEDIDA}
                            partnerId={partnerId}
                            partner={partner}
                            storeId={selectedStore?.id || ""}
                            isLoadingDetails={isLoadingDetail}
                        />
                    )
                ) : (
                    <FadeIn
                        key="list"
                        className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                    >
                        <style>{`
                        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                        .hide-scrollbar::-webkit-scrollbar { display: none; }
                        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                    `}</style>

                        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Produtos
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie seus produtos, estoque e preços.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outlineorange"
                                        className="w-[42px] h-[42px]"
                                        onClick={() => {
                                            if (hasMinimumPlan(planSlug, "escalar")) setShowReplenishment(true)
                                            else openPlanUpgrade("escalar")
                                        }}
                                        leftIcon={<StarIcon size={18} />}
                                    >
                                        Sugestões
                                    </Button>
                                    <Dropdown
                                        trigger={
                                            <Button variant="outline" leftIcon={<Settings2Icon size={18} />}>
                                                Ações
                                            </Button>
                                        }
                                        align="right"
                                        showChevron={false}
                                        fullWidth={false}
                                    >
                                        <DropdownItem onClick={() => router.push("/erp/products/import")}>
                                            <UploadSheetIcon size={18} /> Importar Planilha
                                        </DropdownItem>
                                        <DropdownItem onClick={handleExport} disabled={isExporting}>
                                            <ExportFileIcon size={18} /> {isExporting ? "Exportando..." : "Exportar"}
                                        </DropdownItem>
                                        <DropdownItem onClick={() => {
                                            if (!hasMinimumPlan(planSlug, "crescer")) {
                                                openPlanUpgrade("crescer")
                                            } else {
                                                setShowLabelModal(true)
                                            }
                                        }}>
                                            <TagIcon size={18} /> Gerar Etiquetas
                                        </DropdownItem>
                                    </Dropdown>

                                    <Button
                                        onClick={handleAddFirstProduct}
                                        className="w-full"
                                        leftIcon={<PlusIcon size={18} />}
                                    >
                                        Novo produto
                                    </Button>
                                </div>
                            </div>

                            {hasProducts && (
                                <ProductPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals((p) => ({ ...p, filter: true }))}
                                    onOpenImport={() => router.push("/erp/xml-import")}
                                    onOpenExport={handleExport}
                                    onAddProduct={handleAddFirstProduct}
                                    filters={filters}
                                    setFilters={setFilters}
                                    viewMode={viewMode}
                                    onViewModeChange={(mode) => {
                                        setViewModeState(mode)
                                    }}
                                    hasActiveFilters={hasActiveFilters}
                                    onScanBarcode={handleScanBarcode}
                                    onOpenCamera={() => setIsCameraOpen(true)}
                                    onOpenReplenishment={() => {
                                        if (hasMinimumPlan(planSlug, "escalar")) setShowReplenishment(true)
                                        else openPlanUpgrade("escalar")
                                    }}
                                    hasEscalarPlan={hasMinimumPlan(planSlug, "escalar")}
                                />
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {!hasProducts ? (
                                        <FadeIn key="empty-no-data" className="w-full h-full">
                                            <EmptyState
                                                type="no-data"
                                                onAddFirst={handleAddFirstProduct}
                                                onClearFilters={handleClearFilters}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full">
                                            <EmptyState
                                                type={isFiltered ? "no-results" : "empty-tab"}
                                                onAddFirst={handleAddFirstProduct}
                                                onClearFilters={handleClearFilters}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <AnimatePresence mode="wait">
                                            <FadeIn key={effectiveViewMode} className="w-full">
                                                <SelectionBanner
                                                    selectedCount={selection.ids.size}
                                                    totalCount={sortedProducts.length}
                                                    onSelectAll={() => setSelection(p => ({ ...p, ids: new Set(sortedProducts.map(prod => prod.id)) }))}
                                                    onClearSelection={() => setSelection(p => ({ ...p, ids: new Set() }))}
                                                    itemName="produtos"
                                                    singularItemName="produto"
                                                />
                                                {effectiveViewMode === "grid" ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginated.map((product) => {
                                                            const prefetch = getPrefetchProps(product.id)
                                                            return (
                                                                <ProductGridCard
                                                                    key={product.id}
                                                                    product={product}
                                                                    selected={selection.ids.has(product.id)}
                                                                    onSelect={() => handleSelectRow(product.id)}
                                                                    onEdit={() => handleEditProduct(product)}
                                                                    onDetails={() => handleDetailsProduct(product)}
                                                                    onDelete={() => handleDeleteProduct(product)}
                                                                    onDuplicate={() => handleDuplicateProduct(product)}
                                                                    onShare={() => setSharingProduct(product)}
                                                                    onPrefetchMouseEnter={prefetch.onMouseEnter}
                                                                    onPrefetchMouseLeave={prefetch.onMouseLeave}
                                                                    onPrefetchTouchStart={prefetch.onTouchStart}
                                                                />
                                                            )
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                                                                            <Checkbox
                                                                                checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                                onCheckedChange={(checked) => {
                                                                                    if (checked) setSelection(p => ({ ...p, ids: new Set([...p.ids, ...paginated.map(x => x.id)]) }))
                                                                                    else setSelection(p => {
                                                                                        const s = new Set(p.ids)
                                                                                        paginated.forEach(x => s.delete(x.id))
                                                                                        return { ...p, ids: s }
                                                                                    })
                                                                                }}
                                                                                className="bg-white dark:bg-dark-background"
                                                                            />
                                                                        </th>
                                                                        {FIXED_COLUMNS.map((col) => {
                                                                            const isSorted = sortConfig?.key === col.id
                                                                            return (
                                                                                <th
                                                                                    key={col.id}
                                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""}`}
                                                                                    style={{ width: col.width, minWidth: col.minWidth }}
                                                                                    onClick={() => {
                                                                                        if (col.id === "actions") return
                                                                                        setSortConfig((prev) => ({
                                                                                            key: col.id,
                                                                                            direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                                        }))
                                                                                    }}
                                                                                >
                                                                                    <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                        <span>{col.label}</span>
                                                                                        {col.id !== "actions" && (
                                                                                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                                <ArrowUpDownIcon
                                                                                                    size={14}
                                                                                                    className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                                                />
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </th>
                                                                            )
                                                                        })}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginated.map((product) => {
                                                                        const prefetch = getPrefetchProps(product.id)
                                                                        return (
                                                                            <ProductListItem
                                                                                key={product.id}
                                                                                product={product}
                                                                                columns={FIXED_COLUMNS}
                                                                                selected={selection.ids.has(product.id)}
                                                                                onSelect={handleSelectRow}
                                                                                onEdit={handleEditProduct}
                                                                                onDetails={handleDetailsProduct}
                                                                                onDelete={handleDeleteProduct}
                                                                                onDuplicate={handleDuplicateProduct}
                                                                                onShare={(prod) => setSharingProduct(prod)}
                                                                                suppliers={[]}
                                                                                onPrefetchMouseEnter={prefetch.onMouseEnter}
                                                                                onPrefetchMouseLeave={prefetch.onMouseLeave}
                                                                                onPrefetchTouchStart={prefetch.onTouchStart}
                                                                            />
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </FadeIn>
                                        </AnimatePresence>
                                    )}
                                </AnimatePresence>
                                {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                            </div>

                            {hasProducts && paginated.length > 0 && (
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={(p) => {
                                        setPage(p)
                                        if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                            void fetchNextPage()
                                        }
                                    }}
                                />
                            )}
                            {hasNextPage && page === totalPages && isFetchingNextPage ? (
                                <div className="flex flex-col gap-2 py-2 px-4">
                                    <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse" />
                                    <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse opacity-70" />
                                </div>
                            ) : null}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection((p) => ({ ...p, ids: new Set() }))}
            >
                <Button
                    variant="ghost"
                    onClick={() => setBulkEditModal({ isOpen: true })}
                    leftIcon={<EditIcon size={18} />}
                    className="h-10 px-3"
                >
                    Ações em massa
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkInactive: true }))}
                    leftIcon={
                        selectedProds.every((p) => !p.is_active)
                            ? <CheckCircleIcon size={18} />
                            : <BlockedIcon size={18} />
                    }
                    className="h-10 px-3"
                >
                    {selectedProds.every((p) => !p.is_active) ? "Ativar" : "Desativar"}
                </Button>

                <Button
                    variant="ghostred"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkDelete: true }))}
                    leftIcon={<TrashIcon size={18} />}
                    className="h-10 px-3"
                >
                    Excluir
                </Button>
            </FloatingActionBar>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals((p) => ({ ...p, filter: false }))}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={handleClearFilters}
            />

            <AlertModal
                isOpen={confirmations.delete}
                onClose={() => setConfirmations((p) => ({ ...p, delete: false }))}
                onConfirm={confirmDelete}
                title="Excluir"
                message="Tem certeza que deseja excluir este produto?"
                confirmText="Excluir"
                icon={<TrashIcon />}
                variant="danger"
            />
            <AlertModal
                isOpen={confirmations.bulkDelete}
                onClose={() => setConfirmations((p) => ({ ...p, bulkDelete: false }))}
                onConfirm={() => confirmBulk("delete")}
                title="Excluir Produtos"
                message={`Tem certeza que deseja excluir ${selection.ids.size} produtos? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                variant="danger"
            />

            <BulkEditActionsModal
                isOpen={bulkEditModal.isOpen}
                onClose={() => setBulkEditModal({ isOpen: false })}
                selectedCount={selection.ids.size}
                targetType="product"
                onApply={handleBulkEditApply}
            />
            <AlertModal
                isOpen={confirmations.bulkInactive}
                onClose={() => setConfirmations((p) => ({ ...p, bulkInactive: false }))}
                onConfirm={() => confirmBulk("inactive")}
                title="Atualizar Status"
                message={`Tem certeza que deseja alterar o status de ${selection.ids.size} produtos(s)?`}
                confirmText="Confirmar"
                variant="warning"
            />
            <ImportXmlModal
                isOpen={modals.import}
                onClose={() => setModals((p) => ({ ...p, import: false }))}
                partnerId={partnerId}
                storeId={selectedStore?.id || ""}
                onImportSuccess={() => { }}
            />
            {sharingProduct && (
                <ShareModal
                    isOpen={!!sharingProduct}
                    onClose={() => setSharingProduct(null)}
                    url={typeof window !== 'undefined' ? `${window.location.origin}${getProductUrl(sharingProduct, partner)}` : ""}
                    title={sharingProduct.name}
                    shareMessage={`🔥 Olha esse achado na Dudit!\n\n*${sharingProduct.name}*\nConfere aqui os detalhes:`}
                    label="Link do produto"
                />
            )}

            <SavingStatusModal isOpen={actionModal.open} text={actionModal.text || "Salvando..."} />

            <ReplenishmentSheet
                isOpen={showReplenishment}
                onClose={() => setShowReplenishment(false)}
                partnerId={partnerId}
            />

            {showLabelModal && (
                <LabelPrintModal
                    isOpen={showLabelModal}
                    onClose={() => setShowLabelModal(false)}
                    allProducts={products}
                />
            )}

            <ExportSelectionModal
                isOpen={selectionModal.isOpen}
                selectedCount={selectionModal.selectedCount}
                totalCount={selectionModal.totalCount}
                onExportSelected={handleExportSelected}
                onExportAll={handleExportAll}
                onClose={closeSelectionModal}
            />
        </>
    )
}
