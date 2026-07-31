"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import { format } from "date-fns"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Button,
    Input,
    Combobox,
    IconPlaceholder,
    FormTextarea,
    MoneyInput,
    DatePicker,
    FormDropdown,
    Checkbox,
    InfoCard,
} from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    SaveIcon,
    ChevronLeftIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    UserIcon,
    PlusIcon,
    ArrowUpDownIcon,
    AdjustIcon,
    ReturnIcon,
} from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { formatCurrency } from "@/lib/utils"
import {
    createManualTransactionAction,
    updateManualTransactionAction,
    createTransferPairAction,
    adjustAccountBalanceViaTransactionAction,
    markRecurringOccurrenceAsPaidAction,
    createInstallmentGroupAction,
} from "@/app/actions/erp/transactions"
import { createFinancialCategoryAction } from "@/app/actions/erp/financial-category-metadata"
import { createFinanceAccountAction } from "@/app/actions/erp/finance-accounts"
import { pickPreferredDefaultAccountId, type FinanceAccountType } from "@/lib/finance-utils"
import {
    listTransactionContactsByTypeAction,
    createTransactionContactAction,
    type TransactionContactRow,
} from "@/app/actions/erp/transaction-contacts"
import {
    createRecurringTransactionAction,
    cancelRecurringTransactionAction,
    type RecurringFrequency,
} from "@/app/actions/erp/recurring-transactions"

export type CategoryItem = { id: string; name: string; parent_id: string | null; category_type?: "income" | "expense" | null }
export type AccountItem = {
    id: string
    name: string
    type: string
    is_active: boolean
    is_default?: boolean
    current_balance?: number | string | null
}

export type TxKind = "income" | "expense" | "transfer" | "adjustment" | "refund"

interface CreateTransactionPageProps {
    partnerId: string
    storeId?: string | null
    categories: CategoryItem[]
    accounts: AccountItem[]
    onBack: () => void
    onSuccess?: () => void
    /** When set, the page operates in edit mode with pre-filled data */
    editTransaction?: import("../../../lib/services/transactions.types").ERPTransaction
    forcedTab?: "Transações" | "A pagar" | "A receber"
}

type ContactType = "customer" | "supplier" | "service" | "employee" | "partner" | "other"
type TransactionMode = "single" | "installment" | "recurring"

type QuickModal = null | "category" | "subcategory" | "account" | "contact"

function toYmd(d: Date | string | undefined): string {
    if (!d) return ""
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ""
    return format(date, "yyyy-MM-dd")
}

function formatLocalYmdToIso(ymd: string): string {
    if (!ymd) return new Date().toISOString()
    const todayYmd = format(new Date(), "yyyy-MM-dd")
    if (ymd === todayYmd) {
        return new Date().toISOString()
    }
    const localDate = new Date(`${ymd}T12:00:00`)
    return isNaN(localDate.getTime()) ? new Date().toISOString() : localDate.toISOString()
}

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function parseYmdToLocalNoon(ymd: string): Date {
    const [y, m, d] = ymd.split("-").map(Number)
    return new Date(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0)
}

function ymdAfterAddingPeriod(anchorYmd: string, frequency: RecurringFrequency, interval: number): string {
    const d = parseYmdToLocalNoon(anchorYmd)
    const iv = Math.max(Math.floor(Number(interval) || 1), 1)
    if (frequency === "daily") d.setDate(d.getDate() + iv)
    else if (frequency === "weekly") d.setDate(d.getDate() + 7 * iv)
    else if (frequency === "monthly") d.setMonth(d.getMonth() + iv)
    else if (frequency === "yearly") d.setFullYear(d.getFullYear() + iv)
    return format(d, "yyyy-MM-dd")
}

function toMiddayIsoFromYmd(ymd: string): string {
    return parseYmdToLocalNoon(ymd).toISOString()
}

function installmentFrequencyLabel(frequency: RecurringFrequency, interval: number): string {
    const iv = Math.max(Math.floor(Number(interval) || 1), 1)
    const unit =
        frequency === "daily" ? "dia" : frequency === "weekly" ? "semana" : frequency === "monthly" ? "mês" : "ano"
    return iv === 1 ? `${unit}` : `${iv} ${unit}s`
}

const FormCombobox = ({
    label,
    value,
    onChange,
    options,
    disabled,
    actionItem,
    placeholder,
    error,
    errorMessage,
}: {
    label: string
    value: string | undefined
    onChange: (val: string) => void
    options: { label: string; value: string }[]
    disabled?: boolean
    actionItem?: { label: string; icon?: React.ReactNode; onClick: () => void }
    placeholder?: string
    error?: boolean
    errorMessage?: string
}) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">{label}</label>
        <Combobox
            options={options}
            value={value}
            onChange={onChange}
            disabled={disabled}
            width="w-full"
            className="w-full"
            actionItem={actionItem}
            placeholder={placeholder}
            error={error}
        />
        {error && errorMessage ? <p className="text-xs text-brand-red">{errorMessage}</p> : null}
    </div>
)

const SidebarCard = ({
    children,
    hasTopStrip = true,
}: {
    children: React.ReactNode
    hasTopStrip?: boolean
}) => (
    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
        {children}
    </div>
)

