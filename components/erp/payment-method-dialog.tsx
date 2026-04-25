"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import {
    DefaultModal,
    Button,
    Input,
    Checkbox,
    FormDropdown,
    Combobox,
    MoneyInput,
    PercentageInput,
    ListItem,
    AlertModal,
} from "@/components/reusable"
import {
    createPaymentMethodAction,
    getPaymentMethodDetailsAction,
    getPartnerFinanceAccountsForPaymentMethodsAction,
    updatePaymentMethodAction,
} from "@/app/actions/erp/payment-methods"
import { createFinanceAccountAction, getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"
import { PlusIcon } from "@/lib/icons"

interface PaymentMethod {
    id: string
    name: string
    type?: string
    payment_type?: string
    is_active: boolean
    fee_percent?: number | null
    fee_fixed?: number | null
    fee_bearer?: "merchant" | "customer"
    supports_installments?: boolean
    max_installments?: number
    receiving_days?: number
    discount_percent?: number | null
    pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
    pix_key?: string | null
    card_brand?: string | null
    installment_fees?: Array<{ installment_number: number; fee_percent: number }>
    default_finance_account_id?: string | null
}

interface PaymentMethodDialogProps {
    open: boolean
    onClose: (shouldReload?: boolean) => void
    partnerId: string
    editingMethod: PaymentMethod | null
    onSuccess?: (newMethod?: any) => void
}

const AVAILABLE_BRANDS = [
    { id: "american_express", label: "American Express", image: "https://img.dudit.com.br/static/icons/payments/Amex.png" },
    { id: "diners", label: "Diners Club", image: "https://img.dudit.com.br/static/icons/payments/Diners.png" },
    { id: "discover", label: "Discover", image: "https://img.dudit.com.br/static/icons/payments/Discover.png" },
    { id: "elo", label: "Elo", image: "https://img.dudit.com.br/static/icons/payments/Elo.png" },
    { id: "hipercard", label: "Hipercard", image: "https://img.dudit.com.br/static/icons/payments/Hipercard.png" },
    { id: "jcb", label: "JCB", image: "https://img.dudit.com.br/static/icons/payments/JCB.png" },
    { id: "mastercard", label: "Mastercard", image: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" },
    { id: "visa", label: "Visa", image: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
]

const ACCOUNT_TYPE_OPTIONS = [
    { value: "bank", label: "Banco" },
    { value: "cash", label: "Caixa" },
    { value: "wallet", label: "Carteira" },
] as const

export function PaymentMethodDialog({ open, onClose, partnerId, editingMethod }: PaymentMethodDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)
    const [financeAccounts, setFinanceAccounts] = useState<Array<{ id: string; name: string; type?: string }>>([])
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    const [brandsModalOpen, setBrandsModalOpen] = useState(false)
    const [installmentsModalOpen, setInstallmentsModalOpen] = useState(false)
    const [showUnsavedModal, setShowUnsavedModal] = useState(false)
    const [baselineFormData, setBaselineFormData] = useState<any>(null)

    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
    const [isSavingAccount, setIsSavingAccount] = useState(false)
    const [newAccountName, setNewAccountName] = useState("")
    const [newAccountType, setNewAccountType] = useState<"cash" | "bank" | "wallet">("bank")
    const [newAccountInitialBalance, setNewAccountInitialBalance] = useState(0)
    const [newAccountIsDefault, setNewAccountIsDefault] = useState(false)
    const [newAccountNameError, setNewAccountNameError] = useState(false)

    const [formData, setFormData] = useState({
        name: "",
        payment_type: "cash",
        is_active: true,
        fee_percent: 0,
        fee_fixed: 0,
        fee_bearer: "merchant" as "merchant" | "customer",
        receiving_days: 0,
        discount_percent: 0,
        pix_key_type: "email" as "cpf" | "cnpj" | "email" | "phone" | "random",
        pix_key: "",
        card_brand: "" as string,
        default_finance_account_id: "",
        has_fees: false,
        supports_installments: false,
        max_installments: 1,
        installment_fees: [{ installment_number: 1, fee_percent: 0 }] as Array<{ installment_number: number; fee_percent: number }>,
    })

    const buildInstallments = (maxInstallments: number, existing?: Array<{ installment_number: number; fee_percent: number }>) => {
        const map = new Map<number, number>((existing || []).map((row) => [row.installment_number, row.fee_percent]))
        return Array.from({ length: maxInstallments }).map((_, idx) => ({
            installment_number: idx + 1,
            fee_percent: map.get(idx + 1) ?? 0,
        }))
    }

    const isDirty = useMemo(() => {
        if (!baselineFormData || !open) return false
        const current = JSON.stringify(formData)
        const baseline = JSON.stringify(baselineFormData)
        return current !== baseline
    }, [formData, baselineFormData, open])

    useEffect(() => {
        if (!open) return
        if (!editingMethod) {
            const initial = {
                name: "",
                payment_type: "cash",
                is_active: true,
                fee_percent: 0,
                fee_fixed: 0,
                fee_bearer: "merchant" as const,
                receiving_days: 0,
                discount_percent: 0,
                pix_key_type: "email" as const,
                pix_key: "",
                card_brand: "",
                default_finance_account_id: "",
                has_fees: false,
                supports_installments: false,
                max_installments: 1,
                installment_fees: [{ installment_number: 1, fee_percent: 0 }],
            }
            setFormData(initial)
            setBaselineFormData(initial)
            setError(null)
            setFieldErrors({})
            return
        }

        setIsLoadingDetails(true)
        getPaymentMethodDetailsAction(editingMethod.id)
            .then((res: any) => {
                const full = res?.method || editingMethod
                const resolvedType = full.type || full.payment_type || "cash"
                const maxInstallments = Number(full.max_installments || 1)
                const data = {
                    name: full.name || "",
                    payment_type: resolvedType,
                    is_active: full.is_active ?? true,
                    fee_percent: Number(full.fee_percent || 0),
                    fee_fixed: Number(full.fee_fixed || 0),
                    fee_bearer: (full.fee_bearer || "merchant") as "merchant" | "customer",
                    receiving_days: Number(full.receiving_days || 0),
                    discount_percent: Number(full.discount_percent || 0),
                    pix_key_type: (full.pix_key_type || "email") as "cpf" | "cnpj" | "email" | "phone" | "random",
                    pix_key: full.pix_key || "",
                    card_brand: full.card_brand || "",
                    default_finance_account_id: full.default_finance_account_id || "",
                    has_fees: Number(full.fee_percent || 0) > 0 || Number(full.fee_fixed || 0) > 0 || (full.installment_fees && full.installment_fees.length > 0),
                    supports_installments: resolvedType === "credit_card" ? Boolean(full.supports_installments || maxInstallments > 1) : false,
                    max_installments: resolvedType === "credit_card" ? maxInstallments : 1,
                    installment_fees: resolvedType === "credit_card" ? buildInstallments(maxInstallments, full.installment_fees) : [{ installment_number: 1, fee_percent: 0 }],
                }
                setFormData(data)
                setBaselineFormData(data)
            })
            .finally(() => setIsLoadingDetails(false))
    }, [editingMethod, open])

    useEffect(() => {
        if (!open) return
        getPartnerFinanceAccountsForPaymentMethodsAction(partnerId).then((res: any) => {
            if (res?.accounts) {
                setFinanceAccounts(res.accounts)
                const initialAccountId = formData.default_finance_account_id || res.accounts?.[0]?.id || ""
                setFormData((prev) => ({
                    ...prev,
                    default_finance_account_id: initialAccountId,
                }))
                setBaselineFormData((prev: any) => {
                    if (prev && !prev.default_finance_account_id && initialAccountId) {
                        return { ...prev, default_finance_account_id: initialAccountId }
                    }
                    return prev
                })
            }
        })
    }, [open, partnerId])

    const isPix = formData.payment_type === "pix"
    const isCreditCard = formData.payment_type === "credit_card"
    const isDebitCard = formData.payment_type === "debit_card"
    const isCard = isCreditCard || isDebitCard
    const showFeeFields = isPix || isDebitCard
    const selectedBrandIds = formData.card_brand ? formData.card_brand.split(";").map((b) => b.trim()).filter(Boolean) : []
    const selectedBrands = AVAILABLE_BRANDS.filter((brand) => selectedBrandIds.includes(brand.id))
    const selectedInstallments = formData.installment_fees.filter((row) => row.installment_number > 0)

    const clearFieldError = (key: string) => {
        setFieldErrors((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
    }

    const handleBrandToggle = (brandId: string) => {
        const brands = formData.card_brand ? formData.card_brand.split(";").map((b) => b.trim()).filter(Boolean) : []
        const index = brands.indexOf(brandId)
        if (index > -1) {
            brands.splice(index, 1)
        } else {
            brands.push(brandId)
        }
        setFormData({ ...formData, card_brand: brands.join("; ") })
        clearFieldError("card_brand")
    }

    const renderBrandAvatar = (brand: (typeof AVAILABLE_BRANDS)[number]) => (
        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border/40 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
            <img
                src={brand.image}
                alt={brand.label}
                className="w-7 h-7 object-contain"
                onError={(e) => {
                    e.currentTarget.style.display = "none"
                    const sibling = e.currentTarget.nextElementSibling as HTMLSpanElement | null
                    if (sibling) sibling.style.display = "inline-flex"
                }}
            />
            <span className="text-[10px] font-bold hidden">{brand.label.slice(0, 2).toUpperCase()}</span>
        </div>
    )

    const refreshFinanceAccounts = async (preferredAccountId?: string) => {
        const refreshed = await getFinanceAccountsAction(partnerId)
        if (refreshed.success && refreshed.data) {
            const active = (refreshed.data.accounts || []).filter((acc: any) => acc.is_active)
            setFinanceAccounts(active.map((acc: any) => ({ id: acc.id, name: acc.name, type: acc.type })))
            setFormData((prev) => ({
                ...prev,
                default_finance_account_id: preferredAccountId || prev.default_finance_account_id || active?.[0]?.id || "",
            }))
            if (preferredAccountId) clearFieldError("default_finance_account_id")
        }
    }

    const handleCreateAccount = async () => {
        if (!newAccountName.trim()) {
            setNewAccountNameError(true)
            return
        }
        setIsSavingAccount(true)
        try {
            const created = await createFinanceAccountAction({
                partnerId,
                name: newAccountName.trim(),
                type: newAccountType,
                initialBalance: newAccountInitialBalance,
                isDefault: newAccountIsDefault,
            })
            if (!created.success || !created.data) {
                setError(created.error || "Não foi possível criar a conta financeira.")
                return
            }
            await refreshFinanceAccounts(created.data.id)
            setIsAccountModalOpen(false)
            setNewAccountName("")
            setNewAccountType("bank")
            setNewAccountInitialBalance(0)
            setNewAccountIsDefault(false)
            setNewAccountNameError(false)
        } finally {
            setIsSavingAccount(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        const nextFieldErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            nextFieldErrors.name = "Nome é obrigatório"
        }
        if (!formData.default_finance_account_id) {
            nextFieldErrors.default_finance_account_id = "Selecione a conta financeira padrão"
        }
        if (isCard && selectedBrandIds.length === 0) {
            nextFieldErrors.card_brand = "Selecione ao menos uma bandeira"
        }
        if (formData.supports_installments && (formData.max_installments < 1 || formData.max_installments > 24)) {
            nextFieldErrors.max_installments = "Informe de 1 até 24 parcelas"
        }
        if (isCreditCard && formData.supports_installments) {
            const invalidInstallment = formData.installment_fees.find((row) => row.fee_percent < 0 || row.fee_percent > 100)
            if (invalidInstallment) {
                nextFieldErrors.installment_fees = "As taxas de parcela devem estar entre 0% e 100%"
            }
        }

        if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors)
            setError("Revise os campos obrigatórios antes de salvar.")
            setIsLoading(false)
            return
        }

        setFieldErrors({})

        try {
            const payload = {
                name: formData.name,
                isActive: formData.is_active,
                paymentType: formData.payment_type,
                feePercent: formData.has_fees && (showFeeFields || isCreditCard) ? formData.fee_percent : 0,
                feeFixed: formData.has_fees && (showFeeFields || isCreditCard) ? formData.fee_fixed : 0,
                receivingDays: formData.receiving_days,
                discountPercent: formData.discount_percent,
                feeBearer: formData.fee_bearer,
                supportsInstallments: isCreditCard && formData.has_fees ? formData.supports_installments : false,
                maxInstallments: isCreditCard && formData.has_fees && formData.supports_installments ? formData.max_installments : 1,
                installmentFees: isCreditCard && formData.has_fees && formData.supports_installments
                    ? formData.installment_fees.map((row) => ({ installmentNumber: row.installment_number, feePercent: row.fee_percent }))
                    : [],
                pixKeyType: isPix ? formData.pix_key_type : null,
                pixKey: isPix ? formData.pix_key : null,
                usePartnerPixData: false,
                cardBrand: isCard ? formData.card_brand : null,
                defaultFinanceAccountId: formData.default_finance_account_id,
            }

            if (editingMethod) {
                const result = await updatePaymentMethodAction(editingMethod.id, payload)

                if (result.error) {
                    setError(result.error)
                } else {
                    setBaselineFormData(formData)
                    onClose(true)
                }
            } else {
                const result = await createPaymentMethodAction({
                    partnerId,
                    ...payload,
                })

                if (result.error) {
                    setError(result.error)
                } else {
                    setBaselineFormData(formData)
                    onClose(true)
                }
            }
        } catch {
            setError("Erro ao salvar método de pagamento")
        } finally {
            setIsLoading(false)
        }
    }

    const handleAttemptClose = (force = false) => {
        if (isDirty && !force) {
            setShowUnsavedModal(true)
        } else {
            setShowUnsavedModal(false)
            onClose(false)
        }
    }

    return (
        <>
            <DefaultModal
                isOpen={open}
                onClose={() => handleAttemptClose()}
                title={`${editingMethod ? "Editar" : "Adicionar"} Método de Pagamento`}
                maxWidth="2xl"
            >
                {isLoadingDetails ? (
                    <div className="text-sm text-brand-inactive-text py-8 text-center">Carregando dados do método...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <Input
                                label="Nome / Descrição"
                                id="name"
                                name="name"
                                required
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData({ ...formData, name: e.target.value })
                                    clearFieldError("name")
                                }}
                                placeholder="Ex: Cartão Visa, PIX, etc"
                                error={Boolean(fieldErrors.name)}
                                errorMessage={fieldErrors.name}
                            />

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading truncate">Tipo de Pagamento</label>
                                    {isCard && (
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="px-0 py-0 h-auto"
                                            onClick={() => setBrandsModalOpen(true)}
                                        >
                                            Selecionar bandeiras
                                        </Button>
                                    )}
                                </div>
                                <FormDropdown
                                    value={formData.payment_type}
                                    setValue={(value) => {
                                        const isNowCreditCard = value === "credit_card"
                                        setFormData({
                                            ...formData,
                                            payment_type: value,
                                            supports_installments: isNowCreditCard ? formData.supports_installments : false,
                                            max_installments: isNowCreditCard ? formData.max_installments : 1,
                                            installment_fees: isNowCreditCard ? formData.installment_fees : [{ installment_number: 1, fee_percent: 0 }],
                                        })
                                        if (value !== "credit_card") {
                                            setInstallmentsModalOpen(false)
                                        }
                                    }}
                                    options={[
                                        { value: "cash", label: "Dinheiro" },
                                        { value: "pix", label: "PIX" },
                                        { value: "credit_card", label: "Cartão de Crédito" },
                                        { value: "debit_card", label: "Cartão de Débito" },
                                        { value: "other", label: "Outros" },
                                    ]}
                                />
                            </div>

                            <Combobox
                                label="Conta padrão no financeiro"
                                value={formData.default_finance_account_id || undefined}
                                onChange={(value) => {
                                    setFormData({ ...formData, default_finance_account_id: value })
                                    clearFieldError("default_finance_account_id")
                                }}
                                options={financeAccounts.map((account) => ({
                                    value: account.id,
                                    label: `${account.name}${account.type ? ` (${account.type})` : ""}`,
                                }))}
                                actionItem={{ label: "Criar conta", icon: <PlusIcon className="w-4 h-4" />, onClick: () => setIsAccountModalOpen(true) }}
                                error={Boolean(fieldErrors.default_finance_account_id)}
                            />
                            {fieldErrors.default_finance_account_id && (
                                <p className="text-xs text-brand-red -mt-2">{fieldErrors.default_finance_account_id}</p>
                            )}

                            {selectedBrands.length > 0 && isCard && (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Bandeiras aceitas</p>
                                    <div className="relative">
                                        <div className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10" />
                                        <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10" />
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                            {selectedBrands.map((brand) => (
                                                <div key={brand.id} className="h-14 md:h-16 rounded-2xl text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading bg-gray-50 dark:bg-dark-border/30 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border active:scale-95 transform duration-100">
                                                    <div className="flex items-center gap-2">
                                                        {renderBrandAvatar(brand)}
                                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">{brand.label}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {fieldErrors.card_brand && isCard && <p className="text-xs text-brand-red -mt-2">{fieldErrors.card_brand}</p>}

                            {isPix && (
                                <div className="space-y-4">
                                    <FormDropdown
                                        label="Tipo da chave PIX"
                                        value={formData.pix_key_type}
                                        setValue={(value: any) => setFormData({ ...formData, pix_key_type: value })}
                                        options={[
                                            { value: "cpf", label: "CPF" },
                                            { value: "cnpj", label: "CNPJ" },
                                            { value: "email", label: "Email" },
                                            { value: "phone", label: "Telefone" },
                                            { value: "random", label: "Chave aleatéria" },
                                        ]}
                                    />
                                    <Input
                                        label="Chave PIX"
                                        id="pix_key"
                                        name="pix_key"
                                        value={formData.pix_key}
                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                        placeholder="Informe a chave PIX"
                                    />
                                </div>
                            )}

                            {isCreditCard && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="supports_installments"
                                            checked={formData.supports_installments}
                                            onChange={(checked) => setFormData({ ...formData, supports_installments: checked as boolean })}
                                        />
                                        <label htmlFor="supports_installments" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                                            Aceita parcelamento
                                        </label>
                                    </div>
                                    {formData.supports_installments && (
                                        <div className="space-y-4 pt-2">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading truncate">Máximo de parcelas</label>
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        className="px-0 py-0 h-auto"
                                                        onClick={() => setInstallmentsModalOpen(true)}
                                                    >
                                                        Configurar parcelas
                                                    </Button>
                                                </div>
                                                <Input
                                                    id="max_installments"
                                                    type="number"
                                                    min="1"
                                                    max="24"
                                                    value={formData.max_installments}
                                                    error={Boolean(fieldErrors.max_installments)}
                                                    errorMessage={fieldErrors.max_installments}
                                                    onChange={(e) => {
                                                        const nextMax = Math.max(1, Math.min(24, Number(e.target.value || 1)))
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            max_installments: nextMax,
                                                            installment_fees: buildInstallments(nextMax, prev.installment_fees),
                                                        }))
                                                        clearFieldError("max_installments")
                                                    }}
                                                />
                                            </div>

                                            {selectedInstallments.length > 0 && (
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Parcelas e taxas</label>
                                                    <div className="relative">
                                                        <div className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-brand-gray/10 dark:from-dark-border/10 to-transparent z-10" />
                                                        <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-brand-gray/10 dark:from-dark-border/10 to-transparent z-10" />
                                                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                                                            {selectedInstallments.map((row) => (
                                                                <div key={row.installment_number} className="shrink-0 rounded-xl bg-gray-50 dark:bg-dark-border/30 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border duration-100 px-3 py-2">
                                                                    <p className="text-xs font-bold text-brand-dark dark:text-dark-heading">{row.installment_number}x</p>
                                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">{row.fee_percent}% taxa</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {fieldErrors.installment_fees && <p className="text-xs text-brand-red">{fieldErrors.installment_fees}</p>}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-4 border-t border-brand-border dark:border-dark-border pt-4">
                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Configurações de taxa</h3>
                                    <div className="flex items-center gap-2 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-border/10">
                                        <Checkbox
                                            id="has_fees"
                                            checked={formData.has_fees}
                                            onChange={(checked) => setFormData({ ...formData, has_fees: checked as boolean })}
                                        />
                                        <label htmlFor="has_fees" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer select-none">
                                            Possui taxas de recebimento ou parcelamento
                                        </label>
                                    </div>
                                </div>

                                {formData.has_fees && (
                                    <div className="space-y-4 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <FormDropdown
                                            label="Quem paga a taxa?"
                                            value={formData.fee_bearer}
                                            setValue={(value: any) => setFormData({ ...formData, fee_bearer: value })}
                                            options={[
                                                { value: "merchant", label: "Empresa (absorve)" },
                                                { value: "customer", label: "Cliente (acrescenta no valor)" },
                                            ]}
                                        />

                                        {(!isCreditCard || !formData.supports_installments) && (showFeeFields || isCreditCard) && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <PercentageInput
                                                    label="Taxa percentual"
                                                    id="fee_percent"
                                                    value={formData.fee_percent}
                                                    onChange={(value) => setFormData({ ...formData, fee_percent: value })}
                                                />
                                                <MoneyInput
                                                    label="Taxa fixa"
                                                    id="fee_fixed"
                                                    value={formData.fee_fixed}
                                                    onChange={(value) => setFormData({ ...formData, fee_fixed: value })}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                    <PercentageInput
                                        label="Desconto"
                                        id="discount_percent"
                                        name="discount_percent"
                                        value={formData.discount_percent}
                                        onChange={(value) => setFormData({ ...formData, discount_percent: value })}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="is_active"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
                                />
                                <label htmlFor="is_active" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                                    Método ativo
                                </label>
                            </div>
                        </div>

                        {error && <p className="text-sm text-brand-red font-bold">{error}</p>}

                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleAttemptClose()}
                                className="flex-1"
                                disabled={isLoading}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" className="flex-1" disabled={isLoading}>
                                {isLoading ? "Salvando..." : editingMethod ? "Atualizar" : "Adicionar"}
                            </Button>
                        </div>
                    </form>
                )}
            </DefaultModal>

            <DefaultModal
                isOpen={brandsModalOpen}
                onClose={() => setBrandsModalOpen(false)}
                title="Selecionar bandeiras aceitas"
                maxWidth="lg"
            >
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    <div className="space-y-2 py-1">
                        {AVAILABLE_BRANDS.map((brand) => {
                            const checked = selectedBrandIds.includes(brand.id)
                            return (
                                <ListItem
                                    key={brand.id}
                                    title={brand.label}
                                    left={<div className="pr-3">{renderBrandAvatar(brand)}</div>}
                                    right={<Checkbox checked={checked} onChange={() => handleBrandToggle(brand.id)} />}
                                    onClick={() => handleBrandToggle(brand.id)}
                                    className="px-3 py-3"
                                />
                            )
                        })}
                    </div>
                    <div className="flex justify-end pt-4 sticky bottom-0 bg-white dark:bg-dark-surface pb-1">
                        <Button type="button" onClick={() => setBrandsModalOpen(false)}>Salvar</Button>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={installmentsModalOpen}
                onClose={() => setInstallmentsModalOpen(false)}
                title="Configurar taxas por parcela"
                maxWidth="lg"
            >
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                    <div className="space-y-2 py-1">
                        {formData.installment_fees.map((row, index) => {
                            return (
                                <ListItem
                                    key={row.installment_number}
                                    title={`${row.installment_number}x parcela`}
                                    description="Taxa percentual da parcela"
                                    right={
                                        <div className="w-[130px]" onClick={(e) => e.stopPropagation()}>
                                            <PercentageInput
                                                value={row.fee_percent}
                                                onChange={(value) => {
                                                    const next = [...formData.installment_fees]
                                                    next[index] = { ...row, fee_percent: value }
                                                    setFormData({ ...formData, installment_fees: next })
                                                    clearFieldError("installment_fees")
                                                }}
                                            />
                                        </div>
                                    }
                                    className="px-3 py-3"
                                />
                            )
                        })}
                    </div>
                    <div className="flex justify-end pt-4 sticky bottom-0 bg-white dark:bg-dark-surface pb-1">
                        <Button type="button" onClick={() => setInstallmentsModalOpen(false)}>Salvar</Button>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={isAccountModalOpen}
                onClose={() => {
                    if (isSavingAccount) return
                    setIsAccountModalOpen(false)
                }}
                title="Nova conta"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setIsAccountModalOpen(false)} disabled={isSavingAccount}>
                            Cancelar
                        </Button>
                        <Button isLoading={isSavingAccount} onClick={handleCreateAccount}>
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 p-2">
                    <Input
                        label="Nome"
                        value={newAccountName}
                        onChange={(e) => {
                            setNewAccountName(e.target.value)
                            setNewAccountNameError(false)
                        }}
                        placeholder="Ex: Banco Inter PJ"
                        error={newAccountNameError}
                        errorMessage={newAccountNameError ? "O nome é obrigatório." : undefined}
                    />
                    <FormDropdown
                        label="Tipo"
                        options={ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={newAccountType}
                        setValue={(v) => setNewAccountType(v as "cash" | "bank" | "wallet")}
                    />
                    <MoneyInput
                        label="Saldo inicial"
                        value={newAccountInitialBalance}
                        onChange={setNewAccountInitialBalance}
                    />
                    <Checkbox
                        id="new_account_default"
                        label="Conta padrão deste tipo"
                        checked={newAccountIsDefault}
                        onChange={(checked) => setNewAccountIsDefault(Boolean(checked))}
                    />
                </div>
            </DefaultModal>

            {showUnsavedModal && (
                <AlertModal
                    isOpen={showUnsavedModal}
                    onClose={() => setShowUnsavedModal(false)}
                    onConfirm={() => handleAttemptClose(true)}
                    title="Descartar alterações?"
                    description="Existem dados não salvos neste formulário. Se sair agora, você perderá o que preencheu."
                    confirmText="Sair sem salvar"
                    variant="warning"
                />
            )}
        </>
    )
}
