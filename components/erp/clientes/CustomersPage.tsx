"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { getERPCustomersPageAction, type ERPCustomerListCursor } from "@/app/actions/erp/customers"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"

// Components
import { Button, IconPlaceholder, ThreeDotsLoader, Checkbox, Badge, AlertModal, SavingStatusModal, SelectionBanner } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import CustomerListItem from "./CustomerListRow"
import CustomerGridCard from "./CustomerGridCard"
import CustomerPageControls from "./CustomerPageControls"
import CustomerDetailPage from "./CustomerDetailPage"
import NewCustomerPage from "./NewCustomerPage"
import { deleteCustomersInBatchAction, toggleCustomersStatusAction } from "@/app/actions/erp/customers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatCurrency, formatDate } from "@/lib/utils"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    Users,
    ArrowUpDownIcon,
    TrashIcon,
    BlockedIcon,
    CheckCircleIcon
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"

// --- TYPES & INTERFACES ---

interface Customer {
    id: string;
    originalId: string;
    name: string;
    avatar: string;
    orders: number;
    totalOrderValue: number;
    avgOrderValue: number;
    status: string;
    lastOrderDate: string;
    rawLastOrderDate: number;
    storeCredit?: number;
    createdAt?: string;
    address?: string;
}

interface FilterState {
    status: string[]
}

const INITIAL_FILTERS: FilterState = {
    status: [],
}

type SortKey = 'name' | 'orders' | 'total_spent' | 'store_credit' | 'status' | 'last_order';
type SortDirection = 'asc' | 'desc';

