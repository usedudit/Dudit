"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ActionsDropdown, Badge, Button, DefaultModal, DropdownItem, FormSection, IconPlaceholder, InfoCard, Input, MoneyInput, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { closeCashSessionAction, createCashMovementAction, getCashSessionCloseSummaryAction, getCashSessionDetailsAction, reverseCashMovementAction } from "@/app/actions/erp/cash-register"
import { useNotification } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { useMediaQuery } from "@/components/erp/hooks"
import { downloadPdf } from "@/lib/pdf/download"
import { ChevronLeftIcon, MoneyIcon, CreditCardIcon, QRCodeIcon, MoreHorizontalIcon, MoneyBagIcon, ShoppingCartIcon, ArrowUpDownIcon, ArrowDownIcon, ArrowUpIcon, EyeIcon, ReturnIcon, CheckCircleIcon } from "@/lib/icons"
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
    const isMobileDevice = useMediaQuery("(max-width: 1023px)")
    const [details, setDetails] = useState<DetailPayload | null>(initialDetails)
    const [activeTab, setActiveTab] = useState<"summary" | "movements" | "returns">("summary")

    const handleBack = useCallback(() => onBack?.(), [onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        const sessionId = details?.session?.id
        const title = sessionId ? `Caixa ${sessionId.slice(0, 8).toUpperCase()}` : "Detalhes do caixa"
        setHeaderOverride({
            title,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [details?.session?.id, handleBack, setHeaderOverride])
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

    const handlePrintCoupon = useCallback(() => {
        if (!session?.id) return
        const couponType = isOpen ? "opening" : "closing"
        const params = new URLSearchParams({ type: couponType })
        if (isMobileDevice) {
            downloadPdf(`/api/pdf/caixa/${session.id}?${params.toString()}`, `cupom-caixa-${session.id.slice(0, 8)}.pdf`)
                .catch(() => window.open(`/print/caixa/${session.id}?${params.toString()}`, "_blank"))
            return
        }
        window.open(`/print/caixa/${session.id}?${params.toString()}`, "_blank")
    }, [session?.id, isOpen, isMobileDevice])

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
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">Caixa {session.id.slice(0, 8).toUpperCase()}</span>
                                            <Badge variant={isOpen ? "green" : "gray"}>{isOpen ? "Aberto" : "Fechado"}</Badge>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Aberto em {formatLongDateTime(session.opened_at)} - {details.operators.open_name}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
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

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="summary">Resumo</TabsTrigger>
                                        <TabsTrigger value="movements" badge={<span className="text-xs text-brand-inactive-text">{String(sangriasReforcos.length).padStart(2, "0")}</span>}>Sangrias e reforços</TabsTrigger>
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
                                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Operador da abertura: <strong className="text-brand-dark dark:text-dark-heading">{details.operators.open_name}</strong></div>
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
                                                    let Icon = MoneyIcon
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
                                                                    <span className="text-xs font-medium text-brand-inactive-text mb-1">Registrado</span>
                                                                    <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(row.calculated)}</span>
                                                                </div>

                                                                {!isOpen && (
                                                                    <>
                                                                        <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                            <span className="text-xs font-medium text-brand-inactive-text mb-1">Informado</span>
                                                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{row.counted != null ? formatCurrency(row.counted) : "-"}</span>
                                                                        </div>

                                                                        <div className="hidden sm:flex flex-col items-end border-l border-brand-border dark:border-dark-border pl-6">
                                                                            <span className="text-xs font-medium text-brand-inactive-text mb-1">Diferença</span>
                                                                            <span className={`text-[15px] font-bold ${getDifferenceTone(row.difference)}`}>{row.difference != null ? formatCurrency(row.difference) : "-"}</span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}

                                                {(details.summaryByPaymentMethod || []).length === 0 && (
                                                    <IconPlaceholder icon={ShoppingCartIcon} title="Nenhuma venda registrada nesta sessão" subtitle="Nenhuma venda foi realizada ainda." />
                                                )}

                                                <div className="py-4 flex items-center gap-4 mt-2">
                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                        <MoneyBagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
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
                                                    <button type="button" className="text-left text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline" onClick={handlePrintCoupon}>{isOpen ? "Imprimir cupom de abertura" : "Imprimir cupom de fechamento"}</button>
                                                    <Link href="/erp/transacoes" className="block text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline">Ver relatório de movimentação do caixa</Link>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="movements" className="mt-0">
                                <div className={sangriasReforcos.length > 0 ? "grid grid-cols-12 gap-y-8 md:gap-y-0 relative" : "grid gap-y-8 md:gap-y-0 relative"}>
                                    <div className={sangriasReforcos.length > 0 ? "col-span-12 xl:col-span-8 pr-0 xl:pr-12" : "col-span-12 xl:col-span-8 pr-0"}>
                                        {
                                            sangriasReforcos.length > 0 ? (
                                                <>
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
                                                </>
                                            ) : (
                                                <IconPlaceholder
                                                    placeholderType="image"
                                                    imageSrc="https://img.dudit.com.br/static/mascots/PDV.png"
                                                    imageAlt="Nenhuma sangria ou reforço"
                                                    title="Nenhuma sangria ou reforço"
                                                    subtitle="Nenhuma sangria ou reforço registrado nesta sessão."
                                                />
                                            )
                                        }
                                    </div>
                                    {sangriasReforcos.length > 0 && (
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
                                    )}
                                </div>
                            </TabsContent>
                        </div>
                    </div>

                    {isOpen && <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setMovModal("withdrawal")}>Sangria</Button><Button variant="outline" className="flex-1" onClick={() => setMovModal("deposit")}>Reforço</Button><Button className="flex-1" onClick={openCloseModal} isLoading={isPreparingClose}>Fechar</Button></div>}

                    <DefaultModal isOpen={closeOpen} onClose={closeCloseModal} title="Fechar caixa">
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
                                                const lowerLabel = row.label?.toLowerCase() || ""
                                                let Icon = MoneyIcon
                                                if (lowerLabel.includes("dinheiro")) Icon = MoneyIcon
                                                if (lowerLabel.includes("cartão") || lowerLabel.includes("cartao")) Icon = CreditCardIcon
                                                if (lowerLabel.includes("pix")) Icon = QRCodeIcon
                                                return (
                                                    <div key={row.paymentMethodId || row.label} className="w-full rounded-2xl bg-brand-gray/80 dark:bg-dark-border/20 p-3 flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-9 h-9 rounded-full bg-brand-slate dark:bg-dark-border/50 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                <Icon className="w-5 h-5" />
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
                                <Button id="cash-close-submit" onClick={handleClose} isLoading={isClosing}>
                                    Confirmar fechamento
                                </Button>
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
                </Tabs >
            </div >
        </FadeIn >
    )
}
