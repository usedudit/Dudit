"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Checkbox, IconPlaceholder, Badge, FormDropdown, MoneyInput, ThreeDotsLoader, InfoCard, FormSection, ActionsDropdown, DropdownItem, SavingStatusModal } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"
import { diffCalendarDaysInSaoPaulo, formatBrazilDateFromDbInput } from "@/lib/utils/formatters"
import { PlusIcon, ExportFileIcon, ArrowUpDownIcon, CreditCardIcon, FileIcon, MoneyIcon, EditIcon, ClockIcon, InstallmentIcon, CheckCircleIcon, CashierIcon, SaveIcon, AlertTriangleIcon, } from "@/lib/icons"
import TransactionPageControls from "./TransactionPageControls"
import TransactionListItem from "./TransactionListRow"
import TransactionGridCard from "./TransactionGridCard"
import CreateTransactionPage, { type CategoryItem, type AccountItem } from "./CreateTransactionPage"
import TransactionDetailView from "./TransactionDetailView"
import InstallmentParcelsTable, { type InstallmentParcelRow } from "./InstallmentParcelsTable"
import type { ERPTransaction, FinancialTransactionCursor, TransactionTab } from "@/lib/services/transactions.types"
import type { RecurringOccurrence } from "@/app/actions/erp/recurring-transactions"
import { markRecurringOccurrenceAsPaidAction } from "@/app/actions/erp/transactions"
import { getInstallmentGroupDetailsAction } from "@/app/actions/erp/transactions"
import { recordInstallmentPaymentAction } from "@/app/actions/erp/transactions"
import { settleInstallmentGroupAction } from "@/app/actions/erp/transactions"
import { getFinancialTransactionsAction, getTransactionDetailsAction, type TransactionDetailPayload } from "@/app/actions/erp/transactions"
import { cancelPendingTransactionAction } from "@/app/actions/erp/transactions"
import { getPaymentMethodsAction } from "@/app/actions/erp/payment-methods"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useNotification } from "@/hooks/use-notification"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon } from "@/lib/icons"

function ymdFromRaw(raw: string | null | undefined): string | null {
    if (!raw) return null
    const t = new Date(raw as string).getTime()
    if (Number.isNaN(t)) return String(raw).slice(0, 10)
    return msToBrazilYmd(t)
}

function formatDateFromRaw(raw: string | null | undefined): string | null {
    if (!raw) return null
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return null
    return dt.toLocaleDateString("pt-BR")
}