// --- CONFIGURAÇÃO DE COLUNAS ---
const COLUMNS = [
    { id: "name", label: "Cliente", align: "left" as const, width: "300px" },
    { id: "orders", label: "Pedidos", align: "center" as const, width: "100px" },
    { id: "total_spent", label: "Total Gasto", align: "right" as const, width: "150px" },
    { id: "store_credit", label: "Crédito", align: "right" as const, width: "130px" },
    { id: "last_order", label: "Último Pedido", align: "left" as const, width: "160px" },
    { id: "status", label: "Status", align: "center" as const, width: "120px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

export default function CustomersPage({
    partnerId,
    initialCustomers = [],
    initialNextCursor,
    initialHasMore,
}: {
    partnerId: string
    initialCustomers?: any[]
    initialNextCursor: ERPCustomerListCursor | null
    initialHasMore: boolean
}) {
    const { toast } = useToast()
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")

    const queryKey = useMemo(() => ["erp", "customers", partnerId] as const, [partnerId])

    // ── Entity Page Hook (URL state + cache + infinite list) ──────────
    const entityPage = useEntityPage<any, any, ERPCustomerListCursor>({
        entityType: 'customers',
        partnerId,
        queryKey,
        initialItems: initialCustomers,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPCustomersPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar clientes.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
        getDetailFn: async (_id: string) => null,
        listToDetail: (item: any) => item,
    })

    const {
        items: rawCustomers, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading: isQueryLoading,
        entityState, openEntity, closeEntity, isViewing, isCreating: isCreatingEntity, isEditing: isEditingEntity,
        currentEntity,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation,
    } = entityPage

    // Sidebar reset → close entity view
    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [closeEntity])

    // ── UI State (non-URL) ────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo" | "Bloqueado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [confirmations, setConfirmations] = useState({ bulkDelete: false, bulkInactive: false })
    const [isProcessingBulk, setIsProcessingBulk] = useState(false)
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
    const [isDeletingCustomer, setIsDeletingCustomer] = useState(false)

    const observerTarget = useRef<HTMLDivElement>(null)

    const isLoading = storeLoading || isQueryLoading
    const itemsPerPage = 8

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

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, viewMode, rawCustomers])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo", "Bloqueado"] },
    ]

    const filteredCustomers: Customer[] = useMemo(() => {
        if (!rawCustomers) return []

        const term = debouncedSearch.toLowerCase()

        const filtered = rawCustomers
            .filter((c: any) => {
                const nameMatch = (c.name || "").toLowerCase().includes(term)
                const emailMatch = (c.email || "").toLowerCase().includes(term)
                const phoneMatch = (c.phone || "").includes(debouncedSearch)

                return nameMatch || emailMatch || phoneMatch
            })
            .filter((c: any) => {
                const statusLabel = c.status === 'bloqueado' ? "Bloqueado" : (c.status === 'inativo' ? "Inativo" : "Ativo")

                let tabMatch = true
                if (activeTab === "Ativo") tabMatch = statusLabel === "Ativo"
                else if (activeTab === "Inativo") tabMatch = statusLabel === "Inativo"
                else if (activeTab === "Bloqueado") tabMatch = statusLabel === "Bloqueado"

                const filterMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

                return tabMatch && filterMatch
            })
            .map((c: any): Customer => ({
                id: c.id ? `#${c.id.substring(0, 5).toUpperCase()}` : '-',
                originalId: c.id,
                name: c.name || 'Cliente Sem Nome',
                avatar: c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'C')}&background=random`,
                orders: c.orders_count || 0,
                totalOrderValue: c.total_spent || 0.00,
                avgOrderValue: 0.00,
                status: c.status || 'ativo',
                lastOrderDate: c.last_order_at ? formatDate(c.last_order_at) : '-',
                rawLastOrderDate: c.last_order_at ? new Date(c.last_order_at).getTime() : 0,
                storeCredit: c.store_credit || 0,
                createdAt: c.created_at,
                address: c.address
            }))

        const result = [...filtered]

        if (sortConfig) {
            const { key, direction } = sortConfig;
            result.sort((a, b) => {
                let aVal: any;
                let bVal: any;

                switch (key) {
                    case 'name':
                        aVal = a.name;
                        bVal = b.name;
                        break;
                    case 'orders':
                        aVal = a.orders;
                        bVal = b.orders;
                        break;
                    case 'total_spent':
                        aVal = a.totalOrderValue;
                        bVal = b.totalOrderValue;
                        break;
                    case 'store_credit':
                        aVal = a.storeCredit;
                        bVal = b.storeCredit;
                        break;
                    case 'status':
                        aVal = a.status;
                        bVal = b.status;
                        break;
                    case 'last_order':
                        aVal = a.rawLastOrderDate;
                        bVal = b.rawLastOrderDate;
                        break;
                    default:
                        aVal = (a as any)[key];
                        bVal = (b as any)[key];
                }

                if (aVal === bVal) return 0;
                const comparison = aVal < bVal ? -1 : 1;
                return direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [rawCustomers, debouncedSearch, activeTab, filters, sortConfig])

    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage)
    const paginated = filteredCustomers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    // selectedCustomer derived from entityPage.currentEntity or list fallback
    const selectedCustomer = useMemo(() => {
        if (!entityState.entityId) return null
        // currentEntity comes from cache or list-to-detail mapping
        if (currentEntity) return currentEntity
        return filteredCustomers.find(c => c.originalId === entityState.entityId) || null
    }, [entityState.entityId, currentEntity, filteredCustomers])

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const hasActiveFilters = filters.status.length > 0 || debouncedSearch.length > 0
    const hasCustomers = (rawCustomers?.length || 0) > 0

    // Handlers (URL-driven)
    const handleAddCustomer = () => openEntity('create')
    const handleEditCustomer = (customer: any) => openEntity('edit', customer.originalId || customer.id)
    const handleDetailsCustomer = (customer: any) => openEntity('view', customer.originalId || customer.id)
    const handleDeleteCustomer = (customer: any) => setCustomerToDelete(customer)
    const handleSelectRow = (id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    const confirmDeleteCustomer = async () => {
        if (!customerToDelete) return
        setIsDeletingCustomer(true)
        const idToDelete = customerToDelete.originalId || customerToDelete.id
        const result = await deleteCustomersInBatchAction([idToDelete])
        if (result.success) {
            afterMutation()
            toast({ title: "Excluído com sucesso" })
            setSelection((p) => {
                const nextIds = new Set(p.ids)
                nextIds.delete(idToDelete)
                return { ...p, ids: nextIds }
            })
            if (entityState.entityId === idToDelete) {
                closeEntity()
            }
            setCustomerToDelete(null)
        } else {
            toast({ title: "Erro", description: result.error, variant: "destructive" })
        }
        setIsDeletingCustomer(false)
    }

    const confirmBulk = async (action: "delete" | "inactive") => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        setIsProcessingBulk(true)
        if (action === "delete") {
            const result = await deleteCustomersInBatchAction(ids)
            if (result.success) {
                afterMutation()
                toast({ title: "Excluído com sucesso" })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
            setConfirmations(p => ({ ...p, bulkDelete: false }))
        } else {
            const allInactive = (rawCustomers || []).filter((c: any) => selection.ids.has(c.id)).every((c: any) => c.is_active === false)
            const result = await toggleCustomersStatusAction(ids, allInactive)
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

    return (
        <>
            <AnimatePresence mode="wait">
                {(isCreatingEntity || isEditingEntity) ? (
                    <NewCustomerPage
                        key="form"
                        partnerId={partnerId}
                        customerId={entityState.entityId || undefined}
                        onBack={() => closeEntity()}
                        onSuccess={(msg) => {
                            toast({ title: "Sucesso", description: msg })
                            afterMutation()
                            closeEntity()
                        }}
                        onError={(msg) => toast({ title: "Erro", description: msg, variant: "destructive" })}
                    />
                ) : isViewing && selectedCustomer ? (
                    <CustomerDetailPage
                        key="details"
                        customer={selectedCustomer}
                        onBack={() => closeEntity()}
                        onEdit={handleEditCustomer}
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
                            {/* Desktop Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Clientes
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie sua base de clientes e contatos.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button variant="outline" onClick={() => { }} leftIcon={<ExportFileIcon size={18} />}>
                                        Exportar
                                    </Button>

                                    <Button onClick={handleAddCustomer} leftIcon={<PlusIcon size={18} />}>
                                        Novo cliente
                                    </Button>
                                </div>
                            </div>

                            {hasCustomers && (
                                <CustomerPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals({ filter: true })}
                                    onExport={() => { }}
                                    onAddCustomer={handleAddCustomer}
                                    filters={filters}
                                    setFilters={setFilters as any}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewModeState}
                                    hasActiveFilters={hasActiveFilters}
                                />
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isLoading ? (
                                        <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                            <ThreeDotsLoader />
                                        </FadeIn>
                                    ) : !hasCustomers ? (
                                        <FadeIn key="empty-no-data" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/Clientes.png"
                                                imageAlt="Sem clientes"
                                                title="Você ainda não tem clientes"
                                                subtitle="Cadastre seus clientes para gerenciar vendas e contatos."
                                                itemButton={{
                                                    text: "Cadastrar Primeiro Cliente",
                                                    action: handleAddCustomer,
                                                }}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum cliente encontrado"
                                                title="Nenhum cliente encontrado"
                                                subtitle="Tente ajustar seus filtros ou termos de busca."
                                                itemButton={{
                                                    text: "Limpar Filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline"
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <FadeIn
                                            key={activeTab + viewMode}
                                            className="w-full"
                                        >
                                            <SelectionBanner
                                                selectedCount={selection.ids.size}
                                                totalCount={filteredCustomers.length}
                                                onSelectAll={() => setSelection({ ids: new Set(filteredCustomers.map(c => c.originalId)) })}
                                                onClearSelection={() => setSelection({ ids: new Set() })}
                                                itemName="clientes"
                                                singularItemName="cliente"
                                            />
                                            {isMobile ? (
                                                <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                                                    {paginated.map((c: Customer) => {
                                                        const prefetch = getPrefetchProps(c.originalId)
                                                        return (
                                                            <div
                                                                key={c.originalId}
                                                                className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer flex items-center gap-4"
                                                                onClick={() => handleDetailsCustomer(c)}
                                                                onTouchStart={prefetch.onTouchStart}
                                                            >
                                                                <UserProfileImage
                                                                    fullName={c.name || "Cliente"}
                                                                    className="w-14 h-14 text-xl"
                                                                />

                                                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="flex flex-col min-w-0 pr-1">
                                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                                {c.name}
                                                                            </h3>
                                                                            <span className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                                                                                {c.id !== '-' ? c.id : "Cliente"}
                                                                            </span>
                                                                        </div>
                                                                        <Badge variant={c.status === 'ativo' ? 'green' : c.status === 'inativo' ? 'gray' : 'red'} className="shrink-0 text-[10px] h-5 px-1.5">
                                                                            {c.status === 'ativo' ? "Ativo" : c.status === 'inativo' ? "Inativo" : "Bloqueado"}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="flex justify-between items-center mt-1">
                                                                        <span className="text-[14px] font-bold text-brand-primary">
                                                                            {c.totalOrderValue ? formatCurrency(c.totalOrderValue) : "-"}
                                                                        </span>
                                                                        <div className="flex items-center gap-4">
                                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                                {c.orders} pedido{c.orders !== 1 && 's'}
                                                                            </span>
                                                                            <div onClick={(e) => { e.stopPropagation(); handleSelectRow(c.originalId); }}>
                                                                                <Checkbox checked={selection.ids.has(c.originalId)} onChange={() => handleSelectRow(c.originalId)} />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : viewMode === "grid" ? (
                                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginated.map((c: Customer) => {
                                                        const prefetch = getPrefetchProps(c.originalId)
                                                        return (
                                                            <CustomerGridCard
                                                                key={c.originalId}
                                                                customer={c}
                                                                selected={selection.ids.has(c.originalId)}
                                                                onSelect={() => handleSelectRow(c.originalId)}
                                                                onDetails={() => handleDetailsCustomer(c)}
                                                                onEdit={() => handleEditCustomer(c)}
                                                                onDelete={() => handleDeleteCustomer(c)}
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
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                        <div className="flex items-center">
                                                                            <Checkbox
                                                                                checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                                onChange={(checked) => {
                                                                                    setSelection({ ids: checked ? new Set(paginated.map((x: Customer) => x.originalId)) : new Set() })
                                                                                }}
                                                                                className="bg-white dark:bg-dark-background"
                                                                            />
                                                                        </div>
                                                                    </th>
                                                                    {COLUMNS.map((col, idx) => {
                                                                        const isSortable = col.id !== "actions";
                                                                        const isSorted = sortConfig?.key === col.id;
                                                                        return (
                                                                            <th
                                                                                key={col.id}
                                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""}`}
                                                                                style={{ width: col.width }}
                                                                                onClick={() => {
                                                                                    if (!isSortable) return;
                                                                                    setSortConfig(prev => ({
                                                                                        key: col.id as SortKey,
                                                                                        direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                                    }));
                                                                                }}
                                                                            >
                                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                    <span>{col.label}</span>
                                                                                    {isSortable && (
                                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                            <ArrowUpDownIcon
                                                                                                size={14}
                                                                                                className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100 block' : 'text-brand-inactive-text hidden group-hover:block opacity-40'
                                                                                                    } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </th>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginated.map((c: Customer) => {
                                                                    const prefetch = getPrefetchProps(c.originalId)
                                                                    return (
                                                                        <CustomerListItem
                                                                            key={c.originalId}
                                                                            customer={c}
                                                                            columns={COLUMNS}
                                                                            selected={selection.ids.has(c.originalId)}
                                                                            onSelect={handleSelectRow}
                                                                            onEdit={handleEditCustomer}
                                                                            onDelete={handleDeleteCustomer}
                                                                            onDetails={handleDetailsCustomer}
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

                            {hasCustomers && paginated.length > 0 && (
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
                onClose={() => setConfirmations((p) => ({ ...p, bulkDelete: false }))}
                title="Excluir Clientes"
                description={`Tem certeza que deseja excluir ${selection.ids.size} cliente(s)? Esta ação não pode ser desfeita.`}
                confirmText="Sim, excluir"
                variant="danger"
                onConfirm={() => confirmBulk("delete")}
            />

            <AlertModal
                isOpen={confirmations.bulkInactive}
                onClose={() => setConfirmations((p) => ({ ...p, bulkInactive: false }))}
                title="Alterar status"
                description={`Tem certeza que deseja alterar o status de ${selection.ids.size} cliente(s)?`}
                confirmText="Confirmar"
                variant="warning"
                onConfirm={() => confirmBulk("inactive")}
            />

            <AlertModal
                isOpen={!!customerToDelete}
                onClose={() => {
                    if (!isDeletingCustomer) setCustomerToDelete(null)
                }}
                title="Excluir cliente?"
                description={`Tem certeza que deseja excluir ${customerToDelete?.name || "este cliente"}? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                variant="danger"
                onConfirm={confirmDeleteCustomer}
            />

            <SavingStatusModal isOpen={isDeletingCustomer || isProcessingBulk} text={isDeletingCustomer ? "Excluindo cliente..." : "Processando..."} />

            <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={() => setSelection((p) => ({ ...p, ids: new Set() }))}>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-dark dark:text-dark-heading gap-2 font-bold px-3 hover:bg-gray-100 dark:hover:bg-dark-border"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkInactive: true }))}
                >
                    {(rawCustomers || []).filter((c: any) => selection.ids.has(c.id)).every((c: any) => c.status === 'inativo') ? (
                        <>
                            <CheckCircleIcon size={16} className="text-brand-green" /> Ativar
                        </>
                    ) : (
                        <>
                            <BlockedIcon size={16} className="text-brand-inactive-text" /> Desativar
                        </>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-red gap-2 font-bold px-3 hover:bg-red-50 hover:text-brand-red dark:hover:bg-red-900/20"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkDelete: true }))}
                >
                    <TrashIcon size={16} /> Excluir
                </Button>
            </FloatingActionBar>
        </>
    )
}