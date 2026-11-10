"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { getERPCustomersPageAction, getCustomerByIdAction, type ERPCustomerListCursor } from "@/app/actions/erp/customers"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { Button, IconPlaceholder, ThreeDotsLoader, Checkbox, AlertModal, SavingStatusModal, SelectionBanner, Dropdown, DropdownItem } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import CustomerListItem from "./CustomerListRow"
import CustomerGridCard from "./CustomerGridCard"
import CustomerPageControls from "./CustomerPageControls"
import CustomerDetailPage from "./CustomerDetailPage"
import NewCustomerPage from "./NewCustomerPage"
import { deleteCustomersInBatchAction, toggleCustomersStatusAction, archiveCustomerAction, unarchiveCustomerAction } from "@/app/actions/erp/customers"
import { formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds, ymdInBounds, type DatePeriodFilterValue } from "@/lib/utils/filter-date-period"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    Users,
    ArrowUpDownIcon,
    TrashIcon,
    BlockedIcon,
    CheckCircleIcon,
    UploadIcon,
    Settings2Icon,
    UploadSheetIcon
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useErpExport } from "@/hooks/use-erp-export"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"

// --- TYPES & INTERFACES ---

interface Customer {
    id: string;
    originalId: string;
    name: string;
    avatar: string;
    email?: string;
    phone?: string;
    orders: number;
    totalOrderValue: number;
    avgOrderValue: number;
    status: string;
    lastOrderDate: string;
    rawLastOrderDate: number;
    storeCredit?: number;
    createdAt?: string;
    address?: string;
    birth_date?: string | null;
    city?: string | null;
    state?: string | null;
}

interface FilterState {
    status: string[]
    personType: string[]
    orders: string[]
    createdPeriod: DatePeriodFilterValue
}

const INITIAL_FILTERS: FilterState = {
    status: [],
    personType: [],
    orders: [],
    createdPeriod: { ...EMPTY_DATE_PERIOD },
}

type SortKey = 'name' | 'orders' | 'total_spent' | 'store_credit' | 'status' | 'last_order';
type SortDirection = 'asc' | 'desc';

interface Column {
    id: string;
    label: string;
    align: "left" | "center" | "right";
    width: string;
}

