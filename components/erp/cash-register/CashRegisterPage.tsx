"use client"

import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Badge,
    Button,
    DefaultModal,
    Input,
    MoneyInput,
    IconPlaceholder,
    SkeletonLoader,
} from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { Separator } from "@/components/reusable/Separator"
import { ArrowUpDownIcon } from "@/lib/icons"
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
    getCashSessionsHistoryAction,
    openCashSessionAction,
    getCashSessionDetailsAction,
} from "@/app/actions/erp/cash-register"

import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"

import CashRegisterPageControls from "./CashRegisterPageControls"
import CashSessionGridCard from "./CashSessionGridCard"
import CashSessionListItem from "./CashSessionListItem"
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

export default function CashRegisterPage({
    partnerId,
    initialHistory,
    initialActiveSession,
}: {
    partnerId: string
    initialHistory: SessionItem[]
    initialActiveSession: any | null
}) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const [history, setHistory] = useState<SessionItem[]>(initialHistory || [])
    const [activeSession, setActiveSession] = useState<any | null>(initialActiveSession || null)
    const [search, setSearch] = useState("")
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [page, setPage] = useState(1)
    const [viewMode, setViewModeState] = useState<"grid" | "list">(isMobile ? "grid" : "list")
    const [modals, setModals] = useState({ filter: false })
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
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
    }, [checkScroll, viewMode, history])

    useEffect(() => {
        setPage(1)
    }, [search, filters])

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
            { id: "status", title: "Status", type: "checkbox-list", options: ["Aberto", "Fechado"] },
            { id: "openedBy", title: "Quem abriu", type: "checkbox-list", options: operatorOptions },
            { id: "closedBy", title: "Quem fechou", type: "checkbox-list", options: operatorOptions },
        ],
        [operatorOptions],
    )

    const hasActiveFilters =
        filters.status.length > 0 ||
        filters.openedBy.length > 0 ||
        filters.closedBy.length > 0 ||
        isDatePeriodFilterActive(filters.dateOpenedPeriod) ||
        isDatePeriodFilterActive(filters.dateClosedPeriod)

    const isFiltered = search !== "" || hasActiveFilters

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
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
    }, [history, search, filters, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const refreshHistory = async () => {
        const result = await getCashSessionsHistoryAction(partnerId)
        if (result.success) setHistory(result.data as SessionItem[])
    }

    const handleViewDetails = async (id: string) => {
        setSelectedSessionId(id)
        setDetailedSession(null)
        setIsDetailLoading(true)
        try {
            const res = await getCashSessionDetailsAction(partnerId, id)
            if (res.success) {
                setDetailedSession(res.data)
            } else {
                notifyError(res.error || "Erro ao carregar detalhes")
                setSelectedSessionId(null)
            }
        } catch {
            notifyError("Erro de conexão ao carregar detalhes")
            setSelectedSessionId(null)
        } finally {
            setIsDetailLoading(false)
        }
    }

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
            if (rows.length === 0) {
                init.__total__ = String(Number(summary.data.expectedDrawerTotal || 0).toFixed(2))
            } else {
                for (const row of rows) {
                    const key = row.paymentMethodId || "__none__"
                    init[key] = String(Number(row.calculated ?? 0).toFixed(2))
                }
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

    const columns: { id: string; label: string; align: "left" | "center" | "right"; width?: string }[] = [
        { id: "session", label: "Sessão", align: "left", width: "250px" },
        { id: "open_date", label: "Abertura", align: "left", width: "300px" },
        { id: "close_date", label: "Fechamento", align: "left", width: "300px" },
        { id: "initial_amount", label: "Saldo Inicial", align: "left", width: "250px" },
        { id: "expected_total", label: "Saldo Final", align: "left", width: "250px" },
        { id: "status", label: "Status", align: "center", width: "120px" },
    ]

    if (selectedSessionId) {
        return (
            <CashSessionDetailPage
                partnerId={partnerId}
                details={detailedSession}
                isLoading={isDetailLoading}
                onBack={() => {
                    setSelectedSessionId(null)
                    setDetailedSession(null)
                }}
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
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Controle de Caixa
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Abertura, fechamento e auditoria de sessões do PDV.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
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
                    viewMode={viewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {paginated.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
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
                                        text: "Limpar Filtros",
                                        action: handleClearFilters,
                                        variant: "outline",
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={isTablet ? "stacked" : viewMode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                            >
                                {isTablet ? (
                                    <div className="rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                                        {paginated.map((session, index) => (
                                            <div key={session.id}>
                                                <button
                                                    type="button"
                                                    className="w-full text-left px-4 py-5 hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors"
                                                    onClick={() => handleViewDetails(session.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                    Sessão {session.id.slice(0, 8).toUpperCase()}
                                                                </h3>
                                                                <Badge variant={session.status === "open" ? "green" : "gray"} className="whitespace-nowrap">
                                                                    {session.status === "open" ? "Aberto" : "Fechado"}
                                                                </Badge>
                                                            </div>
                                                            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                Abriu: {session.opened_by_name || session.user_name}
                                                            </p>
                                                            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                Fechou: {session.closed_by_name || "-"}
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Gaveta
                                                            </p>
                                                            <p className="text-[15px] font-bold text-brand-primary">
                                                                {formatCurrency(Number(session.expected_drawer_total || 0))}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                                        <div>
                                                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Abertura
                                                            </p>
                                                            <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatDateTime(session.opened_at)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Fechamento
                                                            </p>
                                                            <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatDateTime(session.closed_at)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Saldo inicial
                                                            </p>
                                                            <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(Number(session.initial_amount || 0))}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Data da sessão
                                                            </p>
                                                            <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatShortDate(session.closed_at || session.opened_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                                {index < paginated.length - 1 && (
                                                    <Separator className="bg-brand-border dark:bg-dark-border" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : viewMode === "grid" ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
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
                                                                    className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${isFirst ? "rounded-l-lg pl-6" : ""} ${isLast ? "rounded-r-lg" : ""}`}
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
                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
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
                                                            onSelect={() => {}}
                                                            onDetails={handleViewDetails}
                                                            showCheckbox={false}
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

                {filtered.length > 0 && (
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                )}
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
                        <>
                            <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 space-y-3">
                                <SkeletonLoader className="h-4 w-36 rounded-full" />
                                <SkeletonLoader className="h-8 w-48 rounded-xl" />
                            </div>
                            <div className="space-y-3">
                                <SkeletonLoader className="h-12 w-full rounded-xl" />
                                <SkeletonLoader className="h-12 w-full rounded-xl" />
                                <SkeletonLoader className="h-12 w-full rounded-xl" />
                            </div>
                        </>
                    ) : closeSummary ? (
                        <>
                            <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Saldo calculado (gaveta)</p>
                                <p className="mt-2 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))}
                                </p>
                            </div>

                            <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 space-y-2">
                                <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    Resumo calculado
                                </p>
                                {(closeSummary.groupedByMethod || []).length > 0 ? (
                                    (closeSummary.groupedByMethod || []).map((row: any) => (
                                        <div key={row.paymentMethodId || row.label} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body">{row.label}</span>
                                            <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(Number(row.calculated ?? row.total ?? 0))}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                        Nenhum agrupamento por meio de pagamento disponível. Informe apenas o total contado.
                                    </p>
                                )}
                            </div>

                            {(closeSummary.groupedByMethod || []).length === 0 ? (
                                <MoneyInput
                                    label="Valor contado na gaveta (total)"
                                    value={Number(countedByPm.__total__ ?? closeSummary.expectedDrawerTotal ?? 0)}
                                    onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))}
                                />
                            ) : (
                                <div className="space-y-3">
                                    {(closeSummary.groupedByMethod || []).map((row: any) => {
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
                                </div>
                            )}
                        </>
                    ) : null}

                    <Input
                        label="Observações de fechamento"
                        value={closingNotes}
                        onChange={(e: any) => setClosingNotes(e.target.value)}
                    />

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={closeCloseModal}>Cancelar</Button>
                        <Button onClick={handleCloseSession} isLoading={isClosingSession} disabled={!closeSummary}>
                            Confirmar fechamento
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        </motion.div>
    )
}
