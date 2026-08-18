"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { getERPSuppliersPageAction, getSupplierByIdAction, type ERPSupplierListCursor } from "@/app/actions/erp/suppliers"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { usePermissions } from "@/lib/permission-context"

import { Button, IconPlaceholder, ThreeDotsLoader, Checkbox, Badge, AlertModal, SavingStatusModal, SelectionBanner } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import SupplierListRow from "./SupplierListRow"
import SupplierGridCard from "./SupplierGridCard"
import SupplierPageControls from "./SupplierPageControls"
import SupplierDetailPage from "./SupplierDetailPage"
import NewSupplierPage from "./NewSupplierPage"
import { deleteSuppliersInBatchAction, toggleSuppliersStatusAction } from "@/app/actions/erp/suppliers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatCurrency, formatDate } from "@/lib/utils"

import {
    PlusIcon,
    Users,
    ArrowUpDownIcon,
    TrashIcon,
    BlockedIcon,
    CheckCircleIcon,
    FileTextIcon,
    ExportFileIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useErpExport } from "@/hooks/use-erp-export"
import { useStore } from "@/lib/store-context"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"

interface Supplier {
    id: string
    originalId: string
    name: string
    email: string
    phone: string
    document: string
    xml_count: number
    total_imported_value: number
    status: string
    supplier_code: string
    created_at: string
    image_url: string | null
}

interface FilterState {
    status: string[]
}

const INITIAL_FILTERS: FilterState = { status: [] }

type SortKey = "name" | "imports" | "total" | "status" | "code"
type SortDirection = "asc" | "desc"

