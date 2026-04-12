"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Checkbox, IconPlaceholder, Badge } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"
import { diffCalendarDaysInSaoPaulo } from "@/lib/utils/formatters"
import { DueDateCountdown } from "@/lib/utils/transaction-due-countdown"
import {
    PlusIcon,
    ExportFileIcon,
    ArrowUpDownIcon,
    CreditCardIcon,
    FileIcon,
    MoneyIcon,
    EditIcon,
} from "@/lib/icons"
import TransactionPageControls from "./TransactionPageControls"
import TransactionListItem from "./TransactionListItem"
import TransactionGridCard from "./TransactionGridCard"
import CreateTransactionPage, { type CategoryItem, type AccountItem } from "./CreateTransactionPage"
import type { ERPTransaction, TransactionTab } from "../../../lib/services/transactions.types"
import type { RecurringOccurrence } from "@/app/actions/erp/recurring-transactions"
import { markRecurringOccurrenceAsPaidAction } from "@/app/actions/erp/transactions"
import { useRouter } from "next/navigation"
import { useNotification } from "@/hooks/use-notification"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

function ymdFromRaw(raw: string | null | undefined): string | null {
    if (!raw) return null
    const t = new Date(raw as string).getTime()
    if (Number.isNaN(t)) return String(raw).slice(0, 10)
    return msToBrazilYmd(t)
}

/** Previstos: vencimento/ocorrência. Transações: pagamento efetivo, senão vencimento. */
function transactionFilterYmd(item: ERPTransaction, tab: TransactionTab): string | null {
    if (tab === "Previstos") {
        if (item.occurrenceDate) return item.occurrenceDate.slice(0, 10)
        return ymdFromRaw(item.dueDateRaw)
    }
    if (item.paymentDateRaw) return ymdFromRaw(item.paymentDateRaw)
    return ymdFromRaw(item.dueDateRaw)
}

interface FilterState {
    recurringOnly: boolean
    datePeriod: DatePeriodFilterValue
    status: string[]
    category: string[]
    paymentType: string[]
}

type SortKey = "transaction" | "category" | "contact" | "date" | "payment" | "status" | "amount"
type SortDirection = "asc" | "desc"

const INITIAL_FILTERS: FilterState = {
    recurringOnly: false,
    datePeriod: { ...EMPTY_DATE_PERIOD },
    status: [],
    category: [],
    paymentType: [],
}

