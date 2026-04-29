"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { getERPServicesPageAction, type ERPServiceListCursor } from "@/app/actions/erp/services"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

// Actions
import {
    createServiceAction,
    updateServiceAction,
    deleteServiceAction,
    deleteServicesInBatchAction,
    toggleServicesStatusAction,
    getServiceWithDetailsAction,
    batchUpdateServicesAction,
    duplicateServiceAction
} from "@/app/actions/erp/services"

// Components
import { Button, IconPlaceholder, Checkbox } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"

// New Component Imports
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import ServiceGridCard from "./ServiceGridCard"
import ServiceListItem from "./ServiceListRow"
import ServiceMobileItem from "./ServiceMobileItem"
import ServicePageControls from "./ServicePageControls"
import { AddServicePage } from "./AddServicePage"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    Settings2Icon,
    UploadIcon,
    ArrowUpDownIcon,
    TrashIcon,
    CheckCircleIcon,
    BlockedIcon
} from "@/lib/icons"

// --- TYPES & INTERFACES ---

type ColumnId =
    | "name"
    | "category"
    | "duration"
    | "price"
    | "status"
    | "actions"

interface ColumnDef {
    id: ColumnId
    label: string
    align?: "left" | "center" | "right"
    width: string
    minWidth?: string
}

interface FilterState {
    categories: string[]
    status: string[]
    priceRange: { min: string; max: string }
    [key: string]: any
}

const INITIAL_FILTERS: FilterState = {
    categories: [],
    status: [],
    priceRange: { min: "", max: "" },
}

// --- CONFIGURAÇÃO DE COLUNAS ---
const FIXED_COLUMNS: ColumnDef[] = [
    { id: "name", label: "Serviço", align: "left", width: "280px", minWidth: "280px" },
    { id: "category", label: "Categoria", align: "left", width: "130px", minWidth: "120px" },
    { id: "duration", label: "Duração", align: "left", width: "110px", minWidth: "100px" },
    { id: "price", label: "Preço", align: "left", width: "110px", minWidth: "100px" },
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
        title = "Você ainda não tem serviços"
        description = "Comece adicionando serviços ao seu catálogo para gerenciar seus agendamentos."
        imageAlt = "Sem serviços"
    } else if (type === "no-results") {
        title = "Nenhum serviço encontrado"
        description = "Tente ajustar seus filtros ou termos de busca para encontrar o que procura."
        imageAlt = "Nenhum serviço encontrado"
    } else {
        title = "Nenhum serviço nesta seção"
        description = "Não há serviços com este status no momento."
        imageAlt = "Nenhum serviço nesta seção"
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
                    text: "Adicionar Primeiro Serviço",
                    action: onAddFirst,
                } : type === "no-results" ? {
                    text: "Limpar Filtros",
                    action: onClearFilters,
                    variant: "outline"
                } : undefined}
            />
        </FadeIn>
                )})
EmptyState.displayName = "EmptyState"

// --- MAIN COMPONENT ---