const COLUMNS = [
    { id: "name", label: "Fornecedor", align: "left" as const, width: "300px" },
    { id: "contacts", label: "Contato", align: "left" as const, width: "220px" },
    { id: "imports", label: "XMLs", align: "center" as const, width: "80px" },
    { id: "total", label: "Total NF-e", align: "right" as const, width: "150px" },
    { id: "code", label: "Código", align: "center" as const, width: "120px" },
    { id: "status", label: "Status", align: "center" as const, width: "120px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

export default function SuppliersPage({
    partnerId,
    initialSuppliers = [],
    initialNextCursor,
    initialHasMore,
    planGate,
}: {
    partnerId: string
    initialSuppliers?: any[]
    initialNextCursor: ERPSupplierListCursor | null
    initialHasMore: boolean
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}) {
    const { toast } = useToast()
    const { openPlanUpgrade } = usePlanUpgrade()
    const { planSlug } = usePermissions()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const queryKey = useMemo(() => ["erp", "suppliers", partnerId] as const, [partnerId])

    const entityPage = useEntityPage<any, any, ERPSupplierListCursor>({
        entityType: "suppliers",
        partnerId,
        queryKey,
        initialItems: initialSuppliers,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPSuppliersPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar fornecedores.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getSupplierByIdAction(id)
            return res.supplier || null
        },
        listToDetail: (item: any) => item,
    })

    const {
        items: rawSuppliers, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading: isQueryLoading,
        entityState, closeEntity, isViewing, isCreating: isCreatingEntity, isEditing: isEditingEntity,
        currentEntity, isLoadingDetail,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation,
    } = entityPage

    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [closeEntity])

    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [confirmations, setConfirmations] = useState({ bulkDelete: false, bulkInactive: false })
    const [isProcessingBulk, setIsProcessingBulk] = useState(false)
    const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
    const [isDeletingSupplier, setIsDeletingSupplier] = useState(false)

    const observerTarget = useRef<HTMLDivElement>(null)

    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)
    const isLoading = isQueryLoading
    const itemsPerPage = 8

    const rafRef = useRef<number>(0)
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

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

    const handleScroll = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(checkScroll)
    }, [checkScroll])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => {
            window.removeEventListener("resize", checkScroll)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [checkScroll])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        // Only show status filter if there are suppliers with different statuses
        const statusLabels = [...new Set((rawSuppliers || []).map((s: any) => s.status === "ativo" ? "Ativo" : "Inativo"))]

        const sections: FilterSectionConfig[] = []

        if (statusLabels.length > 1) {
            sections.push({ id: "status", title: "Status", type: "checkbox-list", options: statusLabels })
        }

        return sections
    }, [rawSuppliers])

    const filteredSuppliers: Supplier[] = useMemo(() => {
        if (!rawSuppliers) return []

        const term = debouncedSearch.toLowerCase()

        const filtered = rawSuppliers
            .filter((s: any) => {
                const nameMatch = (s.name || "").toLowerCase().includes(term)
                const emailMatch = (s.email || "").toLowerCase().includes(term)
                const phoneMatch = (s.phone || "").includes(debouncedSearch)
                const docMatch = (s.cnpj || s.cpf || "").includes(debouncedSearch)
                return nameMatch || emailMatch || phoneMatch || docMatch
            })
            .filter((s: any) => {
                const statusLabel = s.status === "ativo" ? "Ativo" : "Inativo"

                let tabMatch = true
                if (activeTab === "Ativo") tabMatch = statusLabel === "Ativo"
                else if (activeTab === "Inativo") tabMatch = statusLabel === "Inativo"

                const filterMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

                return tabMatch && filterMatch
            })
            .map((s: any): Supplier => ({
                id: s.id ? `#${s.id.substring(0, 5).toUpperCase()}` : "-",
                originalId: s.id,
                name: s.name || "Fornecedor Sem Nome",
                email: s.email || "",
                phone: s.phone || "",
                document: s.cnpj || s.cpf || "",
                xml_count: s.xml_count || 0,
                total_imported_value: s.total_imported_value || 0,
                status: s.status || "ativo",
                supplier_code: s.supplier_code || "",
                created_at: s.created_at,
                image_url: s.image_url || s.imageUrl || s.avatar_url || null,
            }))

        const result = [...filtered]

        if (sortConfig) {
            const { key, direction } = sortConfig
            result.sort((a, b) => {
                let aVal: any, bVal: any
                switch (key) {
                    case "name": aVal = a.name; bVal = b.name; break
                    case "imports": aVal = a.xml_count; bVal = b.xml_count; break
                    case "total": aVal = a.total_imported_value; bVal = b.total_imported_value; break
                    case "status": aVal = a.status; bVal = b.status; break
                    case "code": aVal = a.supplier_code; bVal = b.supplier_code; break
                    default: aVal = (a as any)[key]; bVal = (b as any)[key]
                }
                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return direction === "asc" ? comparison : -comparison
            })
        }

        return result
    }, [rawSuppliers, debouncedSearch, activeTab, filters, sortConfig])

    const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage)
    const paginated = filteredSuppliers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const selectedSupplier = useMemo(() => {
        if (!entityState.entityId) return null
        if (currentEntity) return currentEntity
        return rawSuppliers?.find(s => s.id === entityState.entityId || (s as any).originalId === entityState.entityId) || null
    }, [entityState.entityId, currentEntity, rawSuppliers])

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filteredSuppliers.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filteredSuppliers.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredSuppliers.length])

    const hasActiveFilters = filters.status.length > 0 || debouncedSearch.length > 0
    const hasSuppliers = (rawSuppliers?.length || 0) > 0

    const tabCounts = useMemo(() => {
        if (!rawSuppliers) return { Todos: 0, Ativo: 0, Inativo: 0 }
        let Todos = rawSuppliers.length, Ativo = 0, Inativo = 0
        for (const s of rawSuppliers) {
            if ((s as any).status === "ativo") Ativo++
            else Inativo++
        }
        return { Todos, Ativo, Inativo }
    }, [rawSuppliers])

    const handleAddSupplier = () => entityPage.openEntity("create")
    const handleEditSupplier = (supplier: any) => entityPage.openEntity("edit", supplier.originalId || supplier.id)
    const handleDetailsSupplier = (supplier: any) => entityPage.openEntity("view", supplier.originalId || supplier.id)
    const handleDeleteSupplier = (supplier: any) => setSupplierToDelete(supplier)
    const handleSelectRow = (id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const { selectedStore } = useStore()

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "suppliers",
            format: "xlsx",
            filters: { storeId: selectedStore?.id || null, search: debouncedSearch, activeTab, status: filters.status },
        }, { selectedIds: selection.ids, totalCount: filteredSuppliers.length })
    }, [exportData, partnerId, selectedStore?.id, debouncedSearch, activeTab, filters.status, selection.ids, filteredSuppliers.length])

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    const confirmDeleteSupplier = async () => {
        if (!supplierToDelete) return
        setIsDeletingSupplier(true)
        const idToDelete = supplierToDelete.originalId || supplierToDelete.id
        const result = await deleteSuppliersInBatchAction([idToDelete])
        if (result.success) {
            afterMutation()
            cache.removeItemFromListCache(idToDelete)
            toast({ title: "Excluído com sucesso" })
            setSelection((p) => {
                const nextIds = new Set(p.ids)
                nextIds.delete(idToDelete)
                return { ...p, ids: nextIds }
            })
            if (entityState.entityId === idToDelete) closeEntity()
            setSupplierToDelete(null)
        } else {
            toast({ title: "Erro", description: result.error, variant: "destructive" })
        }
        setIsDeletingSupplier(false)
    }

    const confirmBulk = async (action: "delete" | "inactive") => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        setIsProcessingBulk(true)
        if (action === "delete") {
            const result = await deleteSuppliersInBatchAction(ids)
            if (result.success) {
                afterMutation()
                ids.forEach(id => cache.removeItemFromListCache(id))
                toast({ title: "Excluído com sucesso" })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
            setConfirmations(p => ({ ...p, bulkDelete: false }))
        } else {
            const allInactive = (rawSuppliers || []).filter((s: any) => selection.ids.has(s.id)).every((s: any) => s.status === "inativo")
            const result = await toggleSuppliersStatusAction(ids, allInactive)
            if (result.success) {
                afterMutation()
                toast({ title: "Status atualizado" })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
            setConfirmations(p => ({ ...p, bulkInactive: false }))
        }
        setIsProcessingBulk(false)
        setSelection(p => ({ ...p, ids: new Set() }))
    }

    if (planGate) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Fornecedores.png"
                        imageAlt="Recurso bloqueado"
                        title="Fornecedores"
                        subtitle="Gerencie seus fornecedores e relacione produtos. Disponível nos planos Crescer e Escalar."
                        itemButton={{
                            text: "Fazer upgrade",
                            action: () => openPlanUpgrade(planGate.requiredPlanSlug)
                        }}
                    />
                </div>
            </FadeIn>
        )
    }

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && isViewing ? (
                    <FadeIn key="details" className="w-full h-full">
                        <SupplierDetailPage
                            supplier={selectedSupplier}
                            onBack={() => closeEntity()}
                            onEdit={handleEditSupplier}
                        />
                    </FadeIn>
                ) : (isCreatingEntity || isEditingEntity) ? (
                    <FadeIn key="form" className="w-full h-full">
                        <NewSupplierPage
                            partnerId={partnerId}
                            supplierId={entityState.entityId || undefined}
                            onBack={() => closeEntity()}
                            onSuccess={(msg) => {
                                toast({ title: "Sucesso", description: msg })
                                afterMutation()
                                closeEntity()
                            }}
                            onError={(msg) => toast({ title: "Erro", description: msg, variant: "destructive" })}
                        />
                    </FadeIn>
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
                                            Fornecedores
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie seus fornecedores e importações de XML.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                                        {isExporting ? "Exportando..." : "Exportar"}
                                    </Button>
                                    <Button onClick={handleAddSupplier} leftIcon={<PlusIcon size={18} />}>
                                        Novo fornecedor
                                    </Button>
                                </div>
                            </div>

                            {hasSuppliers && (
                                <SupplierPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals({ filter: true })}
                                    onAddSupplier={handleAddSupplier}
                                    filters={filters}
                                    setFilters={setFilters as any}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewModeState}
                                    hasActiveFilters={hasActiveFilters}
                                    tabCounts={tabCounts}
                                />
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isLoading ? (
                                        <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                            <ThreeDotsLoader />
                                        </FadeIn>
                                    ) : !hasSuppliers ? (
                                        <FadeIn key="empty-no-data" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/MovimentacaoEstoque.png"
                                                imageAlt="Sem fornecedores"
                                                title="Você ainda não tem fornecedores"
                                                subtitle="Cadastre seus fornecedores ou importe XMLs de NF-e."
                                                itemButton={{
                                                    text: "Cadastrar Primeiro Fornecedor",
                                                    action: handleAddSupplier,
                                                }}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum fornecedor encontrado"
                                                title="Nenhum fornecedor encontrado"
                                                subtitle="Tente ajustar seus filtros ou termos de busca."
                                                itemButton={{
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline",
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <FadeIn
                                            key={activeTab + effectiveViewMode}
                                            className="w-full"
                                        >
                                            <SelectionBanner
                                                selectedCount={selection.ids.size}
                                                totalCount={filteredSuppliers.length}
                                                onSelectAll={() => setSelection({ ids: new Set(filteredSuppliers.map(s => s.originalId)) })}
                                                onClearSelection={() => setSelection({ ids: new Set() })}
                                                itemName="fornecedores"
                                                singularItemName="fornecedor"
                                            />
                                            {effectiveViewMode === "grid" ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginated.map((s: Supplier) => {
                                                        const prefetch = getPrefetchProps(s.originalId)
                                                        return (
                                                            <SupplierGridCard
                                                                key={s.originalId}
                                                                supplier={s}
                                                                selected={selection.ids.has(s.originalId)}
                                                                onSelect={() => handleSelectRow(s.originalId)}
                                                                onDetails={() => handleDetailsSupplier(s)}
                                                                onEdit={() => handleEditSupplier(s)}
                                                                onDelete={() => handleDeleteSupplier(s)}
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

                                                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={handleScroll}>
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                        <div className="flex items-center">
                                                                            <Checkbox
                                                                                checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                                onChange={(checked) => {
                                                                                    setSelection({ ids: checked ? new Set(paginated.map((x: Supplier) => x.originalId)) : new Set() })
                                                                                }}
                                                                                className="bg-white dark:bg-dark-background"
                                                                            />
                                                                        </div>
                                                                    </th>
                                                                    {COLUMNS.map((col, idx) => {
                                                                        const isSortable = col.id !== "actions"
                                                                        const isSorted = sortConfig?.key === col.id
                                                                        return (
                                                                            <th
                                                                                key={col.id}
                                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""}`}
                                                                                style={{ width: col.width }}
                                                                                onClick={() => {
                                                                                    if (!isSortable) return
                                                                                    setSortConfig(prev => ({
                                                                                        key: col.id as SortKey,
                                                                                        direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                                    }))
                                                                                }}
                                                                            >
                                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                    <span>{col.label}</span>
                                                                                    {isSortable && (
                                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                            <ArrowUpDownIcon
                                                                                                size={14}
                                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig.direction === "desc" ? "rotate-180" : ""}`}
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
                                                                {paginated.map((s: Supplier) => {
                                                                    const prefetch = getPrefetchProps(s.originalId)
                                                                    return (
                                                                        <SupplierListRow
                                                                            key={s.originalId}
                                                                            supplier={s}
                                                                            columns={COLUMNS}
                                                                            selected={selection.ids.has(s.originalId)}
                                                                            onSelect={handleSelectRow}
                                                                            onEdit={handleEditSupplier}
                                                                            onDelete={handleDeleteSupplier}
                                                                            onDetails={handleDetailsSupplier}
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
                                    )}
                                </AnimatePresence>
                                {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                            </div>

                            {hasSuppliers && paginated.length > 0 && (
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

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <AlertModal
                isOpen={confirmations.bulkDelete}
                onClose={() => setConfirmations(p => ({ ...p, bulkDelete: false }))}
                title="Excluir Fornecedores"
                description={`Tem certeza que deseja excluir ${selection.ids.size} fornecedor(es)? Esta ação não pode ser desfeita.`}
                confirmText="Sim, excluir"
                variant="danger"
                onConfirm={() => confirmBulk("delete")}
            />

            <AlertModal
                isOpen={confirmations.bulkInactive}
                onClose={() => setConfirmations(p => ({ ...p, bulkInactive: false }))}
                title="Alterar status"
                description={`Tem certeza que deseja alterar o status de ${selection.ids.size} fornecedor(es)?`}
                confirmText="Confirmar"
                variant="warning"
                onConfirm={() => confirmBulk("inactive")}
            />

            <AlertModal
                isOpen={!!supplierToDelete}
                onClose={() => { if (!isDeletingSupplier) setSupplierToDelete(null) }}
                title="Excluir fornecedor?"
                description={`Tem certeza que deseja excluir ${supplierToDelete?.name || "este fornecedor"}? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                variant="danger"
                onConfirm={confirmDeleteSupplier}
            />

            <SavingStatusModal isOpen={isDeletingSupplier || isProcessingBulk} text={isDeletingSupplier ? "Excluindo fornecedor..." : "Processando..."} />

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />

            <ExportSelectionModal
                isOpen={selectionModal.isOpen}
                selectedCount={selectionModal.selectedCount}
                totalCount={selectionModal.totalCount}
                onExportSelected={handleExportSelected}
                onExportAll={handleExportAll}
                onClose={closeSelectionModal}
            />

            <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={() => setSelection(p => ({ ...p, ids: new Set() }))}>
                <Button
                    variant="ghost"
                    className="h-10 px-3"
                    leftIcon={
                        (rawSuppliers || []).filter((s: any) => selection.ids.has(s.id)).every((s: any) => s.status === "inativo")
                            ? <CheckCircleIcon size={18} />
                            : <BlockedIcon size={18} />
                    }
                    onClick={() => setConfirmations(p => ({ ...p, bulkInactive: true }))}
                >
                    {(rawSuppliers || []).filter((s: any) => selection.ids.has(s.id)).every((s: any) => s.status === "inativo")
                        ? "Ativar" : "Desativar"}
                </Button>
                <Button
                    variant="ghostred"
                    className="h-10 px-3"
                    leftIcon={<TrashIcon size={18} />}
                    onClick={() => setConfirmations(p => ({ ...p, bulkDelete: true }))}
                >
                    Excluir
                </Button>
            </FloatingActionBar>
        </>
    )
}
