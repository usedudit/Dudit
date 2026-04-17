"use client"

import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge, Button, DefaultModal, Input, MoneyInput, Checkbox, IconPlaceholder } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { ArrowUpDownIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

import {
    closeCashSessionAction,
    getCashSessionCloseSummaryAction,
    getCashSessionsHistoryAction,
    openCashSessionAction,
    getCashSessionDetailsAction
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
    user_name: string
    opened_at: string
    closed_at: string | null
    initial_amount: number
    closing_amount: number | null
    status: "open" | "closed"
    expected_drawer_total?: number
}

const ITEMS_PER_PAGE = 8

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

    const [history, setHistory] = useState<SessionItem[]>(initialHistory || [])
    const [activeSession, setActiveSession] = useState<any | null>(initialActiveSession || null)
    
    // Controls State
    const [search, setSearch] = useState("")
    const [filters, setFilters] = useState<{ status: "all" | "open" | "closed" }>({ status: "all" })
    const [page, setPage] = useState(1)
    const [viewMode, setViewModeState] = useState<"grid" | "list">(isMobile ? "grid" : "list")
    const [selection, setSelection] = useState({ ids: new Set<string>() })

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)

    // Inline Detail State
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
    const [detailedSession, setDetailedSession] = useState<any | null>(null)
    const [isDetailLoading, setIsDetailLoading] = useState(false)

    // Modals
    const [openModal, setOpenModal] = useState(false)
    const [closeModal, setCloseModal] = useState(false)
    const [openingBalance, setOpeningBalance] = useState(0)
    const [openingNotes, setOpeningNotes] = useState("")
    const [closingNotes, setClosingNotes] = useState("")
    const [closeSummary, setCloseSummary] = useState<any | null>(null)
    const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})

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

    const isFiltered = search !== "" || filters.status !== "all"

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        let result = (history || []).filter((session) => {
            const statusMatch = filters.status === "all" || session.status === filters.status
            const searchMatch =
                !term ||
                session.user_name?.toLowerCase().includes(term) ||
                session.id.toLowerCase().includes(term)
            return statusMatch && searchMatch
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
    }, [history, search, filters.status, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const refreshHistory = async () => {
        const result = await getCashSessionsHistoryAction(partnerId)
        if (result.success) setHistory(result.data as SessionItem[])
    }

    const handleSelectRow = (id: string) => {
        setSelection(prev => {
            const s = new Set(prev.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
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
        } catch (err) {
            notifyError("Erro de conexão ao carregar detalhes")
            setSelectedSessionId(null)
        } finally {
            setIsDetailLoading(false)
        }
    }

    const handleOpenSession = async () => {
        if (openingBalance < 0) {
            notifyError("Saldo inicial inválido.")
            return
        }
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
        setOpenModal(false)
        setOpeningBalance(0)
        setOpeningNotes("")
        await refreshHistory()
    }

    const openCloseModal = async () => {
        if (!activeSession?.id) {
            notifyError("Nenhum caixa aberto.")
            return
        }
        const summary = await getCashSessionCloseSummaryAction(partnerId, activeSession.id)
        if (!summary.success) {
            notifyError(summary.error || "Não foi possível carregar o resumo de fechamento.")
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
        setCloseModal(true)
    }

    const handleCloseSession = async () => {
        if (!activeSession?.id) return
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
        setCloseModal(false)
        setCloseSummary(null)
        setCountedByPm({})
        setClosingNotes("")
        await refreshHistory()
    }

    const columns: { id: string; label: string; align: "left" | "center" | "right"; width?: string }[] = [
        { id: "session", label: "Sessão", align: "left", width: "200px" },
        { id: "open_date", label: "Abertura", align: "left" },
        { id: "close_date", label: "Fechamento", align: "left" },
        { id: "initial_amount", label: "Inicial", align: "left" },
        { id: "expected_total", label: "Líquido Estimado", align: "left" },
        { id: "status", label: "Status", align: "center", width: "120px" },
    ]

    if (selectedSessionId) {
        return (
            <div className="h-full flex flex-col pt-4">
                <CashSessionDetailPage
                    partnerId={partnerId}
                    details={detailedSession}
                    isLoading={isDetailLoading}
                    onBack={() => {
                        setSelectedSessionId(null)
                        setDetailedSession(null)
                    }}
                />
            </div>
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
                
                {/* Header */}
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
                            <Button onClick={openCloseModal}>Fechar Caixa Atual</Button>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <CashRegisterPageControls
                    search={search}
                    onSearchChange={setSearch}
                    onOpenSession={() => setOpenModal(true)}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewModeState}
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
                                        action: () => {
                                            setSearch("")
                                            setFilters({ status: "all" })
                                        },
                                        variant: "outline"
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={viewMode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                            >
                                {viewMode === 'grid' ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginated.map((session) => (
                                            <CashSessionGridCard
                                                key={session.id}
                                                session={session}
                                                selected={selection.ids.has(session.id)}
                                                onSelect={handleSelectRow}
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
                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                            <div className="flex items-center">
                                                                <Checkbox
                                                                    checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                    onChange={(checked) => {
                                                                        setSelection({ ids: checked ? new Set(paginated.map(x => x.id)) : new Set() })
                                                                    }}
                                                                    className="bg-white dark:bg-dark-background"
                                                                />
                                                            </div>
                                                        </th>
                                                        {columns.map((col, idx) => {
                                                            const isSortable = true
                                                            const isSorted = sortConfig?.key === col.id
                                                            const isLast = idx === columns.length - 1

                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${isSortable ? 'cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors' : ''} ${isLast ? 'rounded-r-lg' : ''}`}
                                                                    style={{ width: col.width }}
                                                                    onClick={() => {
                                                                        if (!isSortable) return
                                                                        setSortConfig(prev => ({
                                                                            key: col.id,
                                                                            direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                        }))
                                                                    }}
                                                                >
                                                                    <div className={`relative flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
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
                                                            selected={selection.ids.has(session.id)}
                                                            onSelect={handleSelectRow}
                                                            onDetails={handleViewDetails}
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
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                )}
            </div>

            <DefaultModal isOpen={openModal} onClose={() => setOpenModal(false)} title="Abrir caixa">
                <div className="space-y-3">
                    <MoneyInput label="Troco inicial" value={openingBalance} onChange={setOpeningBalance} />
                    <Input label="Observações" value={openingNotes} onChange={(e: any) => setOpeningNotes(e.target.value)} />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setOpenModal(false)}>Cancelar</Button>
                        <Button onClick={handleOpenSession}>Confirmar abertura</Button>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal isOpen={closeModal} onClose={() => setCloseModal(false)} title="Fechar caixa">
                <div className="space-y-3">
                    {closeSummary && (
                        <>
                            <div className="rounded-lg border border-brand-border p-3">
                                <p className="text-sm text-brand-inactive-text">Saldo calculado (gaveta)</p>
                                <p className="text-xl font-bold">{formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))}</p>
                            </div>
                            <div className="space-y-1">
                                {(closeSummary.groupedByMethod || []).map((row: any) => (
                                    <div key={row.paymentMethodId || row.label} className="flex items-center justify-between text-sm">
                                        <span>{row.label} (calculado)</span>
                                        <span className="font-semibold">{formatCurrency(Number(row.calculated ?? row.total ?? 0))}</span>
                                    </div>
                                ))}
                            </div>
                            {(closeSummary.groupedByMethod || []).length === 0 ? (
                                <MoneyInput
                                    label="Valor contado na gaveta (total)"
                                    value={Number(countedByPm.__total__ ?? closeSummary.expectedDrawerTotal ?? 0)}
                                    onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))}
                                />
                            ) : (
                                (closeSummary.groupedByMethod || []).map((row: any) => {
                                    const key = row.paymentMethodId || "__none__"
                                    return (
                                        <MoneyInput
                                            key={key}
                                            label={`Contado — ${row.label}`}
                                            value={Number(countedByPm[key] ?? row.calculated ?? 0)}
                                            onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))}
                                        />
                                    )
                                })
                            )}
                        </>
                    )}
                    <Input label="Observações de fechamento" value={closingNotes} onChange={(e: any) => setClosingNotes(e.target.value)} />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setCloseModal(false)}>Cancelar</Button>
                        <Button onClick={handleCloseSession}>Confirmar fechamento</Button>
                    </div>
                </div>
            </DefaultModal>
        </motion.div>
    )
}