// --- CONFIGURAÇÃO DE COLUNAS ---
const COLUMNS: Column[] = [
    { id: "name", label: "Cliente", align: "left", width: "300px" },
    { id: "contact", label: "Contato", align: "left", width: "220px" },
    { id: "city", label: "Cidade", align: "left", width: "180px" },
    { id: "orders", label: "Pedidos", align: "center", width: "100px" },
    { id: "last_order", label: "Último Pedido", align: "left", width: "160px" },
    { id: "status", label: "Status", align: "center", width: "120px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
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
    const router = useRouter()
    const { toast } = useToast()
    const { planSlug } = usePermissions()
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")
    const showBirthdayBadge = hasMinimumPlan(planSlug, "crescer")

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
            const res = await getERPCustomersPageAction(partnerId, { cursor, limit: 100, filters: { includeArchived: true } })
            if (!res.success) throw new Error(res.error || "Erro ao carregar clientes.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((c: any) => String(c?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getCustomerByIdAction(id)
            return res.customer || null
        },
        listToDetail: (item: any) => item,
    })

    const {
        items: rawCustomers, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading: isQueryLoading,
        entityState, openEntity, closeEntity, isViewing, isCreating: isCreatingEntity, isEditing: isEditingEntity,
        currentEntity, isLoadingDetail,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation,
        queryClient,
    } = entityPage

    // Sidebar reset → close entity view
    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [closeEntity])

    // ── UI State (non-URL) ────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo" | "Bloqueado" | "Arquivado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [confirmations, setConfirmations] = useState({ bulkDelete: false, bulkInactive: false })
    const [isProcessingBulk, setIsProcessingBulk] = useState(false)
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
    const [customerToArchive, setCustomerToArchive] = useState<Customer | null>(null)
    const [isDeletingCustomer, setIsDeletingCustomer] = useState(false)
    const [isArchivingCustomer, setIsArchivingCustomer] = useState(false)

    const observerTarget = useRef<HTMLDivElement>(null)

    const isLoading = storeLoading || isQueryLoading
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
        if (!rawCustomers) return []

        const statuses = [...new Set(rawCustomers.map((c: any) => {
            const isArchived = c.status === "arquivado" || c.status === "archived"
            return isArchived ? "Arquivado" : (c.status === 'bloqueado' ? "Bloqueado" : (c.status === 'inativo' ? "Inativo" : "Ativo"))
        }).filter(Boolean))] as string[]

        const sections: FilterSectionConfig[] = []

        if (statuses.length > 1) {
            sections.push({ id: "status", title: "Status", type: "checkbox-list", options: statuses })
        }

        sections.push({ id: "personType", title: "Tipo de Pessoa", type: "checkbox-list", options: ["Pessoa Física", "Pessoa Jurídica"] })
        sections.push({ id: "orders", title: "Pedidos", type: "checkbox-list", options: ["Com pedidos", "Sem pedidos"] })
        sections.push({ id: "createdPeriod", title: "Data de cadastro", type: "date-period" })

        return sections
    }, [rawCustomers])

    const filteredCustomers: Customer[] = useMemo(() => {
        if (!rawCustomers) return []

        const term = debouncedSearch.toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.createdPeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        const cleanSearchDigits = debouncedSearch.replace(/\D/g, "")

        const filtered = rawCustomers
            .filter((c: any) => {
                if (!term) return true
                const nameMatch = (c.name || "").toLowerCase().includes(term)
                const emailMatch = (c.email || "").toLowerCase().includes(term)
                const phoneMatch = (c.phone || "").includes(debouncedSearch) || (cleanSearchDigits.length > 2 && (c.phone || "").replace(/\D/g, "").includes(cleanSearchDigits))
                const phoneFixedMatch = (c.phone_fixed || "").includes(debouncedSearch) || (cleanSearchDigits.length > 2 && (c.phone_fixed || "").replace(/\D/g, "").includes(cleanSearchDigits))
                const docMatch = (cleanSearchDigits.length > 2 && (
                    (c.cnpj && c.cnpj.replace(/\D/g, "").includes(cleanSearchDigits)) ||
                    (c.cpf && c.cpf.replace(/\D/g, "").includes(cleanSearchDigits))
                )) || ((c.cnpj || "").toLowerCase().includes(term)) || ((c.cpf || "").toLowerCase().includes(term))
                const fantasyMatch = (c.nome_fantasia || "").toLowerCase().includes(term)
                const companyMatch = (c.razao_social || "").toLowerCase().includes(term)
                const cityMatch = (c.city || "").toLowerCase().includes(term)
                const stateMatch = (c.state || "").toLowerCase().includes(term)
                const neighborhoodMatch = (c.neighborhood || "").toLowerCase().includes(term)
                const notesMatch = (c.notes || "").toLowerCase().includes(term)

                return nameMatch || emailMatch || phoneMatch || phoneFixedMatch || docMatch || fantasyMatch || companyMatch || cityMatch || stateMatch || neighborhoodMatch || notesMatch
            })
            .filter((c: any) => {
                if (c.status === "deleted" || c.status === "deletado" || c.deleted_at != null) return false
                const isArchived = c.status === "arquivado" || c.status === "archived"
                const statusLabel = isArchived ? "Arquivado" : (c.status === 'bloqueado' ? "Bloqueado" : (c.status === 'inativo' ? "Inativo" : "Ativo"))

                let tabMatch = true
                if (activeTab === "Arquivado") tabMatch = isArchived
                else {
                    if (isArchived) tabMatch = false
                    else if (activeTab === "Ativo") tabMatch = statusLabel === "Ativo"
                    else if (activeTab === "Inativo") tabMatch = statusLabel === "Inativo"
                    else if (activeTab === "Bloqueado") tabMatch = statusLabel === "Bloqueado"
                }

                const filterMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

                const personTypeLabel = c.person_type === "pj" ? "Pessoa Jurídica" : "Pessoa Física"
                const personTypeMatch = filters.personType.length === 0 || filters.personType.includes(personTypeLabel)

                const hasOrders = Number(c.orders_count || 0) > 0
                const ordersMatch = filters.orders.length === 0 ||
                    (filters.orders.includes("Com pedidos") ? hasOrders : !hasOrders)

                const createdMatch = !dateBoundsActive || ymdInBounds(c.created_at, startYmd, endYmd)

                return tabMatch && filterMatch && personTypeMatch && ordersMatch && createdMatch
            })
            .map((c: any): Customer => ({
                id: c.id ? `#${c.id.substring(0, 5).toUpperCase()}` : '-',
                originalId: c.id,
                name: c.name || 'Cliente Sem Nome',
                avatar: c.image_url || c.avatar_url || '',
                email: c.email || "",
                phone: c.phone || c.phone_fixed || "",
                orders: c.orders_count || 0,
                totalOrderValue: c.total_spent || 0.00,
                avgOrderValue: 0.00,
                status: c.status || 'ativo',
                lastOrderDate: c.last_order_at ? formatDate(c.last_order_at) : '-',
                rawLastOrderDate: c.last_order_at ? new Date(c.last_order_at).getTime() : 0,
                storeCredit: c.store_credit || 0,
                createdAt: c.created_at,
                address: c.address,
                birth_date: c.birth_date,
                city: c.city || null,
                state: c.state || null,
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
        return rawCustomers.find(c => c.id === entityState.entityId || (c as any).originalId === entityState.entityId) || null
    }, [entityState.entityId, currentEntity, rawCustomers])

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filteredCustomers.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filteredCustomers.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredCustomers.length])

    const hasActiveFilters = filters.status.length > 0 || filters.personType.length > 0 || filters.orders.length > 0 || isDatePeriodFilterActive(filters.createdPeriod) || debouncedSearch.length > 0
    const hasCustomers = (rawCustomers?.length || 0) > 0

    const tabCounts = useMemo(() => {
        if (!rawCustomers) return { Todos: 0, Ativo: 0, Inativo: 0, Bloqueado: 0, Arquivado: 0 }
        let Ativo = 0, Inativo = 0, Bloqueado = 0, Arquivado = 0, TodosActive = 0
        for (const c of rawCustomers) {
            const status = (c as any).status
            if (status === "arquivado" || status === "archived") {
                Arquivado++
                continue
            }
            TodosActive++
            if (status === "bloqueado") Bloqueado++
            else if (status === "inativo") Inativo++
            else Ativo++
        }
        return { Todos: TodosActive, Ativo, Inativo, Bloqueado, Arquivado }
    }, [rawCustomers])

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "customers",
            format: "xlsx",
            filters: {
                storeId: selectedStore?.id || null,
                search: debouncedSearch,
                activeTab,
                status: filters.status,
            },
        }, { selectedIds: selection.ids, totalCount: filteredCustomers.length })
    }, [exportData, partnerId, selectedStore?.id, debouncedSearch, activeTab, filters.status, selection.ids, filteredCustomers.length])

    // Handlers (URL-driven)
    const handleAddCustomer = () => openEntity('create')
    const handleEditCustomer = (customer: any) => openEntity('edit', customer.originalId || customer.id)
    const handleDetailsCustomer = (customer: any) => openEntity('view', customer.originalId || customer.id)
    const handleDeleteCustomer = (customer: any) => setCustomerToDelete(customer)

    const handleArchiveCustomer = (customer: any) => setCustomerToArchive(customer)

    const handleUnarchiveCustomer = (customer: any) => setCustomerToArchive(customer)

    const confirmArchiveCustomer = async () => {
        if (!customerToArchive) return
        const isCurrentlyArchived = customerToArchive.status === "arquivado" || customerToArchive.status === "archived"
        setIsArchivingCustomer(true)
        const idToArchive = customerToArchive.originalId || customerToArchive.id
        try {
            const res = isCurrentlyArchived
                ? await unarchiveCustomerAction(idToArchive)
                : await archiveCustomerAction(idToArchive)
            if (res.error) {
                toast({ title: isCurrentlyArchived ? "Erro ao desarquivar" : "Erro ao arquivar", description: res.error, variant: "destructive" })
            } else {
                toast({ title: isCurrentlyArchived ? "Cliente reativado com sucesso." : "Cliente arquivado com sucesso." })
                afterMutation()
            }
        } catch (e: any) {
            toast({ title: "Erro", description: e.message || "Erro ao arquivar", variant: "destructive" })
        } finally {
            setIsArchivingCustomer(false)
            setCustomerToArchive(null)
        }
    }
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
            cache.removeItemFromListCache(idToDelete)
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
                ids.forEach(id => cache.removeItemFromListCache(id))
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
                {entityState.isOpen && isViewing ? (
                    <FadeIn key="details" className="w-full h-full">
                        <CustomerDetailPage
                            customer={selectedCustomer}
                            onBack={() => closeEntity()}
                            onEdit={handleEditCustomer}
                        />
                    </FadeIn>
                ) : (isCreatingEntity || isEditingEntity) ? (
                    <FadeIn key="form" className="w-full h-full">
                        <NewCustomerPage
                            partnerId={partnerId}
                            customerId={entityState.entityId || undefined}
                            initialData={isEditingEntity ? currentEntity : undefined}
                            onBack={() => closeEntity()}
                            onSuccess={(msg, savedCustomer) => {
                                toast({ title: "Sucesso", description: msg })
                                if (savedCustomer?.id) {
                                    if (entityState.entityId) {
                                        cache.setEntity(savedCustomer.id, savedCustomer)
                                    } else {
                                        queryClient.setQueryData(queryKey, (oldData: any) => {
                                            if (!oldData?.pages?.length) return oldData
                                            const firstPage = oldData.pages[0]
                                            const existingItems = firstPage.items || []
                                            return {
                                                ...oldData,
                                                pages: [
                                                    {
                                                        ...firstPage,
                                                        items: [
                                                            savedCustomer,
                                                            ...existingItems.filter((item: any) => item.id !== savedCustomer.id),
                                                        ],
                                                    },
                                                    ...oldData.pages.slice(1),
                                                ],
                                            }
                                        })
                                    }
                                } else {
                                    // Backward-compatible fallback if an older
                                    // action response does not include the row.
                                    afterMutation()
                                }
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
                                        <DropdownItem onClick={() => router.push("/erp/clientes/importar")}>
                                            <UploadSheetIcon size={16} /> Importar
                                        </DropdownItem>
                                        <DropdownItem onClick={handleExport} disabled={isExporting}>
                                            <ExportFileIcon size={16} /> {isExporting ? "Exportando..." : "Exportar"}
                                        </DropdownItem>
                                    </Dropdown>

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
                                    onExport={handleExport}
                                    onAddCustomer={handleAddCustomer}
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
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline"
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
                                                totalCount={filteredCustomers.length}
                                                onSelectAll={() => setSelection({ ids: new Set(filteredCustomers.map(c => c.originalId)) })}
                                                onClearSelection={() => setSelection({ ids: new Set() })}
                                                itemName="clientes"
                                                singularItemName="cliente"
                                            />
                                            {effectiveViewMode === "grid" ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
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
                                                                onArchive={() => handleArchiveCustomer(c)}
                                                                onUnarchive={() => handleUnarchiveCustomer(c)}
                                                                onPrefetchMouseEnter={prefetch.onMouseEnter}
                                                                onPrefetchMouseLeave={prefetch.onMouseLeave}
                                                                onPrefetchTouchStart={prefetch.onTouchStart}
                                                                showBirthdayBadge={showBirthdayBadge}
                                                            />
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="w-full overflow-hidden rounded-xl relative">
                                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={handleScroll}>
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1380px]">
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
                                                                            onArchive={handleArchiveCustomer}
                                                                            onUnarchive={handleUnarchiveCustomer}
                                                                            onDetails={handleDetailsCustomer}
                                                                            onPrefetchMouseEnter={prefetch.onMouseEnter}
                                                                            onPrefetchMouseLeave={prefetch.onMouseLeave}
                                                                            onPrefetchTouchStart={prefetch.onTouchStart}
                                                                            showBirthdayBadge={showBirthdayBadge}
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
                isOpen={!!customerToArchive}
                onClose={() => {
                    if (!isArchivingCustomer) setCustomerToArchive(null)
                }}
                title="Arquivar cliente?"
                description={`Tem certeza que deseja arquivar ${customerToArchive?.name || "este cliente"}? O cliente será movido para a lista de arquivados.`}
                confirmText="Arquivar"
                variant="warning"
                onConfirm={confirmArchiveCustomer}
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

            <SavingStatusModal isOpen={isDeletingCustomer || isArchivingCustomer || isProcessingBulk} text={isArchivingCustomer ? "Arquivando cliente..." : isDeletingCustomer ? "Excluindo cliente..." : "Processando..."} />

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

            <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={() => setSelection((p) => ({ ...p, ids: new Set() }))}>
                <Button
                    variant="ghost"
                    className="h-10 px-3"
                    leftIcon={
                        (rawCustomers || []).filter((c: any) => selection.ids.has(c.id)).every((c: any) => c.status === 'inativo') ? (
                            <CheckCircleIcon size={18} />
                        ) : (
                            <BlockedIcon size={18} />
                        )
                    }
                    onClick={() => setConfirmations((p) => ({ ...p, bulkInactive: true }))}
                >
                    {(rawCustomers || []).filter((c: any) => selection.ids.has(c.id)).every((c: any) => c.status === 'inativo') ? (
                        <>
                            Ativar
                        </>
                    ) : (
                        <>
                            Desativar
                        </>
                    )}
                </Button>
                <Button
                    variant="ghostred"
                    className="h-10 px-3"
                    leftIcon={<TrashIcon size={18} />}
                    onClick={() => setConfirmations((p) => ({ ...p, bulkDelete: true }))}
                >
                    Excluir
                </Button>
            </FloatingActionBar>
        </>
    )
}
