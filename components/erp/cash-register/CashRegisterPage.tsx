"use client"

import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
    Button,
    DefaultModal,
    Input,
    MoneyInput,
    IconPlaceholder,
    FormSection,
    ThreeDotsLoader,
} from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { ArrowUpDownIcon, CreditCardIcon, MoneyIcon, QRCodeIcon, ExportFileIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

import {
    closeCashSessionAction,
    getCashSessionCloseSummaryAction,
    getCashSessionsHistoryPageAction,
    openCashSessionAction,
    getCashSessionDetailsAction,
    type ERPCashSessionListCursor,
} from "@/app/actions/erp/cash-register"

import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions } from "@/lib/permission-context"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityState } from "@/hooks/use-entity-state"
import CashRegisterPageControls from "./CashRegisterPageControls"
import CashSessionGridCard from "./CashSessionGridCard"
import CashSessionListItem from "./CashSessionListRow"
import CashSessionDetailPage from "./CashSessionDetailPage"

type SessionItem = {
    id: string
    opened_by_user_id: string
    closed_by_user_id?: string | null
    user_name: string
    opened_by_name?: string
    closed_by_name?: string | null
    opened_at: string
    closed_at: string | null
    initial_amount: number
    closing_amount: number | null
    status: "open" | "closed"
    expected_drawer_total?: number
    total_received_amount?: number
}

type FilterState = {
    status: string[]
    openedBy: string[]
    closedBy: string[]
    dateOpenedPeriod: DatePeriodFilterValue
    dateClosedPeriod: DatePeriodFilterValue
}

const ITEMS_PER_PAGE = 8
const INITIAL_FILTERS: FilterState = {
    status: [],
    openedBy: [],
    closedBy: [],
    dateOpenedPeriod: { ...EMPTY_DATE_PERIOD },
    dateClosedPeriod: { ...EMPTY_DATE_PERIOD },
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "-"
    return new Date(value).toLocaleString("pt-BR")
}

function formatShortDate(value: string | null | undefined) {
    if (!value) return "-"
    return new Date(value).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    })
}

function resolvePaymentMethodVisual(row: any) {
    const type = String(row?.paymentMethodType || "").toLowerCase()
    const label = String(row?.label || "").toLowerCase()
    if (type === "cash" || label.includes("dinheiro")) {
        return { Icon: MoneyIcon }
    }
    if (type === "pix" || label.includes("pix")) {
        return { Icon: QRCodeIcon }
    }
    return { Icon: CreditCardIcon }
}

