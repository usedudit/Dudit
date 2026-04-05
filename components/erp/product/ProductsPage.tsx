"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery, useERPData } from "../hooks"
import { useStore } from "@/lib/store-context"
import { generateSKUBase } from "@/lib/utils/code-generators"
import type { Product } from "@/lib/types/product"
import { motion, AnimatePresence } from "framer-motion"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { UNITS } from "@/lib/constants/product-constants"
import { fetchERPProductsClient } from "@/app/actions/erp/client-loaders"
import { useQueryClient } from "@tanstack/react-query"

// Actions
import {
    createProductComprehensiveAction,
    updateProductAction,
    deleteProductAction,
    deleteProductsInBatchAction,
    toggleProductsStatusAction,
    getProductWithDetailsAction,
    batchUpdateProductsAction,
} from "@/app/actions/erp/products"

// Components
import { Button, Checkbox, IconPlaceholder } from "@/components/reusable"
import Dropdown from "../../reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import AlertModal from "../../reusable/AlertModal"
import AddProductPage from "./AddProductPage"
import { ImportXmlModal } from "@/components/erp/import-xml-modal"
import DefaultModal from "@/components/reusable/DefaultModal"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"

// New Component Imports
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import ProductGridCard from "./ProductGridCard"
import ProductListItem from "./ProductListItem"
import ProductMobileItem from "./ProductMobileItem"
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
    EditIcon
} from "@/lib/icons"

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
    { id: "name", label: "Produto", align: "left", width: "280px", minWidth: "280px" },
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
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
        >
            <IconPlaceholder
                placeholderType="image"
                imageSrc={image}
                imageAlt={imageAlt}
                title={title}
                subtitle={description}
                itemButton={type === "no-data" ? {
                    text: "Adicionar Primeiro Produto",
                    action: onAddFirst,
                } : type === "no-results" ? {
                    text: "Limpar Filtros",
                    action: onClearFilters,
                    variant: "outline"
                } : undefined}
            />
        </motion.div>
    )
})
EmptyState.displayName = "EmptyState"


// --- MAIN COMPONENT ---

