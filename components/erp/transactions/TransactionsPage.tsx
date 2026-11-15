"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Checkbox, IconPlaceholder, Badge, FormDropdown, MoneyInput, ThreeDotsLoader, InfoCard, FormSection, SavingStatusModal } from "@/components/reusable"
import { KPICard } from "@/components/erp/dashboard/cards/KPICard"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import { SelectionBanner } from "@/components/reusable/SelectionBanner"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"
import { diffCalendarDaysInSaoPaulo, formatBrazilDateFromDbInput } from "@/lib/utils/formatters"
import { PlusIcon, ExportFileIcon, ArrowUpDownIcon, CreditCardIcon, FileIcon, MoneyIcon, EditIcon, ClockIcon, InstallmentIcon, CheckCircleIcon, CashierIcon, SaveIcon, ShoppingCartIcon, Users } from "@/lib/icons"
import TransactionPageControls from "./TransactionPageControls"
import TransactionListItem from "./TransactionListRow"
import TransactionGridCard from "./TransactionGridCard"
import CreateTransactionPage, { type CategoryItem, type AccountItem } from "./CreateTransactionPage"
import TransactionDetailView from "./TransactionDetailView"
import TransactionPrintModal from "./TransactionPrintModal"
import type { ERPTransaction, FinancialTransactionCursor, TransactionTab } from "@/lib/services/transactions.types"
import type { RecurringOccurrence } from "@/app/actions/erp/recurring-transactions"
import { markRecurringOccurrenceAsPaidAction, recordRegularTransactionPaymentAction } from "@/app/actions/erp/transactions"
import { getInstallmentGroupDetailsAction } from "@/app/actions/erp/transactions"
import { recordInstallmentPaymentAction } from "@/app/actions/erp/transactions"
import { settleInstallmentGroupAction } from "@/app/actions/erp/transactions"
import { getFinancialTransactionsAction, getTransactionDetailsAction, type TransactionDetailPayload } from "@/app/actions/erp/transactions"
import { cancelPendingTransactionAction, updateFinancialTransactionsInBatchAction } from "@/app/actions/erp/transactions"
import { getPaymentMethodsAction } from "@/app/actions/erp/payment-methods"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"
import { BulkEditActionsModal, type BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import { useUndoGracePeriod } from "@/hooks/use-undo-grace-period"
import { UndoGracePeriodToast } from "@/components/reusable/UndoGracePeriodToast"
import { STANDARD_PAYMENT_METHODS, resolveStandardPaymentMethod, pickBankThenCashDefaultFinanceAccountId, findMercadoPagoAccountId, isMercadoPagoPaymentType } from "@/lib/finance-utils"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useNotification } from "@/hooks/use-notification"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { usePermissions } from "@/lib/permission-context"
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
import { useErpExport } from "@/hooks/use-erp-export"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import { usePartnerTimezone } from "@/lib/store-context"

function ymdFromRaw(raw: string | null | undefined): string | null {
    if (!raw) return null
    const t = new Date(raw as string).getTime()
    if (Number.isNaN(t)) return String(raw).slice(0, 10)
    return msToBrazilYmd(t)
}

function formatDateFromRaw(raw: string | null | undefined, tz?: string): string | null {
    if (!raw) return null
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return null
    return dt.toLocaleDateString("pt-BR", { timeZone: tz })
}

function formatTimeFromRaw(raw: string | null | undefined, tz?: string): string | null {
    if (!raw) return null
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return null
    return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz })
}

/** Tabs of the main Transações page (Todas / Entradas / Saídas): show settled movements by payment date. */
function isSettledTab(tab: TransactionTab): boolean {
    return tab === "Transações" || tab === "Entradas" || tab === "Saídas"
}

/** A pagar/A receber: vencimento/ocorrência. Transações: pagamento efetivo, senão vencimento. */
function transactionFilterYmd(item: ERPTransaction, tab: TransactionTab): string | null {
    if (!isSettledTab(tab)) {
        if (item.occurrenceDate) return item.occurrenceDate.slice(0, 10)
        return ymdFromRaw(item.dueDateRaw)
    }
    if (item.paymentDateRaw) return ymdFromRaw(item.paymentDateRaw)
    return ymdFromRaw(item.dueDateRaw)
}