export default function CreateTransactionPage({
    partnerId,
    storeId: storeIdProp,
    categories,
    accounts,
    onBack,
    onSuccess,
    editTransaction,
    editRecurringTemplateId,
    editRecurringTemplate,
    paymentMethods = [],
    forcedTab,
}: CreateTransactionPageProps & { editRecurringTemplateId?: string, editRecurringTemplate?: any, paymentMethods?: any[] }) {
    const router = useRouter()
    const debouncedRefresh = useDebouncedRefresh()
    const { success, error } = useNotification()
    const { planSlug } = usePermissions()
    const storeId = storeIdProp || null
    const { openPlanUpgrade } = usePlanUpgrade()
    const isFreePlan = planSlug === "free"
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [isScrolled, setIsScrolled] = useState(false)
    const [activeTab, setActiveTab] = useState("general")
    const [isSaving, setIsSaving] = useState(false)

    /* ── Edit mode computed flags ── */
    const isEditMode = !!editTransaction || !!editRecurringTemplate
    const isRecurringTemplateEdit = !!editRecurringTemplate
    const isPaidTransaction = !!editTransaction && String(editTransaction.rawStatus || "").toLowerCase() === "paid"
    const isPendingTransaction = !!editTransaction && String(editTransaction.rawStatus || "").toLowerCase() === "pending"
    const isSystemGatewayOrigin = !!editTransaction && ["system", "gateway"].includes(String(editTransaction.origin || "").toLowerCase())
    const lockFinancialFields = isPaidTransaction || isSystemGatewayOrigin
    const lockAmountField = lockFinancialFields || (isEditMode && !!editTransaction && isPendingTransaction)
    const isInstallmentTransaction = !!editTransaction?.installmentGroupId
    const isRecurringTransaction = !!editTransaction && !!editTransaction.recurringId
    const isSalesOrigin = !!editTransaction && String(editTransaction.category || "").toLowerCase() === "vendas"

    const [txKind, setTxKind] = useState<TxKind>(() => {
        if (editRecurringTemplate) return editRecurringTemplate.type || "income"
        if (editTransaction) return editTransaction.transactionType || "income"
        if (forcedTab === "A pagar") return "expense"
        if (forcedTab === "A receber") return "income"
        return "income"
    })
    const [amount, setAmount] = useState(() => editRecurringTemplate ? editRecurringTemplate.amount : editTransaction ? editTransaction.amount : 0)
    const [description, setDescription] = useState(() => editRecurringTemplate?.description || editTransaction?.description || "")
    const [categoryId, setCategoryId] = useState<string | undefined>(() => editRecurringTemplate?.category_id ?? editTransaction?.categoryId ?? undefined)
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(() => editRecurringTemplate?.subcategory_id ?? editTransaction?.subcategoryId ?? undefined)
    const [dueDate, setDueDate] = useState(() =>
        editRecurringTemplate?.start_date?.slice(0, 10) ||
        (editTransaction?.dueDateRaw ? editTransaction.dueDateRaw.slice(0, 10) : format(new Date(), "yyyy-MM-dd")),
    )
    const [paymentDate, setPaymentDate] = useState(() => editTransaction?.paymentDateRaw ? editTransaction.paymentDateRaw.slice(0, 10) : format(new Date(), "yyyy-MM-dd"))
    const [status, setStatus] = useState<"pending" | "paid">(() => editRecurringTemplate ? "pending" : editTransaction ? (String(editTransaction.rawStatus || "").toLowerCase() === "paid" ? "paid" : "pending") : "pending")
    const [accountId, setAccountId] = useState<string | undefined>(() => {
        const explicitId = editRecurringTemplate?.account_id ?? editTransaction?.accountId ?? undefined
        if (explicitId) return explicitId
        return pickPreferredDefaultAccountId(accounts.filter((a) => a.is_active))
    })
    const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined)
    const [toAccountId, setToAccountId] = useState<string | undefined>(undefined)
    const [paymentType, setPaymentType] = useState<string>("Pix")
    const [paymentMethodId, setPaymentMethodId] = useState<string | undefined>(() => editRecurringTemplate?.payment_method_id ?? editTransaction?.paymentMethodId ?? paymentMethods?.[0]?.id ?? undefined)
    const [contactType, setContactType] = useState<ContactType>(() => editRecurringTemplate?.contact_type || "customer")
    const [notes, setNotes] = useState(() => editTransaction?.notes || "")

    const [contactRows, setContactRows] = useState<TransactionContactRow[]>([])
    const [contactsLoading, setContactsLoading] = useState(false)
    const [selectedContactId, setSelectedContactId] = useState<string | undefined>(undefined)
    const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; email?: string | null; phone?: string | null; avatar_url?: string | null } | null>(null)
    const [customerSheetOpen, setCustomerSheetOpen] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(() => new Set())
    const [showDiscardModal, setShowDiscardModal] = useState(false)
    const [cancelRecurringOpen, setCancelRecurringOpen] = useState(false)

    const [adjustmentTargetBalance, setAdjustmentTargetBalance] = useState(0)
    const [refundKind, setRefundKind] = useState<"expense_refund" | "revenue_refund">(() => editTransaction?.refundKind || "expense_refund")
    const [referenceNote, setReferenceNote] = useState(() => editTransaction?.referenceNote || "")

    const [enableRecurrence, setEnableRecurrence] = useState(() => !!editRecurringTemplate)
    const [transactionMode, setTransactionMode] = useState<TransactionMode>(() => (editRecurringTemplate ? "recurring" : "single"))
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurringFrequency>(() => editRecurringTemplate?.frequency || "monthly")
    const [recurrenceInterval, setRecurrenceInterval] = useState(() => editRecurringTemplate?.interval_value || 1)
    const [recurrenceNextRunYmd, setRecurrenceNextRunYmd] = useState(() =>
        editRecurringTemplate?.start_date?.slice(0, 10) || ymdAfterAddingPeriod(format(new Date(), "yyyy-MM-dd"), "monthly", 1),
    )
    const [recurrenceEndYmd, setRecurrenceEndYmd] = useState(() => editRecurringTemplate?.end_date?.slice(0, 10) || "")
    const [recurrenceMonthlyLastDay, setRecurrenceMonthlyLastDay] = useState(() => !!editRecurringTemplate?.use_last_day)
    const [installmentsCount, setInstallmentsCount] = useState(2)
    const [installmentFrequency, setInstallmentFrequency] = useState<RecurringFrequency>("monthly")
    const [installmentInterval, setInstallmentInterval] = useState(1)

    const [quickModal, setQuickModal] = useState<QuickModal>(null)
    const [quickSaving, setQuickSaving] = useState(false)
    const [quickName, setQuickName] = useState("")
    const [newAccountType, setNewAccountType] = useState<FinanceAccountType>("cash")
    const [newAccountInitial, setNewAccountInitial] = useState(0)
    const [newContactModalType, setNewContactModalType] = useState<ContactType>("supplier")
    const [newContactDesc, setNewContactDesc] = useState("")
    const pendingSelectContactIdRef = useRef<string | null>(null)
    const pendingCloseRef = useRef<(() => void) | null>(null)
    const skipTransferBalanceCheckRef = useRef(false)

    const [transferInsufficientOpen, setTransferInsufficientOpen] = useState(false)
    const [transferInsufficientMeta, setTransferInsufficientMeta] = useState({ fromBal: 0, amount: 0 })
    const [adjustFromTransferOpen, setAdjustFromTransferOpen] = useState(false)
    const [adjustFromTransferNewBalance, setAdjustFromTransferNewBalance] = useState(0)
    const [adjustFromTransferSaving, setAdjustFromTransferSaving] = useState(false)
    const isQuickModalCloseLocked = quickSaving
    const isAdjustModalCloseLocked = adjustFromTransferSaving

    const defaultDayYmd = useMemo(() => format(new Date(), "yyyy-MM-dd"), [])
    const defaultRecurrenceNext = useMemo(
        () => ymdAfterAddingPeriod(format(new Date(), "yyyy-MM-dd"), "monthly", 1),
        [],
    )

    const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts])
    const accountOptions = useMemo(
        () => activeAccounts.map((a) => ({ value: a.id, label: a.name })),
        [activeAccounts],
    )

    const getAccountBalance = useCallback(
        (id?: string) => {
            if (!id) return 0
            const a = activeAccounts.find((x) => x.id === id)
            if (!a) return 0
            const v = a.current_balance
            if (v === null || v === undefined) return 0
            const n = Number(v)
            return Number.isFinite(n) ? n : 0
        },
        [activeAccounts],
    )

    const isDirty = useMemo(() => {
        if (isEditMode) {
            const iTxKind = editRecurringTemplate ? (editRecurringTemplate.type || "income") : editTransaction?.transactionType || "income"
            const iAmount = editRecurringTemplate ? editRecurringTemplate.amount : editTransaction ? editTransaction.amount : 0
            const iDescription = editRecurringTemplate?.description || editTransaction?.description || ""
            const iCategoryId = editRecurringTemplate?.category_id ?? editTransaction?.categoryId ?? undefined
            const iSubcategoryId = editRecurringTemplate?.subcategory_id ?? editTransaction?.subcategoryId ?? undefined
            const iAccountId = editRecurringTemplate?.account_id ?? editTransaction?.accountId ?? undefined
            const iNotes = editTransaction?.notes || ""
            const iStatus = editRecurringTemplate ? "pending" : editTransaction ? (String(editTransaction.rawStatus || "").toLowerCase() === "paid" ? "paid" : "pending") : "pending"
            const iPaymentMethodId = editRecurringTemplate?.payment_method_id ?? editTransaction?.paymentMethodId ?? paymentMethods?.[0]?.id ?? undefined
            const iDueDate = editRecurringTemplate?.start_date?.slice(0, 10) || (editTransaction?.dueDateRaw ? editTransaction.dueDateRaw.slice(0, 10) : defaultDayYmd)
            const iPaymentDate = editTransaction?.paymentDateRaw ? editTransaction.paymentDateRaw.slice(0, 10) : defaultDayYmd
            const iContactType = editRecurringTemplate?.contact_type || "customer"

            if (txKind !== iTxKind) return true
            if (amount !== iAmount) return true
            if (description !== iDescription) return true
            if (categoryId !== iCategoryId) return true
            if (subcategoryId !== iSubcategoryId) return true
            if (accountId !== iAccountId) return true
            if (notes !== iNotes) return true
            if (status !== iStatus) return true
            if (paymentMethodId !== iPaymentMethodId) return true
            if (dueDate !== iDueDate) return true
            if (paymentDate !== iPaymentDate) return true
            if (contactType !== iContactType) return true

            return false
        }

        // Original logic for create mode
        if (description.trim()) return true
        if (txKind === "adjustment") {
            if (accountId && Math.abs(adjustmentTargetBalance - getAccountBalance(accountId)) > 0.005) return true
        } else if (amount > 0) return true
        if (notes.trim()) return true
        if (categoryId) return true
        if (subcategoryId) return true
        if (accountId) return true
        if (fromAccountId || toAccountId) return true
        if (selectedContactId) return true
        if (selectedCustomer) return true
        if (transactionMode !== "single") return true
        if (enableRecurrence) return true
        if (installmentsCount !== 2) return true
        if (installmentFrequency !== "monthly") return true
        if (installmentInterval !== 1) return true
        if (status !== "pending") return true
        if (paymentType !== "Pix") return true
        if (contactType !== "customer") return true
        if (referenceNote.trim()) return true
        if (refundKind !== "expense_refund") return true
        if (txKind !== "income") return true
        if (dueDate !== defaultDayYmd || paymentDate !== defaultDayYmd) return true
        if (recurrenceEndYmd.trim()) return true
        if (recurrenceMonthlyLastDay) return true
        if (recurrenceInterval !== 1 || recurrenceFrequency !== "monthly") return true
        if (recurrenceNextRunYmd !== defaultRecurrenceNext) return true
        return false
    }, [
        isEditMode,
        paymentMethods,
        editTransaction,
        editRecurringTemplate,
        description,
        amount,
        notes,
        categoryId,
        subcategoryId,
        accountId,
        adjustmentTargetBalance,
        fromAccountId,
        toAccountId,
        selectedContactId,
        selectedCustomer,
        transactionMode,
        enableRecurrence,
        installmentsCount,
        installmentFrequency,
        installmentInterval,
        status,
        paymentMethodId,
        paymentType,
        contactType,
        referenceNote,
        refundKind,
        txKind,
        getAccountBalance,
        dueDate,
        paymentDate,
        defaultDayYmd,
        recurrenceEndYmd,
        recurrenceMonthlyLastDay,
        recurrenceInterval,
        recurrenceFrequency,
        recurrenceNextRunYmd,
        defaultRecurrenceNext,
    ])

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => {
        if (isDirty) {
            setShowDiscardModal(true)
        } else {
            onBack()
        }
    }, [isDirty, onBack])

    const confirmDiscard = useCallback(() => {
        setShowDiscardModal(false)
        onBack()
    }, [onBack])

    const isIncomeExpense = txKind === "income" || txKind === "expense"
    const needsContactPanel = isIncomeExpense || txKind === "refund"
    const recurringModeEnabled = transactionMode === "recurring"
    const installmentModeEnabled = transactionMode === "installment"

    useEffect(() => {
        if (contactType !== "customer") setSelectedCustomer(null)
    }, [contactType])

    useEffect(() => {
        if (!editRecurringTemplate) return
        if (editRecurringTemplate.customer_id) {
            setContactType("customer")
            setSelectedCustomer({
                id: editRecurringTemplate.customer_id,
                name: "Cliente",
            })
            setSelectedContactId(undefined)
            return
        }
        if (editRecurringTemplate.contact_id && editRecurringTemplate.contact_type) {
            setContactType(editRecurringTemplate.contact_type as ContactType)
            pendingSelectContactIdRef.current = editRecurringTemplate.contact_id
        }
    }, [editRecurringTemplate])

    useEffect(() => {
        if (txKind === "adjustment" || txKind === "transfer") setStatus("paid")
    }, [txKind])

    useEffect(() => {
        if (txKind !== "adjustment" || !accountId) return
        setAdjustmentTargetBalance(getAccountBalance(accountId))
    }, [txKind, accountId, getAccountBalance])

    const transferFromAccountName = useMemo(
        () => activeAccounts.find((a) => a.id === fromAccountId)?.name || "Conta de origem",
        [activeAccounts, fromAccountId],
    )

    const parentCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories])
    const visibleParentCategories = useMemo(() => {
        if (txKind === "income") return parentCategories.filter((c) => c.category_type === "income")
        if (txKind === "expense") return parentCategories.filter((c) => c.category_type === "expense")
        return parentCategories
    }, [parentCategories, txKind])
    const childCategories = useMemo(() => {
        if (!categoryId) return []
        return categories.filter((c) => c.parent_id === categoryId)
    }, [categories, categoryId])
    const selectedCategoryName = useMemo(
        () => String(parentCategories.find((c) => c.id === categoryId)?.name || "").trim(),
        [parentCategories, categoryId],
    )

    const contactComboboxOptions = useMemo(
        () => contactRows.map((c) => ({ value: c.id, label: c.name })),
        [contactRows],
    )

    useEffect(() => {
        if (!needsContactPanel) {
            setContactRows([])
            setSelectedContactId(undefined)
            setSelectedCustomer(null)
            return
        }
        if (contactType === "customer") {
            setContactRows([])
            setSelectedContactId(undefined)
            setContactsLoading(false)
            pendingSelectContactIdRef.current = null
            return
        }
        let cancelled = false
            ; (async () => {
                setContactsLoading(true)
                const res = await listTransactionContactsByTypeAction(partnerId, contactType)
                if (cancelled) return
                if (res.success) setContactRows(res.data)
                else setContactRows([])
                const pending = pendingSelectContactIdRef.current
                if (pending) {
                    setSelectedContactId(pending)
                    pendingSelectContactIdRef.current = null
                } else {
                    setSelectedContactId(undefined)
                }
                setContactsLoading(false)
            })()
        return () => {
            cancelled = true
        }
    }, [partnerId, contactType, needsContactPanel])

    useEffect(() => {
        if (!isIncomeExpense) setEnableRecurrence(false)
    }, [isIncomeExpense])

    useEffect(() => {
        if (!isIncomeExpense) {
            setTransactionMode("single")
            setEnableRecurrence(false)
            return
        }
        if (transactionMode === "recurring") setEnableRecurrence(true)
        else setEnableRecurrence(false)
    }, [isIncomeExpense, transactionMode])

    useEffect(() => {
        if (!enableRecurrence || !isIncomeExpense || isRecurringTemplateEdit) return
        setRecurrenceNextRunYmd(dueDate)
    }, [enableRecurrence, dueDate, isIncomeExpense, isRecurringTemplateEdit])

    const dueDateYmdParts = useMemo(() => {
        const [y, m, d] = dueDate.split("-").map(Number)
        return { month: m || 1, day: d || 1 }
    }, [dueDate])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const paidLabel =
        txKind === "expense" || (txKind === "refund" && refundKind === "revenue_refund") ? "Pago" : "Recebido"

    const refreshLists = () => debouncedRefresh()

    const openQuickCategory = () => {
        setQuickName("")
        setQuickModal("category")
    }
    const openQuickSubcategory = () => {
        if (!categoryId) return error("Selecione uma categoria antes de criar subcategoria.")
        setQuickName("")
        setQuickModal("subcategory")
    }
    const openQuickAccount = () => {
        setQuickName("")
        setNewAccountType("cash")
        setNewAccountInitial(0)
        setQuickModal("account")
    }
    const openQuickContact = () => {
        if (contactType === "customer") return
        setQuickName("")
        setNewContactModalType(contactType)
        setNewContactDesc("")
        setQuickModal("contact")
    }

    const handleQuickSave = async () => {
        if (quickModal === "category") {
            if (!quickName.trim()) return error("Nome obrigatório")
            const key = normalizeName(quickName)
            if (categories.some((c) => normalizeName(c.name) === key)) return error("Já existe uma categoria com esse nome.")
            setQuickSaving(true)
            try {
                const res = await createFinancialCategoryAction({
                    partnerId,
                    name: quickName.trim(),
                    parentId: null,
                    categoryType: txKind === "expense" ? "expense" : "income",
                })
                if (!res.success) return error(res.error || "Erro")
                success("Categoria criada")
                setQuickModal(null)
                refreshLists()
            } finally {
                setQuickSaving(false)
            }
            return
        }
        if (quickModal === "subcategory") {
            if (!quickName.trim()) return error("Nome obrigatório")
            if (!categoryId) return error("Categoria pai obrigatória")
            const key = normalizeName(quickName)
            if (categories.some((c) => normalizeName(c.name) === key)) return error("Já existe uma subcategoria com esse nome.")
            setQuickSaving(true)
            try {
                const res = await createFinancialCategoryAction({
                    partnerId,
                    name: quickName.trim(),
                    parentId: categoryId,
                })
                if (!res.success) return error(res.error || "Erro")
                success("Subcategoria criada")
                setQuickModal(null)
                refreshLists()
            } finally {
                setQuickSaving(false)
            }
            return
        }
        if (quickModal === "account") {
            if (!quickName.trim()) return error("Nome obrigatório")
            const key = normalizeName(quickName)
            if (accounts.some((a) => normalizeName(a.name) === key)) return error("Já existe uma conta com esse nome.")
            setQuickSaving(true)
            try {
                const res = await createFinanceAccountAction({
                    partnerId,
                    name: quickName.trim(),
                    type: newAccountType,
                    initialBalance: newAccountInitial,
                    currentBalance: null,
                })
                if (!res.success) return error(res.error || "Erro")
                success("Conta criada")
                setQuickModal(null)
                refreshLists()
            } finally {
                setQuickSaving(false)
            }
            return
        }
        if (quickModal === "contact") {
            if (!quickName.trim()) return error("Nome obrigatório")
            const key = normalizeName(quickName)
            if (contactRows.some((c) => normalizeName(c.name) === key && c.type === newContactModalType)) {
                return error("Já existe um contato com esse nome para esse tipo.")
            }
            setQuickSaving(true)
            try {
                const res = await createTransactionContactAction({
                    partnerId,
                    name: quickName.trim(),
                    type: newContactModalType,
                    description: newContactDesc.trim() || null,
                })
                if (!res.success) return error(res.error || "Erro")
                success("Contato criado")
                if (newContactModalType === contactType) {
                    setContactRows((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
                    setSelectedContactId(res.data.id)
                } else {
                    pendingSelectContactIdRef.current = res.data.id
                    setContactType(newContactModalType)
                }
                setQuickModal(null)
            } finally {
                setQuickSaving(false)
            }
        }
    }

    const collectValidationErrors = useCallback((): Set<string> => {
        const e = new Set<string>()
        if (txKind === "transfer") {
            if (!(amount > 0)) e.add("amount")
            if (!fromAccountId) e.add("fromAccountId")
            if (!toAccountId) e.add("toAccountId")
            if (fromAccountId && toAccountId && fromAccountId === toAccountId) e.add("toAccountId")
        } else if (txKind === "adjustment") {
            if (!description.trim()) e.add("description")
            if (!accountId) e.add("accountId")
            const cur = getAccountBalance(accountId)
            if (Math.abs(adjustmentTargetBalance - cur) < 0.005) e.add("adjustmentTarget")
        } else if (txKind === "refund") {
            if (!description.trim()) e.add("description")
            if (!(amount > 0)) e.add("amount")
            if (!accountId) e.add("accountId")
        } else if (isIncomeExpense) {
            if (!description.trim()) e.add("description")
            if (!(amount > 0)) e.add("amount")
            if (!accountId) e.add("accountId")
            if (installmentModeEnabled) {
                if (!(installmentsCount >= 1) || installmentsCount > 48) e.add("installmentsCount")
            }
            if (enableRecurrence && !isRecurringTemplateEdit && recurrenceEndYmd.trim()) {
                const startIso = toMiddayIsoFromYmd(dueDate)
                const endIso = toMiddayIsoFromYmd(recurrenceEndYmd.trim())
                if (new Date(endIso) < new Date(startIso)) e.add("recurrenceEndYmd")
            }
            if (isRecurringTemplateEdit && recurrenceEndYmd.trim()) {
                const startIso = toMiddayIsoFromYmd(recurrenceNextRunYmd)
                const endIso = toMiddayIsoFromYmd(recurrenceEndYmd.trim())
                if (new Date(endIso) < new Date(startIso)) e.add("recurrenceEndYmd")
            }
        }
        return e
    }, [
        txKind,
        amount,
        fromAccountId,
        toAccountId,
        description,
        accountId,
        isIncomeExpense,
        installmentModeEnabled,
        installmentsCount,
        enableRecurrence,
        isRecurringTemplateEdit,
        dueDate,
        recurrenceNextRunYmd,
        recurrenceEndYmd,
        adjustmentTargetBalance,
        getAccountBalance,
    ])

    const contactPayload = useCallback(() => {
        if (contactType === "customer" && selectedCustomer) {
            return {
                contactId: null as string | null,
                customerId: selectedCustomer.id,
                contactTypeResolved: "customer" as const,
            }
        }
        if (contactType === "customer") {
            return {
                contactId: null as string | null,
                customerId: null as string | null,
                contactTypeResolved: null as null,
            }
        }
        if (!selectedContactId) {
            return {
                contactId: null as string | null,
                customerId: null as string | null,
                contactTypeResolved: null as null,
            }
        }
        return {
            contactId: selectedContactId,
            customerId: null as string | null,
            contactTypeResolved: contactType,
        }
    }, [contactType, selectedCustomer, selectedContactId])

    const handleSave = async () => {
        const errs = collectValidationErrors()
        if (errs.size > 0) {
            setFieldErrors(new Set(errs))
            setActiveTab("general")
            error("Verifique os campos obrigatórios.")
            return
        }
        setFieldErrors(new Set())

        /* ── EDIT MODE: update existing recurring template ── */
        if (isRecurringTemplateEdit && editRecurringTemplateId) {
            setIsSaving(true)
            try {
                const cp = contactPayload()
                const { updateRecurringTransactionAction } = await import("@/app/actions/erp/recurring-transactions")
                const anchorYmd = recurrenceNextRunYmd
                const anchorParts = anchorYmd.split("-").map(Number)
                const rMonth = anchorParts[1] || 1
                const rDay = anchorParts[2] || 1
                const startIso = toMiddayIsoFromYmd(anchorYmd)
                const patch: Record<string, unknown> = {
                    amount,
                    description: description.trim(),
                    frequency: recurrenceFrequency,
                    interval_value: recurrenceInterval,
                    use_last_day: recurrenceMonthlyLastDay,
                    week_days: recurrenceFrequency === "weekly" ? [parseYmdToLocalNoon(anchorYmd).getDay()] : null,
                    month_day: recurrenceFrequency === "monthly" && !recurrenceMonthlyLastDay ? rDay : null,
                    year_month: recurrenceFrequency === "yearly" ? rMonth : null,
                    year_day: recurrenceFrequency === "yearly" ? rDay : null,
                    account_id: accountId || null,
                    category_id: categoryId || null,
                    subcategory_id: subcategoryId || null,
                    contact_id: cp.contactId,
                    customer_id: cp.customerId,
                    contact_type: cp.contactTypeResolved,
                    payment_method_id: paymentMethodId,
                    start_date: startIso,
                    next_run_date: startIso,
                    end_date: recurrenceEndYmd.trim() ? toMiddayIsoFromYmd(recurrenceEndYmd.trim()) : null,
                }
                const res = await updateRecurringTransactionAction(editRecurringTemplateId, partnerId, patch)
                if (!res.success) return error(res.error || "Erro ao atualizar recorrência")
                success("Recorrência atualizada!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
            return
        }

        /* ── EDIT MODE: update existing transaction ── */
        if (isEditMode && editTransaction) {
            setIsSaving(true)
            try {
                const cp = contactPayload()
                const patch: Record<string, unknown> = {}

                if (isInstallmentTransaction) {
                    patch.notes = notes || null
                    patch.accountId = accountId || null
                    patch.paymentMethodId = paymentMethodId || null
                } else {
                    // Always allow these
                    patch.description = description.trim()
                    patch.notes = notes || null

                    if (!isPaidTransaction) {
                        patch.categoryId = categoryId || null
                        patch.subcategoryId = subcategoryId || null
                        patch.status = status
                        patch.paymentDate = status === "paid" ? formatLocalYmdToIso(paymentDate) : null
                    }

                    // Only allow financial fields if NOT locked
                    if (!lockFinancialFields) {
                        patch.amount = amount
                        patch.accountId = accountId || null
                        patch.contactId = cp.contactId
                        patch.customerId = cp.customerId
                        patch.contactType = cp.contactTypeResolved
                        patch.paymentMethodId = paymentMethodId
                        patch.dueDate = isSalesOrigin ? null : dueDate
                        patch.transactionDate = isSalesOrigin ? (paymentDate ? formatLocalYmdToIso(paymentDate) : null) : (dueDate ? toMiddayIsoFromYmd(dueDate) : null)
                    }
                }

                const res = await updateManualTransactionAction(
                    editTransaction.id,
                    partnerId,
                    patch as any,
                )
                if (!res.success) return error(res.error || "Erro ao atualizar transação")
                success("Transação atualizada com sucesso!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
            return
        }

        /* ── CREATE MODE (original logic below) ── */

        if (txKind === "transfer") {
            const fromBal = getAccountBalance(fromAccountId)
            if (
                !skipTransferBalanceCheckRef.current &&
                status === "paid" &&
                amount > 0 &&
                fromBal + 0.005 < amount
            ) {
                setTransferInsufficientMeta({ fromBal, amount })
                setTransferInsufficientOpen(true)
                return
            }
            skipTransferBalanceCheckRef.current = false

            setIsSaving(true)
            try {
                const res = await createTransferPairAction({
                    partnerId,
                    fromAccountId: fromAccountId!,
                    toAccountId: toAccountId!,
                    amount,
                    description: description.trim() || null,
                    transactionDate: dueDate,
                    status,
                    paymentMethodId: paymentMethodId || null,
                })
                if (!res.success) return error(res.error || "Erro ao transferir")
                success("Transferência registrada!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
            return
        }

        if (txKind === "adjustment") {
            const cur = getAccountBalance(accountId)
            const signed = Math.round((adjustmentTargetBalance - cur) * 100) / 100
            if (Math.abs(signed) < 0.005) {
                return error("O novo saldo deve ser diferente do saldo atual.")
            }
            const datePart = dueDate.slice(0, 10)
            const transactionTs = new Date(`${datePart}T12:00:00`).toISOString()
            setIsSaving(true)
            try {
                const res = await createManualTransactionAction({
                    partnerId,
                    storeId,
                    transactionType: "adjustment",
                    amount: signed,
                    description: description.trim(),
                    category: "Ajuste de saldo",
                    categoryId: null,
                    subcategoryId: null,
                    accountId: accountId || null,
                    contactId: null,
                    customerId: null,
                    contactType: null,
                    paymentType: "Ajuste",
                    dueDate,
                    paymentDate: transactionTs,
                    transactionDate: datePart,
                    status: "paid",
                    notes: notes || null,
                    origin: "manual",
                })
                if (!res.success) return error(res.error || "Erro ao salvar")
                success("Ajuste registrado!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
            return
        }

        if (txKind === "refund") {
            const cp = contactPayload()
            setIsSaving(true)
            try {
                const res = await createManualTransactionAction({
                    partnerId,
                    storeId,
                    transactionType: "refund",
                    amount,
                    description: description.trim(),
                    category: "Reembolsos",
                    categoryId: null,
                    subcategoryId: null,
                    accountId: accountId || null,
                    contactId: cp.contactId,
                    customerId: cp.customerId,
                    contactType: needsContactPanel ? cp.contactTypeResolved : null,
                    paymentType: "Reembolso",
                    dueDate,
                    paymentDate: status === "paid" ? formatLocalYmdToIso(paymentDate) : null,
                    transactionDate: dueDate ? toMiddayIsoFromYmd(dueDate) : null,
                    status,
                    notes: notes || null,
                    origin: "manual",
                    refundKind,
                    referenceNote: referenceNote.trim() || null,
                })
                if (!res.success) return error(res.error || "Erro ao salvar reembolso")
                success("Reembolso registrado!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
            return
        }

        const cp = contactPayload()
        setIsSaving(true)
        try {
            if (recurringModeEnabled && enableRecurrence) {
                const iv = Math.max(Math.floor(Number(recurrenceInterval) || 1), 1)
                const startIso = toMiddayIsoFromYmd(dueDate)
                const endIso = recurrenceEndYmd.trim() ? toMiddayIsoFromYmd(recurrenceEndYmd.trim()) : null

                const recRes = await createRecurringTransactionAction({
                    partnerId,
                    type: txKind,
                    amount,
                    description: description.trim(),
                    frequency: recurrenceFrequency,
                    intervalValue: iv,
                    weekDays: recurrenceFrequency === "weekly" ? [parseYmdToLocalNoon(dueDate).getDay()] : null,
                    monthDay:
                        recurrenceFrequency === "monthly" && !recurrenceMonthlyLastDay
                            ? dueDateYmdParts.day
                            : null,
                    useLastDay: recurrenceFrequency === "monthly" && recurrenceMonthlyLastDay,
                    yearMonth: recurrenceFrequency === "yearly" ? dueDateYmdParts.month : null,
                    yearDay: recurrenceFrequency === "yearly" ? dueDateYmdParts.day : null,
                    startDate: startIso,
                    endDate: endIso,
                    nextRunDate: startIso,
                    accountId: accountId || null,
                    categoryId: categoryId || null,
                    subcategoryId: subcategoryId || null,
                    contactId: cp.contactId,
                    customerId: cp.customerId,
                    contactType: cp.contactTypeResolved,
                    paymentMethodId: paymentMethodId || null,
                })
                if (!recRes.success) return error(recRes.error || "Erro ao criar recorrência")
                const newId = (recRes.data as { id?: string } | undefined)?.id
                if (status === "paid" && newId) {
                    const paidRes = await markRecurringOccurrenceAsPaidAction({
                        partnerId,
                        recurringId: newId,
                        occurrenceDate: dueDate.slice(0, 10),
                        accountId: accountId || null,
                        paymentMethodId: paymentMethodId || null,
                    })
                    if (!paidRes.success) return error(paidRes.error || "Erro ao registrar pagamento da ocorrência")
                }
                success(
                    status === "paid"
                        ? "Recorrência criada e primeira ocorrência marcada como paga!"
                        : "Recorrência criada! Próximas ocorrências aparecem em A pagar/A receber.",
                )
                onSuccess?.()
                debouncedRefresh()
                onBack()
                return
            }

            if (installmentModeEnabled) {
                const iv = Math.max(Math.floor(Number(installmentInterval) || 1), 1)
                const count = Math.max(1, Math.floor(Number(installmentsCount) || 1))
                if (count > 48) return error("Máximo de 48 parcelas.")

                const installmentRes = await createInstallmentGroupAction({
                    partnerId,
                    transactionType: txKind,
                    description: description.trim(),
                    categoryLabel: selectedCategoryName,
                    totalAmount: amount,
                    installmentsCount: count,
                    frequency: installmentFrequency,
                    interval: iv,
                    startDate: dueDate,
                    categoryId: categoryId || null,
                    subcategoryId: subcategoryId || null,
                    accountId: accountId || null,
                    contactId: cp.contactId,
                    customerId: cp.customerId,
                    contactType: cp.contactTypeResolved,
                    paymentType,
                    paymentMethodId: paymentMethodId || null,
                    notes: notes || null,
                    initialStatus: status,
                    firstInstallmentPaymentDate: status === "paid" ? formatLocalYmdToIso(paymentDate) : null,
                })
                if (!installmentRes.success) return error(installmentRes.error || "Erro ao criar parcelamento")
                success("Parcelamento criado com sucesso!")
                onSuccess?.()
                debouncedRefresh()
                onBack()
                return
            }

            const res = await createManualTransactionAction({
                partnerId,
                storeId,
                transactionType: txKind,
                amount,
                description,
                category: selectedCategoryName,
                categoryId: categoryId || null,
                subcategoryId: subcategoryId || null,
                accountId: accountId || null,
                contactId: cp.contactId,
                customerId: cp.customerId,
                contactType: cp.contactTypeResolved,
                paymentType,
                paymentMethodId,
                dueDate,
                paymentDate: status === "paid" ? formatLocalYmdToIso(paymentDate) : null,
                transactionDate: dueDate ? toMiddayIsoFromYmd(dueDate) : null,
                status,
                notes: notes || null,
                origin: "manual",
            })

            if (!res.success) return error(res.error || "Erro ao salvar transação")
            success("Transação criada com sucesso!")
            onSuccess?.()
            debouncedRefresh()
            onBack()
        } finally {
            setIsSaving(false)
        }
    }

    const handleConfirmCancelRecurring = useCallback(() => {
        if (!editRecurringTemplateId) return
        void (async () => {
            setIsSaving(true)
            try {
                const res = await cancelRecurringTransactionAction(editRecurringTemplateId, partnerId)
                if (!res.success) {
                    error(res.error || "Erro ao cancelar")
                    setCancelRecurringOpen(false)
                    return
                }
                success("Recorrência cancelada. O histórico de pagamentos foi preservado.")
                setCancelRecurringOpen(false)
                onSuccess?.()
                debouncedRefresh()
                onBack()
            } finally {
                setIsSaving(false)
            }
        })()
    }, [editRecurringTemplateId, partnerId, error, success, onSuccess, debouncedRefresh, onBack])

    const typeButtons: {
        id: TxKind
        label: string
        sub: string
        activeClass: string
        iconActiveClass: string
        icon: React.ReactNode
    }[] = [
            {
                id: "income",
                label: "Receita",
                sub: "Entrada",
                activeClass: "bg-green-50/50 dark:bg-green-900/10 border-brand-green",
                iconActiveClass:
                    "border-brand-green bg-green-50 dark:bg-green-900/25 text-brand-green ring-1 ring-brand-green/25",
                icon: <ChevronDownIcon size={22} strokeWidth={2.5} />,
            },
            {
                id: "expense",
                label: "Despesa",
                sub: "Saída",
                activeClass: "bg-red-50/50 dark:bg-red-900/10 border-brand-red",
                iconActiveClass: "border-brand-red bg-red-50 dark:bg-red-900/25 text-brand-red ring-1 ring-brand-red/25",
                icon: <ChevronUpIcon size={22} strokeWidth={2.5} />,
            },
            {
                id: "transfer",
                label: "Transferência",
                sub: "Entre contas",
                activeClass: "bg-slate-50/80 dark:bg-slate-900/20 border-brand-dark dark:border-dark-body",
                iconActiveClass:
                    "border-brand-dark dark:border-dark-body bg-slate-100 dark:bg-dark-border/80 text-brand-dark dark:text-dark-heading ring-1 ring-brand-dark/15 dark:ring-dark-body/30",
                icon: <ArrowUpDownIcon size={22} />,
            },
            {
                id: "adjustment",
                label: "Ajuste",
                sub: "Saldo manual",
                activeClass: "bg-amber-50/60 dark:bg-amber-900/15 border-amber-500/50",
                iconActiveClass:
                    "border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/25",
                icon: <AdjustIcon size={22} />,
            },
            {
                id: "refund",
                label: "Reembolso",
                sub: "Estorno",
                activeClass: "bg-violet-50/70 dark:bg-violet-900/15 border-violet-400/60",
                iconActiveClass:
                    "border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/25",
                icon: <ReturnIcon size={22} />,
            },
        ]

    const accountAction = {
        label: "Criar nova conta",
        icon: <PlusIcon className="w-4 h-4" />,
        onClick: openQuickAccount,
    }

    const renderTypeSpecificLeft = () => (
        <>
            {txKind === "transfer" && (
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Transferência</h3>
                    <InfoCard message="Serão criados dois lançamentos vinculados (saída na origem e entrada no destino)." color="gray" />
                    <MoneyInput
                        label="Valor"
                        value={amount}
                        onChange={setAmount}
                        error={fieldErrors.has("amount")}
                        errorMessage={fieldErrors.has("amount") ? "Valor inválido" : undefined}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormCombobox
                            label="Conta de origem"
                            options={accountOptions}
                            value={fromAccountId}
                            onChange={(v) => setFromAccountId(v)}
                            actionItem={accountAction}
                            error={fieldErrors.has("fromAccountId")}
                            errorMessage={fieldErrors.has("fromAccountId") ? "Selecione a conta de origem" : undefined}
                        />
                        <FormCombobox
                            label="Conta de destino"
                            options={accountOptions}
                            value={toAccountId}
                            onChange={(v) => setToAccountId(v)}
                            actionItem={accountAction}
                            error={fieldErrors.has("toAccountId")}
                            errorMessage={
                                fieldErrors.has("toAccountId")
                                    ? fromAccountId === toAccountId
                                        ? "Contas devem ser diferentes"
                                        : "Selecione a conta de destino"
                                    : undefined
                            }
                        />
                    </div>
                    <DatePicker label="Data" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                    <Input
                        label="Descrição (opcional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex: Porte entre caixa e banco"
                    />
                </section>
            )}

            {txKind === "adjustment" && (
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Ajuste de saldo</h3>
                    <InfoCard message="Informe o novo saldo da conta; o sistema calcula a diferença e registra o ajuste." color="gray" />

                    <Input
                        label="Saldo atual"
                        readOnly
                        disabled
                        value={accountId ? formatCurrency(getAccountBalance(accountId)) : "-"}
                    />
                    <MoneyInput
                        label="Novo saldo"
                        value={adjustmentTargetBalance}
                        onChange={setAdjustmentTargetBalance}
                        error={fieldErrors.has("adjustmentTarget")}
                        errorMessage={
                            fieldErrors.has("adjustmentTarget") ? "Defina um saldo diferente do atual" : undefined
                        }
                    />
                    <Input
                        label="Descrição"
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex: Ajuste após conciliação bancária"
                        error={fieldErrors.has("description")}
                        errorMessage={fieldErrors.has("description") ? "Descrição obrigatória" : undefined}
                    />
                    <DatePicker label="Data" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                </section>
            )}

            {txKind === "refund" && (
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Reembolso</h3>
                    <FormDropdown
                        label="Tipo de reembolso"
                        options={[
                            { value: "expense_refund", label: "Reembolso de despesa (dinheiro volta)" },
                            { value: "revenue_refund", label: "Estorno de receita (dinheiro sai)" },
                        ]}
                        value={refundKind}
                        setValue={(v) => setRefundKind(v as "expense_refund" | "revenue_refund")}
                    />
                    <Input
                        label="Descrição"
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detalhe o reembolso"
                        error={fieldErrors.has("description")}
                        errorMessage={fieldErrors.has("description") ? "Descrição obrigatória" : undefined}
                    />
                    <MoneyInput
                        label="Valor"
                        value={amount}
                        onChange={setAmount}
                        error={fieldErrors.has("amount")}
                        errorMessage={fieldErrors.has("amount") ? "Valor inválido" : undefined}
                    />
                    <Input
                        label="Referência (opcional)"
                        value={referenceNote}
                        onChange={(e) => setReferenceNote(e.target.value)}
                        placeholder="Ex: Pedido #1234, NF, despesa anterior…"
                    />
                    <DatePicker label="Data" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                </section>
            )}

            {isIncomeExpense && (
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Detalhes do lançamento</h3>
                    <MoneyInput
                        label="Valor"
                        value={amount}
                        onChange={setAmount}
                        disabled={lockAmountField}
                        error={fieldErrors.has("amount")}
                        errorMessage={fieldErrors.has("amount") ? "Valor obrigatório" : undefined}
                    />
                    <Input
                        label="Descrição"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex: Venda de serviço"
                        required
                        error={fieldErrors.has("description")}
                        errorMessage={fieldErrors.has("description") ? "Descrição obrigatória" : undefined}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormCombobox
                            label="Categoria"
                            options={visibleParentCategories.map((c) => ({ value: c.id, label: c.name }))}
                            value={categoryId}
                            onChange={(v) => {
                                setCategoryId(v)
                                setSubcategoryId(undefined)
                            }}
                            disabled={isPaidTransaction}
                            actionItem={isPaidTransaction ? undefined : {
                                label: "Criar nova categoria",
                                icon: <PlusIcon className="w-4 h-4" />,
                                onClick: openQuickCategory,
                            }}
                        />
                        <FormCombobox
                            label="Subcategoria"
                            options={childCategories.map((c) => ({ value: c.id, label: c.name }))}
                            value={subcategoryId}
                            onChange={(v) => setSubcategoryId(v)}
                            placeholder="Selecione..."
                            disabled={isPaidTransaction}
                            actionItem={isPaidTransaction ? undefined : {
                                label: "Criar nova subcategoria",
                                icon: <PlusIcon className="w-4 h-4" />,
                                onClick: openQuickSubcategory,
                            }}
                        />
                    </div>
                    {!isRecurringTemplateEdit && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!isSalesOrigin ? (
                                <DatePicker label="Data de vencimento" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} disabled={lockFinancialFields} />
                            ) : (
                                <Input label="Data de vencimento" value="Não se aplica para vendas" readOnly disabled />
                            )}
                            <DatePicker
                                label="Data do pagamento"
                                value={paymentDate}
                                onChange={(d) => setPaymentDate(toYmd(d))}
                                disabled={status !== "paid" || lockFinancialFields}
                            />
                        </div>
                    )}

                    {isIncomeExpense && (!isEditMode || isRecurringTemplateEdit) && (
                        <div className="mt-8">
                            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">
                                    {enableRecurrence && "Detalhes da recorrência"}
                                    {installmentModeEnabled && "Detalhes das parcelas"}
                                </h3>
                            </div>
                            {!enableRecurrence && !isRecurringTemplateEdit && recurringModeEnabled && (
                                <Checkbox
                                    name="enable_recurrence"
                                    checked={enableRecurrence}
                                    onChange={setEnableRecurrence}
                                    label={
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                            Criar recorrência
                                        </span>
                                    }
                                />
                            )}
                            {isRecurringTemplateEdit && (
                                <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Regra de recorrência</p>
                            )}
                            {(recurringModeEnabled && (enableRecurrence || isRecurringTemplateEdit)) && (
                                <>
                                    <InfoCard
                                        color="orange"
                                        message={isRecurringTemplateEdit
                                            ? "Alterações passam a valer para ocorrências futuras. Pagamentos já confirmados não são alterados."
                                            : "A data de vencimento acima é a primeira ocorrência. As próximas datas aparecem em A pagar/A receber e seguem a frequência abaixo."}
                                        className="mb-6"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <FormDropdown
                                            label="Frequência"
                                            options={[
                                                { value: "daily", label: "Diário" },
                                                { value: "weekly", label: "Semanal" },
                                                { value: "monthly", label: "Mensal" },
                                                { value: "yearly", label: "Anual" },
                                            ]}
                                            value={recurrenceFrequency}
                                            setValue={(v) => setRecurrenceFrequency(v as RecurringFrequency)}
                                        />
                                        <Input
                                            label="A cada (intervalo)"
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={recurrenceInterval}
                                            onChange={(e) =>
                                                setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                        {isRecurringTemplateEdit && (
                                            <DatePicker
                                                label="Data inicial (1ª ocorrência)"
                                                value={recurrenceNextRunYmd}
                                                onChange={(d) => setRecurrenceNextRunYmd(toYmd(d))}
                                            />
                                        )}
                                        <DatePicker
                                            label="Encerrar em (opcional)"
                                            value={recurrenceEndYmd}
                                            onChange={(d) => setRecurrenceEndYmd(toYmd(d))}
                                            error={fieldErrors.has("recurrenceEndYmd")}
                                            errorMessage={
                                                fieldErrors.has("recurrenceEndYmd")
                                                    ? "Data final deve ser igual ou após a data inicial"
                                                    : undefined
                                            }
                                        />
                                    </div>
                                    {recurrenceFrequency === "monthly" && (
                                        <Checkbox
                                            name="recurrence_month_last"
                                            checked={recurrenceMonthlyLastDay}
                                            onChange={setRecurrenceMonthlyLastDay}
                                            label={
                                                <span className="text-sm text-brand-dark dark:text-dark-heading">
                                                    Sempre no último dia do mês
                                                </span>
                                            }
                                            className="mt-6"
                                        />
                                    )}
                                    {isRecurringTemplateEdit && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full border-brand-red/40 text-brand-red hover:bg-brand-red/5"
                                            onClick={() => setCancelRecurringOpen(true)}
                                            disabled={isSaving}
                                        >
                                            Cancelar recorrência
                                        </Button>
                                    )}
                                </>
                            )}
                            {!isRecurringTemplateEdit && installmentModeEnabled && (
                                <>
                                    <InfoCard
                                        message={`Todas as parcelas serão geradas na hora (Total de ${installmentsCount}x, a cada ${installmentFrequencyLabel(installmentFrequency, installmentInterval)}).`}
                                        color="orange"
                                        className="mb-6"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <Input
                                            label="Número de parcelas"
                                            type="number"
                                            min={1}
                                            max={48}
                                            value={installmentsCount}
                                            onChange={(e) => setInstallmentsCount(Math.max(1, Number(e.target.value) || 1))}
                                            error={fieldErrors.has("installmentsCount")}
                                            errorMessage={fieldErrors.has("installmentsCount") ? "Máximo de 48 parcelas" : undefined}
                                        />
                                        <FormDropdown
                                            label="Frequência"
                                            options={[
                                                { value: "daily", label: "Diário" },
                                                { value: "weekly", label: "Semanal" },
                                                { value: "monthly", label: "Mensal" },
                                                { value: "yearly", label: "Anual" },
                                            ]}
                                            value={installmentFrequency}
                                            setValue={(v) => setInstallmentFrequency(v as RecurringFrequency)}
                                        />
                                        <Input
                                            label="A cada (intervalo)"
                                            type="number"
                                            min={1}
                                            max={24}
                                            value={installmentInterval}
                                            onChange={(e) => setInstallmentInterval(Math.max(1, Number(e.target.value) || 1))}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {isEditMode && isRecurringTransaction && (
                        <div>
                            <InfoCard message="Esta transação faz parte de uma recorrência. Campos financeiros estão bloqueados. Para alterar valores futuros, edite a recorrência diretamente." color="blue" />
                        </div>
                    )}
                </section>
            )}
        </>
    )

    const renderRightColumn = () => (
        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
            <SidebarCard>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">
                    {txKind === "transfer" ? "Status" : txKind === "adjustment" ? "Status e conta" : "Status e conta"}
                </h3>
                <div className="space-y-4">
                    {isIncomeExpense && !isRecurringTemplateEdit && !isEditMode && (
                        <FormDropdown
                            label="Modo"
                            options={[
                                { value: "single", label: "Única" },
                                { value: "installment", label: "Parcelada" },
                                { value: "recurring", label: isFreePlan ? "Recorrente ⭐" : "Recorrente" },
                            ]}
                            value={transactionMode}
                            setValue={(v) => {
                                if (v === "recurring" && isFreePlan) {
                                    openPlanUpgrade("crescer")
                                    return
                                }
                                setTransactionMode(v as TransactionMode)
                            }}
                        />
                    )}
                    {txKind === "adjustment" || txKind === "transfer" ? (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            O {txKind === "transfer" ? "lançamento" : "ajuste"} é efetivado ao salvar e atualiza o saldo da conta.
                        </p>
                    ) : isRecurringTemplateEdit ? (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                            O pagamento de cada data é feito em A pagar/A receber («Marcar como pago»). Este formulário atualiza apenas o modelo da recorrência.
                        </p>
                    ) : (
                        <div>
                            <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                Situação
                            </label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")} disabled={lockFinancialFields || isPaidTransaction}>
                                    {paidLabel}
                                </Button>
                                <Button
                                    variant={status === "pending" ? "default" : "outline"}
                                    onClick={() => setStatus("pending")}
                                    disabled={lockFinancialFields || isPaidTransaction}
                                >
                                    Pendente
                                </Button>
                            </div>
                        </div>
                    )}

                    {(isIncomeExpense || txKind === "refund" || txKind === "adjustment") && (
                        <FormCombobox
                            label="Conta bancária / caixa"
                            options={accountOptions}
                            value={accountId}
                            onChange={(v) => setAccountId(v)}
                            disabled={lockFinancialFields}
                            actionItem={lockFinancialFields ? undefined : accountAction}
                            error={fieldErrors.has("accountId")}
                            errorMessage={fieldErrors.has("accountId") ? "Selecione a conta" : undefined}
                        />
                    )}

                    {isIncomeExpense && (
                        <>
                            <FormCombobox
                                label="Forma de pagamento"
                                options={paymentMethods!.map(pm => ({ value: pm.id, label: pm.name }))}
                                value={paymentMethodId || ""}
                                onChange={(v) => {
                                    setPaymentMethodId(v)
                                    const pm = paymentMethods!.find(p => p.id === v)
                                    if (pm) setPaymentType(pm.payment_type || "Pix")
                                }}
                                disabled={isSalesOrigin && isEditMode}
                            />
                            {isSalesOrigin && isEditMode && (
                                <InfoCard
                                    message="Transações de venda não permitem edição do meio de pagamento."
                                    color="orange"
                                    className="mt-2"
                                />
                            )}
                        </>
                    )}

                    {txKind === "refund" && (
                        <DatePicker
                            label="Data do pagamento"
                            value={paymentDate}
                            onChange={(d) => setPaymentDate(toYmd(d))}
                            disabled={status !== "paid"}
                        />
                    )}
                </div>
            </SidebarCard>

            {needsContactPanel && (
                <SidebarCard>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Contato</h3>
                    <FormDropdown
                        label="Tipo de contato"
                        options={[
                            { value: "customer", label: "Cliente" },
                            { value: "supplier", label: "Fornecedor" },
                            { value: "service", label: "Serviço" },
                            { value: "employee", label: "Funcionário" },
                            { value: "partner", label: "Parceiro" },
                            { value: "other", label: "Outro" },
                        ]}
                        value={contactType}
                        setValue={(v) => setContactType(v as ContactType)}
                        disabled={isSalesOrigin}
                    />
                    <div className="mt-4">
                        {contactType === "customer" ? (
                            selectedCustomer ? (
                                <div className="rounded-xl border border-brand-border dark:border-dark-border p-3 flex items-center gap-3">
                                    <UserProfileImage
                                        fullName={selectedCustomer.name || "Cliente"}
                                        imageUrl={selectedCustomer.avatar_url}
                                        className="w-10 h-10 shrink-0 text-base"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Cliente</p>
                                        <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                            {selectedCustomer.name}
                                        </p>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => setCustomerSheetOpen(true)}>
                                        Alterar
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setCustomerSheetOpen(true)}
                                    disabled={isSalesOrigin}
                                >
                                    Selecionar cliente
                                </Button>
                            )
                        ) : contactsLoading ? (
                            <p className="text-sm text-brand-inactive-text">Carregando contatos…</p>
                        ) : contactComboboxOptions.length === 0 ? (
                            <IconPlaceholder
                                icon={UserIcon}
                                title="Nenhum contato deste tipo"
                                subtitle="Crie um contato para vincular ao lançamento."
                                itemButton={{
                                    text: "Criar contato",
                                    action: openQuickContact,
                                    variant: "outline",
                                }}
                            />
                        ) : (
                            <FormCombobox
                                label="Contato"
                                options={contactComboboxOptions}
                                value={selectedContactId}
                                onChange={(v) => setSelectedContactId(v)}
                                disabled={isSalesOrigin}
                                actionItem={{
                                    label: "Criar novo contato",
                                    icon: <PlusIcon className="w-4 h-4" />,
                                    onClick: openQuickContact,
                                }}
                            />
                        )}
                        {isSalesOrigin && (
                            <InfoCard
                                message="O contato não pode ser alterado em transações geradas por venda."
                                color="gray"
                                className="mt-2"
                            />
                        )}
                    </div>
                </SidebarCard>
            )}
        </div>
    )

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-300">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar"
                    >
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                                <div
                                    className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}
                                >
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1
                                            className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                                        >
                                            {isRecurringTemplateEdit ? "Editar recorrência" : isEditMode ? "Editar transação" : "Nova transação"}
                                        </h1>
                                        <div
                                            className={`text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                                        >
                                            {isEditMode
                                                ? lockFinancialFields
                                                    ? "Campos financeiros bloqueados. Apenas descrição e observações podem ser editadas."
                                                    : "Edite os campos desejados e salve."
                                                : "Registre e organize os lançamentos do seu financeiro."}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            <SaveIcon className="w-4.5 h-4.5 mr-2" />
                                            {isSaving ? "Salvando..." : isEditMode ? "Salvar alterações" : "Salvar lançamento"}
                                        </Button>
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger
                                            value="general"
                                            badge={
                                                fieldErrors.size > 0 ? (
                                                    <span
                                                        className="inline-block w-2 h-2 rounded-full bg-brand-red shrink-0"
                                                        aria-hidden
                                                    />
                                                ) : undefined
                                            }
                                        >
                                            Dados gerais
                                        </TabsTrigger>
                                        <TabsTrigger value="attachments">Anexos</TabsTrigger>
                                        <TabsTrigger value="notes">Observações</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <TabsContent value="general" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                        <motion.div
                                            key={txKind}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="space-y-10"
                                        >
                                            {(!forcedTab || forcedTab === "Transações") && (
                                                <>
                                                    <section>
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Tipo de lançamento
                                                        </h3>
                                                        <div className="lg:hidden -mx-4 px-4">
                                                            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 pt-0.5 no-scrollbar scroll-pl-4 pl-4 pr-2">
                                                                {typeButtons.map((b) => (
                                                                    <button
                                                                        key={b.id}
                                                                        type="button"
                                                                        disabled={isEditMode}
                                                                        onClick={() => !isEditMode && setTxKind(b.id)}
                                                                        className={`snap-start shrink-0 flex-[0_0_calc(85%-0.5rem)] max-w-[320px] sm:flex-[0_0_280px] flex items-center justify-between p-4 rounded-2xl transition-all border text-left ${isEditMode ? "opacity-60 cursor-not-allowed" : ""} ${txKind === b.id
                                                                            ? b.activeClass
                                                                            : "bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border"
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <div
                                                                                className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-200 ${txKind === b.id
                                                                                    ? b.iconActiveClass
                                                                                    : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text"
                                                                                    }`}
                                                                            >
                                                                                {b.icon}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                                    {b.label}
                                                                                </div>
                                                                                <div className="text-xs text-brand-inactive-text truncate">{b.sub}</div>
                                                                            </div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="hidden lg:grid lg:grid-cols-3 gap-3">
                                                            {typeButtons.map((b) => (
                                                                <button
                                                                    key={b.id}
                                                                    type="button"
                                                                    disabled={isEditMode}
                                                                    onClick={() => !isEditMode && setTxKind(b.id)}
                                                                    className={`flex items-center justify-between p-4 rounded-2xl transition-all border text-left ${isEditMode ? "opacity-60 cursor-not-allowed" : ""} ${txKind === b.id
                                                                        ? b.activeClass
                                                                        : "bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border"
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                        <div
                                                                            className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-200 ${txKind === b.id
                                                                                ? b.iconActiveClass
                                                                                : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text"
                                                                                }`}
                                                                        >
                                                                            {b.icon}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                                {b.label}
                                                                            </div>
                                                                            <div className="text-xs text-brand-inactive-text truncate">{b.sub}</div>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </section>

                                                    <div className="h-px bg-brand-border dark:bg-dark-border w-full" />
                                                </>
                                            )}

                                            {renderTypeSpecificLeft()}
                                        </motion.div>
                                    </div>

                                    {renderRightColumn()}
                                </div>
                            </TabsContent>

                            <TabsContent value="notes" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Observações</h3>
                                        <FormTextarea
                                            name="transaction_notes"
                                            label="Observações internas"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={8}
                                            maxLength={500}
                                            showCharacterCount
                                        />
                                    </div>
                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border min-h-[120px]" />
                                </div>
                            </TabsContent>

                            <TabsContent value="attachments" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                        <IconPlaceholder
                                            icon={UserIcon}
                                            title="Anexos em breve"
                                            subtitle="Você poderá anexar comprovantes nesta aba."
                                        />
                                    </div>
                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border min-h-[120px]" />
                                </div>
                            </TabsContent>
                        </div>
                    </div>

                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={handleBack} disabled={isSaving} className="flex-1 h-12">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} className="flex-1 h-12" leftIcon={<SaveIcon size={18} />}>
                            {isSaving ? "Salvando..." : isEditMode ? "Salvar alterações" : "Salvar lançamento"}
                        </Button>
                    </div>
                </Tabs>

                <DefaultModal
                    isOpen={quickModal === "category"}
                    onClose={() => {
                        if (isQuickModalCloseLocked) return
                        setQuickModal(null)
                    }}
                    title="Nova categoria"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)} disabled={isQuickModalCloseLocked}>
                                Cancelar
                            </Button>
                            <Button onClick={handleQuickSave} isLoading={quickSaving}>
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <Input label="Nome" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Ex: Marketing" />
                </DefaultModal>

                <DefaultModal
                    isOpen={quickModal === "subcategory"}
                    onClose={() => {
                        if (isQuickModalCloseLocked) return
                        setQuickModal(null)
                    }}
                    title="Nova subcategoria"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)} disabled={isQuickModalCloseLocked}>
                                Cancelar
                            </Button>
                            <Button onClick={handleQuickSave} isLoading={quickSaving}>
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <p className="text-sm text-brand-inactive-text mb-3">
                        Será criada dentro de: <strong>{selectedCategoryName}</strong>
                    </p>
                    <Input label="Nome" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Ex: Energia" />
                </DefaultModal>

                <DefaultModal
                    isOpen={quickModal === "account"}
                    onClose={() => {
                        if (isQuickModalCloseLocked) return
                        setQuickModal(null)
                    }}
                    title="Nova conta"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)} disabled={isQuickModalCloseLocked}>
                                Cancelar
                            </Button>
                            <Button onClick={handleQuickSave} isLoading={quickSaving}>
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <Input label="Nome" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Ex: Nubank" />
                        <FormDropdown
                            label="Tipo"
                            options={[
                                { value: "cash", label: "Caixa" },
                                { value: "bank", label: "Banco" },
                                { value: "wallet", label: "Carteira digital" },
                            ]}
                            value={newAccountType}
                            setValue={(v) => setNewAccountType(v as FinanceAccountType)}
                        />
                        <MoneyInput label="Saldo inicial" value={newAccountInitial} onChange={setNewAccountInitial} />
                    </div>
                </DefaultModal>

                <DefaultModal
                    isOpen={quickModal === "contact"}
                    onClose={() => {
                        if (isQuickModalCloseLocked) return
                        setQuickModal(null)
                    }}
                    title="Novo contato financeiro"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)} disabled={isQuickModalCloseLocked}>
                                Cancelar
                            </Button>
                            <Button onClick={handleQuickSave} isLoading={quickSaving}>
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <FormDropdown
                            label="Tipo do contato"
                            options={[
                                { value: "supplier", label: "Fornecedor" },
                                { value: "service", label: "Serviço" },
                                { value: "employee", label: "Funcionário" },
                                { value: "partner", label: "Parceiro" },
                                { value: "other", label: "Outro" },
                            ]}
                            value={newContactModalType === "customer" ? "supplier" : newContactModalType}
                            setValue={(v) => setNewContactModalType(v as ContactType)}
                        />
                        <Input label="Nome" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Nome exibido nas transações" />
                        <Input
                            label="Descrição (opcional)"
                            value={newContactDesc}
                            onChange={(e) => setNewContactDesc(e.target.value)}
                            placeholder="Notas internas"
                        />
                    </div>
                </DefaultModal>

                <DefaultModal
                    isOpen={transferInsufficientOpen}
                    onClose={() => setTransferInsufficientOpen(false)}
                    title="Saldo insuficiente"
                    maxWidth="md"
                    footer={
                        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end w-full">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setTransferInsufficientOpen(false)
                                    setAdjustFromTransferNewBalance(transferInsufficientMeta.fromBal)
                                    setAdjustFromTransferOpen(true)
                                }}
                            >
                                Ajustar saldo
                            </Button>
                            <Button
                                onClick={() => {
                                    skipTransferBalanceCheckRef.current = true
                                    setTransferInsufficientOpen(false)
                                    void handleSave()
                                }}
                            >
                                Continuar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 text-sm text-brand-inactive-text dark:text-dark-body">
                        <p>A conta de origem selecionada não possui saldo suficiente para essa transferência.</p>

                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-3 space-y-2 text-brand-dark dark:text-dark-heading font-medium">
                            <p>Saldo atual: {formatCurrency(transferInsufficientMeta.fromBal)}</p>
                            <p>Valor da transferência: {formatCurrency(transferInsufficientMeta.amount)}</p>
                        </div>

                        <InfoCard color="red" title="Atenção!" message="Se continuar, o saldo ficará negativo." />
                    </div>
                </DefaultModal>

                <DefaultModal
                    isOpen={adjustFromTransferOpen}
                    onClose={() => {
                        if (isAdjustModalCloseLocked) return
                        setAdjustFromTransferOpen(false)
                    }}
                    title="Ajustar saldo da conta"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setAdjustFromTransferOpen(false)} disabled={isAdjustModalCloseLocked}>
                                Cancelar
                            </Button>
                            <Button
                                isLoading={adjustFromTransferSaving}
                                onClick={async () => {
                                    if (!fromAccountId) return
                                    setAdjustFromTransferSaving(true)
                                    try {
                                        const res = await adjustAccountBalanceViaTransactionAction({
                                            partnerId,
                                            accountId: fromAccountId,
                                            newBalance: adjustFromTransferNewBalance,
                                            description: `Ajuste de saldo - ${transferFromAccountName}`,
                                            transactionDateYmd: dueDate,
                                        })
                                        if (!res.success) return error(res.error || "Erro ao ajustar saldo")
                                        success("Saldo atualizado. Você pode concluir a transferência.")
                                        setAdjustFromTransferOpen(false)
                                        debouncedRefresh()
                                    } finally {
                                        setAdjustFromTransferSaving(false)
                                    }
                                }}
                            >
                                Salvar ajuste
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                            {transferFromAccountName}
                        </p>
                        <Input
                            label="Saldo atual"
                            readOnly
                            disabled
                            value={formatCurrency(getAccountBalance(fromAccountId))}
                        />
                        <MoneyInput
                            label="Novo saldo"
                            value={adjustFromTransferNewBalance}
                            onChange={setAdjustFromTransferNewBalance}
                        />
                    </div>
                </DefaultModal>

                <SelectCustomerSheet
                    isOpen={customerSheetOpen}
                    onClose={() => setCustomerSheetOpen(false)}
                    onSelect={(c: any) =>
                        setSelectedCustomer({ id: c.id, name: c.name || "Cliente", email: c.email || null, phone: c.phone || null, avatar_url: c.avatar_url || null })
                    }
                    partnerId={partnerId}
                />

                <SavingStatusModal isOpen={isSaving} text="Salvando transação..." />

                {unsavedChangesDialogOpen && (
                    <AlertModal
                        isOpen={unsavedChangesDialogOpen}
                        onClose={handleUnsavedChangesDialogClose}
                        onConfirm={handleUnsavedChangesConfirm}
                        title="Sair sem salvar?"
                        description="Você tem alterações na transação que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}

                <AlertModal
                    isOpen={showDiscardModal}
                    onClose={() => setShowDiscardModal(false)}
                    onConfirm={confirmDiscard}
                    title="Sair sem salvar?"
                    description="Você tem alterações na transação que ainda não foram salvas."
                    confirmText="Sair sem salvar"
                    cancelText="Continuar editando"
                    variant="warning"
                />

                <AlertModal
                    isOpen={cancelRecurringOpen}
                    onClose={() => setCancelRecurringOpen(false)}
                    onConfirm={handleConfirmCancelRecurring}
                    title="Cancelar recorrência?"
                    description="Nenhum pagamento já registrado será apagado. Novas ocorrências deixarão de ser geradas."
                    confirmText="Cancelar recorrência"
                    variant="warning"
                />
            </div>
        </FadeIn>
    )
}