export default function ProductsPage({
    products: initialProducts,
    partnerId,
    suppliers,
}: { products: Product[]; partnerId: string; suppliers: any[] }) {
    const router = useRouter()
    const { toast } = useToast()
    const { selectedStore } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")

    const queryClient = useQueryClient()

    const { data: queryProducts, isLoading: isQueryLoading } = useERPData(
        ['erp', 'products', partnerId],
        () => fetchERPProductsClient(),
        { initialData: initialProducts, isCritical: true }
    )

    const effectiveBaseProducts = queryProducts ?? initialProducts

    // State
    const [data, setData] = useState<{ products: Product[], search: string, debouncedSearch: string, page: number }>({ products: effectiveBaseProducts, search: "", debouncedSearch: "", page: 1 })

    // Update state when server/query data changes (e.g. after background refresh)
    const prevProductsRef = useRef(effectiveBaseProducts)
    useEffect(() => {
        if (prevProductsRef.current !== effectiveBaseProducts) {
            // Only update if array actually changed references (RQ does this automatically if data is different)
            setData(prev => ({ ...prev, products: effectiveBaseProducts }))
            prevProductsRef.current = effectiveBaseProducts
        }
    }, [effectiveBaseProducts])

    const [selection, setSelection] = useState({ ids: new Set<string>(), product: null as Product | null, delete: null as Product | null, duplicate: null as Partial<Product> | null, loadingDetails: false })
    const [actionModal, setActionModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
    const [viewMode, setViewModeState] = useState<"list" | "grid">(
        isMobile ? "grid" : "list",
    )
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
    const [ui, setUi] = useState<{ formMode: "edit" | "duplicate" | "details" | "add" | null; pageState: string; sort: { key: string; direction: "asc" | "desc" } | null; isSaving?: boolean }>({ formMode: null, pageState: "list", sort: null })
    const [confirmations, setConfirmations] = useState({
        delete: false,
        inactivate: false,
        bulkDelete: false,
        bulkInactive: false
    })
    const [modals, setModals] = useState({ filter: false, import: false, export: false })
    const [bulkEditModal, setBulkEditModal] = useState({ isOpen: false })

    const effectiveViewMode = isMobile ? "grid" : viewMode
    const itemsPerPage = 8

    // Initialize refs for container scrolling
    const containerRef = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)

    const hasProducts = data.products.length > 0
    const hasActiveFilters =
        filters.stocks.length > 0 ||
        filters.categories.length > 0 ||
        filters.brands.length > 0 ||
        filters.status.length > 0 ||
        !!filters.priceRange.min ||
        !!filters.priceRange.max

    const isFiltered = data.search.length > 0 || hasActiveFilters

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
        return () => {
            window.removeEventListener("resize", checkScroll)
        }
    }, [checkScroll, effectiveViewMode, data.products])

    useEffect(() => {
        const t = setTimeout(() => setData((p) => ({ ...p, debouncedSearch: p.search })), 500)
        return () => clearTimeout(t)
    }, [data.search])

    // Data Logic for Filter Sections
    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const categories = [...new Set(data.products.map((p) => p.category).filter(Boolean))] as string[]
        const brands = [...new Set(data.products.map((p) => p.brand).filter(Boolean))] as string[]
        const units = [...new Set(data.products.map((p) => p.unit).filter(Boolean))] as string[]
        const stockLabels = [...new Set(data.products.map((p) => getStockStatus(p.stock_quantity ?? (p as any).stock ?? 0, p.min_stock ?? undefined).label))] as string[]

        return [
            { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo"] },
            { id: "priceRange", title: "Preço", type: "range", rangeConfig: { minKey: "minPrice", maxKey: "maxPrice" } },
            { id: "categories", title: "Categoria", type: "checkbox-list", options: categories },
            { id: "brands", title: "Marca", type: "checkbox-list", options: brands },
            { id: "units", title: "Unidade", type: "checkbox-list", options: units },
            { id: "stocks", title: "Situação de Estoque", type: "checkbox-list", options: stockLabels },
        ]
    }, [data.products])

    const filteredProducts = useMemo(() => {
        return data.products.filter((p) => {
            const term = data.debouncedSearch.toLowerCase()
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
    }, [data.products, data.debouncedSearch, filters, activeTab])

    const sortedProducts = useMemo(() => {
        if (!ui.sort) return filteredProducts
        return [...filteredProducts].sort((a, b) => {
            let valA: any = a[ui.sort!.key as keyof Product]
            let valB: any = b[ui.sort!.key as keyof Product]

            if (ui.sort!.key === "stock") {
                valA = a.stock_quantity ?? (a as any).stock ?? 0
                valB = b.stock_quantity ?? (b as any).stock ?? 0
            }

            if (valA === valB) return 0
            const comparison = valA < valB ? -1 : 1
            return ui.sort!.direction === "asc" ? comparison : -comparison
        })
    }, [filteredProducts, ui.sort])

    const totalPages = Math.ceil(sortedProducts.length / itemsPerPage)
    const paginated = useMemo(() =>
        sortedProducts.slice((data.page - 1) * itemsPerPage, data.page * itemsPerPage),
        [sortedProducts, data.page, itemsPerPage])

    // --- Handlers ---

    const handleSelectRow = useCallback((id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ...p, ids: s }
        })
    }, [])

    // Abre form IMEDIATAMENTE com dados básicos, fetcha detalhes em background
    const openProductForm = useCallback((product: Product, mode: "edit" | "details") => {
        // Mostra form IMEDIATAMENTE com dados da lista
        setSelection((s) => ({ ...s, product, loadingDetails: true }))
        setUi((u) => ({ ...u, formMode: mode, pageState: "form" }))

        // Fetch detalhes em background
        getProductWithDetailsAction(product.id)
            .then((res) => {
                if (res.success && res.product) {
                    setSelection((s) => ({ ...s, product: res.product, loadingDetails: false }))
                } else {
                    setSelection((s) => ({ ...s, loadingDetails: false }))
                }
            })
            .catch(() => {
                setSelection((s) => ({ ...s, loadingDetails: false }))
            })
    }, [])

    const handleEditProduct = useCallback((product: Product) => {
        openProductForm(product, "edit")
    }, [openProductForm])

    const handleDetailsProduct = useCallback((product: Product) => {
        openProductForm(product, "details")
    }, [openProductForm])

    const handleDeleteProduct = useCallback((product: Product) => {
        setSelection((s) => ({ ...s, delete: product }))
        setConfirmations((c) => ({ ...c, delete: true }))
    }, [])

    const handleDuplicateProduct = useCallback(async (product: Product) => {
        const sku = generateSKUBase(product.name ? `${product.name} Copy` : undefined)

        setSelection((s) => ({
            ...s,
            duplicate: { ...product, id: undefined, sku, images: product.images || [] },
        }))
        setUi((u) => ({ ...u, formMode: "add", pageState: "form" }))

        // Busca detalhes completos em background
        getProductWithDetailsAction(product.id)
            .then((res) => {
                if (res.success && res.product) {
                    setSelection((s) => ({
                        ...s,
                        duplicate: { ...res.product, id: undefined, sku, images: res.product.images || [] },
                    }))
                }
            })
            .catch(() => { })
    }, [])

    const handleSaveProduct = async (formData: any) => {
        setUi((p) => ({ ...p, isSaving: true }))
        setActionModal({ open: true, text: ui.formMode === "add" ? "Criando produto..." : "Salvando produto..." })
        try {
            const action = ui.formMode === "add" ? createProductComprehensiveAction : updateProductAction
            const payload =
                ui.formMode === "add"
                    ? { ...formData, partnerId, storeId: selectedStore?.id }
                    : { productId: selection.product?.id, ...formData }
            const res = await action(payload)
            if (res.success) {
                toast({ title: "Sucesso" })
                queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })

                // Fecha form IMEDIATAMENTE — sem esperar refresh
                setUi((p) => ({ ...p, pageState: "list", isSaving: false }))
                setSelection((p) => ({ ...p, duplicate: null }))

                // Atualiza lista local (optimistic) em vez de router.refresh()
                if (ui.formMode === "add" && 'data' in res && res.data) {
                    setData((p) => ({ ...p, products: [res.data, ...p.products] }))
                } else if (ui.formMode === "edit" && selection.product?.id) {
                    setData((p) => ({
                        ...p,
                        products: p.products.map((prod) =>
                            prod.id === selection.product?.id
                                ? { ...prod, ...formData, is_active: formData.status === "Active" }
                                : prod
                        ),
                    }))
                }
                return
            } else {
                toast({ title: "Erro", description: res.error, variant: "destructive" })
            }
        } catch {
            toast({ title: "Erro", variant: "destructive" })
        } finally {
            setUi((p) => ({ ...p, isSaving: false }))
            setActionModal({ open: false, text: "" })
        }
    }

    const confirmDelete = async () => {
        if (selection.delete) {
            const deleteId = selection.delete.id
            setActionModal({ open: true, text: "Excluindo produto..." })
            const result = await deleteProductAction(deleteId)
            setActionModal({ open: false, text: "" })
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })
                setData((p) => ({ ...p, products: p.products.filter((prod) => prod.id !== deleteId) }))
                toast({ title: "Excluído" })
            } else {
                const isPermission = result.error?.includes("permissão")
                toast({
                    title: isPermission ? "Sem permissão" : "Erro",
                    description: result.error || "Erro ao excluir produto",
                    variant: "destructive",
                })
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
                toast({
                    title: isPermission ? "Sem permissão" : "Erro",
                    description: result.error,
                    variant: "destructive",
                })
            } else {
                queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })
                const idSet = new Set(ids)
                setData((p) => ({ ...p, products: p.products.filter((prod) => !idSet.has(prod.id)) }))
                toast({ title: "Excluído" })
            }
            setConfirmations((p) => ({ ...p, bulkDelete: false }))
        } else {
            setActionModal({ open: true, text: "Atualizando status..." })
            const allInactive = data.products.filter((p) => selection.ids.has(p.id)).every((p) => !p.is_active)
            await toggleProductsStatusAction(ids, allInactive)
            queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })
            setActionModal({ open: false, text: "" })
            const idSet = new Set(ids)
            setData((p) => ({
                ...p,
                products: p.products.map((prod) =>
                    idSet.has(prod.id) ? { ...prod, is_active: allInactive } : prod
                ),
            }))
            setConfirmations((p) => ({ ...p, bulkInactive: false }))
            toast({ title: "Atualizado" })
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
                    queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })
                    setData(p => ({ ...p, products: p.products.filter(prod => !selection.ids.has(prod.id)) }))
                    setSelection(p => ({ ...p, ids: new Set() }))
                    toast({ title: "Sucesso", description: `${ids.length} produtos excluídos` })
                    setBulkEditModal({ isOpen: false })
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
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
                    toast({ title: "Erro", description: "Falha no upload da imagem", variant: "destructive" })
                    return
                }
            }

            // 3. Prepare Updates — O(1) lookup via Map (was O(n²) with .find())
            const productsMap = new Map(data.products.map(p => [p.id, p]))
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
                    queryClient.invalidateQueries({ queryKey: ['erp', 'products', partnerId] })
                    const updatesMap = new Map(updates.map(u => [u.id, u]))
                    setData(p => ({
                        ...p,
                        products: p.products.map(prod => updatesMap.has(prod.id) ? { ...prod, ...updatesMap.get(prod.id) } : prod)
                    }))
                    toast({ title: "Sucesso", description: "Alterações aplicadas com sucesso" })
                    setBulkEditModal({ isOpen: false })
                    setSelection(p => ({ ...p, ids: new Set() }))
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
                }
            }

        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Ocorreu um erro ao processar a solicitação", variant: "destructive" })
        } finally {
            setActionModal({ open: false, text: "" })
        }
    }

    const handleAddFirstProduct = useCallback(() => {
        setUi((p) => ({ ...p, formMode: "add", pageState: "form" }))
        setSelection((p) => ({ ...p, product: null, duplicate: null }))
    }, [])

    const handleClearFilters = useCallback(() => {
        setData(p => ({ ...p, search: "", debouncedSearch: "" }))
        setFilters(INITIAL_FILTERS)
    }, [])

    const updateViewMode = useCallback((mode: "list" | "grid") => {
        // Implement the logic to update view mode here
    }, [])

    const selectedProds = useMemo(() =>
        data.products.filter((p) => selection.ids.has(p.id)),
        [data.products, selection.ids])

    if (ui.pageState === "form") {
        return (
            <AddProductPage
                mode={ui.formMode as any}
                setMode={(m) => setUi((p) => ({ ...p, formMode: m }))}
                product={(ui.formMode === "edit" || ui.formMode === "details" ? selection.product : selection.duplicate) as any}
                onBack={() => setUi((p) => ({ ...p, pageState: "list" }))}
                onClose={() => setUi((p) => ({ ...p, pageState: "list" }))}
                onSave={handleSaveProduct}
                isSaving={ui.isSaving}
                suppliers={suppliers}
                unidadesMedida={UNIDADES_MEDIDA}
                partnerId={partnerId}
                storeId={selectedStore?.id || ""}
                isLoadingDetails={selection.loadingDetails}
            />
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
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
                                Inventário
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie seus produtos, estoque e preços.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Dropdown
                            trigger={
                                <Button variant="outline">
                                    <Settings2Icon className="w-[18px] h-[18px]" /> Ações
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            fullWidth={false}
                        >
                            <DropdownItem onClick={() => setModals((p) => ({ ...p, import: true }))}>
                                <UploadIcon size={16} /> Importar XML
                            </DropdownItem>
                            <DropdownItem onClick={() => setModals((p) => ({ ...p, export: true }))}>
                                <ExportFileIcon size={16} /> Exportar
                            </DropdownItem>
                        </Dropdown>

                        <Button
                            onClick={handleAddFirstProduct}
                            className="w-full"
                        >
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Novo Produto
                        </Button>
                    </div>
                </div>

                {hasProducts && (
                    <ProductPageControls
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        search={data.search}
                        onSearchChange={(val) => setData((p) => ({ ...p, search: val }))}
                        onOpenFilter={() => setModals((p) => ({ ...p, filter: true }))}
                        onOpenImport={() => setModals((p) => ({ ...p, import: true }))}
                        onOpenExport={() => setModals((p) => ({ ...p, export: true }))}
                        onAddProduct={handleAddFirstProduct}
                        filters={filters}
                        setFilters={setFilters}
                        viewMode={viewMode}
                        onViewModeChange={(mode) => {
                            setViewModeState(mode)
                        }}
                        hasActiveFilters={hasActiveFilters}
                    />
                )}

                <div ref={containerRef} className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">

                    <AnimatePresence mode="wait">
                        {!hasProducts ? (
                            <motion.div key="empty-no-data" className="w-full h-full">
                                <EmptyState
                                    type="no-data"
                                    onAddFirst={handleAddFirstProduct}
                                    onClearFilters={handleClearFilters}
                                />
                            </motion.div>
                        ) : paginated.length === 0 ? (
                            <motion.div key="empty-results" className="w-full h-full">
                                <EmptyState
                                    type={isFiltered ? "no-results" : "empty-tab"}
                                    onAddFirst={handleAddFirstProduct}
                                    onClearFilters={handleClearFilters}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={activeTab + effectiveViewMode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-full"
                            >
                                {isMobile ? (
                                    <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                                        {paginated.map((product) => (
                                            <ProductMobileItem
                                                key={product.id}
                                                product={product}
                                                onClick={handleDetailsProduct}
                                                isSelected={selection.ids.has(product.id)}
                                                onSelect={handleSelectRow}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    effectiveViewMode === "grid" ? (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                            {paginated.map((p) => (
                                                <ProductGridCard
                                                    key={p.id}
                                                    product={p}
                                                    selected={selection.ids.has(p.id)}
                                                    onSelect={() => handleSelectRow(p.id)}
                                                    onDetails={() => handleDetailsProduct(p)}
                                                    onEdit={() => handleEditProduct(p)}
                                                    onDelete={() => handleDeleteProduct(p)}
                                                    onDuplicate={() => handleDuplicateProduct(p)}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="w-full overflow-hidden rounded-xl relative">
                                            <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                            <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                            <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                    <thead>
                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                            <th className="py-3 pl-6 pr-0 w-14 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                <Checkbox
                                                                    checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                    onChange={(checked) =>
                                                                        setSelection((p) => ({
                                                                            ...p,
                                                                            ids: checked ? new Set(paginated.map((x) => x.id)) : new Set(),
                                                                        }))
                                                                    }
                                                                    className="bg-white dark:bg-dark-background"
                                                                />
                                                            </th>
                                                            {FIXED_COLUMNS.map((col, idx) => {
                                                                const isSortable = col.id !== "actions";
                                                                const isSorted = ui.sort?.key === col.id;
                                                                const isLast = idx === FIXED_COLUMNS.length - 1;

                                                                return (
                                                                    <th
                                                                        key={col.id}
                                                                        className={`py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                        style={{ width: col.width, minWidth: col.minWidth }}
                                                                        onClick={() => {
                                                                            if (!isSortable) return;
                                                                            setUi((p) => ({
                                                                                ...p,
                                                                                sort: p.sort?.key === col.id && p.sort.direction === "asc"
                                                                                    ? { key: col.id, direction: "desc" }
                                                                                    : { key: col.id, direction: "asc" },
                                                                            }));
                                                                        }}
                                                                    >
                                                                        <div className={`flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                                                                            {col.label}
                                                                            {isSortable && (
                                                                                <ArrowUpDownIcon
                                                                                    size={14}
                                                                                    className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100' : 'text-brand-inactive-text opacity-0 group-hover:opacity-40'
                                                                                        } ${isSorted && ui.sort?.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </th>
                                                                );
                                                            })}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paginated.map((product) => (
                                                            <ProductListItem
                                                                key={product.id}
                                                                product={product}
                                                                columns={FIXED_COLUMNS}
                                                                suppliers={suppliers}
                                                                selected={selection.ids.has(product.id)}
                                                                onSelect={handleSelectRow}
                                                                onEdit={handleEditProduct}
                                                                onDuplicate={handleDuplicateProduct}
                                                                onDelete={handleDeleteProduct}
                                                                onDetails={handleDetailsProduct}
                                                            />
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {hasProducts && paginated.length > 0 && (
                    <Pagination
                        currentPage={data.page}
                        totalPages={totalPages}
                        onPageChange={(p) => setData(prev => ({ ...prev, page: p }))}
                    />
                )}

            </div>

            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection((p) => ({ ...p, ids: new Set() }))}
            >
                <Button
                    variant="ghost"
                    onClick={() => setBulkEditModal({ isOpen: true })}
                    leftIcon={<EditIcon className="w-4 h-4" />}
                    className="h-10 px-3"
                >
                    Ações em massa
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkInactive: true }))}
                    leftIcon={
                        selectedProds.every((p) => !p.is_active)
                            ? <CheckCircleIcon className="w-4 h-4" />
                            : <BlockedIcon className="w-4 h-4" />
                    }
                    className="h-10 px-3"
                >
                    {selectedProds.every((p) => !p.is_active) ? "Ativar" : "Desativar"}
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkDelete: true }))}
                    leftIcon={<TrashIcon className="w-4 h-4" />}
                    className="h-10 px-3 text-brand-red hover:text-brand-red/90 dark:text-brand-red hover:text-brand-red/90"
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
                title="Excluir Seleção"
                message={`Tem certeza que deseja excluir ${selection.ids.size} produtos?`}
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
                message="Confirmar alteração de status em massa?"
                confirmText="Confirmar"
            />
            <ImportXmlModal
                isOpen={modals.import}
                onClose={() => setModals((p) => ({ ...p, import: false }))}
                partnerId={partnerId}
                storeId={selectedStore?.id || ""}
                onImportSuccess={() => { }}
            />
            <DefaultModal
                isOpen={modals.export}
                onClose={() => setModals((p) => ({ ...p, export: false }))}
                title="Exportar"
                footer={<Button onClick={() => setModals((p) => ({ ...p, export: false }))}> Fechar</Button>}
            >
                <div className="p-8 text-center text-gray-500">Funcionalidade de exportação em breve.</div>
            </DefaultModal>

            {/* Modal de ação (salvar/excluir) */}
            <DefaultModal
                isOpen={actionModal.open}
                onClose={() => { }}
                title=""
                hideHeader
            >
                <div className="flex flex-col items-center justify-center p-6 gap-6 h-full mt-4">
                    <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="w-36 h-36 object-contain" />
                    <p className="text-lg font-semibold text-brand-dark dark:text-dark-heading text-center leading-tight">{actionModal.text}</p>
                </div>
            </DefaultModal>
        </motion.div>
    )
}
