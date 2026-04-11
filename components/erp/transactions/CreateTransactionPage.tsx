"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
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
} from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
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
import { createManualTransactionAction, createTransferPairAction } from "@/app/actions/erp/transactions"
import { createFinancialCategoryAction } from "@/app/actions/erp/financial-category-metadata"
import { createFinanceAccountAction, type FinanceAccountType } from "@/app/actions/erp/finance-accounts"
import {
    listTransactionContactsByTypeAction,
    createTransactionContactAction,
    type TransactionContactRow,
} from "@/app/actions/erp/transaction-contacts"
import {
    createRecurringTransactionAction,
    type RecurringFrequency,
} from "@/app/actions/erp/recurring-transactions"

export type CategoryItem = { id: string; name: string; parent_id: string | null }
export type AccountItem = { id: string; name: string; type: string; is_active: boolean }

export type TxKind = "income" | "expense" | "transfer" | "adjustment" | "refund"

interface CreateTransactionPageProps {
    partnerId: string
    categories: CategoryItem[]
    accounts: AccountItem[]
    onClose: () => void
    onSuccess?: () => void
}

type ContactType = "customer" | "supplier" | "service" | "employee" | "partner" | "other"

type QuickModal = null | "category" | "subcategory" | "account" | "contact"

function toYmd(d: Date | string | undefined): string {
    if (!d) return ""
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ""
    return format(date, "yyyy-MM-dd")
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
    categories,
    accounts,
    onClose,
    onSuccess,
}: CreateTransactionPageProps) {
    const router = useRouter()
    const { success, error } = useNotification()
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [isScrolled, setIsScrolled] = useState(false)
    const [activeTab, setActiveTab] = useState("general")
    const [isSaving, setIsSaving] = useState(false)

    const [txKind, setTxKind] = useState<TxKind>("income")
    const [amount, setAmount] = useState(0)
    const [description, setDescription] = useState("")
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined)
    const [dueDate, setDueDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
    const [paymentDate, setPaymentDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
    const [status, setStatus] = useState<"pending" | "paid">("pending")
    const [accountId, setAccountId] = useState<string | undefined>(undefined)
    const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined)
    const [toAccountId, setToAccountId] = useState<string | undefined>(undefined)
    const [paymentType, setPaymentType] = useState<string>("Pix")
    const [contactType, setContactType] = useState<ContactType>("customer")
    const [notes, setNotes] = useState("")

    const [contactRows, setContactRows] = useState<TransactionContactRow[]>([])
    const [contactsLoading, setContactsLoading] = useState(false)
    const [selectedContactId, setSelectedContactId] = useState<string | undefined>(undefined)
    const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null)
    const [customerSheetOpen, setCustomerSheetOpen] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(() => new Set())
    const [showDiscardModal, setShowDiscardModal] = useState(false)

    const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">("increase")
    const [refundKind, setRefundKind] = useState<"expense_refund" | "revenue_refund">("expense_refund")
    const [referenceNote, setReferenceNote] = useState("")

    const [enableRecurrence, setEnableRecurrence] = useState(false)
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurringFrequency>("monthly")
    const [recurrenceInterval, setRecurrenceInterval] = useState(1)
    const [recurrenceNextRunYmd, setRecurrenceNextRunYmd] = useState(() =>
        ymdAfterAddingPeriod(format(new Date(), "yyyy-MM-dd"), "monthly", 1),
    )
    const [recurrenceEndYmd, setRecurrenceEndYmd] = useState("")
    const [recurrenceMonthlyLastDay, setRecurrenceMonthlyLastDay] = useState(false)

    const [quickModal, setQuickModal] = useState<QuickModal>(null)
    const [quickSaving, setQuickSaving] = useState(false)
    const [quickName, setQuickName] = useState("")
    const [newAccountType, setNewAccountType] = useState<FinanceAccountType>("cash")
    const [newAccountInitial, setNewAccountInitial] = useState(0)
    const [newContactModalType, setNewContactModalType] = useState<ContactType>("supplier")
    const [newContactDesc, setNewContactDesc] = useState("")
    const pendingSelectContactIdRef = useRef<string | null>(null)
    const pendingCloseRef = useRef<(() => void) | null>(null)

    const defaultDayYmd = useMemo(() => format(new Date(), "yyyy-MM-dd"), [])
    const defaultRecurrenceNext = useMemo(
        () => ymdAfterAddingPeriod(format(new Date(), "yyyy-MM-dd"), "monthly", 1),
        [],
    )

    const isDirty = useMemo(() => {
        if (description.trim()) return true
        if (amount > 0) return true
        if (notes.trim()) return true
        if (categoryId) return true
        if (subcategoryId) return true
        if (accountId) return true
        if (fromAccountId || toAccountId) return true
        if (selectedContactId) return true
        if (selectedCustomer) return true
        if (enableRecurrence) return true
        if (status !== "pending") return true
        if (paymentType !== "Pix") return true
        if (contactType !== "customer") return true
        if (referenceNote.trim()) return true
        if (refundKind !== "expense_refund") return true
        if (adjustDirection !== "increase") return true
        if (txKind !== "income") return true
        if (dueDate !== defaultDayYmd || paymentDate !== defaultDayYmd) return true
        if (recurrenceEndYmd.trim()) return true
        if (recurrenceMonthlyLastDay) return true
        if (recurrenceInterval !== 1 || recurrenceFrequency !== "monthly") return true
        if (recurrenceNextRunYmd !== defaultRecurrenceNext) return true
        return false
    }, [
        description,
        amount,
        notes,
        categoryId,
        subcategoryId,
        accountId,
        fromAccountId,
        toAccountId,
        selectedContactId,
        selectedCustomer,
        enableRecurrence,
        status,
        paymentType,
        contactType,
        referenceNote,
        refundKind,
        adjustDirection,
        txKind,
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

    const requestClose = useCallback(() => {
        if (isDirty) {
            pendingCloseRef.current = () => {
                setShowDiscardModal(false)
                onClose()
            }
            setShowDiscardModal(true)
        } else {
            onClose()
        }
    }, [isDirty, onClose])

    const confirmDiscard = useCallback(() => {
        pendingCloseRef.current?.()
        pendingCloseRef.current = null
    }, [])

    const isIncomeExpense = txKind === "income" || txKind === "expense"
    const needsContactPanel = isIncomeExpense || txKind === "refund"

    useEffect(() => {
        if (contactType !== "customer") setSelectedCustomer(null)
    }, [contactType])

    const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts])
    const accountOptions = useMemo(
        () => activeAccounts.map((a) => ({ value: a.id, label: a.name })),
        [activeAccounts],
    )

    const parentCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories])
    const childCategories = useMemo(() => {
        if (!categoryId) return []
        return categories.filter((c) => c.parent_id === categoryId)
    }, [categories, categoryId])
    const selectedCategoryName = useMemo(
        () => parentCategories.find((c) => c.id === categoryId)?.name || "Outros",
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
        if (!enableRecurrence || !isIncomeExpense) return
        setRecurrenceNextRunYmd(ymdAfterAddingPeriod(dueDate, recurrenceFrequency, recurrenceInterval))
    }, [enableRecurrence, dueDate, recurrenceFrequency, recurrenceInterval, isIncomeExpense])

    const dueDateYmdParts = useMemo(() => {
        const [y, m, d] = dueDate.split("-").map(Number)
        return { month: m || 1, day: d || 1 }
    }, [dueDate])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const paidLabel =
        txKind === "expense" || (txKind === "refund" && refundKind === "revenue_refund") ? "Pago" : "Recebido"

    const refreshLists = () => router.refresh()

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
            setQuickSaving(true)
            try {
                const res = await createFinancialCategoryAction({
                    partnerId,
                    name: quickName.trim(),
                    parentId: null,
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
            if (!(Math.abs(amount) > 0)) e.add("amount")
            if (!accountId) e.add("accountId")
        } else if (txKind === "refund") {
            if (!description.trim()) e.add("description")
            if (!(amount > 0)) e.add("amount")
            if (!accountId) e.add("accountId")
        } else if (isIncomeExpense) {
            if (!description.trim()) e.add("description")
            if (!(amount > 0)) e.add("amount")
            if (!accountId) e.add("accountId")
            if (enableRecurrence) {
                if (!recurrenceNextRunYmd) e.add("recurrenceNextRunYmd")
                if (recurrenceEndYmd.trim()) {
                    const nextIso = toMiddayIsoFromYmd(recurrenceNextRunYmd)
                    const endIso = toMiddayIsoFromYmd(recurrenceEndYmd.trim())
                    if (new Date(endIso) < new Date(nextIso)) e.add("recurrenceEndYmd")
                }
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
        enableRecurrence,
        recurrenceNextRunYmd,
        recurrenceEndYmd,
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

        if (txKind === "transfer") {
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
                })
                if (!res.success) return error(res.error || "Erro ao transferir")
                success("Transferência registrada!")
                onSuccess?.()
                router.refresh()
                onClose()
            } finally {
                setIsSaving(false)
            }
            return
        }

        if (txKind === "adjustment") {
            const abs = Math.abs(amount)
            const signed = adjustDirection === "increase" ? abs : -abs
            setIsSaving(true)
            try {
                const res = await createManualTransactionAction({
                    partnerId,
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
                    paymentDate: status === "paid" ? paymentDate : null,
                    transactionDate: dueDate,
                    status,
                    notes: notes || null,
                    origin: "manual",
                })
                if (!res.success) return error(res.error || "Erro ao salvar")
                success("Ajuste registrado!")
                onSuccess?.()
                router.refresh()
                onClose()
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
                    paymentDate: status === "paid" ? paymentDate : null,
                    transactionDate: dueDate,
                    status,
                    notes: notes || null,
                    origin: "manual",
                    refundKind,
                    referenceNote: referenceNote.trim() || null,
                })
                if (!res.success) return error(res.error || "Erro ao salvar reembolso")
                success("Reembolso registrado!")
                onSuccess?.()
                router.refresh()
                onClose()
            } finally {
                setIsSaving(false)
            }
            return
        }

        const cp = contactPayload()
        setIsSaving(true)
        try {
            if (enableRecurrence) {
                const iv = Math.max(Math.floor(Number(recurrenceInterval) || 1), 1)
                const startIso = toMiddayIsoFromYmd(dueDate)
                const nextIso = toMiddayIsoFromYmd(recurrenceNextRunYmd)
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
                    nextRunDate: nextIso,
                    accountId: accountId || null,
                    categoryId: categoryId || null,
                    subcategoryId: subcategoryId || null,
                    contactId: cp.contactId,
                    customerId: cp.customerId,
                    contactType: cp.contactTypeResolved,
                })
                if (!recRes.success) return error(recRes.error || "Erro ao criar recorrência")
            }

            const res = await createManualTransactionAction({
                partnerId,
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
                dueDate,
                paymentDate: status === "paid" ? paymentDate : null,
                transactionDate: dueDate,
                status,
                notes: notes || null,
                origin: "manual",
            })

            if (!res.success) return error(res.error || "Erro ao salvar transação")
            success(enableRecurrence ? "Transação criada e recorrência ativa!" : "Transação criada com sucesso!")
            onSuccess?.()
            router.refresh()
            onClose()
        } finally {
            setIsSaving(false)
        }
    }

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
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Serão criados dois lançamentos vinculados (saída na origem e entrada no destino).
                    </p>
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
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body rounded-xl border border-brand-border dark:border-dark-border p-3 bg-brand-gray/40 dark:bg-dark-border/20">
                        Esse lançamento ajusta o saldo da conta manualmente (ex.: conciliação ou correção).
                    </p>
                    <MoneyInput
                        label="Valor"
                        value={Math.abs(amount)}
                        onChange={(n) => setAmount(Math.abs(n))}
                        error={fieldErrors.has("amount")}
                        errorMessage={fieldErrors.has("amount") ? "Informe um valor" : undefined}
                    />
                    <FormDropdown
                        label="Direção do ajuste"
                        options={[
                            { value: "increase", label: "Aumentar saldo (crédito)" },
                            { value: "decrease", label: "Reduzir saldo (débito)" },
                        ]}
                        value={adjustDirection}
                        setValue={(v) => setAdjustDirection(v as "increase" | "decrease")}
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DatePicker label="Data" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                        <DatePicker
                            label="Data do pagamento"
                            value={paymentDate}
                            onChange={(d) => setPaymentDate(toYmd(d))}
                            disabled={status !== "paid"}
                        />
                    </div>
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
                    <Input
                        label="Descrição"
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Detalhe o reembolso"
                        error={fieldErrors.has("description")}
                        errorMessage={fieldErrors.has("description") ? "Descrição obrigatória" : undefined}
                    />
                    <DatePicker label="Data de vencimento" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                </section>
            )}

            {isIncomeExpense && (
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Detalhes do lançamento</h3>
                    <MoneyInput
                        label="Valor"
                        value={amount}
                        onChange={setAmount}
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
                            options={parentCategories.map((c) => ({ value: c.id, label: c.name }))}
                            value={categoryId}
                            onChange={(v) => {
                                setCategoryId(v)
                                setSubcategoryId(undefined)
                            }}
                            actionItem={{
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
                            placeholder="Selecione"
                            actionItem={{
                                label: "Criar nova subcategoria",
                                icon: <PlusIcon className="w-4 h-4" />,
                                onClick: openQuickSubcategory,
                            }}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DatePicker label="Data de vencimento" value={dueDate} onChange={(d) => setDueDate(toYmd(d))} />
                        <DatePicker
                            label="Data do pagamento"
                            value={paymentDate}
                            onChange={(d) => setPaymentDate(toYmd(d))}
                            disabled={status !== "paid"}
                        />
                    </div>

                    <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4 space-y-4 bg-brand-gray/25 dark:bg-dark-border/15">
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
                        {enableRecurrence && (
                            <>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                    Só para receita e despesa. Este lançamento é salvo agora; as próximas ocorrências são
                                    geradas automaticamente (cron) na data de &quot;próxima execução&quot;. Transferência,
                                    ajuste e reembolso não têm recorrência.
                                </p>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <DatePicker
                                        label="Próxima execução automática"
                                        value={recurrenceNextRunYmd}
                                        onChange={(d) => setRecurrenceNextRunYmd(toYmd(d))}
                                        error={fieldErrors.has("recurrenceNextRunYmd")}
                                        errorMessage={
                                            fieldErrors.has("recurrenceNextRunYmd")
                                                ? "Defina a próxima execução"
                                                : undefined
                                        }
                                    />
                                    <DatePicker
                                        label="Encerrar em (opcional)"
                                        value={recurrenceEndYmd}
                                        onChange={(d) => setRecurrenceEndYmd(toYmd(d))}
                                        error={fieldErrors.has("recurrenceEndYmd")}
                                        errorMessage={
                                            fieldErrors.has("recurrenceEndYmd")
                                                ? "Data final deve ser após a próxima execução"
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
                                    />
                                )}
                            </>
                        )}
                    </div>
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
                    <div>
                        <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Situação</label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")}>
                                {txKind === "transfer" ? "Efetivado" : txKind === "adjustment" ? "Confirmado" : paidLabel}
                            </Button>
                            <Button
                                variant={status === "pending" ? "default" : "outline"}
                                onClick={() => setStatus("pending")}
                            >
                                Pendente
                            </Button>
                        </div>
                    </div>

                    {(isIncomeExpense || txKind === "refund" || txKind === "adjustment") && (
                        <FormCombobox
                            label="Conta bancária / caixa"
                            options={accountOptions}
                            value={accountId}
                            onChange={(v) => setAccountId(v)}
                            actionItem={accountAction}
                            error={fieldErrors.has("accountId")}
                            errorMessage={fieldErrors.has("accountId") ? "Selecione a conta" : undefined}
                        />
                    )}

                    {isIncomeExpense && (
                        <FormCombobox
                            label="Forma de pagamento"
                            options={[
                                { value: "Pix", label: "Pix" },
                                { value: "Boleto", label: "Boleto" },
                                { value: "Cartão", label: "Cartão" },
                                { value: "Dinheiro", label: "Dinheiro" },
                            ]}
                            value={paymentType}
                            onChange={(v) => setPaymentType(v)}
                        />
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
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-3">
                        Opcional — salve sem vincular contato se preferir.
                    </p>
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
                    />
                    <div className="mt-4">
                        {contactType === "customer" ? (
                            selectedCustomer ? (
                                <div className="rounded-xl border border-brand-border dark:border-dark-border p-3 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
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
                                actionItem={{
                                    label: "Criar novo contato",
                                    icon: <PlusIcon className="w-4 h-4" />,
                                    onClick: openQuickContact,
                                }}
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
                                    <Button variant="filled" onClick={requestClose} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1
                                            className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                                        >
                                            Nova Transação
                                        </h1>
                                        <div
                                            className={`text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                                        >
                                            Registre e organize os lançamentos do seu financeiro.
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3 mb-4">
                                        <Button variant="outline" onClick={requestClose} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            <SaveIcon className="w-4.5 h-4.5 mr-2" />
                                            {isSaving ? "Salvando..." : "Salvar Lançamento"}
                                        </Button>
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger
                                            value="general"
                                            className="px-0 pb-3"
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
                                        <TabsTrigger value="attachments" className="px-0 pb-3">
                                            Anexos
                                        </TabsTrigger>
                                        <TabsTrigger value="notes" className="px-0 pb-3">
                                            Observações
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <TabsContent value="general" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                        <motion.div
                                            key={txKind}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="space-y-10"
                                        >
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
                                                                onClick={() => setTxKind(b.id)}
                                                                className={`snap-start shrink-0 flex-[0_0_calc(85%-0.5rem)] max-w-[320px] sm:flex-[0_0_280px] flex items-center justify-between p-4 rounded-2xl transition-all border text-left ${txKind === b.id
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
                                                            onClick={() => setTxKind(b.id)}
                                                            className={`flex items-center justify-between p-4 rounded-2xl transition-all border text-left ${txKind === b.id
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

                                            {renderTypeSpecificLeft()}
                                        </motion.div>
                                    </div>

                                    {renderRightColumn()}
                                </div>
                            </TabsContent>

                            <TabsContent value="notes" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Observações</h3>
                                        <FormTextarea
                                            name="transaction_notes"
                                            label="Observações internas"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={8}
                                        />
                                    </div>
                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border min-h-[120px]" />
                                </div>
                            </TabsContent>

                            <TabsContent value="attachments" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">
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

                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={requestClose} disabled={isSaving} className="flex-1 h-[48px]">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} className="flex-1 h-[48px]">
                            <SaveIcon className="w-4 h-4 mr-2" />
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                <DefaultModal
                    isOpen={quickModal === "category"}
                    onClose={() => setQuickModal(null)}
                    title="Nova categoria"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)}>
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
                    onClose={() => setQuickModal(null)}
                    title="Nova subcategoria"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)}>
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
                    onClose={() => setQuickModal(null)}
                    title="Nova conta"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)}>
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
                    onClose={() => setQuickModal(null)}
                    title="Novo contato financeiro"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setQuickModal(null)}>
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

                <SelectCustomerSheet
                    isOpen={customerSheetOpen}
                    onClose={() => setCustomerSheetOpen(false)}
                    onSelect={(c: { id: string; name: string }) =>
                        setSelectedCustomer({ id: c.id, name: c.name || "Cliente" })
                    }
                    partnerId={partnerId}
                />

                <AlertModal
                    isOpen={showDiscardModal}
                    onClose={() => {
                        setShowDiscardModal(false)
                        pendingCloseRef.current = null
                    }}
                    onConfirm={confirmDiscard}
                    title="Descartar alterações?"
                    description="Você tem dados não salvos. Se sair agora, eles serão perdidos."
                    confirmText="Sair sem salvar"
                    variant="warning"
                />
            </div>
        </FadeIn>
    )
}