function isCancelledTransaction(item: ERPTransaction): boolean {
    return (
        String(item.rawStatus || "").toLowerCase().includes("cancel") ||
        String(item.status || "").toLowerCase().includes("cancel")
    )
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
    { id: "contact", label: "Contato", align: "left", width: "220px" },
    { id: "category", label: "Categoria", align: "left", width: "170px" },
    { id: "originSource", label: "Origem", align: "left", width: "150px" },
    { id: "date", label: "Data", align: "left", width: "130px" },
    { id: "dueDate", label: "Vencimento", align: "left", width: "130px" },
    { id: "amount", label: "Valor", align: "right", width: "100px" },
    { id: "status", label: "Status", align: "center", width: "100px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

const BoletoIcon = ({ className }: { className?: string }) => (
    <img src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className={className} />
)

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return BoletoIcon
    return MoneyIcon
}

export default function TransactionsPage({
    initialItems,
    initialNextCursor,
    initialHasMore,
    partnerId,
    storeId: storeIdProp,
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
    storeId?: string | null
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
    const tz = usePartnerTimezone()
    const { planSlug } = usePermissions()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")

    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTabState] = useState<TransactionTab>(forcedTab || "Transações")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const setActiveTab = useCallback((tab: TransactionTab) => {
        setActiveTabState(tab)
        setSelection({ ids: new Set() })
    }, [])
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [bulkModalOpen, setBulkModalOpen] = useState(false)
    const [printTransactionId, setPrintTransactionId] = useState<string | null>(null)
    const undoManager = useUndoGracePeriod(10000)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [installmentDetail, setInstallmentDetail] = useState<any | null>(null)
    const [payingInstallment, setPayingInstallment] = useState(false)
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [paymentAttemptId, setPaymentAttemptId] = useState<string | null>(null)
    const [selectedInstallmentForPayment, setSelectedInstallmentForPayment] = useState<any | null>(null)
    const [paymentAmount, setPaymentAmount] = useState("")
    const [interestAmount, setInterestAmount] = useState("0")
    const [discountAmount, setDiscountAmount] = useState("0")
    const [paymentMethodId, setPaymentMethodId] = useState("Pix")
    const [financeAccountId, setFinanceAccountId] = useState<string>("")
    const [mpPaymentLocked, setMpPaymentLocked] = useState(false)
    const [financeAccounts, setFinanceAccounts] = useState<any[]>([])
    const [fallbackPaymentMethods, setFallbackPaymentMethods] = useState<any[]>([])
    const [confirmRecurringPayment, setConfirmRecurringPayment] = useState<ERPTransaction | null>(null)
    const [paymentBalanceWarningOpen, setPaymentBalanceWarningOpen] = useState(false)
    const [paymentBalanceWarningMeta, setPaymentBalanceWarningMeta] = useState<{
        accountName: string
        currentBalance: number
        amount: number
    }>({ accountName: "", currentBalance: 0, amount: 0 })
    const skipPaymentBalanceWarningRef = useRef(false)
    const [confirmSettleGroup, setConfirmSettleGroup] = useState<ERPTransaction | null>(null)
    const [settleAccountId, setSettleAccountId] = useState<string | null>(null)
    const [confirmCancelTransaction, setConfirmCancelTransaction] = useState<ERPTransaction | null>(null)
    const [cancelReason, setCancelReason] = useState("")
    const [cancellingTransaction, setCancellingTransaction] = useState(false)
    const [settlingGroup, setSettlingGroup] = useState(false)
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)
    const observerTarget = useRef<HTMLDivElement>(null)

    const [storeId] = useState<string | null>(storeIdProp || null)

    const entityPage = useEntityPage<ERPTransaction, TransactionDetailPayload, FinancialTransactionCursor>({
        entityType: "transactions",
        partnerId,
        queryKey: financialTransactionsQueryKey(partnerId),
        initialItems,
        initialNextCursor,
        initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getFinancialTransactionsAction(partnerId, { cursor, storeId })
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
            paymentDateSubtitle: item.paymentDateRaw ? (item.paymentDateDate || formatBrazilDateFromDbInput(item.paymentDateRaw, "dayMonthYear")) : (item.dueDate || null),
            creatorName: "...",
            originLabel: item.origin === "manual" ? "Manual" : item.origin === "gateway" ? "Gateway" : "Sistema",
            originSource: item.originSource || "Manual",
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

    // --- Handlers ---
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

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
                const res = await getPaymentMethodsAction(partnerId)
                if (!active) return
                const list = Array.isArray(res) ? res : res?.methods || []
                setFallbackPaymentMethods(list)
            })()
        return () => {
            active = false
        }
    }, [paymentMethods, partnerId])

    useEffect(() => {
        let active = true
            ; (async () => {
                const res = await getFinanceAccountsAction(partnerId)
                if (!active) return
                if (res.success && res.data?.accounts) {
                    setFinanceAccounts(res.data.accounts.filter((a: any) => a.is_active))
                }
            })()
        return () => { active = false }
    }, [partnerId])

    const activePaymentMethodsList = useMemo(() => {
        const source = (paymentMethods && paymentMethods.length > 0) ? paymentMethods : fallbackPaymentMethods
        return (source || []).filter((m: any) => m.is_active !== false)
    }, [paymentMethods, fallbackPaymentMethods])

    const isMercadoPagoTransaction = useCallback((row: any): boolean => {
        if (!row) return false
        if (isMercadoPagoPaymentType(row.paymentType)) return true
        if (row.origin === "gateway" && (typeof row.paymentType === "string" && isMercadoPagoPaymentType(row.paymentType))) return true
        if (row.accountId) {
            const acc = financeAccounts.find((a: any) => a.id === row.accountId)
            if (acc?.integration_source === "mercadopago") return true
        }
        return false
    }, [financeAccounts])

    const resolveMpPaymentDefaults = useCallback((row: any): { methodId: string; accountId: string } | null => {
        if (!isMercadoPagoTransaction(row)) return null
        const mpAccountId = findMercadoPagoAccountId(financeAccounts)
        if (!mpAccountId) return null
        return { methodId: "Mercado Pago", accountId: mpAccountId }
    }, [isMercadoPagoTransaction, financeAccounts])

    // ── Bank account resolution for the "Quitar todas as parcelas" flow ──
    // The account field is only changeable when the chosen payment method(s) do NOT
    // have a linked finance account. A sale (pedido) installment is born with a fixed
    // payment method; if that method exposes a default_finance_account_id the balance
    // must go there (auto-filled & locked). Otherwise the user may choose the account.
    const settlePendingInstallments = (installmentDetail?.installments || []).filter((row: any) => row.status !== "paid")
    const settlePendingCount = settlePendingInstallments.length
    const settleMethodsHaveLinkedAccount =
        settlePendingCount > 0 &&
        settlePendingInstallments.every((row: any) => {
            const pmId = row.paymentMethodId ? sanitizeUUID(row.paymentMethodId) : null
            const method = pmId ? activePaymentMethodsList.find((m: any) => m.id === pmId) : null
            return Boolean(method?.default_finance_account_id)
        })
    const settleAccountLocked = Boolean(settleMethodsHaveLinkedAccount)
    const settleAccountOptions = useMemo(
        () => financeAccounts.map((a: any) => ({ value: a.id, label: a.name })),
        [financeAccounts],
    )
    const settleResolvedAccount = useMemo<string | null>(() => {
        if (settleAccountLocked && settlePendingCount > 0) {
            for (const row of settlePendingInstallments) {
                const pmId = row.paymentMethodId ? sanitizeUUID(row.paymentMethodId) : null
                const method = pmId ? activePaymentMethodsList.find((m: any) => m.id === pmId) : null
                if (method?.default_finance_account_id) return method.default_finance_account_id
            }
        }
        return settleAccountId || pickBankThenCashDefaultFinanceAccountId(financeAccounts) || null
    }, [settleAccountLocked, settlePendingCount, settlePendingInstallments, activePaymentMethodsList, settleAccountId, financeAccounts])

    const getMatchedPaymentMethod = useCallback((methodIdOrLabel: string | null | undefined) => {
        if (!methodIdOrLabel) return null
        const cleanVal = String(methodIdOrLabel).trim().toLowerCase()
        const byId = activePaymentMethodsList.find((m: any) => m.id === methodIdOrLabel)
        if (byId) return byId
        const byName = activePaymentMethodsList.find((m: any) => (m.name || "").toLowerCase() === cleanVal)
        if (byName) return byName
        const byType = activePaymentMethodsList.find((m: any) =>
            (m.type && m.type.toLowerCase() === cleanVal) ||
            (m.payment_type && m.payment_type.toLowerCase() === cleanVal)
        )
        if (byType) return byType
        return null
    }, [activePaymentMethodsList])

    const paymentMethodDropdownOptions = useMemo(() => {
        return STANDARD_PAYMENT_METHODS
    }, [])

    const handleSelectPaymentMethod = useCallback((newMethodVal: string) => {
        setPaymentMethodId(newMethodVal)
        const matched = getMatchedPaymentMethod(newMethodVal)
        if (matched?.default_finance_account_id) {
            setFinanceAccountId(matched.default_finance_account_id)
        }
    }, [getMatchedPaymentMethod])

    // ── Search debounce (300ms) ──────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    const paymentTypeOptions = useMemo(
        () => STANDARD_PAYMENT_METHODS.map((o) => o.value),
        [],
    )

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
                    !isSettledTab(activeTab)
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

    const accountNameMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const a of accounts || []) {
            if (a.id && a.name) map.set(a.id, a.name)
        }
        return map
    }, [accounts])

    const filteredTransactions = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        // Convert recurring occurrences to ERPTransaction shape for A pagar / A receber tabs
        const virtualItems: ERPTransaction[] = recurringOccurrences.map((occ) => {
            const dateObj = new Date(`${occ.occurrenceDate}T12:00:00`)
            const daysUntilDue = diffCalendarDaysInSaoPaulo(occ.occurrenceDate)
            const dateLabel = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: tz })
            const dateShort = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: tz })
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
            const accountName = item.accountId ? (accountNameMap.get(item.accountId) || "") : ""
            const matchesSearch =
                !term ||
                item.description.toLowerCase().includes(term) ||
                item.displayId.toLowerCase().includes(term) ||
                item.contactName.toLowerCase().includes(term) ||
                item.category.toLowerCase().includes(term) ||
                (typeof item.details === "string" && item.details.toLowerCase().includes(term)) ||
                (typeof item.paymentType === "string" && item.paymentType.toLowerCase().includes(term)) ||
                (typeof item.notes === "string" && item.notes.toLowerCase().includes(term)) ||
                (typeof item.referenceNote === "string" && item.referenceNote.toLowerCase().includes(term)) ||
                (typeof item.installmentGroupDescription === "string" && item.installmentGroupDescription.toLowerCase().includes(term)) ||
                accountName.toLowerCase().includes(term)

            const isPrevisto = item.isRecurringOccurrence || item.status === "Pendente" || item.isOverdue || item.status === "Atrasado" || (item.transactionType !== 'adjustment' && item.transactionType !== 'transfer' && !['recebido', 'pago', 'paid'].includes(item.status.toLowerCase()))
            const isCancelled = isCancelledTransaction(item)
            const isOverdueItem = item.isOverdue || item.status.toLowerCase() === "atrasado" || (item.daysUntilDue !== undefined && item.daysUntilDue < 0)

            const matchesLedgerByTab =
                (activeTab === "A pagar" || ((activeTab === "Vencidos" || activeTab === "Cancelados") && forcedTab === "A pagar")) ? item.ledgerDirection === "out" :
                    (activeTab === "A receber" || ((activeTab === "Vencidos" || activeTab === "Cancelados") && forcedTab === "A receber")) ? item.ledgerDirection === "in" :
                        true
            const matchesTab = activeTab === "Cancelados"
                ? isCancelled
                : activeTab === "Transações"
                    ? (!isPrevisto && !item.isRecurringOccurrence && !isCancelled)
                    : activeTab === "Entradas"
                        ? (!isPrevisto && !item.isRecurringOccurrence && !isCancelled && item.ledgerDirection === "in")
                        : activeTab === "Saídas"
                            ? (!isPrevisto && !item.isRecurringOccurrence && !isCancelled && item.ledgerDirection === "out")
                            : activeTab === "Vencidos"
                                ? (isPrevisto && !isCancelled && isOverdueItem)
                                : (isPrevisto && !isCancelled)

            const matchesStatus = filters.status.length === 0 || filters.status.includes(item.status)
            const matchesCategory = filters.category.length === 0 || filters.category.includes(item.category)
            const matchesPayment = filters.paymentType.length === 0 || filters.paymentType.includes(resolveStandardPaymentMethod(item.paymentType))
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
            if (isCancelledTransaction(item)) {
                passthrough.push(item)
                continue
            }
            if (!item.isRecurringOccurrence && item.installmentGroupId) {
                const isPaid = String(item.rawStatus || "").toLowerCase() === "paid" || item.status.toLowerCase() === "pago" || item.status.toLowerCase() === "recebido"
                if (isPaid) {
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

            const uniquePaymentTypes = [...new Set(
                sorted
                    .map(r => r.paymentType)
                    .filter(Boolean)
                    .filter(t => t !== "Não informado")
            )]
            const combinedPaymentType = uniquePaymentTypes.length > 0
                ? uniquePaymentTypes.join(", ")
                : "Não informado"

            const gAmt = Math.round(sorted.reduce((acc, r) => acc + Number(r.paidAmount ?? r.amount ?? 0), 0) * 100) / 100
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
                paymentDateDate: latestPaidAt ? formatDateFromRaw(latestPaidAt) || first.createdAtDate : first.createdAtDate,
                paymentDateTime: latestPaidAt ? formatTimeFromRaw(latestPaidAt) || first.createdAtTime : first.createdAtTime,
                amount: gAmt,
                paidAmount: gAmt,
                paymentType: combinedPaymentType,
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

            const allItems = [
                ...(items || []),
                ...(paidInstallmentByGroup.get(groupId) || [])
            ]
            const uniquePaymentTypes = [...new Set(
                allItems
                    .map(r => r.paymentType)
                    .filter(Boolean)
                    .filter(t => t !== "Não informado")
            )]
            const combinedPaymentType = uniquePaymentTypes.length > 0
                ? uniquePaymentTypes.join(", ")
                : "Não informado"

            const groupRemainingAmount =
                Math.round(
                    sortedPending.reduce((acc, row) => acc + Number(row.installmentRemainingAmount ?? row.amount ?? 0), 0) * 100,
                ) / 100

            const groupPaidAmount =
                Math.round(
                    allItems.reduce((acc, row) => acc + Number(row.paidAmount ?? 0), 0) * 100,
                ) / 100

            collapsedGroups.push({
                ...nextPending,
                id: `group-${groupId}`,
                groupRepresentativeTransactionId: nextPending.id,
                description: `${nextPending.installmentGroupDescription || nextPending.description} - ${totalCount}x`,
                installmentGroupId: groupId,
                installmentTotalCount: totalCount,
                installmentPaidCount: paidCount,
                installmentPendingCount: pendingCount,
                isInstallmentGroup: true,
                amount: groupRemainingAmount,
                paidAmount: groupPaidAmount,
                paymentType: combinedPaymentType,
                status: `${pendingCount}/${totalCount} pendentes`,
                statusVariant: "orange",
            })
        }
        result = [...passthrough, ...collapsedGroups, ...collapsedPaidInstallmentGroups]

        const transactionSortTime = (item: ERPTransaction) => {
            const raw = item.paymentDateRaw || item.createdAtRaw || item.dueDateRaw || null
            if (!raw) return 0
            const ts = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)
                ? new Date(`${raw}T12:00:00`).getTime()
                : new Date(raw).getTime()
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
                        const at = !isSettledTab(activeTab)
                            ? a.occurrenceDate
                                ? new Date(`${a.occurrenceDate}T12:00:00`).getTime()
                                : a.dueDateRaw
                                    ? new Date(a.dueDateRaw).getTime()
                                    : new Date(a.dueDate).getTime()
                            : transactionSortTime(a)
                        const bt = !isSettledTab(activeTab)
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
        } else if (!isSettledTab(activeTab)) {
            // ALWAYS sort A pagar/A receber by due_date ASC
            result = [...result].sort((a, b) => {
                // Use occurrenceDate for virtual items, dueDateRaw for real transactions
                const aDate = a.occurrenceDate || a.dueDateRaw || a.dueDate
                const bDate = b.occurrenceDate || b.dueDateRaw || b.dueDate
                return String(aDate).localeCompare(String(bDate))
            })
        } else {
            result = [...result].sort((a, b) => {
                const diff = transactionSortTime(b) - transactionSortTime(a)
                if (diff !== 0) return diff
                const aCreated = a.createdAtRaw ? new Date(a.createdAtRaw).getTime() : 0
                const bCreated = b.createdAtRaw ? new Date(b.createdAtRaw).getTime() : 0
                if (bCreated !== aCreated) return bCreated - aCreated
                return String(b.id || "").localeCompare(String(a.id || ""))
            })
        }

        return result
    }, [loadedTransactions, recurringOccurrences, debouncedSearch, activeTab, filters, sortConfig])

    const { paginatedTransactions, totalPages } = useMemo(() => {
        const paginated = filteredTransactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
        const pages = Math.max(1, Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE))
        return { paginatedTransactions: paginated, totalPages: pages }
    }, [filteredTransactions, page])

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filteredTransactions.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filteredTransactions.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredTransactions.length])

    const hasActiveFilters =
        search.length > 0 ||
        filters.status.length > 0 ||
        filters.category.length > 0 ||
        filters.paymentType.length > 0 ||
        filters.recurringOnly ||
        filters.installmentOnly ||
        isDatePeriodFilterActive(filters.datePeriod)
    const hasTransactions = loadedTransactions.length > 0

    const tabCounts = useMemo(() => {
        const Transacoes = loadedTransactions.length
        let pagar = 0, receber = 0, cancelados = 0, vencidos = 0
        let entradas = 0, saidas = 0
        for (const t of loadedTransactions) {
            const isCancelled = isCancelledTransaction(t)
            if (isCancelled) {
                if (forcedTab === "A pagar" && (t as any).ledgerDirection === "out") cancelados++
                else if (forcedTab === "A receber" && (t as any).ledgerDirection === "in") cancelados++
                else if (forcedTab !== "A pagar" && forcedTab !== "A receber") cancelados++
            } else {
                const isPaid = String(t.rawStatus || "").toLowerCase() === "paid" || t.status.toLowerCase() === "recebido" || t.status.toLowerCase() === "pago"
                const isPrevisto = t.isRecurringOccurrence || t.status === "Pendente" || t.isOverdue || t.status === "Atrasado" || (t.transactionType !== 'adjustment' && t.transactionType !== 'transfer' && !['recebido', 'pago', 'paid'].includes(t.status.toLowerCase()))
                if ((t as any).ledgerDirection === "out" && isPrevisto) pagar++
                else if ((t as any).ledgerDirection === "in" && isPrevisto) receber++

                const isSettled = !t.isRecurringOccurrence && t.status !== "Pendente" && !t.isOverdue && t.status !== "Atrasado" && (t.transactionType === "adjustment" || t.transactionType === "transfer" || isPaid)
                if (isSettled) {
                    if ((t as any).ledgerDirection === "in") entradas++
                    else if ((t as any).ledgerDirection === "out") saidas++
                }

                if (!isPaid && (t.isOverdue || t.status.toLowerCase() === "atrasado" || (t.daysUntilDue !== undefined && t.daysUntilDue < 0))) {
                    if (forcedTab === "A pagar" && (t as any).ledgerDirection !== "out") {
                        // skip
                    } else if (forcedTab === "A receber" && (t as any).ledgerDirection !== "in") {
                        // skip
                    } else {
                        vencidos++
                    }
                }
            }
        }
        return { "Transações": Math.max(0, Transacoes - cancelados), "A pagar": pagar, "A receber": receber, "Vencidos": vencidos, "Cancelados": cancelados, "Entradas": entradas, "Saídas": saidas }
    }, [loadedTransactions, forcedTab])

    // ── All transactions (including virtual recurring) for tab values calculation ──────────────
    const allTransactionsForTabValues = useMemo(() => {
        const virtualItems: ERPTransaction[] = recurringOccurrences.map((occ) => {
            const dateObj = new Date(`${occ.occurrenceDate}T12:00:00`)
            const daysUntilDue = diffCalendarDaysInSaoPaulo(occ.occurrenceDate)
            const dateLabel = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: tz })
            const dateShort = dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: tz })
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
                isRecurringOccurrence: true,
                recurringTemplateId: occ.recurringTemplateId,
                occurrenceDate: occ.occurrenceDate,
                dueDateRaw: occ.dueDate,
            }
        })
        return [...loadedTransactions, ...virtualItems]
    }, [loadedTransactions, recurringOccurrences])

    // ── Tab monetary values for Recebimentos / Pagamentos pages ──────────────
    const tabValues = useMemo(() => {
        const nowMs = Date.now()
        const nowYmd = msToBrazilYmd(nowMs)
        const currentMonth = nowYmd.slice(0, 7) // "YYYY-MM"

        let pagarPending = 0, pagarOverdue = 0, pagarCompleted = 0
        let receberPending = 0, receberOverdue = 0, receberCompleted = 0
        let canceladosTotal = 0

        for (const item of allTransactionsForTabValues) {
            if (isCancelledTransaction(item)) {
                if (forcedTab === "A pagar" && item.ledgerDirection !== "out") {
                    // skip
                } else if (forcedTab === "A receber" && item.ledgerDirection !== "in") {
                    // skip
                } else {
                    canceladosTotal += item.amount
                }
                continue
            }
            const status = String(item.rawStatus || "").toLowerCase()
            const isPaid = status === "paid" || item.status.toLowerCase() === "recebido" || item.status.toLowerCase() === "pago"
            const isReceivables = item.ledgerDirection === "in"
            const isPayables = item.ledgerDirection === "out"

            if (isPaid) {
                // Check if paid this month
                const payYmd = ymdFromRaw(item.paymentDateRaw) || ymdFromRaw(item.createdAtRaw)
                if (payYmd && payYmd.startsWith(currentMonth)) {
                    if (isReceivables) receberCompleted += item.amount
                    else if (isPayables) pagarCompleted += item.amount
                }
            } else if (item.isOverdue || item.status.toLowerCase() === "atrasado" || (item.daysUntilDue !== undefined && item.daysUntilDue < 0)) {
                if (isReceivables) receberOverdue += item.amount
                else if (isPayables) pagarOverdue += item.amount
            } else {
                if (isReceivables) receberPending += item.amount
                else if (isPayables) pagarPending += item.amount
            }
        }

        const vencidosTotal = forcedTab === "A pagar"
            ? pagarOverdue
            : forcedTab === "A receber"
                ? receberOverdue
                : (pagarOverdue + receberOverdue)

        return {
            "A pagar": { pending: pagarPending, overdue: pagarOverdue, completed: pagarCompleted },
            "A receber": { pending: receberPending, overdue: receberOverdue, completed: receberCompleted },
            "Vencidos": { total: vencidosTotal },
            "Cancelados": { total: canceladosTotal },
        }
    }, [allTransactionsForTabValues, forcedTab])

    // Tabs available per page: main page splits settled movements into Todas/Entradas/Saídas,
    // while the forced pages only expose their own direction plus Vencidos/Cancelados.
    const availableTabs = useMemo<TransactionTab[]>(() => {
        if (forcedTab === "A pagar") return ["A pagar", "Vencidos", "Cancelados"]
        if (forcedTab === "A receber") return ["A receber", "Vencidos", "Cancelados"]
        return ["Transações", "Entradas", "Saídas"]
    }, [forcedTab])

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

    const selectedTransactions = useMemo(() => {
        return paginatedTransactions.filter((tx) => selection.ids.has(tx.id))
    }, [paginatedTransactions, selection.ids])

    const financialSelectionGuards = useMemo(() => {
        const totalCount = selectedTransactions.length
        const pendingCount = selectedTransactions.filter((tx) => String(tx.rawStatus || tx.status || "").toLowerCase() === "pending").length
        const paidCount = selectedTransactions.filter((tx) => String(tx.rawStatus || tx.status || "").toLowerCase() === "paid").length
        const cancelledCount = selectedTransactions.filter((tx) => isCancelledTransaction(tx)).length
        const installmentCount = selectedTransactions.filter((tx) => Boolean(tx.installmentGroupId || tx.isInstallmentGroup)).length
        return {
            totalCount,
            pendingCount,
            paidCount,
            cancelledCount,
            installmentCount,
        }
    }, [selectedTransactions])

    const handleBulkApply = useCallback(async (payload: BulkActionPayload) => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        let actionLabel = "Processando transações"
        if (payload.type === "financial_cancel") actionLabel = "Cancelando transações"
        else if (payload.type === "financial_settle") actionLabel = "Quitando transações"
        else if (payload.type === "financial_reschedule") actionLabel = "Prorrogando vencimento"
        else if (payload.type === "financial_category") actionLabel = "Alterando categoria"

        setBulkModalOpen(false)
        setSelection({ ids: new Set() })

        undoManager.schedule({
            id: `financial-batch-${Date.now()}`,
            title: `${actionLabel} (${ids.length} selecionadas)`,
            description: "Você tem 10 segundos para desfazer.",
            itemCount: ids.length,
            payload,
            onExecute: async (p) => {
                const actionType = p.type === "financial_cancel"
                    ? "cancel"
                    : p.type === "financial_settle"
                        ? "settle"
                        : p.type === "financial_reschedule"
                            ? "reschedule"
                            : "category"

                const res = await updateFinancialTransactionsInBatchAction({
                    partnerId,
                    transactionIds: ids,
                    actionType,
                    cancelReason: p.cancelReason,
                    settleAccountId: p.settleAccountId,
                    settlePaymentMethodId: p.settlePaymentMethodId,
                    settlePaymentDate: p.settlePaymentDate,
                    rescheduleMode: p.rescheduleMode,
                    rescheduleDays: p.rescheduleDays,
                    rescheduleDate: p.rescheduleDate,
                    categoryId: p.categoryId,
                    categoryName: p.categoryName,
                })

                if (!res.success) {
                    throw new Error(res.error || "Erro ao processar transações")
                }
                return res
            },
            onUndo: () => {
                notifySuccess("Ação desfeita", "Nenhuma alteração foi realizada nas transações.")
                void refreshTransactionsNow()
            },
            onSuccess: (res) => {
                notifySuccess("Sucesso", `${res.processedCount} transação(ões) atualizada(s).${res.skippedCount ? ` (${res.skippedCount} ignorada(s) por regra)` : ""}`)
                if (res.warning) {
                    notifyError("Atenção", res.warning)
                }
                void refreshTransactionsNow()
            },
            onError: (err) => {
                notifyError(err?.message || "Falha ao processar transações em massa")
                void refreshTransactionsNow()
            },
        })
    }, [selection.ids, undoManager, partnerId, notifySuccess, notifyError, refreshTransactionsNow])

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "transactions",
            format: "xlsx",
            filters: {
                storeId: storeId || null,
                search: debouncedSearch,
                activeTab,
                status: filters.status,
                category: filters.category,
                paymentType: filters.paymentType,
                datePeriod: filters.datePeriod,
            },
        }, { selectedIds: selection.ids, totalCount: filteredTransactions.length })
    }, [exportData, partnerId, storeId, debouncedSearch, activeTab, filters, selection.ids, filteredTransactions.length])

    const handleClearFilters = () => {
        setSearch("")
        setActiveTab(forcedTab || "Transações")
        setFilters(INITIAL_FILTERS)
    }

    useEffect(() => {
        setPage(1)
    }, [search, activeTab, filters])

    const handleEditTransaction = useCallback((transaction: ERPTransaction) => {
        if (transaction.isInstallmentGroup) return
        if (transaction.isRecurringOccurrence && transaction.recurringTemplateId) {
            openEntity("edit", transaction.recurringTemplateId, "recurring")
        } else {
            openEntity("edit", transaction.id)
        }
    }, [openEntity])

    const handlePrintTransaction = useCallback((transaction: ERPTransaction) => {
        setPrintTransactionId(transaction.id)
    }, [])

    const handleCloseTransactionDetail = useCallback(() => {
        closeEntity()
    }, [closeEntity])

    const refreshInstallmentDetail = useCallback(async (groupId?: string | null) => {
        const gid = groupId
        if (!gid) return
        const res = await getInstallmentGroupDetailsAction({ partnerId, installmentGroupId: gid })
        if (res.success) setInstallmentDetail(res.data)
        else notifyError(res.error || "Erro ao atualizar parcelas")
    }, [partnerId, notifyError])

    const handleEditFromTransactionDetail = useCallback(
        (id: string) => {
            // Products pattern: INSTANT open, NO validation
            openEntity("edit", id)
        },
        [openEntity],
    )

    const handleMarkAsPaid = useCallback(async (transaction: ERPTransaction) => {
        setPaymentAttemptId(crypto.randomUUID())
        setSelectedInstallmentForPayment(transaction as any)
        const remainingFromPartial = transaction.paidAmount ? transaction.amount - transaction.paidAmount : transaction.amount
        const initialAmount = Number(
            transaction.installmentRemainingAmount ??
            (remainingFromPartial > 0 && remainingFromPartial < transaction.amount ? remainingFromPartial : transaction.amount) ??
            0
        )
        setPaymentAmount(String(initialAmount.toFixed(2)))
        setInterestAmount("0")
        setDiscountAmount("0")

        const mpDefaults = resolveMpPaymentDefaults(transaction)
        if (mpDefaults) {
            setPaymentMethodId(mpDefaults.methodId)
            setFinanceAccountId(mpDefaults.accountId)
            setMpPaymentLocked(true)
        } else {
            // When paymentMethodId is a UUID (sales/integrated installments),
            // resolve it to a standard label so the dropdown displays correctly.
            const matchedMethod = transaction.paymentMethodId && sanitizeUUID(transaction.paymentMethodId as string) !== null
                ? getMatchedPaymentMethod(transaction.paymentMethodId as string)
                : null
            const initialMethod = matchedMethod
                ? (resolveStandardPaymentMethod(matchedMethod.name) || matchedMethod.name || "Pix")
                : (transaction.paymentType && transaction.paymentType !== "Não informado" ? transaction.paymentType : (activePaymentMethodsList[0]?.id || "Pix"))
            setPaymentMethodId(initialMethod)

            const matched = getMatchedPaymentMethod(initialMethod)
            if (matched?.default_finance_account_id) {
                setFinanceAccountId(matched.default_finance_account_id)
            } else if (transaction.accountId) {
                setFinanceAccountId(transaction.accountId)
            } else {
                const defaultAcc = pickBankThenCashDefaultFinanceAccountId(financeAccounts) || ""
                setFinanceAccountId(defaultAcc)
            }
            setMpPaymentLocked(false)
        }
        setPaymentModalOpen(true)
    }, [getMatchedPaymentMethod, activePaymentMethodsList, financeAccounts, resolveMpPaymentDefaults])

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
        const tx = confirmCancelTransaction
        const reason = cancelReason.trim() || null

        setConfirmCancelTransaction(null)
        setCancelReason("")

        undoManager.schedule({
            id: `transaction-cancel-${tx.id}`,
            title: `Cancelando transação "${tx.description || 'Pendente'}"...`,
            description: "Você tem 10 segundos para desfazer.",
            itemCount: 1,
            payload: { tx, reason },
            onExecute: async (p) => {
                const res = await cancelPendingTransactionAction({
                    transactionId: p.tx.id,
                    partnerId,
                    reason: p.reason,
                })
                if (!res.success) {
                    throw new Error(res.error || "Erro ao cancelar transação.")
                }
                return res
            },
            onUndo: () => {
                notifySuccess("Cancelamento desfeito.")
                void refreshTransactionsNow()
            },
            onSuccess: () => {
                notifySuccess("Transação cancelada com sucesso.")
                void refreshTransactionsNow()
            },
            onError: (err: any) => {
                notifyError(err?.message || "Erro ao cancelar transação.")
                void refreshTransactionsNow()
            }
        })
    }, [confirmCancelTransaction, cancellingTransaction, undoManager, partnerId, cancelReason, notifySuccess, notifyError, refreshTransactionsNow])

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
                    paymentMethodId: resolveStandardPaymentMethod(row.paymentType) || row.paymentMethodId || "Pix",
                }
            }
            setSettlePaymentsByInstallment(nextState)
            setSettleInstallmentPage(1)
            setConfirmSettleGroup(transaction)
        },
        [installmentDetail, partnerId, notifyError, setSettleInstallmentPage],
    )

    const handleConfirmSettleInstallmentGroup = useCallback(async () => {
        if (!confirmSettleGroup?.installmentGroupId) return
        if (settlingGroup) return
        setSettlingGroup(true)
        try {
            const res = await settleInstallmentGroupAction({
                partnerId,
                installmentGroupId: confirmSettleGroup.installmentGroupId,
                settleAccountId: settleResolvedAccount,
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
            setInstallmentDetail(null)
            setSettleAccountId(null)
            closeEntity()
            void refreshTransactionsNow()
        } finally {
            setSettlingGroup(false)
        }
    }, [confirmSettleGroup, settlingGroup, partnerId, notifyError, notifySuccess, refreshTransactionsNow, settlePaymentsByInstallment, settleAccountId, settleResolvedAccount])

    const handleOpenTransactionDetail = useCallback(
        (transaction: ERPTransaction) => {
            // Installment group → open the representative transaction's normal detail
            // view, which renders the timeline, transaction items, details, customer
            // card AND the "Parcelas da transação" FormSection (installment breakdown).
            if (transaction.isInstallmentGroup && transaction.installmentGroupId) {
                const representativeId = transaction.groupRepresentativeTransactionId || transaction.id
                openEntity("view", representativeId)
                return
            }
            // Recurring occurrence → edit recurring template
            if (transaction.isRecurringOccurrence) {
                if (transaction.recurringTemplateId) {
                    openEntity("edit", transaction.recurringTemplateId, "recurring")
                }
                return
            }
            // Standard transaction → INSTANT open (Products pattern: NO validation before openEntity)
            openEntity("view", transaction.id)
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
        setInstallmentDetail(null)
        closeEntity()
        openEntity("edit", tx.id)
    }, [loadedTransactions, notifyError, openEntity, closeEntity])

      const handlePayInstallment = useCallback(
        (row: any, meta?: { ledgerDirection: ERPTransaction["ledgerDirection"]; isOrderOrigin: boolean }) => {
            if (!row) return
            if (row.status === "paid") {
                notifyError("Parcela já está quitada.")
                return
            }
            const ledgerDirection = meta?.ledgerDirection ?? row.ledgerDirection ?? "in"
            setPaymentAttemptId(crypto.randomUUID())
            setSelectedInstallmentForPayment({
                ...row,
                description: row.description || row.reference || row.headerTitle || "Parcela",
                ledgerDirection,
            })
            setPaymentAmount(String(Number(row.remainingAmount || 0).toFixed(2)))
            setInterestAmount("0")
            setDiscountAmount("0")

            const mpDefaults = resolveMpPaymentDefaults(row)
            if (mpDefaults) {
                setPaymentMethodId(mpDefaults.methodId)
                setFinanceAccountId(mpDefaults.accountId)
                setMpPaymentLocked(true)
            } else {
                // When paymentMethodId is a UUID (sales/integrated installments),
                // resolve it to a standard label so the dropdown displays correctly.
                const matchedMethod = row.paymentMethodId && sanitizeUUID(row.paymentMethodId) !== null
                    ? getMatchedPaymentMethod(row.paymentMethodId)
                    : null
                const initialMethod = matchedMethod
                    ? (resolveStandardPaymentMethod(matchedMethod.name) || matchedMethod.name || "Pix")
                    : (row.paymentType && row.paymentType !== "Não informado" ? row.paymentType : (activePaymentMethodsList[0]?.id || "Pix"))
                setPaymentMethodId(initialMethod)
                const matched = getMatchedPaymentMethod(initialMethod)
                if (matched?.default_finance_account_id) {
                    setFinanceAccountId(matched.default_finance_account_id)
                } else if (row.accountId) {
                    setFinanceAccountId(row.accountId)
                } else {
                    const defaultAcc = pickBankThenCashDefaultFinanceAccountId(financeAccounts) || ""
                    setFinanceAccountId(defaultAcc)
                }
                setMpPaymentLocked(false)
            }
            setPaymentModalOpen(true)
        },
        [installmentDetail, notifyError, getMatchedPaymentMethod, activePaymentMethodsList, financeAccounts, resolveMpPaymentDefaults],
    )

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
        if (!financeAccountId) {
            notifyError("Selecione uma conta bancária para registrar o pagamento.")
            return
        }

        if (!skipPaymentBalanceWarningRef.current) {
            const isIncome =
                selectedInstallmentForPayment.ledgerDirection === "in"
            if (!isIncome) {
                const acc = financeAccounts.find((a: any) => a.id === financeAccountId)
                const accBal = acc ? Number(acc.current_balance ?? 0) : 0
                if (accBal + 0.005 < finalPaid) {
                    setPaymentBalanceWarningMeta({
                        accountName: acc?.name || "Conta selecionada",
                        currentBalance: accBal,
                        amount: finalPaid,
                    })
                    setPaymentBalanceWarningOpen(true)
                    return
                }
            }
        }
        skipPaymentBalanceWarningRef.current = false

        setPayingInstallment(true)
        try {
            if (selectedInstallmentForPayment.isRecurringOccurrence) {
                const res = await markRecurringOccurrenceAsPaidAction({
                    partnerId,
                    recurringId: selectedInstallmentForPayment.recurringTemplateId as string,
                    occurrenceDate: selectedInstallmentForPayment.occurrenceDate as string,
                    accountId: financeAccountId || selectedInstallmentForPayment.accountId,
                    paymentMethodId: paymentMethodId || null,
                    paymentAmount: paid,
                    interestAmount: interest,
                    discountAmount: discount,
                })
                if (!res.success) {
                    notifyError(res.error || "Erro ao registrar pagamento")
                    return
                }
                notifySuccess("Pagamento da ocorrência registrado.")
            } else if (selectedInstallmentForPayment.installmentGroupId) {
                const res = await recordInstallmentPaymentAction({
                    partnerId,
                    transactionId: selectedInstallmentForPayment.id,
                    idempotencyKey: paymentAttemptId,
                    paymentAmount: paid,
                    interestAmount: interest,
                    discountAmount: discount,
                    paymentMethodId: paymentMethodId || null,
                    accountId: financeAccountId || null,
                })
                if (!res.success) {
                    notifyError(res.error || "Erro ao registrar pagamento")
                    return
                }
                notifySuccess(res.data.fullyPaid ? "Parcela quitada com sucesso." : "Pagamento parcial registrado.")
                void refreshInstallmentDetail(selectedInstallmentForPayment.installmentGroupId)
            } else {
                const res = await recordRegularTransactionPaymentAction({
                    partnerId,
                    transactionId: selectedInstallmentForPayment.id,
                    idempotencyKey: paymentAttemptId,
                    paymentAmount: paid,
                    interestAmount: interest,
                    discountAmount: discount,
                    paymentMethodId: paymentMethodId || null,
                    accountId: financeAccountId || null,
                })
                if (!res.success) {
                    notifyError(res.error || "Erro ao registrar pagamento")
                    return
                }
                notifySuccess(
                    selectedInstallmentForPayment.ledgerDirection === "in"
                        ? "Recebimento registrado com sucesso."
                        : "Pagamento registrado com sucesso."
                )
            }
            setPaymentModalOpen(false)
            setSelectedInstallmentForPayment(null)
            setPaymentAttemptId(null)
            void refreshTransactionsNow()
        } finally {
            setPayingInstallment(false)
        }
    }, [
        selectedInstallmentForPayment,
        payingInstallment,
        paymentAttemptId,
        paymentAmount,
        interestAmount,
        discountAmount,
        partnerId,
        paymentMethodId,
        financeAccountId,
        notifyError,
        notifySuccess,
        refreshTransactionsNow,
        refreshInstallmentDetail,
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
                    isOpen={paymentModalOpen}
                    onClose={() => {
                        if (payingInstallment) return
                        setPaymentModalOpen(false)
                        setSelectedInstallmentForPayment(null)
                        setMpPaymentLocked(false)
                    }}
                    title={
                        selectedInstallmentForPayment
                            ? selectedInstallmentForPayment.isRecurringOccurrence
                                ? "Registrar pagamento da ocorrência"
                                : selectedInstallmentForPayment.installmentGroupId
                                    ? "Registrar pagamento da parcela"
                                    : selectedInstallmentForPayment.ledgerDirection === "in"
                                        ? "Registrar recebimento"
                                        : "Registrar pagamento"
                            : "Registrar pagamento"
                    }
                    maxWidth="3xl"
                >
                    {selectedInstallmentForPayment ? (() => {
                        const isInstallment = !!selectedInstallmentForPayment.installmentGroupId
                        const isRecurring = !!selectedInstallmentForPayment.isRecurringOccurrence
                        const isRegular = !isInstallment && !isRecurring
                        // Parcelas de venda nascem com o método fixado pela venda (ex: cartão de crédito)
                        const lockedPaymentMethod = isInstallment && !!selectedInstallmentForPayment.paymentMethodId && sanitizeUUID(selectedInstallmentForPayment.paymentMethodId) !== null
                        const currentRemaining = Number(selectedInstallmentForPayment.remainingAmount ?? selectedInstallmentForPayment.amount ?? 0)
                        const nextRemaining = Math.max(0, currentRemaining - Number(paymentAmount || 0))
                        const currentMatchedMethod = getMatchedPaymentMethod(paymentMethodId)
                        const isAccountLockedByMethod = Boolean(currentMatchedMethod?.default_finance_account_id)
                        const mpAccountId = findMercadoPagoAccountId(financeAccounts)
                        const isMpPayment = mpPaymentLocked || (mpAccountId && paymentMethodId === "Mercado Pago" && financeAccountId === mpAccountId)

                        return (
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Left Column: Resumo (Summary Receipt Style) */}
                                <div className="w-full md:w-[45%] flex flex-col justify-between">
                                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-5 flex flex-col relative h-full border border-brand-border dark:border-dark-border">
                                        {/* Receipt Header (Customer Info Style) */}
                                        <div className="flex items-center justify-between pb-4 border-b border-dashed border-brand-border dark:border-dark-border mb-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                                                    {isRecurring ? <ClockIcon className="w-5 h-5" /> : isInstallment ? <InstallmentIcon className="w-5 h-5" /> : <MoneyIcon className="w-5 h-5" />}
                                                </div>
                                                <div className="flex flex-col overflow-hidden">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[120px] md:max-w-[150px]" title={selectedInstallmentForPayment.description}>
                                                            {selectedInstallmentForPayment.description}
                                                        </span>
                                                        {isRecurring && (
                                                            <Badge variant="purple">
                                                                Recorrente
                                                            </Badge>
                                                        )}
                                                        {isInstallment && (
                                                            <Badge variant="gray">
                                                                Parcela {selectedInstallmentForPayment.installmentNumber}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {selectedInstallmentForPayment.dueDate && (
                                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                                                            Vence em {selectedInstallmentForPayment.dueDate || (selectedInstallmentForPayment.occurrenceDate ? formatBrazilDateFromDbInput(selectedInstallmentForPayment.occurrenceDate, 'dayMonthYear') : '-')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end text-right justify-center shrink-0">
                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Restante</span>
                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(currentRemaining)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Summary Details */}
                                        <div className="space-y-4 flex-1">
                                            <h4 className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Resumo do Lançamento</h4>

                                            <div className="space-y-2.5 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo Devedor Atual</span>
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(currentRemaining)}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(-) Valor Abatido (Principal)</span>
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                        - {formatCurrency(Number(paymentAmount || 0))}
                                                    </span>
                                                </div>

                                                {!isRegular && (
                                                    <div className="flex justify-between items-center text-[11px] pl-2 border-l border-brand-border dark:border-dark-border">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Novo Saldo Restante</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(nextRemaining)}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="border-t border-dashed border-brand-border dark:border-dark-border my-2"></div>

                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(+) Juros Adicionais</span>
                                                    <span className={Number(interestAmount || 0) > 0 ? "font-semibold text-brand-red" : "font-medium text-brand-inactive-text dark:text-dark-body"}>
                                                        + {formatCurrency(Number(interestAmount || 0))}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(-) Desconto Aplicado</span>
                                                    <span className={Number(discountAmount || 0) > 0 ? "font-semibold text-brand-green" : "font-medium text-brand-inactive-text dark:text-dark-body"}>
                                                        - {formatCurrency(Number(discountAmount || 0))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Big Total Row */}
                                        <div className="mt-6 pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <span className="font-bold text-xs text-brand-dark dark:text-dark-heading block">
                                                        {selectedInstallmentForPayment.ledgerDirection === "in" ? "Total a Receber" : "Total a Pagar"}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        Fluxo de caixa líquido
                                                    </span>
                                                </div>
                                                <span className="font-black text-lg text-brand-dark dark:text-dark-heading tracking-tight">
                                                    {formatCurrency(Math.max(0, Number(paymentAmount || 0) + Number(interestAmount || 0) - Number(discountAmount || 0)))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Inputs & Actions (55% width) */}
                                <div className="w-full md:w-[55%] flex flex-col justify-between space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <MoneyInput
                                                label="Valor do pagamento"
                                                value={Number(paymentAmount || 0)}
                                                onChange={(value) => setPaymentAmount(String(value))}
                                                min={0}
                                            />
                                        </div>
                                        <FormDropdown
                                            label="Meio de pagamento"
                                            value={paymentMethodId || "Pix"}
                                            setValue={handleSelectPaymentMethod}
                                            options={paymentMethodDropdownOptions}
                                            placeholder="Selecione"
                                            disabled={lockedPaymentMethod || !!isMpPayment}
                                        />
                                        <div className="space-y-1">
                                            <FormDropdown
                                                label="Conta bancária *"
                                                value={financeAccountId}
                                                setValue={setFinanceAccountId}
                                                options={financeAccounts.map((a: any) => ({ value: a.id, label: a.name }))}
                                                placeholder="Selecione a conta bancária"
                                                disabled={isAccountLockedByMethod || !!isMpPayment}
                                                error={(!financeAccountId && !isMpPayment)}
                                            />
                                            {isMpPayment && (
                                                <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                    Conta vinculada automaticamente ao pagamento via Mercado Pago.
                                                </p>
                                            )}
                                            {isAccountLockedByMethod && (
                                                <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                    Conta vinculada automaticamente ao meio de pagamento.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <MoneyInput
                                                label="Juros"
                                                value={Number(interestAmount || 0)}
                                                onChange={(value) => setInterestAmount(String(value))}
                                                min={0}
                                            />
                                        </div>
                                        <div>
                                            <MoneyInput
                                                label="Desconto"
                                                value={Number(discountAmount || 0)}
                                                onChange={(value) => setDiscountAmount(String(value))}
                                                min={0}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-4 border-t border-brand-border dark:border-dark-border">
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
                                        <Button
                                            onClick={() => void handleConfirmInstallmentPayment()}
                                            disabled={payingInstallment || !financeAccountId || Number(paymentAmount || 0) <= 0}
                                        >
                                            Confirmar {selectedInstallmentForPayment.ledgerDirection === "in" ? "recebimento" : "pagamento"}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })() : null}
                </DefaultModal>

                <SavingStatusModal
                    isOpen={
                        settlingGroup ||
                        payingInstallment ||
                        cancellingTransaction
                    }
                    text={
                        settlingGroup
                            ? "Quitando parcelas..."
                            : payingInstallment
                                ? selectedInstallmentForPayment?.isRecurringOccurrence
                                    ? "Registrando pagamento da ocorrência..."
                                    : selectedInstallmentForPayment?.installmentGroupId
                                        ? "Registrando pagamento da parcela..."
                                        : "Registrando pagamento..."
                                : cancellingTransaction
                                    ? "Cancelando transação..."
                                    : "Salvando..."
                    }
                />

                <AlertModal
                    isOpen={paymentBalanceWarningOpen}
                    onClose={() => {
                        setPaymentBalanceWarningOpen(false)
                        skipPaymentBalanceWarningRef.current = false
                    }}
                    onConfirm={() => {
                        skipPaymentBalanceWarningRef.current = true
                        setPaymentBalanceWarningOpen(false)
                        void handleConfirmInstallmentPayment()
                    }}
                    title="Saldo insuficiente na conta"
                    description={`O valor do pagamento (${formatCurrency(paymentBalanceWarningMeta.amount)}) é maior que o saldo atual da conta ${paymentBalanceWarningMeta.accountName} (${formatCurrency(paymentBalanceWarningMeta.currentBalance)}). Deseja continuar mesmo assim?`}
                    confirmText="Continuar mesmo assim"
                    cancelText="Cancelar"
                    variant="warning"
                />
            </>
        )
    }

    if (entityState.isOpen && entityState.action === "view" && entityState.entityId && !entityState.entityType) {
        if (isLoadingDetail || !currentEntity) {
            return (
                <div className="flex items-center justify-center h-full min-h-[200px] w-full">
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
            <FadeIn className="h-full">
                <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
                                    <Button variant="filled" onClick={() => setConfirmSettleGroup(null)} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">Quitar todas as parcelas</span>
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
                            </div>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-6 space-y-4">
                                {/* Summary Cards */}
                                <HorizontalKPICard
                                    items={[
                                        { title: "Total", value: formatCurrency(total), icon: FileIcon, iconBg: "bg-indigo-50 dark:bg-indigo-950/20", iconColor: "text-indigo-600 dark:text-indigo-400" },
                                        { title: "Pago", value: formatCurrency(paid), icon: CheckCircleIcon, iconBg: "bg-emerald-50 dark:bg-emerald-950/20", iconColor: "text-emerald-600 dark:text-emerald-400" },
                                        { title: "Restante", value: formatCurrency(pending), icon: ClockIcon, iconBg: "bg-amber-50 dark:bg-amber-950/20", iconColor: "text-amber-600 dark:text-amber-400" },
                                        { title: "Parcelas a quitar", value: pendingCount, icon: InstallmentIcon, iconBg: "bg-purple-50 dark:bg-purple-950/20", iconColor: "text-purple-600 dark:text-purple-400" },
                                        { title: "Valor total da quitação", value: formatCurrency(settleModalTotalToPay), icon: CashierIcon, iconBg: "bg-teal-50 dark:bg-teal-950/20", iconColor: "text-teal-600 dark:text-teal-400" },
                                    ]}
                                />

                                 {/* Conta bancária da quitação */}
                                 <FormSection
                                     hasSeparator
                                     title="Conta bancária da quitação"
                                     description={settleAccountLocked ? "Conta vinculada automaticamente ao meio de pagamento do pedido." : "Conta onde o saldo da quitação será aplicado."}
                                 >
                                     <div className="md:w-1/2">
                                         <FormDropdown
                                             label="Conta bancária *"
                                             value={settleResolvedAccount || ""}
                                             setValue={(val) => setSettleAccountId(val)}
                                             options={settleAccountOptions}
                                             placeholder="Selecione a conta bancária"
                                             disabled={settleAccountLocked}
                                             error={settleAccountLocked ? false : !settleResolvedAccount}
                                         />
                                         {settleAccountLocked && settleResolvedAccount && (
                                             <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                 Conta vinculada automaticamente ao meio de pagamento.
                                             </p>
                                         )}
                                     </div>
                                 </FormSection>

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
                                                                <th className="py-3 px-2 pl-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-l-lg" style={{ width: "150px" }}>Parcela</th>
                                                                <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "110px" }}>Vencimento</th>
                                                                <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50" style={{ width: "110px" }}>Restante</th>
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
                                                                    paymentMethodId: resolveStandardPaymentMethod(row.paymentType) || row.paymentMethodId || "Pix",
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
                                                                                <div className="flex items-center">
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                                                                        Parcela {row.installmentNumber}/{row.totalCount || pendingInstallments.length}
                                                                                    </span>
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
                                                                                value={values.paymentMethodId || "Pix"}
                                                                                setValue={(val: string) => setSettlePaymentsByInstallment((prev) => ({
                                                                                    ...prev,
                                                                                    [row.id]: { ...values, paymentMethodId: val }
                                                                                }))}
                                                                                options={STANDARD_PAYMENT_METHODS}
                                                                                placeholder="Selecione"
                                                                                disabled={Boolean(row.paymentMethodId && sanitizeUUID(row.paymentMethodId) !== null)}
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
                                                        paymentMethodId: resolveStandardPaymentMethod(row.paymentType) || row.paymentMethodId || "Pix",
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
                                                                        value={values.paymentMethodId || "Pix"}
                                                                        setValue={(val: string) => setSettlePaymentsByInstallment((prev) => ({
                                                                            ...prev,
                                                                            [row.id]: { ...values, paymentMethodId: val }
                                                                        }))}
                                                                        options={STANDARD_PAYMENT_METHODS}
                                                                        placeholder="Selecione"
                                                                        disabled={Boolean(row.paymentMethodId && sanitizeUUID(row.paymentMethodId) !== null)}
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
                        </div>
                    </div>
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

    const isFormOpen = entityState.isOpen && (
        entityState.action === "create" ||
        entityState.action === "duplicate" ||
        entityState.action === "edit"
    )
    // Plain expression (NOT useMemo - can't use hooks after early returns)
    const editingTx = (entityState.isOpen && entityState.action === "edit" && entityState.entityId)
        ? loadedTransactions.find((t: ERPTransaction) => t.id === entityState.entityId) || null
        : null

    if (isFormOpen) {
        if (entityState.action === "edit" && isLoadingDetail && entityState.entityType !== "recurring" && !editingTx) {
            return (
                <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                    <ThreeDotsLoader />
                </div>
            )
        }
        return (
            <motion.div
                key={entityState.entityType === "recurring" ? `edit-rec-${entityState.entityId}` : editingTx ? `edit-${editingTx.id}` : "create-transaction"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
            >
                <CreateTransactionPage
                    partnerId={partnerId}
                    storeId={storeId}
                    categories={categories}
                    accounts={financeAccounts && financeAccounts.length > 0 ? financeAccounts : accounts}
                    paymentMethods={paymentMethods}
                    editTransaction={editingTx || undefined}
                    editRecurringTemplateId={entityState.entityType === "recurring" ? (entityState.entityId || undefined) : undefined}
                    editRecurringTemplate={entityState.entityType === "recurring" ? recurringTemplates?.find((t: any) => t.id === entityState.entityId) : undefined}
                    forcedTab={forcedTab}
                    onBack={handleCloseTransactionDetail}
                    onSuccess={() => {
                        // afterMutation already refreshes the entity once.
                        afterMutation(entityState.entityId || undefined)
                        closeEntity()
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
                        <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                            {isExporting ? "Exportando..." : "Exportar"}
                        </Button>

                        <Button onClick={() => openEntity("create")} leftIcon={<PlusIcon size={18} />}>
                            Nova transação
                        </Button>
                    </div>
                </div>

                <TransactionPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    tabs={availableTabs}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setModals((prev) => ({ ...prev, filter: true }))}
                    onAddTransaction={() => openEntity("create")}
                    onExport={handleExport}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                    addDisabled={false}
                    tabCounts={tabCounts}
                    tabValues={tabValues}
                />

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
                                {!isSettledTab(activeTab) && (
                                    <SelectionBanner
                                        selectedCount={selection.ids.size}
                                        totalCount={paginatedTransactions.length}
                                        onSelectAll={() => setSelection({ ids: new Set(paginatedTransactions.map((item) => item.id)) })}
                                        onClearSelection={() => setSelection({ ids: new Set() })}
                                        itemName="transações"
                                        singularItemName="transação"
                                    />
                                )}
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
                                                onPrint={handlePrintTransaction}
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
                                                        {!isSettledTab(activeTab) && (
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
                                                        )}
                                                        {COLUMNS.map((col, idx) => {
                                                            const isSortable = col.id !== "actions"
                                                            const isSorted = sortConfig?.key === col.id
                                                            const isFirst = isSettledTab(activeTab) && idx === 0
                                                            const isLast = idx === COLUMNS.length - 1

                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isFirst ? "rounded-l-lg pl-6" : ""} ${isLast ? "rounded-r-lg" : ""}`}
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
                                                            selectable={!isSettledTab(activeTab)}
                                                            onSelect={handleSelectRow}
                                                            onOpenDetail={handleOpenTransactionDetail}
                                                            onEdit={handleEditTransaction}
                                                            onMarkAsPaid={handleMarkAsPaid}
                                                            onCancelPending={handleRequestCancelPending}
                                                            onSettleInstallmentGroup={handleSettleInstallmentGroup}
                                                            onPrint={handlePrintTransaction}
                                                            {...getPrefetchProps(transaction.id)}
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

            {!isSettledTab(activeTab) && (
                <FloatingActionBar
                    selectedCount={selection.ids.size}
                    onClearSelection={() => setSelection({ ids: new Set() })}
                >
                    <Button variant="ghost" onClick={() => setBulkModalOpen(true)} leftIcon={<EditIcon size={18} />} className="h-10 px-3">
                        Ações em massa
                    </Button>
                </FloatingActionBar>
            )}

            {!isSettledTab(activeTab) && (
                <BulkEditActionsModal
                    isOpen={bulkModalOpen}
                    onClose={() => setBulkModalOpen(false)}
                    selectedCount={selection.ids.size}
                    targetType="financial_transaction"
                    financialSelectionGuards={financialSelectionGuards}
                    financialCategories={categories}
                    financeAccounts={financeAccounts}
                    onApply={handleBulkApply}
                />
            )}

            <UndoGracePeriodToast
                isOpen={Boolean(undoManager.pendingAction)}
                title={undoManager.pendingAction?.title || ""}
                description={undoManager.pendingAction?.description}
                remainingSeconds={undoManager.remainingSeconds}
                progressPct={undoManager.progressPct}
                isExecuting={undoManager.isExecuting}
                onUndo={undoManager.undo}
                onConfirmNow={undoManager.flush}
            />

            <TransactionPrintModal
                isOpen={Boolean(printTransactionId)}
                onClose={() => setPrintTransactionId(null)}
                transactionId={printTransactionId || ""}
                partnerId={partnerId}
                storeId={storeId}
            />

            {renderSharedModals()}
        </FadeIn>
    )
}