export default function ServicesPage({
    services: initialServices,
    initialNextCursor,
    initialHasMore,
    partnerId,
}: { services: any[]; initialNextCursor: ERPServiceListCursor | null; initialHasMore: boolean; partnerId: string; }) {
    const router = useRouter()
    const { toast } = useToast()
    const { selectedStore } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")

    const queryClient = useQueryClient()
    const servicesQueryKey = useMemo(() => ['erp', 'services', partnerId] as const, [partnerId])

    const observerTarget = useRef<HTMLDivElement>(null)
    const {
        items: effectiveBaseServices,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteList<any, ERPServiceListCursor>({
        queryKey: servicesQueryKey,
        initialPage: { items: initialServices, nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getERPServicesPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar serviços.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((s: any) => String(s?.id || ""), []),
    })

    // State
    const [data, setData] = useState<{ services: any[], search: string, debouncedSearch: string, page: number }>({ services: effectiveBaseServices, search: "", debouncedSearch: "", page: 1 })

    const prevServicesRef = useRef(effectiveBaseServices)
    useEffect(() => {
        if (prevServicesRef.current !== effectiveBaseServices) {
            setData(prev => ({ ...prev, services: effectiveBaseServices }))
            prevServicesRef.current = effectiveBaseServices
        }
    }, [effectiveBaseServices])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const [selection, setSelection] = useState({ ids: new Set<string>(), service: null as any, delete: null as any, duplicate: null as any, loadingDetails: false })
    const [actionModal, setActionModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all")
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [ui, setUi] = useState<{ formMode: "edit" | "duplicate" | "details" | "add" | null; pageState: string; isSaving?: boolean }>({ formMode: null, pageState: "list" })
    const [confirmations, setConfirmations] = useState({
        delete: false,
        inactivate: false,
        bulkDelete: false,
        bulkInactive: false
    })

    const effectiveViewMode = viewMode
    const itemsPerPage = 8

    const containerRef = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)

    const hasServices = data.services.length > 0
    const hasActiveFilters =
        filters.categories.length > 0 ||
        filters.status.length > 0 ||
        !!filters.priceRange.min ||
        !!filters.priceRange.max

    const isFiltered = data.search.length > 0 || hasActiveFilters

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
    }, [checkScroll, effectiveViewMode, data.services])

    useEffect(() => {
        const t = setTimeout(() => setData((p) => ({ ...p, debouncedSearch: p.search })), 300)
        return () => clearTimeout(t)
    }, [data.search])

    const filteredServices = useMemo(() => {
        return data.services.filter((s) => {
            const term = data.debouncedSearch.toLowerCase()
            const minPrice = filters.priceRange.min ? Number.parseFloat(filters.priceRange.min) : 0
            const maxPrice = filters.priceRange.max ? Number.parseFloat(filters.priceRange.max) : Number.POSITIVE_INFINITY

            let tabMatch = true
            if (activeTab === "active") tabMatch = s.is_active === true
            else if (activeTab === "inactive") tabMatch = s.is_active === false

            const statusLabel = s.is_active ? "Ativo" : "Inativo"
            const statusMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

            return (
                tabMatch &&
                statusMatch &&
                (s.name.toLowerCase().includes(term) || s.sku?.toLowerCase().includes(term)) &&
                (filters.categories.length === 0 || filters.categories.includes((s.service_categories?.name || "") as any)) &&
                s.price >= minPrice &&
                s.price <= maxPrice
            )
        })
    }, [data.services, data.debouncedSearch, filters, activeTab])

    const sortedServices = useMemo(() => {
        if (!sortConfig) return filteredServices
        return [...filteredServices].sort((a, b) => {
            let valA: any
            let valB: any

            switch (sortConfig.key) {
                case "category":
                    valA = a.service_categories?.name || ""
                    valB = b.service_categories?.name || ""
                    break
                case "duration":
                    valA = a.duration_minutes ?? 0
                    valB = b.duration_minutes ?? 0
                    break
                case "price":
                    valA = a.price ?? 0
                    valB = b.price ?? 0
                    break
                case "status":
                    valA = a.is_active ? 1 : 0
                    valB = b.is_active ? 1 : 0
                    break
                default:
                    valA = a[sortConfig.key]
                    valB = b[sortConfig.key]
                    break
            }

            if (typeof valA === "string") valA = valA.toLowerCase()
            if (typeof valB === "string") valB = valB.toLowerCase()
            if (valA === valB) return 0
            const comparison = valA < valB ? -1 : 1
            return sortConfig.direction === "asc" ? comparison : -comparison
        })
    }, [filteredServices, sortConfig])

    const paginated = useMemo(() =>
        sortedServices.slice((data.page - 1) * itemsPerPage, data.page * itemsPerPage),
        [sortedServices, data.page, itemsPerPage])

    // --- Handlers ---

    const handleSelectRow = useCallback((id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ...p, ids: s }
        })
    }, [])

    const openServiceForm = useCallback(async (service: any, mode: "edit" | "details" | "duplicate" | "add") => {
        setSelection((s) => ({ ...s, service, loadingDetails: true }))
        setUi((u) => ({ ...u, formMode: mode as any, pageState: "form" }))

        if (service && mode !== "add") {
            const res = await getServiceWithDetailsAction(service.id)
            if (res.success && (res as any).product) {
                setSelection((s) => ({ ...s, service: (res as any).product, loadingDetails: false }))
            } else {
                toast({ title: "Erro", description: (res as any).error || "Erro ao carregar detalhes", variant: "destructive" })
                setSelection((s) => ({ ...s, loadingDetails: false }))
            }
        }
    }, [toast])

    const handleEditService = useCallback((service: any) => {
        openServiceForm(service, "edit")
    }, [openServiceForm])

    const handleDetailsService = useCallback((service: any) => {
        openServiceForm(service, "details")
    }, [openServiceForm])

    const handleDeleteService = useCallback((service: any) => {
        setSelection((s) => ({ ...s, delete: service }))
        setConfirmations((c) => ({ ...c, delete: true }))
    }, [])

    const handleDuplicateService = useCallback(async (service: any) => {
        setActionModal({ open: true, text: "Duplicando serviço..." })
        const res = await duplicateServiceAction(service.id)
        if (res.success) {
            toast({ title: "Serviço duplicado com sucesso" })
            queryClient.invalidateQueries({ queryKey: servicesQueryKey })
        } else {
            toast({ title: "Erro", description: (res as any).error || "Erro ao duplicar", variant: "destructive" })
        }
        setActionModal({ open: false, text: "" })
    }, [queryClient, servicesQueryKey, toast])

    const confirmDelete = async () => {
        if (selection.delete) {
            const deleteId = selection.delete.id
            setActionModal({ open: true, text: "Excluindo serviço..." })
            const result = await deleteServiceAction(deleteId)
            setActionModal({ open: false, text: "" })
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: servicesQueryKey })
                setData((p) => ({ ...p, services: p.services.filter((prod) => prod.id !== deleteId) }))
                toast({ title: "Excluído" })
            } else {
                toast({
                    title: "Erro",
                    description: result.error || "Erro ao excluir serviço",
                    variant: "destructive",
                })
            }
            setConfirmations((p) => ({ ...p, delete: false }))
        }
    }

    const confirmBulk = async (action: "delete" | "inactive") => {
        const ids = Array.from(selection.ids)
        if (action === "delete") {
            setActionModal({ open: true, text: "Excluir serviços..." })
            const result = await deleteServicesInBatchAction(ids)
            setActionModal({ open: false, text: "" })
            if ((result as any).error) {
                toast({
                    title: "Erro",
                    description: (result as any).error,
                    variant: "destructive",
                })
            } else {
                queryClient.invalidateQueries({ queryKey: servicesQueryKey })
                const idSet = new Set(ids)
                setData((p) => ({ ...p, services: p.services.filter((prod) => !idSet.has(prod.id)) }))
                toast({ title: "Excluídos" })
            }
            setConfirmations((p) => ({ ...p, bulkDelete: false }))
        } else {
            setActionModal({ open: true, text: "Atualizando status..." })
            const allInactive = data.services.filter((p) => selection.ids.has(p.id)).every((p) => !p.is_active)
            await toggleServicesStatusAction(ids, allInactive)
            queryClient.invalidateQueries({ queryKey: servicesQueryKey })
            setActionModal({ open: false, text: "" })
            const idSet = new Set(ids)
            setData((p) => ({
                ...p,
                services: p.services.map((prod) =>
                    idSet.has(prod.id) ? { ...prod, is_active: allInactive } : prod
                ),
            }))
            setConfirmations((p) => ({ ...p, bulkInactive: false }))
            toast({ title: "Atualizado" })
        }
        setSelection((p) => ({ ...p, ids: new Set() }))
    }

    const handleAddFirstService = useCallback(() => {
        setSelection(s => ({ ...s, service: null, loadingDetails: false }))
        setUi(u => ({ ...u, formMode: "add", pageState: "form" }))
    }, [])

    const handleClearFilters = useCallback(() => {
        setData(p => ({ ...p, search: "", debouncedSearch: "" }))
        setFilters(INITIAL_FILTERS)
    }, [])

    const selectedProds = useMemo(() =>
        data.services.filter((p) => selection.ids.has(p.id)),
        [data.services, selection.ids])

    return (
        <>
            <AnimatePresence mode="wait">
                {ui.pageState === "form" ? (
                    <AddServicePage
                        key="form"
                        mode={ui.formMode as any}
                        setMode={(m) => setUi((u) => ({ ...u, formMode: m }))}
                        service={selection.service}
                        onBack={() => setUi((u) => ({ ...u, pageState: "list", formMode: null }))}
                        partnerId={partnerId}
                        storeId={selectedStore?.id}
                        isLoadingDetails={selection.loadingDetails}
                        onClose={() => {
                            setUi((u) => ({ ...u, pageState: "list", formMode: null }))
                            queryClient.invalidateQueries({ queryKey: servicesQueryKey })
                            // To correctly re-fetch we would reset the list state. For now just invalidating.
                        }}
                    />
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
                                            Catálogo de Serviços
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie seus serviços, preços e durações.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={handleAddFirstService}
                                        className="w-full"
                                    >
                                        <PlusIcon size={16} />
                                        Novo Serviço
                                    </Button>
                                </div>
                            </div>

                            {hasServices && (
                                <ServicePageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={data.search}
                                    onSearchChange={(val) => setData((p) => ({ ...p, search: val }))}
                                    onOpenFilter={() => { }}
                                    onOpenImport={() => { }}
                                    onOpenExport={() => { }}
                                    onAddService={handleAddFirstService}
                                    filters={filters}
                                    setFilters={setFilters}
                                    viewMode={viewMode}
                                    onViewModeChange={(mode) => setViewModeState(mode)}
                                    hasActiveFilters={hasActiveFilters}
                                />
                            )}

                            <div ref={containerRef} className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {!hasServices ? (
                                        <FadeIn key="empty-no-data" className="w-full h-full">
                                            <EmptyState
                                                type="no-data"
                                                onAddFirst={handleAddFirstService}
                                                onClearFilters={handleClearFilters}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full">
                                            <EmptyState
                                                type={isFiltered ? "no-results" : "empty-tab"}
                                                onAddFirst={handleAddFirstService}
                                                onClearFilters={handleClearFilters}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <AnimatePresence mode="wait">
                                            <FadeIn key={effectiveViewMode} className="w-full">
                                                {effectiveViewMode === "grid" ? (
                                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginated.map((service) => (
                                                            <ServiceGridCard
                                                                key={service.id}
                                                                service={service}
                                                                selected={selection.ids.has(service.id)}
                                                                onSelect={() => handleSelectRow(service.id)}
                                                                onEdit={() => handleEditService(service)}
                                                                onDuplicate={() => handleDuplicateService(service)}
                                                                onDelete={() => handleDeleteService(service)}
                                                                onDetails={() => handleDetailsService(service)}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : isTabletOrMobile ? (
                                                    <div className="w-full">
                                                        {paginated.map((service) => (
                                                            <ServiceMobileItem
                                                                key={service.id}
                                                                service={service}
                                                                onClick={handleDetailsService}
                                                                isSelected={selection.ids.has(service.id)}
                                                                onSelect={handleSelectRow}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 pl-6 pr-3 w-[48px] bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
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
                                                                            />
                                                                        </th>
                                                                        {FIXED_COLUMNS.map((col) => {
                                                                            const isSorted = sortConfig?.key === col.id
                                                                            return (
                                                                                <th
                                                                                    key={col.id}
                                                                                    className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""}`}
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
                                                                    {paginated.map((service) => (
                                                                        <ServiceListItem
                                                                            key={service.id}
                                                                            service={service}
                                                                            columns={FIXED_COLUMNS}
                                                                            selected={selection.ids.has(service.id)}
                                                                            onSelect={handleSelectRow}
                                                                            onEdit={handleEditService}
                                                                            onDuplicate={handleDuplicateService}
                                                                            onDelete={handleDeleteService}
                                                                            onDetails={handleDetailsService}
                                                                        />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </FadeIn>

                                            {hasNextPage && (
                                                <div ref={observerTarget} className="h-20 w-full flex items-center justify-center">
                                                    {isFetchingNextPage && (
                                                        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                                                    )}
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            {selection.ids.size > 0 && ui.pageState === "list" && (
                <FloatingActionBar
                    selectedCount={selection.ids.size}
                    onClearSelection={() => setSelection((p) => ({ ...p, ids: new Set() }))}
                >
                    <Button
                        variant="ghost"
                        className="h-9 px-3 gap-2 font-bold text-brand-red"
                        onClick={() => setConfirmations(prev => ({ ...prev, bulkDelete: true }))}
                    >
                        <TrashIcon className="w-4 h-4" />
                        Excluir
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmations(p => ({ ...p, bulkInactive: true }))}>
                        {selectedProds.every(p => !p.is_active) ? <CheckCircleIcon size={16} /> : <BlockedIcon size={16} />}
                        {selectedProds.every(p => !p.is_active) ? "Ativar Todos" : "Inativar Todos"}
                    </Button>
                </FloatingActionBar>
            )}

            <AlertModal
                isOpen={confirmations.delete}
                onClose={() => setConfirmations(p => ({ ...p, delete: false }))}
                onConfirm={confirmDelete}
                title="Excluir Serviço"
                description={`Tem certeza que deseja excluir o serviço "${selection.delete?.name}"? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                variant="danger"
            />

            <AlertModal
                isOpen={confirmations.bulkDelete}
                onClose={() => setConfirmations(p => ({ ...p, bulkDelete: false }))}
                onConfirm={() => confirmBulk("delete")}
                title="Excluir Serviços"
                description={`Tem certeza que deseja excluir ${selection.ids.size} serviços? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                variant="danger"
            />

            <AlertModal
                isOpen={confirmations.bulkInactive}
                onClose={() => setConfirmations(p => ({ ...p, bulkInactive: false }))}
                onConfirm={() => confirmBulk("inactive")}
                title="Atualizar Status"
                description={`Tem certeza que deseja alterar o status de ${selection.ids.size} serviços?`}
                confirmText="Confirmar"
                cancelText="Cancelar"
            />

            {actionModal.open && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-brand-dark dark:text-dark-heading font-medium">{actionModal.text}</p>
                    </div>
                </div>
            )}
        </>
    )
}