export default function CashRegisterPage({
    partnerId,
    storeId,
    initialHistory,
    initialNextCursor,
    initialHasMore,
    initialActiveSession,
    initialViewId,
}: {
    partnerId: string
    storeId?: string
    initialHistory: SessionItem[]
    initialNextCursor: ERPCashSessionListCursor | null
    initialHasMore: boolean
    initialActiveSession: any | null
    initialViewId?: string | null
}) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { planSlug } = usePermissions()
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm } = useErpExport(planSlug)
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const { state: entityState, open, close, isViewing } = useEntityState()
    const activeViewId = isViewing ? entityState.entityId : null

    useEffect(() => {
        const handleReset = () => close()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [close])

    const [activeSession, setActiveSession] = useState<any | null>(initialActiveSession || null)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [page, setPage] = useState(1)
    const [viewMode, setViewModeState] = useState<"grid" | "list">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [modals, setModals] = useState({ filter: false })
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [detailedSession, setDetailedSession] = useState<any | null>(null)
    const [isDetailLoading, setIsDetailLoading] = useState(false)
    const [openModal, setOpenModal] = useState(false)
    const [closeModal, setCloseModal] = useState(false)
    const [openingBalance, setOpeningBalance] = useState(0)
    const [openingNotes, setOpeningNotes] = useState("")
    const [closingNotes, setClosingNotes] = useState("")
    const [closeSummary, setCloseSummary] = useState<any | null>(null)
    const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})
    const [isOpeningSession, setIsOpeningSession] = useState(false)
    const [isPreparingClose, setIsPreparingClose] = useState(false)
    const [isClosingSession, setIsClosingSession] = useState(false)

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const observerTarget = useRef<HTMLDivElement>(null)
    const queryKey = useMemo(() => ["erp", "cash-sessions", partnerId, storeId] as const, [partnerId, storeId])
    const { items: history, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteList<SessionItem, ERPCashSessionListCursor>({
        queryKey,
        initialPage: { items: initialHistory || [], nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getCashSessionsHistoryPageAction(partnerId, { cursor, limit: 100, storeId })
            if (!res.success) throw new Error(res.error || "Erro ao carregar histórico do caixa.")
            return { items: res.items || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((s: any) => String(s?.id || ""), []),
    })

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
    }, [checkScroll, viewMode, history])

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters])

    useEffect(() => {
        const handleReset = () => {
            setDetailedSession(null)
        }
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [])

    // Auto-load session detail from URL ?view=id on initial mount
    useEffect(() => {
        if (initialViewId && !detailedSession) {
            handleViewDetails(initialViewId)
        }
    }, [initialViewId, detailedSession])

    const operatorOptions = useMemo(() => {
        const names = new Set<string>()
        for (const session of history || []) {
            if (session.opened_by_name) names.add(session.opened_by_name)
            if (session.closed_by_name) names.add(session.closed_by_name)
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"))
    }, [history])

    const filterSections: FilterSectionConfig[] = useMemo(
        () => [
            { id: "dateOpenedPeriod", title: "Período de abertura", type: "date-period" },
            { id: "dateClosedPeriod", title: "Período de fechamento", type: "date-period" },
            { id: "openedBy", title: "Quem abriu", type: "checkbox-list", options: operatorOptions },
            { id: "closedBy", title: "Quem fechou", type: "checkbox-list", options: operatorOptions },
        ],
        [operatorOptions],
    )

    const hasActiveFilters =
        filters.openedBy.length > 0 ||
        filters.closedBy.length > 0 ||
        isDatePeriodFilterActive(filters.dateOpenedPeriod) ||
        isDatePeriodFilterActive(filters.dateClosedPeriod)

    const isFiltered = debouncedSearch !== "" || hasActiveFilters

    const filtered = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        const statusValues = filters.status.map((value) => (value === "Aberto" ? "open" : "closed"))
        const openedBounds = resolveDatePeriodBounds(filters.dateOpenedPeriod)
        const closedBounds = resolveDatePeriodBounds(filters.dateClosedPeriod)
        const openedBoundsActive = openedBounds.startYmd !== null || openedBounds.endYmd !== null
        const closedBoundsActive = closedBounds.startYmd !== null || closedBounds.endYmd !== null

        let result = (history || []).filter((session) => {
            const openedByName = session.opened_by_name || session.user_name || ""
            const closedByName = session.closed_by_name || ""
            const openTs = session.opened_at ? new Date(session.opened_at).getTime() : Number.NaN
            const closeTs = session.closed_at ? new Date(session.closed_at).getTime() : Number.NaN
            const openYmd = Number.isNaN(openTs) ? null : msToBrazilYmd(openTs)
            const closeYmd = Number.isNaN(closeTs) ? null : msToBrazilYmd(closeTs)

            const statusMatch = statusValues.length === 0 || statusValues.includes(session.status)
            const searchMatch =
                !term ||
                session.id.toLowerCase().includes(term) ||
                session.user_name?.toLowerCase().includes(term) ||
                openedByName.toLowerCase().includes(term) ||
                closedByName.toLowerCase().includes(term)
            const openedByMatch = filters.openedBy.length === 0 || filters.openedBy.includes(openedByName)
            const closedByMatch = filters.closedBy.length === 0 || filters.closedBy.includes(closedByName)
            const openedDateMatch =
                !openedBoundsActive || ymdInBounds(openYmd, openedBounds.startYmd, openedBounds.endYmd)
            const closedDateMatch =
                !closedBoundsActive || ymdInBounds(closeYmd, closedBounds.startYmd, closedBounds.endYmd)

            return statusMatch && searchMatch && openedByMatch && closedByMatch && openedDateMatch && closedDateMatch
        })

        if (sortConfig) {
            result = [...result].sort((a: any, b: any) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]
                if (sortConfig.key === "session") {
                    aVal = a.id
                    bVal = b.id
                } else if (sortConfig.key === "open_date") {
                    aVal = new Date(a.opened_at).getTime()
                    bVal = new Date(b.opened_at).getTime()
                } else if (sortConfig.key === "close_date") {
                    aVal = a.closed_at ? new Date(a.closed_at).getTime() : 0
                    bVal = b.closed_at ? new Date(b.closed_at).getTime() : 0
                }
                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }

        return result
    }, [history, debouncedSearch, filters, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const refreshHistory = async () => {
        await refetch()
    }

    const handleViewDetails = useCallback((id: string) => {
        open("view", id)
    }, [open])

    useEffect(() => {
        if (initialViewId && !activeViewId) {
            open("view", initialViewId)
        }
    }, [initialViewId, activeViewId, open])

    useEffect(() => {
        if (!activeViewId) {
            setDetailedSession(null)
            return
        }

        let isMounted = true
        setIsDetailLoading(true)
        getCashSessionDetailsAction(partnerId, activeViewId)
            .then((res) => {
                if (isMounted) {
                    if (res.success) {
                        setDetailedSession(res.data)
                    } else {
                        notifyError(res.error || "Erro ao carregar detalhes")
                        close()
                    }
                }
            })
            .catch(() => {
                if (isMounted) {
                    notifyError("Erro de conexão ao carregar detalhes")
                    close()
                }
            })
            .finally(() => {
                if (isMounted) setIsDetailLoading(false)
            })

        return () => {
            isMounted = false
        }
    }, [partnerId, activeViewId, close, notifyError])

    const resetOpenForm = () => {
        setOpeningBalance(0)
        setOpeningNotes("")
    }

    const closeOpenModal = () => {
        setOpenModal(false)
        resetOpenForm()
    }

    const resetCloseForm = () => {
        setCloseSummary(null)
        setCountedByPm({})
        setClosingNotes("")
    }

    const closeCloseModal = () => {
        setCloseModal(false)
        resetCloseForm()
    }

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "cash-register",
            format: "xlsx",
            filters: { storeId: storeId || null, search: debouncedSearch, status: filters.status, datePeriod: filters.dateOpenedPeriod },
        })
    }, [exportData, partnerId, storeId, debouncedSearch, filters.status, filters.dateOpenedPeriod])

    const handleClearFilters = useCallback(() => {
        setSearch("")
        setFilters({
            status: [],
            openedBy: [],
            closedBy: [],
            dateOpenedPeriod: { ...EMPTY_DATE_PERIOD },
            dateClosedPeriod: { ...EMPTY_DATE_PERIOD },
        })
    }, [])

    const handleOpenSession = async () => {
        if (openingBalance < 0) {
            notifyError("Saldo inicial inválido.")
            return
        }
        setIsOpeningSession(true)
        try {
            const result = await openCashSessionAction({
                partnerId,
                initialAmount: openingBalance,
                notes: openingNotes,
            })
            if (!result.success) {
                notifyError(result.error || "Não foi possível abrir o caixa.")
                return
            }
            notifySuccess("Caixa aberto com sucesso.")
            setActiveSession(result.data)
            closeOpenModal()
            await refreshHistory()
        } finally {
            setIsOpeningSession(false)
        }
    }

    const openCloseModal = async () => {
        if (!activeSession?.id) {
            notifyError("Nenhum caixa aberto.")
            return
        }
        setCloseModal(true)
        setCloseSummary(null)
        setCountedByPm({})
        setIsPreparingClose(true)
        try {
            const summary = await getCashSessionCloseSummaryAction(partnerId, activeSession.id)
            if (!summary.success) {
                notifyError(summary.error || "Não foi possível carregar o resumo de fechamento.")
                setCloseModal(false)
                return
            }
            const rows = summary.data.groupedByMethod || []
            const init: Record<string, string> = {}
            for (const row of rows) {
                const key = row.paymentMethodId || "__none__"
                init[key] = String(Number(row.calculated ?? 0).toFixed(2))
            }
            setCountedByPm(init)
            setCloseSummary(summary.data)
        } finally {
            setIsPreparingClose(false)
        }
    }

    const handleCloseSession = async () => {
        if (!activeSession?.id || !closeSummary) return
        setIsClosingSession(true)
        try {
            const countedByMethod = Object.entries(countedByPm).map(([key, val]) => ({
                paymentMethodId: key === "__none__" || key === "__total__" ? null : key,
                amount: Number(String(val).replace(",", ".")) || 0,
            }))
            const result = await closeCashSessionAction({
                partnerId,
                cashSessionId: activeSession.id,
                notes: closingNotes,
                countedByMethod,
            })
            if (!result.success) {
                notifyError(result.error || "Não foi possível fechar o caixa.")
                return
            }
            notifySuccess("Caixa fechado com sucesso.")
            setActiveSession(null)
            closeCloseModal()
            await refreshHistory()
        } finally {
            setIsClosingSession(false)
        }
    }

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filtered.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filtered.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filtered.length])

    const columns: { id: string; label: string; align: "left" | "center" | "right"; width?: string }[] = [
        { id: "session", label: "Sessão", align: "left", width: "250px" },
        { id: "open_date", label: "Abertura", align: "left", width: "300px" },
        { id: "close_date", label: "Fechamento", align: "left", width: "300px" },
        { id: "initial_amount", label: "Saldo Inicial", align: "left", width: "250px" },
        { id: "received_total", label: "Recebido na sessão", align: "left", width: "250px" },
        { id: "expected_total", label: "Saldo Final", align: "left", width: "250px" },
        { id: "status", label: "Status", align: "center", width: "120px" }
    ]

    const groupedRows = closeSummary?.groupedByMethod || []
    const closePreview = useMemo(() => {
        if (!closeSummary) return null
        const opening = Number(closeSummary.drawer?.initial || 0)
        const deposits = Number(closeSummary.drawer?.deposits || 0)
        const withdrawals = Number(closeSummary.drawer?.withdrawals || 0)
        const refunds = Number(closeSummary.drawer?.refunds || 0)
        const expectedDrawerTotal = Number(closeSummary.expectedDrawerTotal || 0)
        const expectedCashSales = Number(closeSummary.drawer?.cashSales || 0)
        const informedCashSales = groupedRows.reduce((acc: number, row: any) => {
            const key = row.paymentMethodId || "__none__"
            const raw = Number(String(countedByPm[key] ?? row.calculated ?? 0).replace(",", "."))
            const value = Number.isFinite(raw) ? raw : 0
            const type = String(row.paymentMethodType || "").toLowerCase()
            const isCash = type === "cash" || (!row.paymentMethodId && type !== "pix")
            return isCash ? acc + value : acc
        }, 0)
        const informedDrawerTotal = opening + informedCashSales + deposits - withdrawals - refunds
        return {
            opening,
            expectedCashSales,
            expectedDrawerTotal,
            informedDrawerTotal,
            difference: informedDrawerTotal - expectedDrawerTotal,
        }
    }, [closeSummary, groupedRows, countedByPm])

    return (
        <>
            <AnimatePresence mode="wait">
                {isViewing && activeViewId ? (
                    <CashSessionDetailPage
                        key="detail"
                        partnerId={partnerId}
                        details={detailedSession}
                        isLoading={isDetailLoading}
                        onBack={() => close()}
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
                                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                        Controle de Caixa
                                    </h1>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Abertura, fechamento e auditoria de sessões do PDV.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                                        {isExporting ? "Exportando..." : "Exportar"}
                                    </Button>
                                    {!activeSession?.id ? (
                                        <Button onClick={() => setOpenModal(true)}>Abrir Caixa</Button>
                                    ) : (
                                        <Button onClick={openCloseModal} isLoading={isPreparingClose}>
                                            Fechar Caixa Atual
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="md:hidden px-4 mb-4">
                                {!activeSession?.id ? (
                                    <Button onClick={() => setOpenModal(true)} className="w-full">
                                        Abrir Caixa
                                    </Button>
                                ) : (
                                    <Button onClick={openCloseModal} isLoading={isPreparingClose} className="w-full">
                                        Fechar Caixa Atual
                                    </Button>
                                )}
                            </div>

                            <CashRegisterPageControls
                                search={search}
                                onSearchChange={setSearch}
                                onOpenFilter={() => setModals((prev) => ({ ...prev, filter: true }))}
                                onOpenSession={() => setOpenModal(true)}
                                filters={filters}
                                setFilters={setFilters}
                                viewMode={effectiveViewMode}
                                onViewModeChange={setViewModeState}
                                hasActiveFilters={hasActiveFilters}
                            />

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {paginated.length === 0 ? (
                                        <FadeIn
                                            key="empty"
                                            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                        >
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc={isFiltered ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/PDV.png"}
                                                imageAlt="Sem sessões"
                                                title={isFiltered ? "Nenhuma sessão encontrada" : "Caixa nunca utilizado"}
                                                subtitle={isFiltered ? "Tente ajustar seus filtros ou termos de busca." : "Abra seu primeiro caixa para começar a vender no PDV."}
                                                itemButton={!isFiltered ? {
                                                    text: "Abrir Caixa",
                                                    action: () => setOpenModal(true),
                                                } : {
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline",
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <FadeIn
                                            key={effectiveViewMode}
                                            className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                                        >
                                            {effectiveViewMode === "grid" ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                    {paginated.map((session) => (
                                                        <CashSessionGridCard
                                                            key={session.id}
                                                            session={session}
                                                            onDetails={handleViewDetails}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="w-full overflow-hidden rounded-xl relative">
                                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    {columns.map((col, idx) => {
                                                                        const isSorted = sortConfig?.key === col.id
                                                                        const isLast = idx === columns.length - 1
                                                                        const isFirst = idx === 0

                                                                        return (
                                                                            <th
                                                                                key={col.id}
                                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${isFirst ? "rounded-l-lg pl-6" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                                style={{ width: col.width }}
                                                                                onClick={() => {
                                                                                    setSortConfig((prev) => ({
                                                                                        key: col.id,
                                                                                        direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                                    }))
                                                                                }}
                                                                            >
                                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                    <span>{col.label}</span>
                                                                                    <div className="ml-1.5 w-4 shrink-0 flex items-center justify-center">
                                                                                        <ArrowUpDownIcon
                                                                                            size={14}
                                                                                            className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </th>
                                                                        )
                                                                    })}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginated.map((session) => (
                                                                    <CashSessionListItem
                                                                        key={session.id}
                                                                        session={session}
                                                                        columns={columns}
                                                                        selected={false}
                                                                        onSelect={() => { }}
                                                                        onDetails={handleViewDetails}
                                                                        showCheckbox={false}
                                                                    />
                                                                ))}
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

                            {filtered.length > 0 && (
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

                        <FilterSheet
                            isOpen={modals.filter}
                            onClose={() => setModals((prev) => ({ ...prev, filter: false }))}
                            sections={filterSections}
                            filters={filters}
                            setFilters={setFilters}
                            onClear={handleClearFilters}
                        />

                        <DefaultModal isOpen={openModal} onClose={closeOpenModal} title="Abrir caixa">
                            <div className="space-y-3">
                                <MoneyInput label="Troco inicial" value={openingBalance} onChange={setOpeningBalance} />
                                <Input label="Observações" value={openingNotes} onChange={(e: any) => setOpeningNotes(e.target.value)} />
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={closeOpenModal}>Cancelar</Button>
                                    <Button onClick={handleOpenSession} isLoading={isOpeningSession}>Confirmar abertura</Button>
                                </div>
                            </div>
                        </DefaultModal>

                        <DefaultModal isOpen={closeModal} onClose={closeCloseModal} title="Fechar caixa">
                            <div className="space-y-4">
                                {isPreparingClose && !closeSummary ? (
                                    <ThreeDotsLoader />
                                ) : closeSummary ? (
                                    <>
                                        {closePreview ? (
                                            <FormSection title="Saldo na gaveta">
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <div className="rounded-xl bg-brand-gray dark:bg-dark-border/30 px-3 py-2">
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Saldo de abertura</p>
                                                        <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(closePreview.opening)}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-xl bg-brand-gray dark:bg-dark-border/30 px-3 py-2">
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Vendas em dinheiro</p>
                                                        <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(closePreview.expectedCashSales)}
                                                        </p>
                                                    </div>
                                                    <div className="rounded-xl bg-brand-gray dark:bg-dark-border/30 px-3 py-2">
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Saldo esperado na gaveta</p>
                                                        <p className="mt-1 text-sm font-semibold text-brand-primary">
                                                            {formatCurrency(closePreview.expectedDrawerTotal)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-brand-gray dark:bg-dark-border/30 px-3 py-2">
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">Saldo informado com a contagem</p>
                                                    <div className="mt-1 flex items-center justify-between gap-3">
                                                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(closePreview.informedDrawerTotal)}
                                                        </p>
                                                        <p className={`text-sm font-bold ${closePreview.difference === 0 ? "text-brand-green" : "text-brand-orange"}`}>
                                                            Diferença: {formatCurrency(closePreview.difference)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </FormSection>
                                        ) : null}

                                        <FormSection title="Resumo calculado" hasSeparator className="mb-8">
                                            {groupedRows.length > 0 ? (
                                                groupedRows.map((row: any) => {
                                                    const visual = resolvePaymentMethodVisual(row)
                                                    return (
                                                        <div key={row.paymentMethodId || row.label} className="w-full rounded-2xl bg-brand-gray/80 dark:bg-dark-border/20 p-3 flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-9 h-9 rounded-full bg-brand-slate dark:bg-dark-border/50 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                    <visual.Icon className="w-5 h-5" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">{row.label}</p>
                                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">Calculado no período</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading shrink-0">
                                                                {formatCurrency(Number(row.calculated ?? row.total ?? 0))}
                                                            </span>
                                                        </div>
                                                    )
                                                })
                                            ) : (
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                    Nenhuma venda no período desta sessão.
                                                </p>
                                            )}
                                        </FormSection>

                                        {groupedRows.length === 0 ? (
                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                Sem formas de pagamento para conferência nesta sessão.
                                            </p>
                                        ) : (
                                            <FormSection title="Contagem de dinheiro no caixa" hasSeparator>
                                                {groupedRows.filter((row: any) => {
                                                    const type = String(row.paymentMethodType || "").toLowerCase()
                                                    const label = String(row.label || "").toLowerCase()
                                                    return type === "cash" || label.includes("dinheiro")
                                                }).map((row: any) => {
                                                    const key = row.paymentMethodId || "__none__"
                                                    return (
                                                        <MoneyInput
                                                            key={key}
                                                            label={`Contado - ${row.label}`}
                                                            value={Number(countedByPm[key] ?? row.calculated ?? 0)}
                                                            onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))}
                                                        />
                                                    )
                                                })}
                                            </FormSection>
                                        )}
                                    </>
                                ) : null}

                                <Input
                                    label="Observações de fechamento"
                                    value={closingNotes}
                                    onChange={(e: any) => setClosingNotes(e.target.value)}
                                    maxLength={500}
                                    showCharacterCount
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" onClick={closeCloseModal}>Cancelar</Button>
                                    <Button id="cash-close-submit" onClick={handleCloseSession} isLoading={isClosingSession}>
                                        Confirmar fechamento
                                    </Button>
                                </div>
                            </div>
                        </DefaultModal>
                    </FadeIn>
                )}
            </AnimatePresence>

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />
        </>
    )
}
