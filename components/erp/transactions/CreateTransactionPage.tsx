"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
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
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    SaveIcon,
    ChevronLeftIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    UserIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
} from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import {
    createManualTransactionAction,
    createTransferPairAction,
} from "@/app/actions/erp/transactions"

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

function toYmd(d: Date | string | undefined): string {
    if (!d) return ""
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) return ""
    return format(date, "yyyy-MM-dd")
}

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
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)

    const [txKind, setTxKind] = useState<TxKind>("income")
    const [amount, setAmount] = useState(0)
    const [description, setDescription] = useState("")
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined)
    const [dueDate, setDueDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
    const [paymentDate, setPaymentDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
    const [competencyDate, setCompetencyDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
    const [status, setStatus] = useState<"pending" | "paid">("pending")
    const [accountId, setAccountId] = useState<string | undefined>(undefined)
    const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined)
    const [toAccountId, setToAccountId] = useState<string | undefined>(undefined)
    const [paymentType, setPaymentType] = useState<string>("Pix")
    const [contactType, setContactType] = useState<ContactType>("customer")
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [notes, setNotes] = useState("")

    const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">("increase")
    const [refundKind, setRefundKind] = useState<"expense_refund" | "revenue_refund">("expense_refund")
    const [referenceNote, setReferenceNote] = useState("")

    const isIncomeExpense = txKind === "income" || txKind === "expense"

    useEffect(() => {
        setActiveTab("general")
    }, [txKind])

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

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const paidLabel =
        txKind === "expense" || (txKind === "refund" && refundKind === "revenue_refund") ? "Pago" : "Recebido"

    const handleSave = async () => {
        if (txKind === "transfer") {
            if (!(amount > 0)) return error("Valor inválido")
            if (!fromAccountId || !toAccountId) return error("Selecione conta de origem e destino")
            if (fromAccountId === toAccountId) return error("As contas devem ser diferentes")
            setIsSaving(true)
            try {
                const res = await createTransferPairAction({
                    partnerId,
                    fromAccountId,
                    toAccountId,
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
            if (!description.trim()) return error("Descrição obrigatória para ajuste")
            const abs = Math.abs(amount)
            if (!(abs > 0)) return error("Informe um valor")
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
                    contactType: null,
                    paymentType: "Ajuste",
                    dueDate,
                    paymentDate: status === "paid" ? paymentDate : null,
                    transactionDate: competencyDate,
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
            if (!description.trim()) return error("Descrição obrigatória")
            if (!(amount > 0)) return error("Valor inválido")
            if (!accountId) return error("Selecione a conta")
            if (contactType === "customer" && !selectedCustomer?.id) return error("Selecione um cliente")
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
                    contactId: contactType === "customer" ? selectedCustomer?.id || null : null,
                    contactType,
                    paymentType: "Reembolso",
                    dueDate,
                    paymentDate: status === "paid" ? paymentDate : null,
                    transactionDate: competencyDate,
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

        if (!description.trim()) return error("Descrição obrigatória")
        if (!(amount > 0)) return error("Valor inválido")
        if (contactType === "customer" && !selectedCustomer?.id) return error("Selecione um cliente")

        setIsSaving(true)
        try {
            const res = await createManualTransactionAction({
                partnerId,
                transactionType: txKind,
                amount,
                description,
                category: selectedCategoryName,
                categoryId: categoryId || null,
                subcategoryId: subcategoryId || null,
                accountId: accountId || null,
                contactId: contactType === "customer" ? selectedCustomer?.id || null : null,
                contactType,
                paymentType,
                dueDate,
                paymentDate: status === "paid" ? paymentDate : null,
                transactionDate: competencyDate,
                status,
                notes: notes || null,
                origin: "manual",
            })

            if (!res.success) return error(res.error || "Erro ao salvar transação")
            success("Transação criada com sucesso!")
            onSuccess?.()
            router.refresh()
            onClose()
        } finally {
            setIsSaving(false)
        }
    }

    const typeButtons: { id: TxKind; label: string; sub: string; activeClass: string; icon: React.ReactNode }[] = [
        {
            id: "income",
            label: "Receita",
            sub: "Entrada",
            activeClass: "bg-green-50/50 dark:bg-green-900/10 border-brand-green",
            icon: <ChevronDownIcon size={22} strokeWidth={2.5} />,
        },
        {
            id: "expense",
            label: "Despesa",
            sub: "Saída",
            activeClass: "bg-red-50/50 dark:bg-red-900/10 border-brand-red",
            icon: <ChevronUpIcon size={22} strokeWidth={2.5} />,
        },
        {
            id: "transfer",
            label: "Transferência",
            sub: "Entre contas",
            activeClass: "bg-slate-50/80 dark:bg-slate-900/20 border-brand-dark dark:border-dark-body",
            icon: (
                <span className="flex items-center gap-0.5">
                    <ArrowLeftIcon size={18} />
                    <ArrowRightIcon size={18} />
                </span>
            ),
        },
        {
            id: "adjustment",
            label: "Ajuste",
            sub: "Saldo manual",
            activeClass: "bg-amber-50/60 dark:bg-amber-900/15 border-amber-500/50",
            icon: <span className="text-lg font-bold">±</span>,
        },
        {
            id: "refund",
            label: "Reembolso",
            sub: "Estorno",
            activeClass: "bg-violet-50/70 dark:bg-violet-900/15 border-violet-400/60",
            icon: <span className="text-lg font-bold">↩</span>,
        },
    ]

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
                                    <Button
                                        variant="filled"
                                        onClick={onClose}
                                        className="w-10 h-10 p-0 flex items-center justify-center"
                                    >
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
                                            {txKind === "transfer" && "Movimentação interna entre contas"}
                                            {txKind === "adjustment" && "Correção manual do saldo da conta"}
                                            {txKind === "refund" && "Reembolso ou estorno vinculado à conta"}
                                            {isIncomeExpense && "Registre receitas ou despesas financeiras"}
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3 mb-4">
                                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            <SaveIcon className="w-4.5 h-4.5 mr-2" />
                                            {isSaving ? "Salvando..." : "Salvar Lançamento"}
                                        </Button>
                                    </div>
                                </div>

                                {isIncomeExpense && (
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">
                                                Dados Gerais
                                            </TabsTrigger>
                                            <TabsTrigger value="attachments">
                                                Anexos
                                            </TabsTrigger>
                                            <TabsTrigger value="notes">
                                                Observações
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">
                                <div
                                    className={
                                        isIncomeExpense && activeTab === "general"
                                            ? "col-span-12 lg:col-span-8 pr-0 lg:pr-12"
                                            : "col-span-12"
                                    }
                                >
                                    <AnimatePresence mode="wait">
                                        {(!isIncomeExpense || activeTab === "general") && (
                                            <motion.div
                                                key="main-form"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="space-y-10"
                                            >
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                        Tipo de lançamento
                                                    </h3>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
                                                                        className={`w-11 h-11 rounded-full border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0 ${txKind === b.id
                                                                            ? "bg-brand-dark text-white dark:bg-brand-dark"
                                                                            : "bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text"
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

                                                {txKind === "transfer" && (
                                                    <section className="space-y-4">
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                            Transferência
                                                        </h3>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                            Serão criados dois lançamentos vinculados (saída na origem e entrada no destino).
                                                        </p>
                                                        <MoneyInput label="Valor" value={amount} onChange={setAmount} />
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <Combobox
                                                                label="Conta de origem"
                                                                options={accountOptions}
                                                                value={fromAccountId}
                                                                onChange={(v: string) => setFromAccountId(v)}
                                                                placeholder="Selecione"
                                                            />
                                                            <Combobox
                                                                label="Conta de destino"
                                                                options={accountOptions}
                                                                value={toAccountId}
                                                                onChange={(v: string) => setToAccountId(v)}
                                                                placeholder="Selecione"
                                                            />
                                                        </div>
                                                        <DatePicker
                                                            label="Data"
                                                            value={dueDate}
                                                            onChange={(d) => setDueDate(toYmd(d))}
                                                        />
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
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                            Ajuste de saldo
                                                        </h3>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body rounded-xl border border-brand-border dark:border-dark-border p-3 bg-brand-gray/40 dark:bg-dark-border/20">
                                                            Esse lançamento ajusta o saldo da conta manualmente (ex.: conciliação ou correção).
                                                        </p>
                                                        <MoneyInput label="Valor" value={Math.abs(amount)} onChange={(n) => setAmount(Math.abs(n))} />
                                                        <FormDropdown
                                                            label="Direção do ajuste"
                                                            options={[
                                                                { value: "increase", label: "Aumentar saldo (crédito)" },
                                                                { value: "decrease", label: "Reduzir saldo (débito)" },
                                                            ]}
                                                            value={adjustDirection}
                                                            setValue={(v) => setAdjustDirection(v as "increase" | "decrease")}
                                                        />
                                                        <Combobox
                                                            label="Conta"
                                                            options={accountOptions}
                                                            value={accountId}
                                                            onChange={(v: string) => setAccountId(v)}
                                                            placeholder="Selecione"
                                                        />
                                                        <Input
                                                            label="Descrição"
                                                            required
                                                            value={description}
                                                            onChange={(e) => setDescription(e.target.value)}
                                                            placeholder="Ex: Ajuste após conciliação bancária"
                                                        />
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <DatePicker
                                                                label="Data"
                                                                value={competencyDate}
                                                                onChange={(d) => setCompetencyDate(toYmd(d))}
                                                            />
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
                                                                {
                                                                    value: "expense_refund",
                                                                    label: "Reembolso de despesa (dinheiro volta)",
                                                                },
                                                                {
                                                                    value: "revenue_refund",
                                                                    label: "Estorno de receita (dinheiro sai)",
                                                                },
                                                            ]}
                                                            value={refundKind}
                                                            setValue={(v) => setRefundKind(v as "expense_refund" | "revenue_refund")}
                                                        />
                                                        <MoneyInput label="Valor" value={amount} onChange={setAmount} />
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
                                                        />
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <DatePicker
                                                                label="Data de vencimento"
                                                                value={dueDate}
                                                                onChange={(d) => setDueDate(toYmd(d))}
                                                            />
                                                            <DatePicker
                                                                label="Competência"
                                                                value={competencyDate}
                                                                onChange={(d) => setCompetencyDate(toYmd(d))}
                                                            />
                                                        </div>
                                                    </section>
                                                )}

                                                {isIncomeExpense && (
                                                    <section className="space-y-4">
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                            Detalhes do lançamento
                                                        </h3>
                                                        <MoneyInput label="Valor" value={amount} onChange={setAmount} />
                                                        <Input
                                                            label="Descrição"
                                                            value={description}
                                                            onChange={(e) => setDescription(e.target.value)}
                                                            placeholder="Ex: Venda de serviço"
                                                        />
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <Combobox
                                                                label="Categoria"
                                                                options={parentCategories.map((c) => ({ value: c.id, label: c.name }))}
                                                                value={categoryId}
                                                                onChange={(v: string) => {
                                                                    setCategoryId(v)
                                                                    setSubcategoryId(undefined)
                                                                }}
                                                            />
                                                            <Combobox
                                                                label="Subcategoria"
                                                                options={childCategories.map((c) => ({ value: c.id, label: c.name }))}
                                                                value={subcategoryId}
                                                                onChange={(v: string) => setSubcategoryId(v)}
                                                                placeholder="Selecione"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <DatePicker
                                                                label="Data de vencimento"
                                                                value={dueDate}
                                                                onChange={(d) => setDueDate(toYmd(d))}
                                                            />
                                                            <DatePicker
                                                                label="Data do pagamento"
                                                                value={paymentDate}
                                                                onChange={(d) => setPaymentDate(toYmd(d))}
                                                                disabled={status !== "paid"}
                                                            />
                                                        </div>
                                                        <DatePicker
                                                            label="Competência"
                                                            value={competencyDate}
                                                            onChange={(d) => setCompetencyDate(toYmd(d))}
                                                        />
                                                    </section>
                                                )}
                                            </motion.div>
                                        )}

                                        {isIncomeExpense && activeTab === "notes" && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Observações</h3>
                                                <FormTextarea
                                                    name="transaction_notes"
                                                    label="Observações internas"
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    rows={8}
                                                />
                                            </motion.div>
                                        )}

                                        {isIncomeExpense && activeTab === "attachments" && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                                <IconPlaceholder
                                                    icon={UserIcon}
                                                    title="Anexos em breve"
                                                    subtitle="Você poderá anexar comprovantes nesta aba."
                                                />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {(isIncomeExpense && activeTab === "general") || txKind === "refund" ? (
                                    <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">
                                                Status & conta
                                            </h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                        Situação
                                                    </label>
                                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                        <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")}>
                                                            {paidLabel}
                                                        </Button>
                                                        <Button
                                                            variant={status === "pending" ? "default" : "outline"}
                                                            onClick={() => setStatus("pending")}
                                                        >
                                                            Pendente
                                                        </Button>
                                                    </div>
                                                </div>
                                                <Combobox
                                                    label="Conta bancária / caixa"
                                                    options={accountOptions}
                                                    value={accountId}
                                                    onChange={(v: string) => setAccountId(v)}
                                                />
                                                {txKind === "refund" && (
                                                    <DatePicker
                                                        label="Data do pagamento"
                                                        value={paymentDate}
                                                        onChange={(d) => setPaymentDate(toYmd(d))}
                                                        disabled={status !== "paid"}
                                                    />
                                                )}
                                                {isIncomeExpense && (
                                                    <Combobox
                                                        label="Forma de pagamento"
                                                        options={[
                                                            { value: "Pix", label: "Pix" },
                                                            { value: "Boleto", label: "Boleto" },
                                                            { value: "Cartão", label: "Cartão" },
                                                            { value: "Dinheiro", label: "Dinheiro" },
                                                        ]}
                                                        value={paymentType}
                                                        onChange={(v: string) => setPaymentType(v)}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
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

                                            {contactType === "customer" ? (
                                                <div className="mt-4">
                                                    {selectedCustomer ? (
                                                        <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                {selectedCustomer.name}
                                                            </div>
                                                            <div className="text-xs text-brand-inactive-text">{selectedCustomer.email || "Sem email"}</div>
                                                            <Button variant="outline" className="mt-3" onClick={() => setIsCustomerSheetOpen(true)}>
                                                                Trocar cliente
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <IconPlaceholder
                                                            icon={UserIcon}
                                                            title="Nenhum cliente selecionado"
                                                            subtitle="Selecione um cliente para vincular."
                                                            itemButton={{
                                                                text: "Selecionar cliente",
                                                                action: () => setIsCustomerSheetOpen(true),
                                                                variant: "outline",
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="mt-4">
                                                    <Input
                                                        label={`Contato (${contactType})`}
                                                        placeholder="Em breve (fluxo dedicado)"
                                                        disabled
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {txKind === "transfer" && (
                                    <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Status</h3>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")}>
                                                    Efetivado
                                                </Button>
                                                <Button
                                                    variant={status === "pending" ? "default" : "outline"}
                                                    onClick={() => setStatus("pending")}
                                                >
                                                    Pendente
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {txKind === "adjustment" && (
                                    <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Status</h3>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")}>
                                                    Confirmado
                                                </Button>
                                                <Button
                                                    variant={status === "pending" ? "default" : "outline"}
                                                    onClick={() => setStatus("pending")}
                                                >
                                                    Pendente
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button variant="outline" onClick={onClose} disabled={isSaving} className="flex-1 h-[48px]">
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} className="flex-1 h-[48px]">
                            <SaveIcon className="w-4 h-4 mr-2" />
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                <SelectCustomerSheet
                    isOpen={isCustomerSheetOpen}
                    onClose={() => setIsCustomerSheetOpen(false)}
                    onSelect={(customer) => setSelectedCustomer(customer)}
                    partnerId={partnerId}
                />
            </div>
        </FadeIn>
    )
}