function formatTimeFromRaw(raw: string | null | undefined): string | null {
    if (!raw) return null
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return null
    return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

/** A pagar/A receber: vencimento/ocorrência. Transações: pagamento efetivo, senão vencimento. */
function transactionFilterYmd(item: ERPTransaction, tab: TransactionTab): string | null {
    if (tab !== "Transações") {
        if (item.occurrenceDate) return item.occurrenceDate.slice(0, 10)
        return ymdFromRaw(item.dueDateRaw)
    }
    if (item.paymentDateRaw) return ymdFromRaw(item.paymentDateRaw)
    return ymdFromRaw(item.dueDateRaw)
}

interface FilterState {
    recurringOnly: boolean
    installmentOnly: boolean
    datePeriod: DatePeriodFilterValue
    status: string[]
    category: string[]
    paymentType: string[]
}

type SortKey = "transaction" | "category" | "contact" | "date" | "payment" | "status" | "amount"
type SortDirection = "asc" | "desc"

const INITIAL_FILTERS: FilterState = {
    recurringOnly: false,
    installmentOnly: false,
    datePeriod: { ...EMPTY_DATE_PERIOD },
    status: [],
    category: [],
    paymentType: [],
}

const ITEMS_PER_PAGE = 8

const financialTransactionsQueryKey = (partnerId: string) => ["erp-financial-transactions", partnerId] as const

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "transaction", label: "Descrição", align: "left", width: "300px" },
    { id: "category", label: "Categoria", align: "left", width: "170px" },
    { id: "originSource", label: "Origem", align: "left", width: "150px" },
    { id: "contact", label: "Contato", align: "left", width: "220px" },
    { id: "date", label: "Data", align: "left", width: "130px" },
    { id: "dueDate", label: "Vencimento", align: "left", width: "130px" },
    { id: "amount", label: "Valor", align: "right", width: "100px" },
    { id: "status", label: "Status", align: "center", width: "100px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

export default function TransactionsPage({
    initialItems,
    initialNextCursor,
    initialHasMore,
    partnerId,
    categories = [],
    accounts = [],
    recurringOccurrences = [],
    recurringTemplates = [],
    paymentMethods = [],
    planGate,
    forcedTab,
    pageTitle,
    pageSubtitle,
}: {
    initialItems: ERPTransaction[]
    initialNextCursor: FinancialTransactionCursor | null
    initialHasMore: boolean
    partnerId: string
    categories?: CategoryItem[]
    accounts?: AccountItem[]
    recurringOccurrences?: RecurringOccurrence[]
    recurringTemplates?: any[]
    paymentMethods?: any[]
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
    /** When set, locks the page to a specific tab and hides the tab selector */
    forcedTab?: TransactionTab
    /** Custom page title (used when forcedTab splits the page) */
    pageTitle?: string
    /** Custom page subtitle */
    pageSubtitle?: string
}) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTabState] = useState<TransactionTab>(forcedTab || "Transações")
    const setActiveTab = forcedTab ? () => { } : setActiveTabState
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [editingRecurringTemplateId, setEditingRecurringTemplateId] = useState<string | null>(null)
    const [markingAsPaid, setMarkingAsPaid] = useState(false)
    const [openInstallmentGroupId, setOpenInstallmentGroupId] = useState<string | null>(null)
    const [installmentDetailLoading, setInstallmentDetailLoading] = useState(false)
    const [installmentDetail, setInstallmentDetail] = useState<any | null>(null)
    const [payingInstallment, setPayingInstallment] = useState(false)
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [selectedInstallmentForPayment, setSelectedInstallmentForPayment] = useState<any | null>(null)
    const [paymentAmount, setPaymentAmount] = useState("")
    const [interestAmount, setInterestAmount] = useState("0")
    const [discountAmount, setDiscountAmount] = useState("0")
    const [paymentMethodId, setPaymentMethodId] = useState("")
    const [fallbackPaymentMethods, setFallbackPaymentMethods] = useState<any[]>([])
    const [confirmRecurringPayment, setConfirmRecurringPayment] = useState<ERPTransaction | null>(null)
    const [confirmSettleGroup, setConfirmSettleGroup] = useState<ERPTransaction | null>(null)
    const [confirmCancelTransaction, setConfirmCancelTransaction] = useState<ERPTransaction | null>(null)
    const [cancelReason, setCancelReason] = useState("")
    const [cancellingTransaction, setCancellingTransaction] = useState(false)
    const [settlingGroup, setSettlingGroup] = useState(false)
    const [confirmRegularMarkAsPaid, setConfirmRegularMarkAsPaid] = useState<ERPTransaction | null>(null)
    const [markingRegularAsPaid, setMarkingRegularAsPaid] = useState(false)
    const isScrolled = false
    const observerTarget = useRef<HTMLDivElement>(null)

    const entityPage = useEntityPage<ERPTransaction, TransactionDetailPayload, FinancialTransactionCursor>({
        entityType: "transactions",
        partnerId,
        queryKey: financialTransactionsQueryKey(partnerId),
        initialItems,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getFinancialTransactionsAction(partnerId, { cursor })
            if (!res.success) throw new Error(res.error || "Erro ao carregar transações.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((t: any) => t.id, []),
        getDetailFn: async (id) => {
            const res = await getTransactionDetailsAction(id, partnerId)
            if (res.success) return res.data as TransactionDetailPayload
            return null
        },
        listToDetail: (item) => ({
            id: item.id,
            headerTitle: item.description,
            statusLabel: item.status,
            statusVariant: item.statusVariant,
            transactionType: item.transactionType,
            isRecurring: !!item.recurringId,
            paymentMethodSubtitle: item.paymentType,
            paymentDateSubtitle: item.dueDate || item.paymentDateRaw || null,
            creatorName: "...",
            originLabel: item.origin === "manual" ? "Manual" : item.origin === "gateway" ? "Gateway" : "Sistema",
            typeBannerLabel: item.transactionType === "income" ? "Receita" : item.transactionType === "expense" ? "Despesa" : "Ajuste",
            amount: item.amount,
            ledgerDirection: item.ledgerDirection,
            canEdit: item.origin === "manual",
            showDueDateRow: !!item.dueDateRaw,
            timeline: {
                step1: { label: "Criada", date: item.createdAtDate, time: item.createdAtTime, active: true },
                step2: {
                    label: item.transactionType === "income" ? "Recebimento" : "Pagamento",
                    date: item.paymentDateRaw ? formatBrazilDateFromDbInput(item.paymentDateRaw, "dayMonth") : "-",
                    time: "-",
                    active: item.rawStatus === "paid",
                    danger: item.isOverdue,
                },
            },
            items: [],
            contactCard: {
                title: "Contato",
                name: item.contactName,
                email: null,
                phone: null,
                isCustomer: item.contactType === "customer",
            },
            categoryLine: item.category,
            subcategoryLine: null,
            accountLine: null,
            dueDateLine: item.dueDate,
            paymentDateLine: item.paymentDateRaw || null,
            notesLine: item.notes || null,
        } as TransactionDetailPayload),
    })

    const {
        items: loadedTransactions, fetchNextPage, hasNextPage, isFetchingNextPage,
        entityState, openEntity, closeEntity, isViewing, isEditing, isCreating,
        currentEntity, isLoadingDetail, getPrefetchProps,
        afterMutation, cache, queryClient: entityQueryClient,
    } = entityPage
    const [settlePaymentsByInstallment, setSettlePaymentsByInstallment] = useState<
        Record<string, { paymentAmount: string; interestAmount: string; discountAmount: string; paymentMethodId: string }>
    >({})
    const resolvedPaymentMethods = paymentMethods?.length ? paymentMethods : fallbackPaymentMethods
    const settleSummary = useMemo(() => {
        if (!confirmSettleGroup) return null
        const rows = installmentDetail?.installments || []
        if (rows.length === 0) {
            return {
                pendingCount: Math.max(0, Number(confirmSettleGroup.installmentPendingCount || 0)),
                totalToSettle: 0,
            }
        }
        const pendingRows = rows.filter((row: any) => row.status !== "paid")
        return {
            pendingCount: pendingRows.length,
            totalToSettle: pendingRows.reduce((acc: number, row: any) => acc + Number(row.remainingAmount || 0), 0),
        }
    }, [confirmSettleGroup, installmentDetail])

    /** Soma o que falta quitar (valores editados ou restante de cada parcela pendente). */
    const settleModalTotalToPay = useMemo(() => {
        if (!confirmSettleGroup) return 0
        const pending = (installmentDetail?.installments || []).filter((r: any) => r.status !== "paid")
        if (pending.length === 0) return Math.round((settleSummary?.totalToSettle ?? 0) * 100) / 100
        let acc = 0
        for (const row of pending) {
            const values = settlePaymentsByInstallment[row.id] || {
                paymentAmount: String(Number(row.remainingAmount || 0).toFixed(2)),
                interestAmount: "0",
                discountAmount: "0",
            }
            acc += Math.max(
                0,
                Number(values.paymentAmount || 0) + Number(values.interestAmount || 0) - Number(values.discountAmount || 0),
            )
        }
        return Math.round(acc * 100) / 100
    }, [confirmSettleGroup, installmentDetail, settlePaymentsByInstallment, settleSummary?.totalToSettle])

    const SETTLE_PAGE_SIZE = 10
    const [settleInstallmentPage, setSettleInstallmentPage] = useState(1)

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
    }, [checkScroll, viewMode, loadedTransactions.length])

    useEffect(() => {
        let active = true
        if (paymentMethods?.length) return
            ; (async () => {
                const methods = await getPaymentMethodsAction(partnerId)
                if (!active) return
                setFallbackPaymentMethods(Array.isArray(methods) ? methods : [])
            })()
        return () => {
            active = false
        }
    }, [paymentMethods, partnerId])

    // ── Search debounce (300ms) ──────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    const paymentTypeOptions = useMemo(() => {
        const s = new Set<string>()
        for (const t of loadedTransactions) {
            if (t.paymentType) s.add(t.paymentType)
        }
        for (const o of recurringOccurrences) {
            if (o.paymentDisplay) s.add(o.paymentDisplay)
        }
        return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"))
    }, [loadedTransactions, recurringOccurrences])

    const statusFilterOptions = useMemo(() => {
        const s = new Set(loadedTransactions.map((item) => item.status))
        if (recurringOccurrences.length > 0) s.add("Pendente")
        return Array.from(s)
    }, [loadedTransactions, recurringOccurrences])

    const filterSections: FilterSectionConfig[] = useMemo(
        () => [
            {
                id: "recurringOnly",
                title: "Recorrência",
                type: "switch",
                switchLabel: "Apenas recorrentes",
            },
            {
                id: "installmentOnly",
                title: "Parcelado",
                type: "switch",
                switchLabel: "Apenas parcelados",
            },
            {
                id: "datePeriod",
                title:
                    activeTab !== "Transações"
                        ? "Período (vencimento / ocorrência)"
                        : "Período (data de pagamento)",
                type: "date-period",
            },
            { id: "status", title: "Status", type: "checkbox-list", options: statusFilterOptions },
            {
                id: "category",
                title: "Categoria",
                type: "checkbox-list",
                options: Array.from(new Set(loadedTransactions.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "pt-BR")),
            },
            { id: "paymentType", title: "Meio de Pagamento", type: "checkbox-list", options: paymentTypeOptions },
        ],
        [paymentTypeOptions, statusFilterOptions, loadedTransactions, activeTab],
    )

    const filteredTransactions = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        // Convert recurring occurrences to ERPTransaction shape for A pagar / A receber tabs
        const virtualItems: ERPTransaction[] = recurringOccurrences.map((occ) => {
            const dateObj = new Date(`${occ.occurrenceDate}T12:00:00`)
            const daysUntilDue = diffCalendarDaysInSaoPaulo(occ.occurrenceDate)
            const dateLabel = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })
            const dateShort = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
            return {
                id: `virt-${occ.recurringId}-${occ.occurrenceDate}`,
                displayId: "",
                description: occ.description,
                category: String(occ.categoryName || "").trim() || "-",
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
        const allItems = [...loadedTransactions, ...virtualItems]

        let result = allItems.filter((item) => {
            const matchesSearch =
                !term ||
                item.description.toLowerCase().includes(term) ||
                item.displayId.toLowerCase().includes(term) ||
                item.contactName.toLowerCase().includes(term) ||
                item.category.toLowerCase().includes(term)

            const isPrevisto = item.isRecurringOccurrence || item.status === "Pendente" || item.isOverdue || item.status === "Atrasado" || (item.transactionType !== 'adjustment' && item.transactionType !== 'transfer' && !['recebido', 'pago', 'paid'].includes(item.status.toLowerCase()))

            const matchesLedgerByTab =
                activeTab === "A pagar" ? item.ledgerDirection === "out" :
                    activeTab === "A receber" ? item.ledgerDirection === "in" :
                        true
            const matchesTab = activeTab === "Transações" ? (!isPrevisto && !item.isRecurringOccurrence) : isPrevisto

            const matchesStatus = filters.status.length === 0 || filters.status.includes(item.status)
            const matchesCategory = filters.category.length === 0 || filters.category.includes(item.category)
            const matchesPayment = filters.paymentType.length === 0 || filters.paymentType.includes(item.paymentType)
            const ymd = transactionFilterYmd(item, activeTab)
            const matchesDate = !dateBoundsActive || ymdInBounds(ymd, startYmd, endYmd)
            const matchesRecurring =
                !filters.recurringOnly || !!(item.recurringId || item.isRecurringOccurrence)
            const matchesInstallment =
                !filters.installmentOnly || !!item.installmentGroupId

            return (
                matchesSearch &&
                matchesTab &&
                matchesLedgerByTab &&
                matchesStatus &&
                matchesCategory &&
                matchesPayment &&
                matchesDate &&
                matchesRecurring &&
                matchesInstallment
            )
        })

        const groupedInstallments = new Map<string, ERPTransaction[]>()
        const paidInstallmentByGroup = new Map<string, ERPTransaction[]>()
        const fullGroupStats = new Map<string, { total: number; paid: number }>()
        for (const tx of loadedTransactions) {
            if (!tx.installmentGroupId) continue
            const key = tx.installmentGroupId
            const prev = fullGroupStats.get(key) || { total: tx.installmentTotalCount || 0, paid: 0 }
            prev.total = Math.max(prev.total || 0, tx.installmentTotalCount || 0)
            if (String(tx.rawStatus || "").toLowerCase() === "paid") prev.paid += 1
            fullGroupStats.set(key, prev)
        }
        const passthrough: ERPTransaction[] = []
        for (const item of result) {
            if (!item.isRecurringOccurrence && item.installmentGroupId) {
                const fullStats = fullGroupStats.get(item.installmentGroupId)
                const totalCount = fullStats?.total || item.installmentTotalCount || 0
                const paidCount = fullStats?.paid || 0
                const hasGroupPending = totalCount > 0 && paidCount < totalCount
                if (activeTab === "Transações" && hasGroupPending) {
                    continue
                }
                if (activeTab === "Transações" && !hasGroupPending && totalCount > 0 && paidCount === totalCount) {
                    const key = item.installmentGroupId
                    const pl = paidInstallmentByGroup.get(key) || []
                    pl.push(item)
                    paidInstallmentByGroup.set(key, pl)
                    continue
                }
                if (String(item.rawStatus || "").toLowerCase() === "paid") {
                    passthrough.push(item)
                    continue
                }
                const key = item.installmentGroupId
                const list = groupedInstallments.get(key) || []
                list.push(item)
                groupedInstallments.set(key, list)
            } else {
                passthrough.push(item)
            }
        }
        const collapsedPaidInstallmentGroups: ERPTransaction[] = []
        for (const [groupId, items] of paidInstallmentByGroup) {
            if (items.length === 0) continue
            const sorted = [...items].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))
            const first = sorted[0]
            const latestPaidItem =
                [...items].sort((a, b) => {
                    const aTs = new Date(a.paymentDateRaw || a.createdAtRaw || 0).getTime()
                    const bTs = new Date(b.paymentDateRaw || b.createdAtRaw || 0).getTime()
                    return bTs - aTs
                })[0] || first
            const latestPaidAt = latestPaidItem?.paymentDateRaw || latestPaidItem?.createdAtRaw || first.createdAtRaw || null
            const fullStats = fullGroupStats.get(groupId)
            const totalCount = fullStats?.total || first.installmentTotalCount || sorted.length
            const gAmt =
                first.installmentGroupTotalAmount && first.installmentGroupTotalAmount > 0
                    ? first.installmentGroupTotalAmount
                    : Math.round(sorted.reduce((acc, r) => acc + Number(r.amount || 0), 0) * 100) / 100
            const paidRow: ERPTransaction = {
                ...first,
                id: `group-${groupId}`,
                description: `${first.installmentGroupDescription || first.description} - ${totalCount}x`,
                installmentGroupId: groupId,
                installmentTotalCount: totalCount,
                installmentPaidCount: totalCount,
                installmentPendingCount: 0,
                isInstallmentGroup: true,
                groupRepresentativeTransactionId: first.id,
                createdAtRaw: latestPaidAt,
                createdAtDate: latestPaidAt ? formatDateFromRaw(latestPaidAt) || first.createdAtDate : first.createdAtDate,
                createdAtTime: latestPaidAt ? formatTimeFromRaw(latestPaidAt) || first.createdAtTime : first.createdAtTime,
                paymentDateRaw: latestPaidAt,
                amount: gAmt,
                status: first.transactionType === "income" ? "Recebido" : "Pago",
                statusVariant: "green",
            }
            collapsedPaidInstallmentGroups.push(paidRow)
        }
        const collapsedGroups: ERPTransaction[] = []
        for (const [groupId, items] of groupedInstallments) {
            if (items.length === 0) continue
            const sortedPending = [...items].sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0))
            const nextPending = sortedPending[0]
            const fullStats = fullGroupStats.get(groupId)
            const totalCount = fullStats?.total || nextPending.installmentTotalCount || sortedPending.length
            const paidCount = fullStats?.paid ?? 0
            const pendingCount = Math.max(0, totalCount - paidCount)
            if (pendingCount <= 0) continue

            const groupRemainingAmount =
                Math.round(
                    sortedPending.reduce((acc, row) => acc + Number(row.installmentRemainingAmount ?? row.amount ?? 0), 0) * 100,
                ) / 100

            collapsedGroups.push({
                ...nextPending,
                id: `group-${groupId}`,
                description: `${nextPending.installmentGroupDescription || nextPending.description} - ${totalCount}x`,
                installmentGroupId: groupId,
                installmentTotalCount: totalCount,
                installmentPaidCount: paidCount,
                installmentPendingCount: pendingCount,
                isInstallmentGroup: true,
                amount: groupRemainingAmount,
                status: `${pendingCount}/${totalCount} pendentes`,
                statusVariant: "orange",
            })
        }
        result = [...passthrough, ...collapsedGroups, ...collapsedPaidInstallmentGroups]

        const transactionSortTime = (item: ERPTransaction) => {
            const raw = item.createdAtRaw || item.paymentDateRaw || item.dueDateRaw || null
            if (!raw) return 0
            const ts = new Date(raw).getTime()
            return Number.isFinite(ts) ? ts : 0
        }

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
                        const at = activeTab !== "Transações"
                            ? a.occurrenceDate
                                ? new Date(`${a.occurrenceDate}T12:00:00`).getTime()
                                : a.dueDateRaw
                                    ? new Date(a.dueDateRaw).getTime()
                                    : new Date(a.dueDate).getTime()
                            : transactionSortTime(a)
                        const bt = activeTab !== "Transações"
                            ? b.occurrenceDate
                                ? new Date(`${b.occurrenceDate}T12:00:00`).getTime()
                                : b.dueDateRaw
                                    ? new Date(b.dueDateRaw).getTime()
                                    : new Date(b.dueDate).getTime()
                            : transactionSortTime(b)
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
        } else if (activeTab !== "Transações") {
            // ALWAYS sort A pagar/A receber by due_date ASC
            result = [...result].sort((a, b) => {
                // Use occurrenceDate for virtual items, dueDateRaw for real transactions
                const aDate = a.occurrenceDate || a.dueDateRaw || a.dueDate
                const bDate = b.occurrenceDate || b.dueDateRaw || b.dueDate
                return String(aDate).localeCompare(String(bDate))
            })
        } else {
            result = [...result].sort((a, b) => transactionSortTime(b) - transactionSortTime(a))
        }

        return result
    }, [loadedTransactions, recurringOccurrences, debouncedSearch, activeTab, filters, sortConfig])

    const { paginatedTransactions, totalPages } = useMemo(() => {
        const paginated = filteredTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
        const pages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE))
        return { paginatedTransactions: paginated, totalPages: pages }
    }, [filteredTransactions, page])

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const hasActiveFilters =
        search.length > 0 ||
        filters.status.length > 0 ||
        filters.category.length > 0 ||
        filters.paymentType.length > 0 ||
        filters.recurringOnly ||
        filters.installmentOnly ||
        isDatePeriodFilterActive(filters.datePeriod)
    const hasTransactions = loadedTransactions.length > 0

    // ── Summary cards for Recebimentos / Pagamentos pages ──────────────
    const summaryCards = useMemo(() => {
        if (!forcedTab || forcedTab === "Transações") return null

        const nowMs = Date.now()
        const nowYmd = msToBrazilYmd(nowMs)
        const currentMonth = nowYmd.slice(0, 7) // "YYYY-MM"

        let totalPending = 0
        let totalOverdue = 0
        let totalCompletedThisMonth = 0

        for (const item of filteredTransactions) {
            const status = String(item.rawStatus || "").toLowerCase()
            const isPaid = status === "paid" || item.status.toLowerCase() === "recebido" || item.status.toLowerCase() === "pago"

            if (isPaid) {
                // Check if paid this month
                const payYmd = ymdFromRaw(item.paymentDateRaw) || ymdFromRaw(item.createdAtRaw)
                if (payYmd && payYmd.startsWith(currentMonth)) {
                    totalCompletedThisMonth += item.amount
                }
            } else if (item.isOverdue || item.status.toLowerCase() === "atrasado" || (item.daysUntilDue !== undefined && item.daysUntilDue < 0)) {
                totalOverdue += item.amount
            } else {
                totalPending += item.amount
            }
        }

        const isReceivables = forcedTab === "A receber"
        return {
            pending: { label: "Pendente", value: totalPending },
            overdue: { label: "Vencido", value: totalOverdue },
            completed: {
                label: isReceivables ? "Recebido no mês" : "Pago no mês",
                value: totalCompletedThisMonth,
            },
        }
    }, [forcedTab, filteredTransactions])

    const refreshTransactionsNow = useCallback(async () => {
        // Invalidate cache + list via the entity page pattern (same as Products)
        afterMutation()
        setPage(1)
        return true
    }, [afterMutation])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })


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
        if (transaction.isInstallmentGroup) return
        if (transaction.isRecurringOccurrence && transaction.recurringTemplateId) {
            setEditingRecurringTemplateId(transaction.recurringTemplateId)
        } else {
            openEntity("edit", transaction.id)
        }
    }, [openEntity])

    const handleCloseTransactionDetail = useCallback(() => {
        closeEntity()
    }, [closeEntity])

    const handleEditFromTransactionDetail = useCallback(
        (id: string) => {
            // Products pattern: INSTANT open, NO validation
            openEntity("edit", id)
        },
        [openEntity],
    )

    const handleMarkAsPaid = useCallback(async (transaction: ERPTransaction) => {
        if (transaction.isRecurringOccurrence) {
            setConfirmRecurringPayment(transaction)
        } else {
            setConfirmRegularMarkAsPaid(transaction)
        }
    }, [])

    const handleRequestCancelPending = useCallback((transaction: ERPTransaction) => {
        const status = String(transaction.rawStatus || "").toLowerCase()
        if (transaction.isInstallmentGroup || transaction.installmentGroupId) {
            notifyError("Parcelas não podem ser canceladas por aqui.")
            return
        }
        if (status !== "pending") {
            notifyError("Apenas transações pendentes podem ser canceladas.")
            return
        }
        setCancelReason("")
        setConfirmCancelTransaction(transaction)
    }, [notifyError])

    const handleConfirmCancelPending = useCallback(async () => {
        if (!confirmCancelTransaction || cancellingTransaction) return
        setCancellingTransaction(true)
        try {
            const res = await cancelPendingTransactionAction({
                transactionId: confirmCancelTransaction.id,
                partnerId,
                reason: cancelReason.trim() || null,
            })
            if (!res.success) {
                notifyError(res.error || "Erro ao cancelar transação.")
                return
            }
            notifySuccess("Transação cancelada com sucesso.")
            setConfirmCancelTransaction(null)
            setCancelReason("")
            void refreshTransactionsNow()
        } finally {
            setCancellingTransaction(false)
        }
    }, [confirmCancelTransaction, cancellingTransaction, partnerId, cancelReason, notifyError, notifySuccess, refreshTransactionsNow])

    const handleConfirmRecurringMarkAsPaid = useCallback(async () => {
        const transaction = confirmRecurringPayment
        if (!transaction || !transaction.recurringTemplateId || !transaction.occurrenceDate) return
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
            void refreshTransactionsNow()
        } catch {
            notifyError("Erro ao marcar como pago")
        } finally {
            setMarkingAsPaid(false)
            setConfirmRecurringPayment(null)
        }
    }, [partnerId, markingAsPaid, refreshTransactionsNow, notifySuccess, notifyError, confirmRecurringPayment])

    const handleConfirmRegularMarkAsPaid = useCallback(async () => {
        const transaction = confirmRegularMarkAsPaid
        if (!transaction) return
        if (markingRegularAsPaid) return
        setMarkingRegularAsPaid(true)
        try {
            const { updateManualTransactionAction } = await import("@/app/actions/erp/transactions")

            const res = await updateManualTransactionAction(transaction.id, partnerId, {
                status: "paid",
                paymentDate: new Date().toISOString()
            } as any)

            if (!res.success) {
                notifyError(res.error || "Erro ao atualizar transação")
                return
            }
            notifySuccess(`Transação marcada como ${transaction.ledgerDirection === "in" ? "recebida" : "paga"}!`)
            void refreshTransactionsNow()
        } catch {
            notifyError("Erro ao atualizar transação")
        } finally {
            setMarkingRegularAsPaid(false)
            setConfirmRegularMarkAsPaid(null)
        }
    }, [partnerId, markingRegularAsPaid, refreshTransactionsNow, notifySuccess, notifyError, confirmRegularMarkAsPaid])

    const handleSettleInstallmentGroup = useCallback(
        async (transaction: ERPTransaction) => {
            if (!transaction.isInstallmentGroup || !transaction.installmentGroupId) return

            let detail = installmentDetail as { group?: { id?: string }; installments?: any[] } | null
            const gid = transaction.installmentGroupId
            if (!detail?.group?.id || detail.group.id !== gid) {
                const res = await getInstallmentGroupDetailsAction({ partnerId, installmentGroupId: gid })
                if (!res.success) {
                    notifyError(res.error || "Erro ao carregar parcelas para quitação.")
                    return
                }
                detail = res.data as { group?: { id?: string }; installments?: any[] }
                setInstallmentDetail(res.data)
            }

            const rows = (detail?.installments || []).filter((row: any) => row.status !== "paid")
            const nextState: Record<
                string,
                { paymentAmount: string; interestAmount: string; discountAmount: string; paymentMethodId: string }
            > = {}
            for (const row of rows) {
                nextState[row.id] = {
                    paymentAmount: String(Number(row.remainingAmount || 0).toFixed(2)),
                    interestAmount: "0",
                    discountAmount: "0",
                    paymentMethodId: resolvedPaymentMethods?.[0]?.id || "",
                }
            }
            setSettlePaymentsByInstallment(nextState)
            setSettleInstallmentPage(1)
            setConfirmSettleGroup(transaction)
        },
        [installmentDetail, resolvedPaymentMethods, partnerId, notifyError, setSettleInstallmentPage],
    )

    const handleConfirmSettleInstallmentGroup = useCallback(async () => {
        if (!confirmSettleGroup?.installmentGroupId) return
        if (settlingGroup) return
        setSettlingGroup(true)
        try {
            const res = await settleInstallmentGroupAction({
                partnerId,
                installmentGroupId: confirmSettleGroup.installmentGroupId,
                installmentPayments: Object.entries(settlePaymentsByInstallment).map(([transactionId, values]) => ({
                    transactionId,
                    paymentAmount: Number(values.paymentAmount || 0),
                    interestAmount: Number(values.interestAmount || 0),
                    discountAmount: Number(values.discountAmount || 0),
                    paymentMethodId: values.paymentMethodId || null,
                })),
            })
            if (!res.success) {
                notifyError(res.error || "Erro ao quitar parcelado")
                return
            }
            notifySuccess("Parcelado quitado com sucesso.")
            setConfirmSettleGroup(null)
            setOpenInstallmentGroupId(null)
            setInstallmentDetail(null)
            void refreshTransactionsNow()
        } finally {
            setSettlingGroup(false)
        }
    }, [confirmSettleGroup, settlingGroup, partnerId, notifyError, notifySuccess, refreshTransactionsNow, settlePaymentsByInstallment])

    const handleOpenTransactionDetail = useCallback(
        (transaction: ERPTransaction) => {
            // Installment group with pending → open installment detail view
            if (transaction.isInstallmentGroup && transaction.installmentGroupId && Number(transaction.installmentPendingCount || 0) > 0) {
                setOpenInstallmentGroupId(transaction.installmentGroupId)
                setInstallmentDetail(null)
                setInstallmentDetailLoading(true)
                void (async () => {
                    const res = await getInstallmentGroupDetailsAction({
                        partnerId,
                        installmentGroupId: transaction.installmentGroupId as string,
                    })
                    if (res.success) setInstallmentDetail(res.data)
                    else notifyError(res.error || "Erro ao carregar parcelado")
                    setInstallmentDetailLoading(false)
                })()
                return
            }
            // Fully paid installment group → view representative transaction
            if (transaction.isInstallmentGroup && Number(transaction.installmentPendingCount || 0) === 0) {
                const representativeId = transaction.groupRepresentativeTransactionId || transaction.id
                openEntity("view", representativeId)
                setEditingRecurringTemplateId(null)
                return
            }
            // Recurring occurrence → edit recurring template
            if (transaction.isRecurringOccurrence) {
                if (transaction.recurringTemplateId) {
                    setEditingRecurringTemplateId(transaction.recurringTemplateId)
                }
                return
            }
            // Standard transaction → INSTANT open (Products pattern: NO validation before openEntity)
            openEntity("view", transaction.id)
            setEditingRecurringTemplateId(null)
        },
        [partnerId, notifyError, openEntity],
    )

    const handleEditInstallment = useCallback((installmentId: string) => {
        const tx = loadedTransactions.find((item: ERPTransaction) => item.id === installmentId)
        if (!tx) {
            notifyError("Parcela não encontrada.")
            return
        }
        if (String(tx.rawStatus || "").toLowerCase() !== "pending") {
            notifyError("Apenas parcelas pendentes podem ser editadas.")
            return
        }
        setOpenInstallmentGroupId(null)
        setInstallmentDetail(null)
        openEntity("edit", tx.id)
    }, [loadedTransactions, notifyError, openEntity])

    const handlePayInstallment = useCallback(async (installmentId: string) => {
        const row = (installmentDetail?.installments || []).find((item: any) => item.id === installmentId)
        if (!row) return
        if (row.status === "paid") {
            notifyError("Parcela já está quitada.")
            return
        }
        setSelectedInstallmentForPayment(row)
        setPaymentAmount(String(Number(row.remainingAmount || 0).toFixed(2)))
        setInterestAmount("0")
        setDiscountAmount("0")
        setPaymentMethodId(resolvedPaymentMethods?.[0]?.id || "")
        setPaymentModalOpen(true)
    }, [installmentDetail, notifyError, resolvedPaymentMethods])

    const handleConfirmInstallmentPayment = useCallback(async () => {
        if (!selectedInstallmentForPayment) return
        if (payingInstallment) return
        const paid = Number(paymentAmount || 0)
        const interest = Number(interestAmount || 0)
        const discount = Number(discountAmount || 0)
        const finalPaid = paid + interest - discount
        if (!(finalPaid > 0)) {
            notifyError("Informe um valor final de pagamento maior que zero.")
            return
        }
        setPayingInstallment(true)
        try {
            const res = await recordInstallmentPaymentAction({
                partnerId,
                transactionId: selectedInstallmentForPayment.id,
                paymentAmount: paid,
                interestAmount: interest,
                discountAmount: discount,
                paymentMethodId: paymentMethodId || null,
            })
            if (!res.success) {
                notifyError(res.error || "Erro ao registrar pagamento")
                return
            }
            notifySuccess(res.data.fullyPaid ? "Parcela quitada com sucesso." : "Pagamento parcial registrado.")
            setPaymentModalOpen(false)
            setSelectedInstallmentForPayment(null)
            void refreshTransactionsNow()
        } finally {
            setPayingInstallment(false)
        }
    }, [
        selectedInstallmentForPayment,
        payingInstallment,
        paymentAmount,
        interestAmount,
        discountAmount,
        partnerId,
        paymentMethodId,
        notifyError,
        notifySuccess,
        refreshTransactionsNow,
    ])

    const renderSharedModals = () => {
        return (
            <>
                <DefaultModal
                    isOpen={!!confirmCancelTransaction}
                    onClose={() => {
                        if (cancellingTransaction) return
                        setConfirmCancelTransaction(null)
                        setCancelReason("")
                    }}
                    title="Cancelar transação pendente"
                    maxWidth="md"
                >
                    {confirmCancelTransaction ? (
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text">
                                Esta ação marca a transação como cancelada e salva o histórico automaticamente.
                            </p>
                            <InfoCard
                                title={confirmCancelTransaction.description}
                                message={`Valor: ${formatCurrency(confirmCancelTransaction.amount)} • Status atual: ${confirmCancelTransaction.status}`}
                                color="red"
                            />
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Motivo (opcional)</label>
                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    rows={3}
                                    maxLength={120}
                                    className="w-full rounded-lg border border-brand-border dark:border-dark-border px-3 py-2 bg-white dark:bg-dark-surface/50 text-sm outline-none focus:border-brand-primary"
                                    placeholder="Ex: cobrança duplicada"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setConfirmCancelTransaction(null)} disabled={cancellingTransaction}>
                                    Voltar
                                </Button>
                                <Button variant="destructive" onClick={() => void handleConfirmCancelPending()} disabled={cancellingTransaction}>
                                    Confirmar cancelamento
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DefaultModal>

                <DefaultModal
                    isOpen={!!confirmRegularMarkAsPaid}
                    onClose={() => {
                        if (markingRegularAsPaid) return
                        setConfirmRegularMarkAsPaid(null)
                    }}
                    title={`Confirmar ${confirmRegularMarkAsPaid?.ledgerDirection === "in" ? "recebimento" : "pagamento"}`}
                    maxWidth="md"
                >
                    {confirmRegularMarkAsPaid ? (
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text">
                                Deseja marcar esta transação como {confirmRegularMarkAsPaid.ledgerDirection === "in" ? "recebida" : "paga"}?
                            </p>
                            <div className="rounded-lg border border-brand-border dark:border-dark-border p-3 text-sm">
                                <p className="font-semibold">{confirmRegularMarkAsPaid.description}</p>
                                <p className="text-brand-inactive-text mt-1">
                                    Valor: {formatCurrency(confirmRegularMarkAsPaid.amount)} • Vencimento: {confirmRegularMarkAsPaid.dueDate}
                                </p>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setConfirmRegularMarkAsPaid(null)} disabled={markingRegularAsPaid}>
                                    Cancelar
                                </Button>
                                <Button onClick={() => void handleConfirmRegularMarkAsPaid()} disabled={markingRegularAsPaid}>
                                    Confirmar
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DefaultModal>

                <DefaultModal
                    isOpen={!!confirmRecurringPayment}
                    onClose={() => {
                        if (markingAsPaid) return
                        setConfirmRecurringPayment(null)
                    }}
                    title="Confirmar pagamento da ocorrência"
                    maxWidth="md"
                >
                    {confirmRecurringPayment ? (
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text">
                                Deseja marcar esta ocorrência recorrente como paga/recebida?
                            </p>
                            <div className="rounded-lg border border-brand-border dark:border-dark-border p-3 text-sm">
                                <p className="font-semibold">{confirmRecurringPayment.description}</p>
                                <p className="text-brand-inactive-text mt-1">
                                    Valor: {formatCurrency(confirmRecurringPayment.amount)} • Data: {confirmRecurringPayment.occurrenceDate}
                                </p>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setConfirmRecurringPayment(null)} disabled={markingAsPaid}>
                                    Cancelar
                                </Button>
                                <Button onClick={() => void handleConfirmRecurringMarkAsPaid()} disabled={markingAsPaid}>
                                    Confirmar
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DefaultModal>

                <DefaultModal
                    isOpen={paymentModalOpen}
                    onClose={() => {
                        if (payingInstallment) return
                        setPaymentModalOpen(false)
                        setSelectedInstallmentForPayment(null)
                    }}
                    title="Registrar pagamento da parcela"
                    maxWidth="md"
                >
                    {selectedInstallmentForPayment ? (
                        <div className="space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                            {selectedInstallmentForPayment.description}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            <Badge variant="gray">
                                                Parcela {selectedInstallmentForPayment.installmentNumber}
                                            </Badge>
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                Vence em {selectedInstallmentForPayment.dueDate || "-"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Restante</p>
                                        <p className="font-bold text-[18px] text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(Number(selectedInstallmentForPayment.remainingAmount || 0))}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <MoneyInput
                                        label="Valor do pagamento"
                                        value={Number(paymentAmount || 0)}
                                        onChange={(value) => setPaymentAmount(String(value))}
                                        min={0}
                                    />
                                    <FormDropdown
                                        label="Meio de pagamento"
                                        value={paymentMethodId}
                                        setValue={setPaymentMethodId}
                                        options={(resolvedPaymentMethods || []).map((pm: any) => ({
                                            value: pm.id,
                                            label: pm.name,
                                        }))}
                                        placeholder="Selecione"
                                    />
                                    <MoneyInput
                                        label="Juros"
                                        value={Number(interestAmount || 0)}
                                        onChange={(value) => setInterestAmount(String(value))}
                                        min={0}
                                    />
                                    <MoneyInput
                                        label="Desconto"
                                        value={Number(discountAmount || 0)}
                                        onChange={(value) => setDiscountAmount(String(value))}
                                        min={0}
                                    />
                                </div>

                                <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">Total a processar</p>
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                            Valor final com juros e desconto aplicados.
                                        </p>
                                    </div>
                                    <p className="font-bold text-[20px] text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(Math.max(0, Number(paymentAmount || 0) + Number(interestAmount || 0) - Number(discountAmount || 0)))}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (payingInstallment) return
                                        setPaymentModalOpen(false)
                                        setSelectedInstallmentForPayment(null)
                                    }}
                                >
                                    Cancelar
                                </Button>
                                <Button onClick={() => void handleConfirmInstallmentPayment()} disabled={payingInstallment}>
                                    Confirmar pagamento
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DefaultModal>

                <SavingStatusModal
                    isOpen={
                        settlingGroup ||
                        payingInstallment ||
                        markingAsPaid ||
                        markingRegularAsPaid ||
                        cancellingTransaction
                    }
                    text={
                        settlingGroup
                            ? "Quitando parcelas..."
                            : payingInstallment
                            ? "Registrando pagamento da parcela..."
                            : markingAsPaid || markingRegularAsPaid
                            ? "Registrando pagamento..."
                            : cancellingTransaction
                            ? "Cancelando transação..."
                            : "Salvando..."
                    }
                />
            </>
        )
    }

    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        if (isLoadingDetail) {
            return (
                <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                    <ThreeDotsLoader />
                </div>
            )
        }
        return (
            <motion.div
                key={`tx-detail-${entityState.entityId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full min-h-[70vh]"
            >
                <TransactionDetailView
                    transactionId={entityState.entityId}
                    partnerId={partnerId}
                    onBack={handleCloseTransactionDetail}
                    onEdit={handleEditFromTransactionDetail}
                    initialDetail={currentEntity as TransactionDetailPayload | null}
                    loading={!currentEntity}
                    onEditInstallment={handleEditInstallment}
                    onPayInstallment={handlePayInstallment}
                />
                {renderSharedModals()}
            </motion.div>
        )
    }

    if (confirmSettleGroup) {
        const total = Number(installmentDetail?.group?.total_amount || 0)
        const rows = installmentDetail?.installments || []
        const paid = rows.reduce((acc: number, row: any) => acc + Number(row.paidAmount || 0), 0)
        const pending = Math.max(0, total - paid)
        const pendingInstallments = rows.filter((row: any) => row.status !== "paid")
        const pendingCount = pendingInstallments.length
        const settleTotalPages = Math.max(1, Math.ceil(pendingCount / SETTLE_PAGE_SIZE))
        const settlePageClamped = Math.min(settleInstallmentPage, settleTotalPages)
        const paginatedPendingInstallments = pendingInstallments.slice(
            (settlePageClamped - 1) * SETTLE_PAGE_SIZE,
            settlePageClamped * SETTLE_PAGE_SIZE
        )

        return (
            <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out px-4 md:px-6">
                    <div className="max-w-[1300px] mx-auto relative md:pt-4">

                        {/* Back button - desktop only */}
                        <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 scale-100">
                            <Button variant="filled" onClick={() => setConfirmSettleGroup(null)} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="truncate">Quitar todas as parcelas</span>
                                </h1>
                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Grupo: {confirmSettleGroup.installmentGroupDescription || confirmSettleGroup.installmentGroupId}
                                </div>
                            </div>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                <Button variant="outline" onClick={() => setConfirmSettleGroup(null)} disabled={settlingGroup}>
                                    Cancelar
                                </Button>
                                <Button onClick={() => void handleConfirmSettleInstallmentGroup()} disabled={settlingGroup} leftIcon={<SaveIcon size={18} />}>
                                    Confirmar quitação
                                </Button>
                            </div>
                        </div>

                        {/* Mobile Title row */}
                        <div className="flex md:hidden items-center gap-3 py-3">
                            <Button variant="filled" onClick={() => setConfirmSettleGroup(null)} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                            <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                                <h1 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">
                                    Quitar todas as parcelas
                                </h1>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {confirmSettleGroup.installmentGroupDescription || confirmSettleGroup.installmentGroupId}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-[1300px] mx-auto w-full custom-scrollbar pb-24 md:pb-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                                    <FileIcon className="w-5 h-5" />
                                </div>
                                <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                    Total
                                </span>
                            </div>
                            <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                                {formatCurrency(total)}
                            </span>
                        </div>

                        <div className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                                    <CheckCircleIcon className="w-5 h-5" />
                                </div>
                                <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                    Pago
                                </span>
                            </div>
                            <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                                {formatCurrency(paid)}
                            </span>
                        </div>

                        <div className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 shrink-0">
                                    <ClockIcon className="w-5 h-5" />
                                </div>
                                <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                    Restante
                                </span>
                            </div>
                            <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                                {formatCurrency(pending)}
                            </span>
                        </div>

                        <div className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 shrink-0">
                                    <InstallmentIcon className="w-5 h-5" />
                                </div>
                                <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                    Parcelas a quitar
                                </span>
                            </div>
                            <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                                {pendingCount}
                            </span>
                        </div>

                        <div className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 shrink-0">
                                    <CashierIcon className="w-5 h-5" />
                                </div>
                                <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                    Valor total da quitação
                                </span>
                            </div>
                            <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none text-brand-green">
                                {formatCurrency(settleModalTotalToPay)}
                            </span>
                        </div>
                    </div>

                    {/* Table / List Container */}
                    <FormSection hasSeparator title="Parcelas pendentes">
                        {pendingInstallments.length === 0 ? (
                            <IconPlaceholder
                                icon={InstallmentIcon}
                                title="Nenhuma parcela pendente encontrada neste grupo."
                                subtitle="Nenhuma parcela pendente encontrada neste grupo. Verifique se as parcelas não foram pagas ou canceladas." />
                        ) : (
                            <>
                                {/* Desktop Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">Parcela</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Vencimento</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Restante</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "160px" }}>Valor Pagamento</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "176px" }}>Meio de Pagamento</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "112px" }}>Juros</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "112px" }}>Desconto</th>
                                                    <th className="py-3 px-2 pr-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-r-lg text-right">Total a Pagar</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedPendingInstallments.map((row: any) => {
                                                    const values = settlePaymentsByInstallment[row.id] || {
                                                        paymentAmount: String(Number(row.remainingAmount || 0).toFixed(2)),
                                                        interestAmount: "0",
                                                        discountAmount: "0",
                                                        paymentMethodId: paymentMethods?.[0]?.id || "",
                                                    }
                                                    const finalPaid = Math.max(0, Number(values.paymentAmount || 0) + Number(values.interestAmount || 0) - Number(values.discountAmount || 0))
                                                    return (
                                                        <motion.tr
                                                            key={row.id}
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background"
                                                        >
                                                            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border">
                                                                <div className="flex flex-col text-left min-w-0">
                                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                                                            {row.description}
                                                                        </span>
                                                                        <Badge variant="gray" className="whitespace-nowrap scale-90 shrink-0">
                                                                            {row.installmentNumber}/{row.totalCount || pendingInstallments.length}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                    {row.dueDate || "-"}
                                                                </span>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border">
                                                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(Number(row.remainingAmount || 0))}
                                                                </span>
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border" style={{ width: "160px" }}>
                                                                <MoneyInput
                                                                    value={Number(values.paymentAmount || 0)}
                                                                    onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                        ...prev,
                                                                        [row.id]: { ...values, paymentAmount: String(value) }
                                                                    }))}
                                                                    min={0}
                                                                />
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border" style={{ width: "176px" }}>
                                                                <FormDropdown
                                                                    value={values.paymentMethodId}
                                                                    setValue={(val: string) => setSettlePaymentsByInstallment((prev) => ({
                                                                        ...prev,
                                                                        [row.id]: { ...values, paymentMethodId: val }
                                                                    }))}
                                                                    options={(resolvedPaymentMethods || []).map((pm: any) => ({
                                                                        value: pm.id,
                                                                        label: pm.name,
                                                                    }))}
                                                                    placeholder="Selecione"
                                                                />
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border" style={{ width: "112px" }}>
                                                                <MoneyInput
                                                                    value={Number(values.interestAmount || 0)}
                                                                    onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                        ...prev,
                                                                        [row.id]: { ...values, interestAmount: String(value) }
                                                                    }))}
                                                                    min={0}
                                                                />
                                                            </td>
                                                            <td className="p-2 border-b border-brand-border dark:border-dark-border" style={{ width: "112px" }}>
                                                                <MoneyInput
                                                                    value={Number(values.discountAmount || 0)}
                                                                    onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                        ...prev,
                                                                        [row.id]: { ...values, discountAmount: String(value) }
                                                                    }))}
                                                                    min={0}
                                                                />
                                                            </td>
                                                            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-right">
                                                                <div className="flex items-center justify-end">
                                                                    <span className="text-[13px] font-bold whitespace-nowrap text-brand-green">
                                                                        {formatCurrency(finalPaid)}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Mobile Stacked View */}
                                <div className="md:hidden space-y-3 pb-24">
                                    {paginatedPendingInstallments.map((row: any) => {
                                        const values = settlePaymentsByInstallment[row.id] || {
                                            paymentAmount: String(Number(row.remainingAmount || 0).toFixed(2)),
                                            interestAmount: "0",
                                            discountAmount: "0",
                                            paymentMethodId: paymentMethods?.[0]?.id || "",
                                        }
                                        const finalPaid = Math.max(0, Number(values.paymentAmount || 0) + Number(values.interestAmount || 0) - Number(values.discountAmount || 0))
                                        return (
                                            <motion.div
                                                key={row.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 flex flex-col"
                                            >
                                                {/* Card Header */}
                                                <div className="flex gap-3 mb-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                        <InstallmentIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <h3 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink">
                                                                {row.description}
                                                            </h3>
                                                            <Badge variant="gray" icon={null} className="whitespace-nowrap scale-90 shrink-0">
                                                                {row.installmentNumber}/{row.totalCount || pendingInstallments.length}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                Venc: {row.dueDate || "-"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Value section */}
                                                <div className="border-t border-brand-border dark:border-dark-border pt-3 flex flex-col gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Restante</span>
                                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(Number(row.remainingAmount || 0))}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <MoneyInput
                                                            label="Valor Pagamento"
                                                            value={Number(values.paymentAmount || 0)}
                                                            onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                ...prev,
                                                                [row.id]: { ...values, paymentAmount: String(value) }
                                                            }))}
                                                            min={0}
                                                        />
                                                        <FormDropdown
                                                            label="Meio de Pagamento"
                                                            value={values.paymentMethodId}
                                                            setValue={(val: string) => setSettlePaymentsByInstallment((prev) => ({
                                                                ...prev,
                                                                [row.id]: { ...values, paymentMethodId: val }
                                                            }))}
                                                            options={(resolvedPaymentMethods || []).map((pm: any) => ({
                                                                value: pm.id,
                                                                label: pm.name,
                                                            }))}
                                                            placeholder="Selecione"
                                                        />
                                                        <MoneyInput
                                                            label="Juros"
                                                            value={Number(values.interestAmount || 0)}
                                                            onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                ...prev,
                                                                [row.id]: { ...values, interestAmount: String(value) }
                                                            }))}
                                                            min={0}
                                                        />
                                                        <MoneyInput
                                                            label="Desconto"
                                                            value={Number(values.discountAmount || 0)}
                                                            onChange={(value) => setSettlePaymentsByInstallment((prev) => ({
                                                                ...prev,
                                                                [row.id]: { ...values, discountAmount: String(value) }
                                                            }))}
                                                            min={0}
                                                        />
                                                    </div>

                                                    <div className="flex justify-between items-center bg-brand-green/5 px-4 py-3 rounded-xl border border-brand-green/10">
                                                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total a Pagar</span>
                                                        <span className="text-[15px] font-bold text-brand-green">{formatCurrency(finalPaid)}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>

                                {/* Pagination */}
                                {pendingCount > SETTLE_PAGE_SIZE && (
                                    <Pagination
                                        currentPage={settlePageClamped}
                                        totalPages={settleTotalPages}
                                        onPageChange={setSettleInstallmentPage}
                                        inline
                                    />
                                )}
                            </>
                        )}
                    </FormSection>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button variant="outline" onClick={() => setConfirmSettleGroup(null)} disabled={settlingGroup} className="flex-1 h-12">
                        Cancelar
                    </Button>
                    <Button onClick={() => void handleConfirmSettleInstallmentGroup()} disabled={settlingGroup} leftIcon={<SaveIcon size={18} />} className="flex-1 h-12">
                        Confirmar quitação
                    </Button>
                </div>

                {renderSharedModals()}
            </FadeIn>
        )
    }

    if (openInstallmentGroupId) {
        return (
            <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                        <div className="flex items-center gap-3">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500`}>
                                <Button variant="filled" onClick={() => {
                                    setOpenInstallmentGroupId(null)
                                    setInstallmentDetail(null)
                                }} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>
                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className="font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 text-xl md:text-3xl">
                                        <span className="truncate">Detalhes do parcelamento</span>
                                    </h1>

                                    <div className="hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden max-h-20">
                                        Resumo completo e lista de parcelas
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cells grid */}
                        {installmentDetailLoading ? (
                            <p className="text-sm text-brand-inactive-text">Carregando parcelas...</p>
                        ) : installmentDetail ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {(() => {
                                        const total = Number(installmentDetail.group?.total_amount || 0)
                                        const rows = installmentDetail.installments || []
                                        const paid = rows.reduce((acc: number, row: any) => acc + Number(row.paidAmount || 0), 0)
                                        const overdue = rows
                                            .filter((row: any) => row.status === "overdue")
                                            .reduce((acc: number, row: any) => acc + Number(row.remainingAmount || 0), 0)
                                        const pending = Math.max(0, total - paid)
                                        const cards = [
                                            {
                                                label: "Total",
                                                value: total,
                                                icon: FileIcon,
                                                bg: "bg-indigo-50 dark:bg-indigo-950/20",
                                                text: "text-indigo-600 dark:text-indigo-400",
                                            },
                                            {
                                                label: "Pago",
                                                value: paid,
                                                icon: CheckCircleIcon,
                                                bg: "bg-emerald-50 dark:bg-emerald-950/20",
                                                text: "text-emerald-600 dark:text-emerald-400",
                                            },
                                            {
                                                label: "Restante",
                                                value: pending,
                                                icon: ClockIcon,
                                                bg: "bg-amber-50 dark:bg-amber-950/20",
                                                text: "text-amber-600 dark:text-amber-400",
                                            },
                                            {
                                                label: "Vencido",
                                                value: overdue,
                                                icon: AlertTriangleIcon,
                                                bg: "bg-rose-50 dark:bg-rose-950/20",
                                                text: "text-rose-600 dark:text-rose-400",
                                            },
                                        ]
                                        return cards.map((card) => {
                                            const Icon = card.icon
                                            return (
                                                <div key={card.label} className="relative flex flex-col p-5 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.bg} ${card.text} shrink-0`}>
                                                            <Icon className="w-5 h-5" />
                                                        </div>
                                                        <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading">
                                                            {card.label}
                                                        </span>
                                                    </div>
                                                    <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                                                        {formatCurrency(card.value)}
                                                    </span>
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                                <div className="mt-4 border-t border-brand-border dark:border-dark-border pt-2">
                                    <InstallmentParcelsTable
                                        rows={
                                            (installmentDetail.installments || []).map(
                                                (row: any): InstallmentParcelRow => ({
                                                    id: row.id,
                                                    installmentNumber: row.installmentNumber,
                                                    totalCount: Number(installmentDetail.group?.installments_count) || 0,
                                                    status: row.status,
                                                    originalAmount: Number(row.originalAmount || 0),
                                                    paidAmount: Number(row.paidAmount || 0),
                                                    interestAmount: row.interestAmount != null ? Number(row.interestAmount) : undefined,
                                                    discountAmount: row.discountAmount != null ? Number(row.discountAmount) : undefined,
                                                    dueDate: row.dueDate ? String(row.dueDate) : null,
                                                    finalizationDate: row.paymentDate ? String(row.paymentDate) : null,
                                                    paymentType: row.paymentType ? String(row.paymentType) : null,
                                                    reason: String(installmentDetail.group?.description || "Parcela"),
                                                    reference: String(row.description || "-"),
                                                }),
                                            )
                                        }
                                        getActionsSlot={(row) =>
                                            row.status === "paid" ? null : (
                                                <ActionsDropdown>
                                                    <DropdownItem onClick={() => void handlePayInstallment(row.id)}>
                                                        <MoneyIcon className="w-4 h-4" /> Registrar pagamento
                                                    </DropdownItem>
                                                </ActionsDropdown>
                                            )
                                        }
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-brand-inactive-text">Nenhum detalhe encontrado.</p>
                        )}
                    </div>
                </div>
                {renderSharedModals()}
            </FadeIn>
        )
    }

    const isFormOpen = (entityState.isOpen && (entityState.action === "create" || entityState.action === "edit" || entityState.action === "duplicate")) || !!editingRecurringTemplateId
    // Plain expression (NOT useMemo - can't use hooks after early returns)
    const editingTx = (entityState.isOpen && entityState.action === "edit" && entityState.entityId)
        ? loadedTransactions.find((t: ERPTransaction) => t.id === entityState.entityId) || null
        : null

    if (isFormOpen) {
        if (entityState.action === "edit" && isLoadingDetail) {
            return (
                <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                    <ThreeDotsLoader />
                </div>
            )
        }
        return (
            <motion.div
                key={editingRecurringTemplateId ? `edit-rec-${editingRecurringTemplateId}` : editingTx ? `edit-${editingTx.id}` : "create-transaction"}
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
                    editTransaction={editingTx || undefined}
                    editRecurringTemplateId={editingRecurringTemplateId || undefined}
                    editRecurringTemplate={editingRecurringTemplateId ? recurringTemplates?.find((t: any) => t.id === editingRecurringTemplateId) : undefined}
                    forcedTab={forcedTab}
                    onClose={() => {
                        closeEntity()
                        setEditingRecurringTemplateId(null)
                    }}
                    onSuccess={() => {
                        // Invalidate caches + close (same pattern as Products)
                        if (entityState.entityId) cache.invalidateEntity(entityState.entityId)
                        afterMutation(entityState.entityId || undefined)
                        closeEntity()
                        setEditingRecurringTemplateId(null)
                    }}
                />
            </motion.div>
        )
    }

    return (
        <FadeIn
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
                            {pageTitle || "Transações Financeiras"}
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            {pageSubtitle || "Acompanhe contas a pagar, receber e movimentações do financeiro."}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => { }}>
                            <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
                        </Button>

                        <Button onClick={() => openEntity("create")}>
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Nova transação
                        </Button>
                    </div>
                </div>

                <TransactionPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setModals((prev) => ({ ...prev, filter: true }))}
                    onAddTransaction={() => openEntity("create")}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                    addDisabled={false}
                    hideTabs={!!forcedTab}
                />

                {/* ── Summary cards (Recebimentos / Pagamentos only) ── */}
                {summaryCards && hasTransactions && (
                    <div className="grid grid-cols-3 gap-3 md:gap-4 mb-5 px-4 md:px-8">
                        <div className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 md:p-4 transition-colors">
                            <p className="text-[11px] md:text-xs font-bold text-brand-inactive-text uppercase tracking-wider mb-1">
                                {summaryCards.pending.label}
                            </p>
                            <p className="text-lg md:text-xl font-bold text-orange-500">
                                {formatCurrency(summaryCards.pending.value)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 md:p-4 transition-colors">
                            <p className="text-[11px] md:text-xs font-bold text-brand-inactive-text uppercase tracking-wider mb-1">
                                {summaryCards.overdue.label}
                            </p>
                            <p className="text-lg md:text-xl font-bold text-brand-red">
                                {formatCurrency(summaryCards.overdue.value)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 md:p-4 transition-colors">
                            <p className="text-[11px] md:text-xs font-bold text-brand-inactive-text uppercase tracking-wider mb-1">
                                {summaryCards.completed.label}
                            </p>
                            <p className="text-lg md:text-xl font-bold text-brand-green">
                                {formatCurrency(summaryCards.completed.value)}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {!hasTransactions ? (
                            <FadeIn
                                key="empty-no-data"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/Transacoes.png"
                                    imageAlt="Sem transações"
                                    title="Você ainda não tem transações"
                                    subtitle="As movimentações financeiras vão aparecer aqui assim que forem cadastradas."
                                    itemButton={{
                                        text: "Adicionar primeira transação",
                                        action: () => openEntity("create")
                                    }}
                                />
                            </FadeIn>
                        ) : paginatedTransactions.length === 0 ? (
                            <FadeIn
                                key="empty-results"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma transação encontrada"
                                    title="Nenhuma transação encontrada"
                                    subtitle="Tente ajustar os filtros ou o termo de busca."
                                    itemButton={{
                                        text: "Limpar filtros",
                                        action: handleClearFilters,
                                        variant: "outline",
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn
                                key={activeTab + effectiveViewMode}
                                className="w-full"
                            >
                                {effectiveViewMode === "grid" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedTransactions.map((transaction) => (
                                            <TransactionGridCard
                                                key={transaction.id}
                                                transaction={transaction}
                                                selected={selection.ids.has(transaction.id)}
                                                onSelect={handleSelectRow}
                                                onOpenDetail={handleOpenTransactionDetail}
                                                onEdit={handleEditTransaction}
                                                onMarkAsPaid={handleMarkAsPaid}
                                                onCancelPending={handleRequestCancelPending}
                                                onSettleInstallmentGroup={handleSettleInstallmentGroup}
                                                {...getPrefetchProps(transaction.id)}
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
                                                            onOpenDetail={handleOpenTransactionDetail}
                                                            onEdit={handleEditTransaction}
                                                            onMarkAsPaid={handleMarkAsPaid}
                                                            onCancelPending={handleRequestCancelPending}
                                                            onSettleInstallmentGroup={handleSettleInstallmentGroup}
                                                            {...getPrefetchProps(transaction.id)}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                            {/* <div ref={observerTarget} className="h-10" /> */}
                                        </div>
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                    {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                </div>

                {paginatedTransactions.length > 0 && (
                    <div className="space-y-3">
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
                        {hasNextPage && page === totalPages && isFetchingNextPage ? (
                            <div className="flex flex-col gap-2 py-2 px-4">
                                <SkeletonLoader className="h-10 w-full max-w-lg mx-auto rounded-lg" />
                                <SkeletonLoader className="h-10 w-full max-w-lg mx-auto rounded-lg opacity-70" />
                            </div>
                        ) : null}
                    </div>
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

            {renderSharedModals()}
        </FadeIn>
    )
}