const ITEMS_PER_PAGE = 8

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "transaction", label: "Descrição", align: "left", width: "300px" },
    { id: "category", label: "Categoria", align: "left", width: "170px" },
    { id: "contact", label: "Contato", align: "left", width: "220px" },
    { id: "date", label: "Data", align: "left", width: "170px" },
    { id: "dueDate", label: "Vencimento", align: "left", width: "170px" },
    { id: "amount", label: "Valor", align: "right", width: "160px" },
    { id: "status", label: "Status", align: "center", width: "150px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

export default function TransactionsPage({
    transactions,
    partnerId,
    categories = [],
    accounts = [],
    recurringOccurrences = [],
    recurringTemplates = [],
    paymentMethods = [],
}: {
    transactions: ERPTransaction[]
    partnerId: string
    categories?: CategoryItem[]
    accounts?: AccountItem[]
    recurringOccurrences?: RecurringOccurrence[]
    recurringTemplates?: any[]
    paymentMethods?: any[]
}) {
    const router = useRouter()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState<TransactionTab>("Transações")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [showCreateTransaction, setShowCreateTransaction] = useState(false)
    const [editingTransaction, setEditingTransaction] = useState<ERPTransaction | null>(null)
    const [editingRecurringTemplateId, setEditingRecurringTemplateId] = useState<string | null>(null)
    const [markingAsPaid, setMarkingAsPaid] = useState(false)

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
    }, [checkScroll, viewMode, transactions])

    const paymentTypeOptions = useMemo(() => {
        const s = new Set<string>()
        for (const t of transactions) {
            if (t.paymentType) s.add(t.paymentType)
        }
        for (const o of recurringOccurrences) {
            if (o.paymentDisplay) s.add(o.paymentDisplay)
        }
        return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"))
    }, [transactions, recurringOccurrences])

    const statusFilterOptions = useMemo(() => {
        const s = new Set(transactions.map((item) => item.status))
        if (recurringOccurrences.length > 0) s.add("Pendente")
        return Array.from(s)
    }, [transactions, recurringOccurrences])

    const filterSections: FilterSectionConfig[] = useMemo(
        () => [
            {
                id: "recurringOnly",
                title: "Recorrência",
                type: "switch",
                switchLabel: "Apenas recorrentes",
            },
            {
                id: "datePeriod",
                title:
                    activeTab === "Previstos"
                        ? "Período (vencimento / ocorrência)"
                        : "Período (data de pagamento)",
                type: "date-period",
            },
            { id: "status", title: "Status", type: "checkbox-list", options: statusFilterOptions },
            {
                id: "category",
                title: "Categoria",
                type: "checkbox-list",
                options: Array.from(new Set(transactions.map((item) => item.category))),
            },
            { id: "paymentType", title: "Meio de Pagamento", type: "checkbox-list", options: paymentTypeOptions },
        ],
        [paymentTypeOptions, statusFilterOptions, transactions, activeTab],
    )

    const filteredTransactions = useMemo(() => {
        const term = search.trim().toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        // Convert recurring occurrences to ERPTransaction shape for Previstos tab
        const virtualItems: ERPTransaction[] = recurringOccurrences.map((occ) => {
            const dateObj = new Date(`${occ.occurrenceDate}T12:00:00`)
            const daysUntilDue = diffCalendarDaysInSaoPaulo(occ.occurrenceDate)
            const dateLabel = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })
            const dateShort = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
            return {
                id: `virt-${occ.recurringId}-${occ.occurrenceDate}`,
                displayId: "",
                description: occ.description,
                category: occ.categoryName || "Sem categoria",
                contactName: occ.contactName || "-",
                contactType: (occ.contactType || "other") as ERPTransaction["contactType"],
                dueDate: dateLabel,
                dueDateShort: dateShort,
                dueDateTime: "",
                dateNote: "-",
                createdAtDate: "",
                createdAtTime: "",
                daysUntilDue,
                isOverdue: daysUntilDue < 0,
                paymentType: occ.paymentDisplay || "Não informado",
                status: "Pendente",
                statusVariant: daysUntilDue < 0 ? "red" : "orange",
                amount: occ.amount,
                transactionType: occ.type as ERPTransaction["transactionType"],
                ledgerDirection: occ.type === "income" ? "in" : "out",
                rawStatus: "pending",
                origin: "system",
                accountId: occ.accountId,
                categoryId: occ.categoryId,
                subcategoryId: occ.subcategoryId,
                contactId: occ.contactId,
                customerId: occ.customerId,
                recurringId: occ.recurringId,
                paymentMethodId: occ.paymentMethodId ?? null,
                // Virtual occurrence fields
                isRecurringOccurrence: true,
                recurringTemplateId: occ.recurringTemplateId,
                occurrenceDate: occ.occurrenceDate,
                dueDateRaw: occ.dueDate,
            }
        })

        // Merge real transactions with virtual recurring items
        const allItems = [...transactions, ...virtualItems]

        let result = allItems.filter((item) => {
            const matchesSearch =
                !term ||
                item.description.toLowerCase().includes(term) ||
                item.displayId.toLowerCase().includes(term) ||
                item.contactName.toLowerCase().includes(term) ||
                item.category.toLowerCase().includes(term)

            const isPrevisto = item.isRecurringOccurrence || item.status === "Pendente" || item.isOverdue || item.status === "Atrasado" || (item.transactionType !== 'adjustment' && item.transactionType !== 'transfer' && !['recebido', 'pago', 'paid'].includes(item.status.toLowerCase()))

            const matchesTab = activeTab === "Transações" ? (!isPrevisto && !item.isRecurringOccurrence) : isPrevisto

            const matchesStatus = filters.status.length === 0 || filters.status.includes(item.status)
            const matchesCategory = filters.category.length === 0 || filters.category.includes(item.category)
            const matchesPayment = filters.paymentType.length === 0 || filters.paymentType.includes(item.paymentType)
            const ymd = transactionFilterYmd(item, activeTab)
            const matchesDate = !dateBoundsActive || ymdInBounds(ymd, startYmd, endYmd)
            const matchesRecurring =
                !filters.recurringOnly || !!(item.recurringId || item.isRecurringOccurrence)

            return (
                matchesSearch &&
                matchesTab &&
                matchesStatus &&
                matchesCategory &&
                matchesPayment &&
                matchesDate &&
                matchesRecurring
            )
        })

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: string | number = ""
                let bVal: string | number = ""

                switch (sortConfig.key) {
                    case "transaction":
                        aVal = a.description
                        bVal = b.description
                        break
                    case "category":
                        aVal = a.category
                        bVal = b.category
                        break
                    case "contact":
                        aVal = a.contactName
                        bVal = b.contactName
                        break
                    case "date": {
                        const at = a.occurrenceDate
                            ? new Date(`${a.occurrenceDate}T12:00:00`).getTime()
                            : a.dueDateRaw
                              ? new Date(a.dueDateRaw).getTime()
                              : new Date(a.dueDate).getTime()
                        const bt = b.occurrenceDate
                            ? new Date(`${b.occurrenceDate}T12:00:00`).getTime()
                            : b.dueDateRaw
                              ? new Date(b.dueDateRaw).getTime()
                              : new Date(b.dueDate).getTime()
                        aVal = at
                        bVal = bt
                        break
                    }
                    case "payment":
                        aVal = a.paymentType
                        bVal = b.paymentType
                        break
                    case "status":
                        aVal = a.status
                        bVal = b.status
                        break
                    case "amount":
                        aVal = a.amount
                        bVal = b.amount
                        break
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        } else if (activeTab === "Previstos") {
            // ALWAYS sort previstos by due_date ASC
            result = [...result].sort((a, b) => {
                // Use occurrenceDate for virtual items, dueDateRaw for real transactions
                const aDate = a.occurrenceDate || a.dueDateRaw || a.dueDate
                const bDate = b.occurrenceDate || b.dueDateRaw || b.dueDate
                return String(aDate).localeCompare(String(bDate))
            })
        }

        return result
    }, [transactions, recurringOccurrences, search, activeTab, filters, sortConfig])

    const paginatedTransactions = filteredTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE))
    const hasActiveFilters =
        search.length > 0 ||
        filters.status.length > 0 ||
        filters.category.length > 0 ||
        filters.paymentType.length > 0 ||
        filters.recurringOnly ||
        isDatePeriodFilterActive(filters.datePeriod)
    const hasTransactions = transactions.length > 0

    const handleSelectRow = useCallback((id: string) => {
        setSelection((prev) => {
            const ids = new Set(prev.ids)
            ids.has(id) ? ids.delete(id) : ids.add(id)
            return { ids }
        })
    }, [])

    const handleClearFilters = () => {
        setSearch("")
        setActiveTab("Transações")
        setFilters(INITIAL_FILTERS)
    }

    useEffect(() => {
        setPage(1)
    }, [search, activeTab, filters])

    const handleEditTransaction = useCallback((transaction: ERPTransaction) => {
        if (transaction.isRecurringOccurrence && transaction.recurringTemplateId) {
            setEditingRecurringTemplateId(transaction.recurringTemplateId)
        } else {
            setEditingTransaction(transaction)
        }
    }, [])

    const handleMarkAsPaid = useCallback(async (transaction: ERPTransaction) => {
        if (!transaction.recurringTemplateId || !transaction.occurrenceDate) return
        if (markingAsPaid) return
        setMarkingAsPaid(true)
        try {
            const res = await markRecurringOccurrenceAsPaidAction({
                partnerId,
                recurringId: transaction.recurringTemplateId,
                occurrenceDate: transaction.occurrenceDate,
                accountId: transaction.accountId,
                paymentMethodId: transaction.paymentMethodId ?? null,
            })
            if (!res.success) {
                notifyError(res.error || "Erro ao marcar como pago")
                return
            }
            if ((res as any).alreadyPaid) {
                notifySuccess("Esta ocorrência já foi paga.")
            } else {
                notifySuccess("Ocorrência marcada como paga!")
            }
            router.refresh()
        } catch {
            notifyError("Erro ao marcar como pago")
        } finally {
            setMarkingAsPaid(false)
        }
    }, [partnerId, markingAsPaid, router, notifySuccess, notifyError])

    if (showCreateTransaction || editingTransaction || editingRecurringTemplateId) {
        return (
            <motion.div
                key={editingRecurringTemplateId ? `edit-rec-${editingRecurringTemplateId}` : editingTransaction ? `edit-${editingTransaction.id}` : "create-transaction"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
            >
                <CreateTransactionPage
                    partnerId={partnerId}
                    categories={categories}
                    accounts={accounts}
                    paymentMethods={paymentMethods}
                    editTransaction={editingTransaction || undefined}
                    editRecurringTemplateId={editingRecurringTemplateId || undefined}
                    editRecurringTemplate={editingRecurringTemplateId ? recurringTemplates.find((t: any) => t.id === editingRecurringTemplateId) : undefined}
                    onClose={() => {
                        setShowCreateTransaction(false)
                        setEditingTransaction(null)
                        setEditingRecurringTemplateId(null)
                    }}
                    onSuccess={() => {
                        setShowCreateTransaction(false)
                        setEditingTransaction(null)
                        setEditingRecurringTemplateId(null)
                        router.refresh()
                    }}
                />
            </motion.div>
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
                            Transações Financeiras
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Acompanhe contas a pagar, receber e movimentações do financeiro.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => { }}>
                            <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
                        </Button>

                        <Button onClick={() => setShowCreateTransaction(true)}>
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Nova Transação
                        </Button>
                    </div>
                </div>

                <TransactionPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setModals((prev) => ({ ...prev, filter: true }))}
                    onAddTransaction={() => setShowCreateTransaction(true)}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {!hasTransactions ? (
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
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Sem transações"
                                    title="Você ainda não tem transações"
                                    subtitle="As movimentações financeiras vão aparecer aqui assim que forem cadastradas."
                                />
                            </motion.div>
                        ) : paginatedTransactions.length === 0 ? (
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
                                    imageAlt="Nenhuma transação encontrada"
                                    title="Nenhuma transação encontrada"
                                    subtitle="Tente ajustar os filtros ou o termo de busca."
                                    itemButton={{
                                        text: "Limpar Filtros",
                                        action: handleClearFilters,
                                        variant: "outline",
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={activeTab + (isTablet ? "mobile" : viewMode)}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-full"
                            >
                                {isTablet ? (
                                    <div className="flex flex-col w-full">
                                        {paginatedTransactions.map((transaction) => {
                                            const PaymentIcon = getPaymentIcon(transaction.paymentType)
                                            const isRecurring = !!transaction.recurringId || !!transaction.isRecurringOccurrence

                                            return (
                                                <div
                                                    key={transaction.id}
                                                    className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 flex items-start gap-3"
                                                    onClick={() => {
                                                        if (transaction.isRecurringOccurrence) {
                                                            handleMarkAsPaid(transaction)
                                                        } else {
                                                            handleEditTransaction(transaction)
                                                        }
                                                    }}
                                                >
                                                    <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox checked={selection.ids.has(transaction.id)} onChange={() => handleSelectRow(transaction.id)} />
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                                        <div className="flex justify-between items-start gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                        {transaction.description}
                                                                    </h3>
                                                                    {isRecurring && (
                                                                        <Badge variant="purple" className="whitespace-nowrap scale-90 shrink-0">
                                                                            Recorrente
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <span className="flex items-center gap-1.5 text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate mt-0.5">
                                                                    <PaymentIcon className="w-3.5 h-3.5 shrink-0" />
                                                                    <span>{transaction.paymentType} • {transaction.contactName}</span>
                                                                </span>
                                                            </div>

                                                            <div className="flex flex-col items-end gap-1 shrink-0 text-right min-w-[100px]">
                                                                <span className={`inline-flex items-center justify-center h-8 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap border ${transaction.isOverdue ? "text-brand-red border-brand-red/15 bg-brand-red/5" : "text-brand-inactive-text dark:text-dark-body border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/60"}`}>
                                                                    {transaction.dueDateShort}
                                                                </span>
                                                                <DueDateCountdown transaction={transaction} align="right" />
                                                                <Badge variant={transaction.statusVariant} className="whitespace-nowrap">
                                                                    {transaction.status}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        <div className={`text-[16px] font-bold ${transaction.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}>
                                                            {transaction.ledgerDirection === "in" ? "+ " : "- "}
                                                            {formatCurrency(transaction.amount)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : viewMode === "grid" ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedTransactions.map((transaction) => (
                                            <TransactionGridCard
                                                key={transaction.id}
                                                transaction={transaction}
                                                selected={selection.ids.has(transaction.id)}
                                                onSelect={handleSelectRow}
                                                onEdit={handleEditTransaction}
                                                onMarkAsPaid={handleMarkAsPaid}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="w-full overflow-hidden rounded-xl relative">
                                        <div className={`absolute top-0 left-0 h-full w-12 bg-linear-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                        <div className={`absolute top-0 right-0 h-full w-12 bg-linear-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1460px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                            <div className="flex items-center">
                                                                <Checkbox
                                                                    checked={selection.ids.size === paginatedTransactions.length && paginatedTransactions.length > 0}
                                                                    onChange={(checked) => {
                                                                        setSelection({ ids: checked ? new Set(paginatedTransactions.map((item) => item.id)) : new Set() })
                                                                    }}
                                                                    className="bg-white dark:bg-dark-background"
                                                                />
                                                            </div>
                                                        </th>
                                                        {COLUMNS.map((col, idx) => {
                                                            const isSortable = col.id !== "actions"
                                                            const isSorted = sortConfig?.key === col.id
                                                            const isLast = idx === COLUMNS.length - 1

                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                    style={{ width: col.width }}
                                                                    onClick={() => {
                                                                        if (!isSortable) return
                                                                        setSortConfig((prev) => ({
                                                                            key: col.id as SortKey,
                                                                            direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                        }))
                                                                    }}
                                                                >
                                                                    <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                        <span className={isSortable ? (col.align === "center" ? "" : "") : ""}>
                                                                            {col.label}
                                                                        </span>
                                                                        {isSortable && (
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
                                                    {paginatedTransactions.map((transaction) => (
                                                        <TransactionListItem
                                                            key={transaction.id}
                                                            transaction={transaction}
                                                            columns={COLUMNS}
                                                            selected={selection.ids.has(transaction.id)}
                                                            onSelect={handleSelectRow}
                                                            onEdit={handleEditTransaction}
                                                            onMarkAsPaid={handleMarkAsPaid}
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

                {paginatedTransactions.length > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                )}
            </div>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals((prev) => ({ ...prev, filter: false }))}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection({ ids: new Set() })}
            >
                <Button variant="ghost" onClick={() => { }} leftIcon={<EditIcon className="w-4 h-4" />} className="h-10 px-3">
                    Ações em massa
                </Button>
            </FloatingActionBar>
        </motion.div>
    )
}
