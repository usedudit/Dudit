"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ActionsDropdown, Badge, Button, DefaultModal, DropdownItem, InfoCard, Input, MoneyInput, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { closeCashSessionAction, createCashMovementAction, getCashSessionCloseSummaryAction, getCashSessionDetailsAction, reverseCashMovementAction } from "@/app/actions/erp/cash-register"
import { useNotification } from "@/hooks/use-notification"
import { ChevronLeftIcon, MoneyIcon, CreditCardIcon, QRCodeIcon, MoreHorizontalIcon, ArrowUpDownIcon, ArrowDownIcon, ArrowUpIcon, EyeIcon, ReturnIcon, CheckCircleIcon } from "@/lib/icons"
import OrderListItem from "@/components/erp/orders/OrderListRow"

type DetailPayload = {
    session: any
    movements: any[]
    operators: { open_name: string; close_name: string | null }
    drawer: { initial: number; cashSales: number; deposits: number; withdrawals: number; refunds: number; total: number }
    summaryByPaymentMethod: Array<{ paymentMethodId: string | null; label: string; calculated: number; counted: number | null; difference: number | null }>
    totals: { initial: number; totalCashSales: number; totalSalesAllMethods?: number; totalWithdrawals: number; totalDeposits: number; totalRefunds: number; calculatedDrawerTotal: number; informedDrawerTotal: number | null; difference: number | null }
    adjustmentMovementCount: number
}

const MOVEMENT_COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Movimentação", align: "left", width: "260px" },
    { id: "total", label: "Valor", align: "left", width: "180px" },
    { id: "status", label: "Status", align: "left", width: "240px" },
    { id: "date", label: "Data", align: "left", width: "220px" },
    { id: "actions", label: "Ações", align: "center", width: "120px" },
]

const formatShortDateTime = (iso: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às")
    } catch { return iso }
}

const formatLongDateTime = (iso: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch { return iso }
}

const getDifferenceTone = (value: number | null) => value == null ? "text-brand-dark dark:text-dark-heading" : value > 0 ? "text-brand-green" : value < 0 ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"

