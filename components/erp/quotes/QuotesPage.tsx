"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useStore } from "@/lib/store-context"

// Components
import { Button, IconPlaceholder, AlertModal, Checkbox, BadgeVariant, SelectionBanner, ThreeDotsLoader, DefaultModal, FormDropdown } from "@/components/reusable"
import { formatDate } from "@/lib/utils";
import QuoteSkeleton from "./QuoteSkeleton"
import { deleteQuoteAction, batchDeleteQuotesAction, batchUpdateQuotesStatusAction, updateQuoteStatusAction, getERPQuotesPageAction, getQuoteDetailsAction, type ERPQuoteListCursor } from "@/app/actions/erp/quotes"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import Pagination from "@/components/reusable/Pagination"
import QuoteListItem from "./QuoteListRow"
import QuoteGridCard from "./QuoteGridCard"
import QuotePageControls from "./QuotePageControls"
import CreateQuote from "./CreateQuote"
import QuoteDetail from "./QuoteDetail"
import QuotePrintModal from "./QuotePrintModal"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import { useNotification } from "@/hooks/use-notification"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions } from "@/lib/permission-context"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    ArrowUpDownIcon,
    TrashIcon,
    EditIcon,
    FileIcon,
    TelegramIcon,
    ClockIcon,
    XIcon,
    FileBlockIcon,
    FileViewIcon,
    FileVerifiedIcon
} from "@/lib/icons"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { FadeIn } from "@/components/animations/FadeIn"

// --- TYPES & INTERFACES ---

interface Quote {
    originalId: string;
    displayId: string;
    customer_name: string;
    customer_id: string | null;
    total_amount: number;
    statusLabel: string;
    statusColor: BadgeVariant;
    statusIcon?: React.ReactElement<any> | null;
    formattedIssueDate: string;
    formattedExpirationDate: string | null;
    items_count: number;
    created_at_time: number;
    status: string;
    user_profiles?: { full_name: string } | null;
    public_token?: string | null;
}

interface FilterState {
    status: string[]
    issuePeriod: DatePeriodFilterValue
}

const INITIAL_FILTERS: FilterState = {
    status: [],
    issuePeriod: { ...EMPTY_DATE_PERIOD },
}

