"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useStore } from "@/lib/store-context"

// Components
import { Button, IconPlaceholder, AlertModal, Badge, Checkbox, BadgeVariant } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils";
import QuoteSkeleton from "./QuoteSkeleton"
import { deleteQuoteAction, batchDeleteQuotesAction, batchUpdateQuotesStatusAction } from "@/app/actions/erp/quotes"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import Pagination from "@/components/reusable/Pagination"
import QuoteListItem from "./QuoteListItem"
import QuoteGridCard from "./QuoteGridCard"
import QuotePageControls from "./QuotePageControls"
import CreateQuote from "./CreateQuote"
import QuoteDetail from "./QuoteDetail"
import { useNotification } from "@/hooks/use-notification"
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
    ClockIcon
} from "@/lib/icons"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getERPQuotesPageAction, type ERPQuoteListCursor } from "@/app/actions/erp/quotes"

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
}: {
    quotes: any[]
    initialNextCursor: ERPQuoteListCursor | null
    initialHasMore: boolean
    partnerId: string
}) {
    const { success, error } = useNotification()
    const debouncedRefresh = useDebouncedRefresh()
    const { isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const queryKey = useMemo(() => ["erp", "quotes", partnerId] as const, [partnerId])
    const observerTarget = useRef<HTMLDivElement>(null)

    const {
        items: loadedQuotes,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteList<any, ERPQuoteListCursor>({
        queryKey,
        initialPage: { items: rawQuotes, nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getERPQuotesPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar orçamentos.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (q) => String(q?.id || ""),
    })

    // Local state for instant updates (optimistic delete etc.)
    const [currentQuotes, setCurrentQuotes] = useState<any[]>(loadedQuotes)
    const prevQuotesRef = useRef<any[]>(loadedQuotes)
    useEffect(() => {
        if (prevQuotesRef.current !== loadedQuotes) {
            setCurrentQuotes(loadedQuotes)
            prevQuotesRef.current = loadedQuotes
        }
    }, [loadedQuotes])

    useEffect(() => {
        const handleReset = () => {
            setWrapperMode(null)
            setActiveQuote(null)
        }
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [])

    useEffect(() => {
        const handleReset = () => {
            setWrapperMode(null)
            setActiveQuote(null)
        }
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [])

    // State
    const [wrapperMode, setWrapperMode] = useState<'create' | 'edit' | 'duplicate' | 'view' | null>(null)
    const [activeQuote, setActiveQuote] = useState<any>(null)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"Todos" | "Enviados" | "Aprovados" | "Rejeitados" | "Expirados">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false, delete: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [isDeleting, setIsDeleting] = useState(false)
    const [quoteToDelete, setQuoteToDelete] = useState<any>(null)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
    const [confirmations, setConfirmations] = useState({ bulkDelete: false })

    const isLoading = storeLoading && rawQuotes === undefined
    const itemsPerPage = 8

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(t)
    }, [search])

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
                    approved: { label: "Aprovado", color: "green", icon: null },
                    rejected: { label: "Rejeitado", color: "red", icon: null },
                    expired: { label: "Expirado", color: "orange", icon: <ClockIcon size={12} /> },
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
                    user_profiles: q.user_profiles
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
                if (activeTab === "Enviados") tabMatch = q.status === "sent"
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

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const hasActiveFilters =
        filters.status.length > 0 ||
        isDatePeriodFilterActive(filters.issuePeriod) ||
        debouncedSearch.length > 0
    const hasQuotes = (currentQuotes?.length || 0) > 0

    // Handlers
    const handleAddQuote = useCallback(() => {
        setWrapperMode('create')
        setActiveQuote(null)
    }, [])

    const handleViewQuote = useCallback((quote: any) => {
        const rawQuote = currentQuotes.find((q: any) => q.id === (quote.originalId || quote.id))
        setActiveQuote(rawQuote)
        setWrapperMode('view')
    }, [currentQuotes])

    const handleEditQuote = useCallback((quote: any) => {
        const rawQuote = currentQuotes.find((q: any) => q.id === (quote.originalId || quote.id))
        setActiveQuote(rawQuote)
        setWrapperMode('edit')
    }, [currentQuotes])

    const handleDuplicateQuote = useCallback((quote: any) => {
        const rawQuote = currentQuotes.find((q: any) => q.id === (quote.originalId || quote.id))
        setActiveQuote(rawQuote)
        setWrapperMode('duplicate')
    }, [currentQuotes])

    const handleDeleteQuote = useCallback((quote: any) => {
        setQuoteToDelete(quote)
        setModals(prev => ({ ...prev, delete: true }))
    }, [])

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
                debouncedRefresh()
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
                debouncedRefresh()
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
                debouncedRefresh()
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
    }, [])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })



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

            <AnimatePresence mode="wait">
                {wrapperMode === 'view' && activeQuote ? (
                    <motion.div
                        key="view-quote"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full"
                    >
                        <QuoteDetail
                            partnerId={partnerId}
                            quoteId={activeQuote.id}
                            onBack={() => {
                                setWrapperMode(null)
                                setActiveQuote(null)
                            }}
                            onEditQuote={handleEditQuote}
                            initialQuote={activeQuote}
                        />
                    </motion.div>
                ) : wrapperMode !== null ? (
                    <motion.div
                        key="create-quote"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full"
                    >
                        <CreateQuote
                            partnerId={partnerId}
                            existingQuote={activeQuote}
                            mode={wrapperMode}
                            onBack={() => {
                                setWrapperMode(null)
                                setActiveQuote(null)
                            }}
                        />
                    </motion.div>
                ) : (

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
                                <Button variant="outline" onClick={() => { }}>
                                    <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
                                </Button>

                                <Button onClick={handleAddQuote}>
                                    <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                                    Novo Orçamento
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
                                onExport={() => { }}
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
                                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <QuoteSkeleton count={5} viewMode={viewMode} />
                                    </motion.div>
                                ) : !hasQuotes ? (
                                    <motion.div
                                        key="empty-no-data"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                    >
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/Orcamentos.png"
                                            imageAlt="Sem orçamentos"
                                            title="Você ainda não tem orçamentos"
                                            subtitle="Seus orçamentos aparecerão aqui assim que você criá-los."
                                        />
                                    </motion.div>
                                ) : paginated.length === 0 ? (
                                    <motion.div
                                        key="empty-results"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                    >
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                            imageAlt="Nenhum orçamento encontrado"
                                            title="Nenhum orçamento encontrado"
                                            subtitle="Tente ajustar seus filtros ou termos de busca."
                                            itemButton={{
                                                text: "Limpar Filtros",
                                                action: handleClearFilters,
                                                variant: "outline"
                                            }}
                                        />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key={activeTab + viewMode}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="w-full"
                                    >
                                        {isTablet ? (
                                            <div className="flex flex-col w-full">
                                                {paginated.map((q: Quote, idx) => (
                                                    <React.Fragment key={q.originalId}>
                                                        <div
                                                            className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer flex items-center gap-4"
                                                            onClick={() => handleViewQuote(q)}
                                                        >
                                                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                                <div className="flex justify-between items-start">
                                                                    <div className="flex flex-col min-w-0 pr-1">
                                                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                            {q.displayId}
                                                                        </h3>
                                                                        <span className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                                                                            {q.customer_name} • {q.formattedIssueDate}
                                                                        </span>
                                                                    </div>
                                                                    <Badge variant={q.statusColor} icon={q.statusIcon ?? undefined} className="shrink-0 text-[10px] h-5 px-1.5">
                                                                        {q.statusLabel}
                                                                    </Badge>
                                                                </div>
                                                                <div className="flex justify-between items-center mt-1">
                                                                    <span className="text-[14px] font-bold text-brand-primary">
                                                                        {formatCurrency(q.total_amount)}
                                                                    </span>
                                                                    <div className="flex items-center gap-4">
                                                                        <div onClick={(e) => { e.stopPropagation(); handleSelectRow(q.originalId); }}>
                                                                            <Checkbox checked={selection.ids.has(q.originalId)} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        ) : viewMode === "grid" ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                {paginated.map((q: Quote) => (
                                                    <QuoteGridCard
                                                        key={q.originalId}
                                                        quote={q}
                                                        selected={selection.ids.has(q.originalId)}
                                                        onSelect={() => handleSelectRow(q.originalId)}
                                                        onEdit={() => handleEditQuote(q)}
                                                        onDuplicate={() => handleDuplicateQuote(q)}
                                                        onDelete={() => handleDeleteQuote(q)}
                                                        onClick={() => handleViewQuote(q)}
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
                                                            {paginated.map((q: Quote) => (
                                                                <QuoteListItem
                                                                    key={q.originalId}
                                                                    quote={q}
                                                                    columns={COLUMNS}
                                                                    selected={selection.ids.has(q.originalId)}
                                                                    onSelect={handleSelectRow}
                                                                    onEdit={handleEditQuote}
                                                                    onDuplicate={handleDuplicateQuote}
                                                                    onDelete={handleDeleteQuote}
                                                                    onClick={handleViewQuote}
                                                                />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
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
                    variant="ghost"
                    className="h-9 px-3 gap-2 font-bold text-brand-red"
                    onClick={() => setConfirmations(prev => ({ ...prev, bulkDelete: true }))}
                >
                    <TrashIcon className="w-4 h-4" />
                    Excluir
                </Button>
            </FloatingActionBar>
        </motion.div>
    )
}