export default function CashSessionDetailPage({ partnerId, details: initialDetails, isLoading, onBack }: { partnerId: string; details: DetailPayload | null; isLoading?: boolean; onBack?: () => void }) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [details, setDetails] = useState<DetailPayload | null>(initialDetails)
    const [activeTab, setActiveTab] = useState<"summary" | "movements" | "returns">("summary")

    const handleBack = useCallback(() => onBack?.(), [onBack])
    const session = details?.session
    const isOpen = session?.status === "open"
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [closeOpen, setCloseOpen] = useState(false)
    const [closeSummary, setCloseSummary] = useState<any>(null)
    const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})
    const [closingNotes, setClosingNotes] = useState("")
    const [isClosing, setIsClosing] = useState(false)
    const [isPreparingClose, setIsPreparingClose] = useState(false)
    const [movModal, setMovModal] = useState<null | "withdrawal" | "deposit">(null)
    const [movAmount, setMovAmount] = useState(0)
    const [movDesc, setMovDesc] = useState("")
    const [isSavingMovement, setIsSavingMovement] = useState(false)
    const [movementsSortConfig, setMovementsSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "date", direction: "desc" })
    const [detailMovement, setDetailMovement] = useState<any | null>(null)
    const movementsTableRef = useRef<HTMLDivElement>(null)
    const [movementsScroll, setMovementsScroll] = useState({ left: false, right: false })

    const checkMovementsScroll = useCallback(() => {
        const el = movementsTableRef.current
        if (!el) return
        const { scrollLeft, scrollWidth, clientWidth } = el
        setMovementsScroll({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const sangriasReforcos = useMemo(() => (details?.movements || []).filter((m) => m.type === "withdrawal" || m.type === "deposit"), [details])
    const movementRows = useMemo(() => {
        const rows = [...sangriasReforcos]
        const mapped = rows.map((m) => {
            const reversed = !!m.reversed_at
            const isDeposit = m.type === "deposit"
            return {
                ...m,
                originalId: m.id,
                displayId: isDeposit ? "Reforço" : "Sangria",
                creator_subtitle: m.creator_name ? `Por ${m.creator_name}` : "-",
                items_count: 1,
                total_amount: Number(m.amount || 0),
                statusLabel: reversed ? "Estornado" : "Concluída",
                statusColor: reversed ? "gray" : "green",
                deliveryStatusLabel: m.creator_name || "Sem responsável",
                deliveryStatusColor: "gray",
                formattedDate: formatShortDateTime(m.created_at),
                formattedTime: "",
                created_at_time: new Date(m.created_at).getTime(),
                situation: reversed ? "cancelled" : "open",
            }
        })
        mapped.sort((a, b) => {
            let aVal: any
            let bVal: any
            switch (movementsSortConfig.key) {
                case "order_id": aVal = a.displayId; bVal = b.displayId; break
                case "total": aVal = a.total_amount; bVal = b.total_amount; break
                case "status": aVal = a.statusLabel; bVal = b.statusLabel; break
                case "date":
                default:
                    aVal = a.created_at_time; bVal = b.created_at_time; break
            }
            if (aVal === bVal) return 0
            const comparison = aVal < bVal ? -1 : 1
            return movementsSortConfig.direction === "asc" ? comparison : -comparison
        })
        return mapped
    }, [sangriasReforcos, movementsSortConfig])
    const paymentMethodTotal = useMemo(() => (details?.summaryByPaymentMethod || []).reduce((acc, row) => acc + Number(row.calculated || 0), 0), [details])
    const countedTotal = useMemo(() => {
        if (!details) return null
        const rows = details.summaryByPaymentMethod || []
        if (!rows.some((row) => row.counted != null)) return null
        return rows.reduce((acc, row) => acc + Number(row.counted || 0), 0)
    }, [details])
    const differenceTotal = useMemo(() => {
        if (!details) return null
        const rows = details.summaryByPaymentMethod || []
        if (!rows.some((row) => row.difference != null)) return null
        return rows.reduce((acc, row) => acc + Number(row.difference || 0), 0)
    }, [details])

    const refresh = useCallback(async () => {
        if (!session?.id) return
        const res = await getCashSessionDetailsAction(partnerId, session.id)
        if (res.success) setDetails(res.data as DetailPayload)
    }, [partnerId, session?.id])

    const resetCloseForm = useCallback(() => {
        setCloseSummary(null)
        setCountedByPm({})
        setClosingNotes("")
    }, [])

    const closeCloseModal = useCallback(() => {
        setCloseOpen(false)
        resetCloseForm()
    }, [resetCloseForm])

    const resetMovementForm = useCallback(() => {
        setMovAmount(0)
        setMovDesc("")
    }, [])

    const closeMovementModal = useCallback(() => {
        setMovModal(null)
        resetMovementForm()
    }, [resetMovementForm])

    useEffect(() => setDetails(initialDetails), [initialDetails])

    useEffect(() => {
        checkMovementsScroll()
        window.addEventListener("resize", checkMovementsScroll)
        return () => window.removeEventListener("resize", checkMovementsScroll)
    }, [checkMovementsScroll, sangriasReforcos.length, activeTab])

    useEffect(() => {
        if (!isOpen || !closeOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                document.getElementById("cash-close-submit")?.click()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [isOpen, closeOpen])

    if (isLoading || !details || !session) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface min-h-[400px]"><ThreeDotsLoader /></div>

    const openCloseModal = async () => {
        setIsPreparingClose(true)
        try {
            const sum = await getCashSessionCloseSummaryAction(partnerId, session.id)
            if (!sum.success) return notifyError(sum.error || "Não foi possí­vel carregar o resumo.")
            const init: Record<string, string> = {}
            const rows = sum.data.groupedByMethod || []
            if (rows.length === 0) init.__total__ = String(Number(sum.data.expectedDrawerTotal || 0).toFixed(2))
            else for (const row of rows) init[row.paymentMethodId || "__none__"] = String(Number(row.calculated ?? 0).toFixed(2))
            setCloseSummary(sum.data)
            setCountedByPm(init)
            setCloseOpen(true)
        } finally {
            setIsPreparingClose(false)
        }
    }

    const handleClose = async () => {
        setIsClosing(true)
        try {
            const countedByMethod = Object.entries(countedByPm).map(([key, val]) => ({ paymentMethodId: key === "__none__" || key === "__total__" ? null : key, amount: Number(String(val).replace(",", ".")) || 0 }))
            const res = await closeCashSessionAction({ partnerId, cashSessionId: session.id, countedByMethod, notes: closingNotes })
            if (!res.success) return notifyError(res.error || "Falha ao fechar.")
            notifySuccess("Caixa fechado.")
            closeCloseModal()
            await refresh()
        } finally { setIsClosing(false) }
    }

    const handleMovement = async () => {
        if (!movModal) return
        setIsSavingMovement(true)
        try {
            const res = await createCashMovementAction({ partnerId, cashSessionId: session.id, type: movModal, amount: movAmount, description: movDesc })
            if (!res.success) return notifyError(res.error || "Falha ao registrar.")
            notifySuccess(movModal === "withdrawal" ? "Sangria registrada." : "Reforço registrado.")
            closeMovementModal()
            await refresh()
        } finally {
            setIsSavingMovement(false)
        }
    }

    const handleReverse = async (movementId: string) => {
        const res = await reverseCashMovementAction({ partnerId, movementId })
        if (!res.success) return notifyError(res.error || "Não foi possível estornar.")
        notifySuccess("Movimentação estornada.")
        await refresh()
    }

    const movementModalTitle = movModal === "withdrawal" ? "Registrar sangria" : movModal === "deposit" ? "Registrar reforço" : "Movimentação de caixa"

    return (
        <FadeIn>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Caixa {session.id.slice(0, 8).toUpperCase()}</span>
                                        <Badge variant={isOpen ? "green" : "gray"}>{isOpen ? "Aberto" : "Fechado"}</Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Aberto em {formatLongDateTime(session.opened_at)} - {details.operators.open_name}
                                    </div>
                                </div>
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    {isOpen && (
                                        <>
                                            <ActionsDropdown
                                                trigger={
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                                                        aria-label="Mais opções de caixa"
                                                    >
                                                        <MoreHorizontalIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-heading" />
                                                    </Button>
                                                }
                                            >
                                                <DropdownItem onClick={() => setMovModal("deposit")}>
                                                    <ArrowDownIcon className="w-4 h-4 shrink-0" /> Novo reforço
                                                </DropdownItem>
                                                <DropdownItem onClick={() => setMovModal("withdrawal")}>
                                                    <ArrowUpIcon className="w-4 h-4 shrink-0" /> Nova sangria
                                                </DropdownItem>
                                            </ActionsDropdown>
                                            <Button onClick={openCloseModal} className="whitespace-nowrap" isLoading={isPreparingClose}>
                                                Fechar caixa
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"} pt-4 md:pt-0 flex items-center`}>
                                {onBack && <div className="md:hidden mr-4"><button onClick={handleBack} className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-gray-200 dark:border-dark-border"><ChevronLeftIcon className="w-4 h-4" /></button></div>}
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="summary">Resumo</TabsTrigger>
                                    <TabsTrigger value="movements" badge={<span className="text-xs text-brand-inactive-text">{String(sangriasReforcos.length).padStart(2, "0")}</span>}>Sangrias e reforços</TabsTrigger>
                                    <TabsTrigger value="returns">Devoluções</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>
                    <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                        <TabsContent value="summary" className="mt-0">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                        <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Operador da abertura:</span>
                                                    <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">{details.operators.open_name}</div>
                                                </div>
                                                <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Status atual: <strong className="text-brand-dark dark:text-dark-heading">{isOpen ? "Caixa aberto" : "Caixa fechado"}</strong></div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-200 dark:divide-dark-border bg-white dark:bg-dark-surface">
                                            <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Troco inicial</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.initial)}</div></div>
                                            <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Vendas na sessão (todos os meios)</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalSalesAllMethods ?? details.totals.totalCashSales)}</div></div>
                                            <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Sangrias</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalWithdrawals)}</div></div>
                                            <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Reforços</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalDeposits)}</div></div>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Resumo por forma de recebimento</h3>
                                        <div className="flex flex-col">
                                            {(details.summaryByPaymentMethod || []).map((row) => {
                                                const lowerLabel = row.label.toLowerCase()
                                                let Icon = MoreHorizontalIcon
                                                if (lowerLabel.includes("dinheiro")) Icon = MoneyIcon
                                                if (lowerLabel.includes("cartão") || lowerLabel.includes("cartao")) Icon = CreditCardIcon
                                                if (lowerLabel.includes("pix")) Icon = QRCodeIcon

                                                return (
                                                    <div key={row.paymentMethodId || row.label} className="py-4 flex items-center gap-4 border-b border-brand-border dark:border-dark-border last:border-none">
                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                            <Icon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                {row.label}
                                                            </h3>
                                                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                Recebimentos no PDV
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-6 ml-3 shrink-0">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xs font-bold text-brand-inactive-text mb-1">Registrado</span>
                                                                <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(row.calculated)}</span>
                                                            </div>

                                                            {!isOpen && (
                                                                <>
                                                                    <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                        <span className="text-xs font-bold text-brand-inactive-text mb-1">Informado</span>
                                                                        <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{row.counted != null ? formatCurrency(row.counted) : "-"}</span>
                                                                    </div>

                                                                    <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                        <span className="text-xs font-bold text-brand-inactive-text mb-1">Diferença</span>
                                                                        <span className={`text-[15px] font-bold ${getDifferenceTone(row.difference)}`}>{row.difference != null ? formatCurrency(row.difference) : "-"}</span>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}

                                            {(details.summaryByPaymentMethod || []).length === 0 && (
                                                <div className="text-center p-8 border border-dashed border-brand-border dark:border-dark-border rounded-2xl">
                                                    <span className="text-brand-inactive-text text-sm font-medium">Nenhuma venda registrada nesta sessão.</span>
                                                </div>
                                            )}

                                            <div className="py-4 flex items-center gap-4 mt-2">
                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                    <MoreHorizontalIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                        Total
                                                    </h3>
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                        Soma de todos os métodos
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-6 ml-3 shrink-0">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[15px] font-black text-brand-dark dark:text-dark-heading">{formatCurrency(paymentMethodTotal)}</span>
                                                    </div>
                                                    {!isOpen && (
                                                        <>
                                                            <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                <span className="text-[15px] font-black text-brand-dark dark:text-dark-heading">{countedTotal != null ? formatCurrency(countedTotal) : "-"}</span>
                                                            </div>
                                                            <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                <span className={`text-[15px] font-black ${getDifferenceTone(differenceTotal)}`}>{differenceTotal != null ? formatCurrency(differenceTotal) : "-"}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                    <InfoCard title={isOpen ? "Caixa em operação" : "Caixa encerrado"} message={isOpen ? `Sessão aberta em ${formatLongDateTime(session.opened_at)} por ${details.operators.open_name}.` : `Sessão encerrada em ${session.closed_at ? formatLongDateTime(session.closed_at) : "-"} por ${details.operators.close_name || "Não informado"}.`} color={isOpen ? "green" : "orange"} />
                                    {!isOpen && details.totals.difference != null && <InfoCard title="Conferência do fechamento" message={`Valor informado: ${details.totals.informedDrawerTotal != null ? formatCurrency(details.totals.informedDrawerTotal) : "-"}
Diferença final: ${formatCurrency(details.totals.difference)}`} color={details.totals.difference === 0 ? "green" : "orange"} />}
                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                                        <div className="p-5 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30"><h3 className="font-bold text-brand-dark dark:text-dark-heading">Dados da sessão</h3></div>
                                        <div className="p-5 space-y-4 bg-white dark:bg-dark-surface">
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Abertura</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatLongDateTime(session.opened_at)}</span></div>
                                            {!isOpen && <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Fechamento</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{session.closed_at ? formatLongDateTime(session.closed_at) : "-"}</span></div>}
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo calculado</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.calculatedDrawerTotal)}</span></div>
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Devoluções</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalRefunds)}</span></div>
                                            <div className="pt-3 border-t border-brand-border dark:border-dark-border space-y-3">
                                                <button type="button" className="text-left text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline" onClick={() => notifyError("Reimpressão em breve.")}>{isOpen ? "Reimprimir cupom de abertura" : "Reimprimir cupom de fechamento"}</button>
                                                <Link href="/erp/transactions" className="block text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline">Ver relatório de movimentação do caixa</Link>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="movements" className="mt-0">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <div className="lg:hidden flex flex-col border-b border-brand-border dark:border-dark-border">
                                        {movementRows.map((m: any) => (
                                            <button
                                                type="button"
                                                key={m.originalId}
                                                className="py-5 flex items-start gap-4 border-b border-gray-50 dark:border-dark-border/50 last:border-none text-left w-full bg-transparent"
                                                onClick={() => setDetailMovement(m)}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-3 mb-0.5">
                                                        <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">{m.displayId}</h3>
                                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                                            <Badge variant={m.statusColor}>{m.statusLabel}</Badge>
                                                            {isOpen && !m.reversed_at ? (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    className="h-8"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleReverse(m.originalId)
                                                                    }}
                                                                >
                                                                    Estornar
                                                                </Button>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate mb-1">{m.formattedDate}</div>
                                                    <div className="flex flex-wrap items-center gap-2 text-[14px]">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{m.creator_subtitle || (m.creator_name ? `Por ${m.creator_name}` : "-")}</span>
                                                        <span className="text-gray-300 dark:text-gray-600 font-medium font-bold">•</span>
                                                        <span className="font-bold text-brand-primary">{formatCurrency(m.total_amount)}</span>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="hidden lg:block w-full overflow-hidden rounded-xl relative">
                                        <div
                                            className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${movementsScroll.left ? "opacity-100" : "opacity-0"}`}
                                        />
                                        <div
                                            className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${movementsScroll.right ? "opacity-100" : "opacity-0"}`}
                                        />
                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={movementsTableRef} onScroll={checkMovementsScroll}>
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        {MOVEMENT_COLUMNS.map((col, idx) => {
                                                            const isSorted = movementsSortConfig?.key === col.id
                                                            const isFirst = idx === 0
                                                            const isLast = idx === MOVEMENT_COLUMNS.length - 1
                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${isFirst ? "rounded-l-lg pl-6" : ""} ${isLast ? "rounded-r-lg pr-6" : ""}`}
                                                                    style={{ width: col.width }}
                                                                    onClick={() => setMovementsSortConfig((prev) => ({ key: col.id, direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc" }))}
                                                                >
                                                                    <div className={`relative flex items-center gap-1.5 ${col.align === "center" ? "justify-center" : col.align === "right" ? "justify-end" : "justify-start"}`}>
                                                                        <span>{col.label}</span>
                                                                        <div className="w-4 shrink-0 flex items-center justify-center">
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-0 group-hover:opacity-40"} ${isSorted && movementsSortConfig?.direction === "desc" ? "rotate-180" : ""}`}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </th>
                                                            )
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {movementRows.map((m: any) => (
                                                        <OrderListItem
                                                            key={m.originalId}
                                                            order={m}
                                                            columns={MOVEMENT_COLUMNS}
                                                            selected={false}
                                                            onSelect={() => { }}
                                                            onEdit={() => { }}
                                                            onCancel={
                                                                isOpen && !m.reversed_at
                                                                    ? () => {
                                                                        handleReverse(m.originalId)
                                                                    }
                                                                    : undefined
                                                            }
                                                            onDetails={() => setDetailMovement(m)}
                                                            canEdit={false}
                                                            cancelLabel="Estornar"
                                                            showCheckbox={false}
                                                            rowVariant="cash_movement"
                                                            actionMenuExtra={
                                                                <DropdownItem onClick={() => setDetailMovement(m)}>
                                                                    <EyeIcon className="w-4 h-4 shrink-0" /> Ver detalhes
                                                                </DropdownItem>
                                                            }
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {sangriasReforcos.length === 0 && <div className="border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma sangria ou reforço registrado nesta sessão.</div>}
                                </div>
                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                                        <div className="p-5 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30"><h3 className="font-bold text-brand-dark dark:text-dark-heading">Conferência rápida</h3></div>
                                        <div className="p-5 space-y-4 bg-white dark:bg-dark-surface">
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Total em sangrias</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalWithdrawals)}</span></div>
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Total em reforços</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalDeposits)}</span></div>
                                            <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo calculado</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.calculatedDrawerTotal)}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="returns" className="mt-0">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <div className="border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 text-sm text-brand-inactive-text dark:text-dark-body">Módulo de devoluções será integrado em seguida.</div>
                                </div>
                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                    <InfoCard title="Devoluções" message="A estrutura visual desta aba já foi alinhada com as outras páginas de detalhes. Falta apenas conectar o módulo." color="orange" />
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </div>

                {isOpen && <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setMovModal("withdrawal")}>Sangria</Button><Button variant="outline" className="flex-1" onClick={() => setMovModal("deposit")}>Reforço</Button><Button className="flex-1" onClick={openCloseModal} isLoading={isPreparingClose}>Fechar</Button></div>}

                <DefaultModal isOpen={closeOpen} onClose={closeCloseModal} title="Fechar caixa">
                    <div className="space-y-4">
                        {closeSummary && <InfoCard title="Saldo total registrado" message={formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))} color="gray" />}
                        {(closeSummary?.groupedByMethod || []).length === 0 ? <MoneyInput label="Valor registrado" value={Number(countedByPm.__total__ ?? closeSummary?.expectedDrawerTotal ?? 0)} onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))} /> : (closeSummary?.groupedByMethod || []).map((row: any) => {
                            const key = row.paymentMethodId || "__none__"
                            return <MoneyInput key={key} label={`Valor informado - ${row.label}`} value={Number(countedByPm[key] ?? row.calculated ?? 0)} onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))} />
                        })}
                        <Input label="Observações" value={closingNotes} onChange={(e: any) => setClosingNotes(e.target.value)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={closeCloseModal}>Cancelar</Button>
                            <Button id="cash-close-submit" onClick={handleClose} isLoading={isClosing}>Confirmar fechamento</Button>
                        </div>
                    </div>
                </DefaultModal>

                <DefaultModal isOpen={movModal !== null} onClose={closeMovementModal} title={movementModalTitle}>
                    <div className="space-y-3">
                        <MoneyInput label="Valor" value={movAmount} onChange={setMovAmount} />
                        <Input label="Descrição" value={movDesc} onChange={(e: any) => setMovDesc(e.target.value)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={closeMovementModal}>Cancelar</Button>
                            <Button onClick={handleMovement} isLoading={isSavingMovement}>Salvar</Button>
                        </div>
                    </div>
                </DefaultModal>

                <DefaultModal
                    isOpen={detailMovement !== null}
                    onClose={() => setDetailMovement(null)}
                    title={detailMovement?.type === "deposit" ? "Detalhes do reforço" : "Detalhes da sangria"}
                >
                    {detailMovement ? (
                        <div className="space-y-4 text-[14px]">
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tipo</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                    {detailMovement.type === "deposit" ? "Reforço" : "Sangria"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status</span>
                                <Badge variant={detailMovement.reversed_at ? "gray" : "green"} icon={detailMovement.reversed_at ? <ReturnIcon size={12} /> : <CheckCircleIcon size={12} />}>
                                    {detailMovement.reversed_at ? "Estornado" : "Concluída"}
                                </Badge>
                            </div>
                            <div className="flex justify-between items-start gap-4">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Registrado por</span>
                                <span className="font-semibold text-brand-dark dark:text-dark-heading text-right">
                                    {detailMovement.creator_name || "-"}
                                </span>
                            </div>
                            {detailMovement.reversed_at ? (
                                <div className="flex justify-between items-start gap-4">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Estornado por</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading text-right">
                                        {detailMovement.reversed_by_name || "-"}
                                    </span>
                                </div>
                            ) : null}
                            <div className="flex justify-between items-center gap-4">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data e hora</span>
                                <span className="font-semibold text-brand-dark dark:text-dark-heading text-right">
                                    {formatLongDateTime(detailMovement.created_at)}
                                </span>
                            </div>
                            {detailMovement.reversed_at ? (
                                <div className="flex justify-between items-center gap-4">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Estornado em</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading text-right">
                                        {formatLongDateTime(detailMovement.reversed_at)}
                                    </span>
                                </div>
                            ) : null}
                            <div className="flex justify-between items-start gap-4">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Descrição</span>
                                <span className="font-semibold text-brand-dark dark:text-dark-heading text-right whitespace-pre-wrap break-words max-w-[65%]">
                                    {String(detailMovement.description || "").trim() || "-"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center gap-4 pt-2 border-t border-brand-border dark:border-dark-border">
                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor</span>
                                <span className="text-lg font-black text-brand-primary">{formatCurrency(detailMovement.total_amount)}</span>
                            </div>
                        </div>
                    ) : null}
                </DefaultModal>
            </Tabs>
        </FadeIn>
    )
}