type SortKey = 'quote_id' | 'customer' | 'issue_date' | 'expiration_date' | 'total' | 'status';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "quote_id", label: "Cód. Orçamento", align: "left", width: "150px" },
    { id: "customer", label: "Cliente", align: "left", width: "250px" },
    { id: "issue_date", label: "Data Emissão", align: "left", width: "150px" },
    { id: "expiration_date", label: "Validade", align: "left", width: "150px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "center", width: "150px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

export default function QuotesPage({
    quotes: rawQuotes,
    initialNextCursor,
    initialHasMore,
    partnerId,
    storeId: storeIdProp,
}: {
    quotes: any[]
    initialNextCursor: ERPQuoteListCursor | null
    initialHasMore: boolean
    partnerId: string
    storeId?: string | null
}) {
    const { success, error } = useNotification()
    const debouncedRefresh = useDebouncedRefresh()
    const { isLoading: storeLoading, selectedStore } = useStore()
    const { planSlug } = usePermissions()
    const partnerName = selectedStore?.name || "Sua Loja"
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")
    const [storeId] = useState<string | null>(storeIdProp || null)

    const queryKey = useMemo(() => ["erp", "quotes", partnerId] as const, [partnerId])
    const observerTarget = useRef<HTMLDivElement>(null)

    // ── Entity Page Hook (URL state + cache + infinite list) ──────────
    const entityPage = useEntityPage<any, any, ERPQuoteListCursor>({
        entityType: 'quotes',
        partnerId,
        queryKey,
        initialItems: rawQuotes,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPQuotesPageAction(partnerId, { cursor, limit: 100, storeId })
            if (!res.success) throw new Error(res.error || "Erro ao carregar orçamentos.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((q: any) => String(q?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getQuoteDetailsAction(id, partnerId)
            if (res.success && res.data) return res.data
            return null
        },
        listToDetail: (item: any) => item,
    })

    const {
        items: loadedQuotes, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading: isQueryLoading,
        entityState, openEntity, closeEntity, isViewing, isEditing, isCreating, isDuplicating,
        currentEntity, isLoadingDetail,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation,
    } = entityPage

    // Local state for instant updates (optimistic delete etc.)
    const [currentQuotes, setCurrentQuotes] = useState<any[]>(loadedQuotes)
    const prevQuotesRef = useRef<any[]>(loadedQuotes)
    useEffect(() => {
        if (prevQuotesRef.current !== loadedQuotes) {
            setCurrentQuotes(loadedQuotes)
            prevQuotesRef.current = loadedQuotes
        }
    }, [loadedQuotes])

    // Export state & handlers
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)

    // Status alteration state
    const [quoteToUpdateStatus, setQuoteToUpdateStatus] = useState<any | null>(null)
    const [pendingStatus, setPendingStatus] = useState<string>("")
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

    const handleOpenStatusModal = useCallback((quote: any) => {
        setQuoteToUpdateStatus(quote)
        setPendingStatus(quote.status || "draft")
    }, [])

    const handleStatusChangeSubmit = async () => {
        if (!quoteToUpdateStatus) return
        setIsUpdatingStatus(true)
        try {
            const res = await updateQuoteStatusAction({
                quoteId: quoteToUpdateStatus.originalId || quoteToUpdateStatus.id,
                partnerId,
                status: pendingStatus as any
            })
            if (res.success) {
                success("Sucesso", "Status do orçamento atualizado com sucesso.")
                setQuoteToUpdateStatus(null)
                afterMutation()
            } else {
                error("Erro", res.error || "Não foi possível atualizar o status.")
            }
        } catch (err) {
            error("Erro", "Erro ao conectar ao servidor.")
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [closeEntity])

    // Derived states from Entity Page
    const wrapperMode = useMemo(() => {
        if (!entityState.isOpen) return null
        return entityState.action
    }, [entityState])

    const activeQuote = useMemo(() => {
        if (!entityState.isOpen || !entityState.entityId) return null
        if (currentEntity) return currentEntity
        return currentQuotes.find((q: any) => q.id === entityState.entityId) || null
    }, [entityState, currentEntity, currentQuotes])

    const [activeTab, setActiveTab] = useState<"Todos" | "Enviados" | "Aprovados" | "Rejeitados" | "Expirados">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)

    const [modals, setModals] = useState({ filter: false, delete: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [isDeleting, setIsDeleting] = useState(false)
    const [quoteToDelete, setQuoteToDelete] = useState<any>(null)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
    const [confirmations, setConfirmations] = useState({ bulkDelete: false })
    const [printQuoteId, setPrintQuoteId] = useState<string | null>(null)
    const [showShareModal, setShowShareModal] = useState(false)
    const [quoteToShare, setQuoteToShare] = useState<Quote | null>(null)

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
    }, [checkScroll, viewMode, currentQuotes])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Rascunho", "Enviado", "Aprovado", "Rejeitado", "Expirado"] },
        { id: "issuePeriod", title: "Período de emissão", type: "date-period" },
    ]

    const filteredQuotes: Quote[] = useMemo(() => {
        if (!currentQuotes) return []

        const term = debouncedSearch.toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.issuePeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        const filtered = currentQuotes
            .map((q: any): Quote => {
                const statusMap: Record<string, { label: string; color: BadgeVariant; icon?: React.ReactElement | null }> = {
                    draft: { label: "Rascunho", color: "gray", icon: <FileIcon size={12} /> },
                    sent: { label: "Enviado", color: "blue", icon: <TelegramIcon size={12} /> },
                    pending_client: { label: "Pendente", color: "purple", icon: <ClockIcon size={12} /> },
                    viewed: { label: "Visualizado", color: "cyan", icon: <FileViewIcon size={12} /> },
                    approved: { label: "Aprovado", color: "green", icon: <FileVerifiedIcon size={12} /> },
                    rejected: { label: "Rejeitado", color: "red", icon: <FileBlockIcon size={12} /> },
                    expired: { label: "Expirado", color: "orange", icon: <ClockIcon size={12} /> },
                    cancelled: { label: "Cancelado", color: "red", icon: <XIcon size={12} /> },
                    converted_to_order: { label: "Convertido", color: "gray", icon: null }
                }
                const statusInfo = statusMap[q.status] || { label: q.status, color: "gray", icon: null }

                let parsedIssueDate;
                let formattedIssueDate = "";
                if (q.issue_date) {
                    const [y, m, d] = q.issue_date.split("-");
                    parsedIssueDate = new Date(y, m - 1, d);
                    formattedIssueDate = `${d}/${m}/${y}`;
                } else if (q.created_at) {
                    parsedIssueDate = new Date(q.created_at);
                    formattedIssueDate = formatDate(parsedIssueDate);
                }

                let formattedExpirationDate = null;
                if (q.expiration_date) {
                    const [y, m, d] = q.expiration_date.split("-");
                    formattedExpirationDate = `${d}/${m}/${y}`;
                }

                return {
                    originalId: q.id,
                    displayId: q.quote_number || `#${q.id.substring(0, 8)}`,
                    customer_name: q.customers?.name || "Cliente sem nome",
                    customer_id: q.customers?.id ? `CST-${q.customers.id.substring(0, 4).toUpperCase()}` : null,
                    items_count: q.items_count?.[0]?.count || 0,
                    total_amount: Number(q.total),
                    statusLabel: statusInfo.label,
                    statusColor: statusInfo.color,
                    statusIcon: statusInfo.icon,
                    formattedIssueDate,
                    formattedExpirationDate,
                    created_at_time: parsedIssueDate ? parsedIssueDate.getTime() : 0,
                    status: q.status,
                    user_profiles: q.user_profiles,
                    public_token: q.public_token || null
                }
            })
            .filter((q: Quote) => {
                const searchMatch =
                    q.displayId.toLowerCase().includes(term) ||
                    q.customer_name.toLowerCase().includes(term) ||
                    (q.customer_id || "").toLowerCase().includes(term)

                return searchMatch
            })
            .filter((q: Quote) => {
                let tabMatch = true
                if (activeTab === "Enviados") tabMatch = q.status === "sent" || q.status === "pending_client" || q.status === "viewed"
                else if (activeTab === "Aprovados") tabMatch = q.status === "approved"
                else if (activeTab === "Rejeitados") tabMatch = q.status === "rejected"
                else if (activeTab === "Expirados") tabMatch = q.status === "expired"

                const statusFilterMatch = filters.status.length === 0 || filters.status.includes(q.statusLabel)
                const issueYmd = msToBrazilYmd(q.created_at_time)
                const matchesIssue = !dateBoundsActive || ymdInBounds(issueYmd, startYmd, endYmd)

                return tabMatch && statusFilterMatch && matchesIssue
            })

        const result = [...filtered]

        if (sortConfig) {
            const { key, direction } = sortConfig;
            result.sort((a: any, b: any) => {
                let aVal: any;
                let bVal: any;

                switch (key) {
                    case 'quote_id':
                        aVal = a.displayId;
                        bVal = b.displayId;
                        break;
                    case 'customer':
                        aVal = a.customer_name;
                        bVal = b.customer_name;
                        break;
                    case 'issue_date':
                        aVal = a.created_at_time;
                        bVal = b.created_at_time;
                        break;
                    case 'expiration_date':
                        aVal = a.formattedExpirationDate || "";
                        bVal = b.formattedExpirationDate || "";
                        break;
                    case 'total':
                        aVal = a.total_amount;
                        bVal = b.total_amount;
                        break;
                    case 'status':
                        aVal = a.statusLabel;
                        bVal = b.statusLabel;
                        break;
                    default:
                        aVal = a[key as keyof Quote];
                        bVal = b[key as keyof Quote];
                }

                if (aVal === bVal) return 0;
                const comparison = aVal < bVal ? -1 : 1;
                return direction === 'asc' ? comparison : -comparison;
            });
        } else {
            // Default sort
            result.sort((a: any, b: any) => b.created_at_time - a.created_at_time)
        }

        return result;
    }, [currentQuotes, debouncedSearch, activeTab, filters, sortConfig])

    const totalPages = Math.ceil(filteredQuotes.length / itemsPerPage) || 1
    const paginated = filteredQuotes.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const handlePageChange = useCallback((newPage: number) => {
        setPage(newPage)
        if (newPage === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filteredQuotes.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filteredQuotes.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredQuotes.length])

    const hasActiveFilters =
        filters.status.length > 0 ||
        isDatePeriodFilterActive(filters.issuePeriod) ||
        debouncedSearch.length > 0
    const hasQuotes = (currentQuotes?.length || 0) > 0

    const handleExport = useCallback(() => {
        void exportData(
            {
                partnerId,
                module: "quotes",
                format: "xlsx",
                filters: {
                    storeId: selectedStore?.id || storeId || null,
                    search: debouncedSearch,
                    activeTab,
                    status: filters.status,
                    datePeriod: filters.issuePeriod
                },
            },
            {
                selectedIds: selection.ids,
                totalCount: filteredQuotes.length,
            }
        )
    }, [exportData, partnerId, selectedStore?.id, storeId, debouncedSearch, activeTab, filters.status, filters.issuePeriod, selection.ids, filteredQuotes.length])

    // Handlers
    const handleAddQuote = useCallback(() => {
        openEntity('create')
    }, [openEntity])

    const handleViewQuote = useCallback((quote: any) => {
        openEntity('view', quote.originalId || quote.id)
    }, [openEntity])

    const handleEditQuote = useCallback((quote: any) => {
        openEntity('edit', quote.originalId || quote.id)
    }, [openEntity])

    const handleDuplicateQuote = useCallback((quote: any) => {
        openEntity('duplicate', quote.originalId || quote.id)
    }, [openEntity])

    const handleDeleteQuote = useCallback((quote: any) => {
        setQuoteToDelete(quote)
        setModals(prev => ({ ...prev, delete: true }))
    }, [])

    const handlePrintQuote = useCallback((quote: any) => {
        setPrintQuoteId(quote.originalId || quote.id)
    }, [])

    const handleShareQuote = useCallback((quote: Quote) => {
        if (quote.status === 'draft' || quote.status === 'pending_client') {
            error("Não é possível compartilhar", "Orçamentos rascunho ou pendentes não podem ser compartilhados.")
            return
        }
        setQuoteToShare(quote)
        setShowShareModal(true)
    }, [error])

    const handleConfirmDelete = async () => {
        if (!quoteToDelete) return

        // OPTIMISTIC DELETE: hide instantly from UI
        const previousQuotes = [...currentQuotes]
        setCurrentQuotes(prev => prev.filter(q => q.id !== quoteToDelete.originalId))
        setModals(prev => ({ ...prev, delete: false }))

        setIsDeleting(true)
        try {
            const res = await deleteQuoteAction(quoteToDelete.originalId)
            if (res.success) {
                success("Orçamento excluído", "O orçamento foi removido com sucesso.")
                afterMutation(quoteToDelete.originalId, true)
            } else {
                // Revert
                setCurrentQuotes(previousQuotes)
                setQuoteToDelete(null)
                error("Erro", res.error || "Não foi possível excluir o orçamento.")
            }
        } catch (err) {
            // Revert
            setCurrentQuotes(previousQuotes)
            setQuoteToDelete(null)
            error("Erro", "Erro de conexão ao excluir orçamento.")
        } finally {
            setIsDeleting(false)
        }
    }

    const handleBulkEditApply = async (payload: BulkActionPayload) => {
        if (payload.type === 'status' && payload.status) {
            const res = await batchUpdateQuotesStatusAction(Array.from(selection.ids), payload.status)
            if (res.success) {
                success("Status atualizado", `${selection.ids.size} ${selection.ids.size === 1 ? 'orçamento atualizado' : 'orçamentos atualizados'} para ${payload.status}.`)
                setSelection({ ids: new Set() })
                afterMutation()
            } else {
                error("Erro", res.error || "Erro ao atualizar status em massa.")
            }
        } else if (payload.type === 'delete') {
            setConfirmations(prev => ({ ...prev, bulkDelete: true }))
        }
    }

    const handleConfirmBulkDelete = async () => {
        setIsDeleting(true)
        try {
            const res = await batchDeleteQuotesAction(Array.from(selection.ids))
            if (res.success) {
                success("Orçamentos excluídos", `${selection.ids.size} orçamentos removidos com sucesso.`)
                setSelection({ ids: new Set() })
                setConfirmations(prev => ({ ...prev, bulkDelete: false }))
                afterMutation()
            } else {
                error("Erro", res.error || "Erro ao excluir orçamentos em massa.")
            }
        } catch (err) {
            error("Erro", "Erro de conexão ao excluir orçamentos.")
        } finally {
            setIsDeleting(false)
        }
    }
    const handleSelectRow = useCallback((id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }, [])

    const handleClearFilters = useCallback(() => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }, [setSearch])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && isViewing ? (
                    (isLoadingDetail || !activeQuote) ? (
                        <ERPDetailLoading key="loading-quote" />
                    ) : (
                        <FadeIn key="view-quote" className="w-full h-full">
                            <QuoteDetail
                                partnerId={partnerId}
                                quoteId={activeQuote.id}
                                onBack={closeEntity}
                                onEditQuote={handleEditQuote}
                                onDuplicateQuote={handleDuplicateQuote}
                                initialQuote={activeQuote}
                            />
                        </FadeIn>
                    )
                ) : (isCreating || isEditing || isDuplicating) ? (
                    ((isEditing || isDuplicating) && (isLoadingDetail || !activeQuote)) ? (
                        <ERPDetailLoading key="loading-quote-form" />
                    ) : (
                        <FadeIn key="create-quote" className="w-full h-full">
                            <CreateQuote
                                partnerId={partnerId}
                                existingQuote={activeQuote}
                                mode={isCreating ? 'create' : isEditing ? 'edit' : isDuplicating ? 'duplicate' : 'view'}
                                onBack={() => {
                                    afterMutation(entityState.entityId || undefined)
                                    closeEntity()
                                }}
                            />
                        </FadeIn>
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
                            {/* Desktop Header */}
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Orçamentos
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie propostas comerciais para seus clientes.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        leftIcon={<ExportFileIcon size={18} />}
                                        onClick={handleExport}
                                        isLoading={isExporting}
                                    >
                                        Exportar
                                    </Button>

                                    <Button leftIcon={<PlusIcon size={18} />} onClick={handleAddQuote}>
                                        Novo orçamento
                                    </Button>
                                </div>
                            </div>

                            {hasQuotes && (
                                <QuotePageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals(prev => ({ ...prev, filter: true }))}
                                    onExport={handleExport}
                                    onAddQuote={handleAddQuote}
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
                                        <FadeIn key="loading">
                                            <QuoteSkeleton count={5} viewMode={viewMode} />
                                        </FadeIn>
                                    ) : !hasQuotes ? (
                                        <FadeIn
                                            key="empty-no-data"
                                            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                        >
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/Orcamentos.png"
                                                imageAlt="Sem orçamentos"
                                                title="Você ainda não tem orçamentos"
                                                subtitle="Seus orçamentos aparecerão aqui assim que você criá-los."
                                                itemButton={{
                                                    text: "Adicionar primeiro orçamento",
                                                    action: handleAddQuote,
                                                }}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn
                                            key="empty-results"
                                            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                        >
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum orçamento encontrado"
                                                title="Nenhum orçamento encontrado"
                                                subtitle="Tente ajustar seus filtros ou termos de busca."
                                                itemButton={{
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline"
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <AnimatePresence mode="wait">
                                            <FadeIn
                                                key={activeTab + effectiveViewMode}
                                                className="w-full"
                                            >
                                                <SelectionBanner
                                                    selectedCount={selection.ids.size}
                                                    totalCount={filteredQuotes.length}
                                                    onSelectAll={() => setSelection({ ids: new Set(filteredQuotes.map(q => q.originalId)) })}
                                                    onClearSelection={() => setSelection({ ids: new Set() })}
                                                    itemName="orçamentos"
                                                    singularItemName="orçamento"
                                                />
                                                {effectiveViewMode === "grid" ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginated.map((q: Quote) => {
                                                            const prefetch = getPrefetchProps(q.originalId)
                                                            return (
                                                                <QuoteGridCard
                                                                    key={q.originalId}
                                                                    quote={q}
                                                                    selected={selection.ids.has(q.originalId)}
                                                                    onSelect={() => handleSelectRow(q.originalId)}
                                                                    onEdit={() => handleEditQuote(q)}
                                                                    onDuplicate={() => handleDuplicateQuote(q)}
                                                                    onDelete={() => handleDeleteQuote(q)}
                                                                    onPrint={() => handlePrintQuote(q)}
                                                                    onShare={() => handleShareQuote(q)}
                                                                    onStatus={() => handleOpenStatusModal(q)}
                                                                    onClick={() => handleViewQuote(q)}
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
                                                                                        setSelection({ ids: checked ? new Set(paginated.map((x: Quote) => x.originalId)) : new Set() })
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
                                                                    {paginated.map((q: Quote) => {
                                                                        const prefetch = getPrefetchProps(q.originalId)
                                                                        return (
                                                                            <QuoteListItem
                                                                                key={q.originalId}
                                                                                quote={q}
                                                                                columns={COLUMNS}
                                                                                selected={selection.ids.has(q.originalId)}
                                                                                onSelect={handleSelectRow}
                                                                                onEdit={handleEditQuote}
                                                                                onDuplicate={handleDuplicateQuote}
                                                                                onDelete={handleDeleteQuote}
                                                                                onPrint={handlePrintQuote}
                                                                                onShare={handleShareQuote}
                                                                                onStatus={handleOpenStatusModal}
                                                                                onClick={handleViewQuote}
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
                            </div>

                            {paginated.length > 0 && (
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                />
                            )}
                            {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
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
                onClose={() => setModals(prev => ({ ...prev, filter: false }))}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <AlertModal
                isOpen={modals.delete}
                onClose={() => setModals(prev => ({ ...prev, delete: false }))}
                onConfirm={handleConfirmDelete}
                title="Excluir Orçamento"
                description={`Tem certeza que deseja excluir o orçamento ${quoteToDelete?.displayId}? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                variant="danger"
                isLoading={isDeleting}
            />

            <AlertModal
                isOpen={confirmations.bulkDelete}
                onClose={() => setConfirmations(prev => ({ ...prev, bulkDelete: false }))}
                onConfirm={handleConfirmBulkDelete}
                title="Excluir Orçamentos"
                description={`Tem certeza que deseja excluir os ${selection.ids.size} orçamentos selecionados? Esta ação não pode ser desfeita.`}
                confirmText="Excluir Seleção"
                variant="danger"
                isLoading={isDeleting}
            />

            <BulkEditActionsModal
                isOpen={bulkEditModalOpen}
                onClose={() => setBulkEditModalOpen(false)}
                selectedCount={selection.ids.size}
                targetType="quote"
                onApply={handleBulkEditApply}
            />

            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection({ ids: new Set() })}
            >
                <Button
                    variant="ghost"
                    className="h-9 px-3 gap-2 font-bold text-brand-primary"
                    onClick={() => setBulkEditModalOpen(true)}
                >
                    <EditIcon className="w-4 h-4" />
                    Ações em massa
                </Button>
                <Button
                    variant="ghostred"
                    className="h-10 px-3"
                    leftIcon={<TrashIcon size={18} />}
                    onClick={() => setConfirmations(prev => ({ ...prev, bulkDelete: true }))}
                >
                    Excluir
                </Button>
            </FloatingActionBar>

            <SavingStatusModal isOpen={isDeleting} text="Excluindo..." />

            {printQuoteId && (
                <QuotePrintModal
                    isOpen={!!printQuoteId}
                    onClose={() => setPrintQuoteId(null)}
                    quoteId={printQuoteId}
                    partnerId={partnerId}
                />
            )}

            {showShareModal && quoteToShare && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => {
                        setShowShareModal(false)
                        setQuoteToShare(null)
                    }}
                    url={typeof window !== "undefined" ? `${window.location.origin}/quote/${quoteToShare.public_token || quoteToShare.originalId}` : ""}
                    title={`Orçamento ${quoteToShare.displayId}`}
                    shareMessage={`Confira a proposta comercial de ${partnerName}`}
                    label="Link do orçamento"
                />
            )}

            {quoteToUpdateStatus && (
                <DefaultModal
                    isOpen={!!quoteToUpdateStatus}
                    onClose={() => !isUpdatingStatus && setQuoteToUpdateStatus(null)}
                    title="Alterar status do orçamento"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => setQuoteToUpdateStatus(null)} disabled={isUpdatingStatus}>Cancelar</Button>
                            <Button onClick={handleStatusChangeSubmit} isLoading={isUpdatingStatus} disabled={pendingStatus === quoteToUpdateStatus.status}>Salvar</Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Selecione o novo status para este orçamento.</p>
                        <FormDropdown
                            label="Status"
                            value={pendingStatus}
                            setValue={setPendingStatus}
                            options={[
                                { value: 'draft', label: 'Rascunho' },
                                { value: 'sent', label: 'Enviado' },
                                { value: 'pending_client', label: 'Pendente do Cliente' },
                                { value: 'viewed', label: 'Visualizado' },
                                { value: 'approved', label: 'Aprovado' },
                                { value: 'rejected', label: 'Rejeitado' },
                                { value: 'expired', label: 'Expirado' },
                                { value: 'cancelled', label: 'Cancelado' }
                            ]}
                        />
                    </div>
                </DefaultModal>
            )}

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
        </>
    )
}
