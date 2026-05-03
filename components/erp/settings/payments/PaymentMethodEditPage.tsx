"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import {
    Button,
    Input,
    Checkbox,
    FormDropdown,
    Combobox,
    MoneyInput,
    PercentageInput,
    ListItem,
    AlertModal,
    SavingStatusModal,
    InfoCard,
    Separator,
    DefaultModal,
} from "@/components/reusable"
import {
    createPaymentMethodAction,
    getPaymentMethodDetailsAction,
    getPartnerFinanceAccountsForPaymentMethodsAction,
    updatePaymentMethodAction,
} from "@/app/actions/erp/payment-methods"
import { createFinanceAccountAction, getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"
import { PlusIcon, ChevronLeftIcon, CheckCircleIcon, QRCodeIcon, CreditCardIcon, MoneyIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"

interface PaymentMethod {
    id: string
    name: string
    type?: string
    payment_type?: string
    is_active: boolean
    is_online_default?: boolean
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

interface PaymentMethodEditPageProps {
    partnerId: string
    editingMethod: PaymentMethod | null
    onBack: (shouldReload?: boolean) => void
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

export function PaymentMethodEditPage({ partnerId, editingMethod, onBack }: PaymentMethodEditPageProps) {
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
        payment_type: "pix",
        is_active: true,
        is_online_default: false,
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
        if (!baselineFormData) return false
        const current = JSON.stringify(formData)
        const baseline = JSON.stringify(baselineFormData)
        return current !== baseline
    }, [formData, baselineFormData])

    useEffect(() => {
        if (!editingMethod) {
            const initial = {
                name: "",
                payment_type: "pix",
                is_active: true,
                is_online_default: false,
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
        } else {
            setIsLoadingDetails(true)
            getPaymentMethodDetailsAction(editingMethod.id)
                .then((res: any) => {
                    const full = res?.method || editingMethod
                    const resolvedType = full.type || full.payment_type || "pix"
                    const maxInstallments = Number(full.max_installments || 1)
                    const data = {
                        name: full.name || "",
                        payment_type: resolvedType,
                        is_active: full.is_active ?? true,
                        is_online_default: full.is_online_default ?? false,
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
        }

        getPartnerFinanceAccountsForPaymentMethodsAction(partnerId).then((res: any) => {
            if (res?.accounts) {
                setFinanceAccounts(res.accounts)
                if (!editingMethod) {
                    const initialAccountId = res.accounts?.[0]?.id || ""
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
            }
        })
    }, [editingMethod, partnerId])

    const isPix = formData.payment_type === "pix"
    const isCreditCard = formData.payment_type === "credit_card"
    const isDebitCard = formData.payment_type === "debit_card"
    const isCard = isCreditCard || isDebitCard
    const showFeeFields = isPix || isDebitCard || (isCreditCard && !formData.supports_installments)
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

    const validatePixKey = (type: string, key: string) => {
        if (!key.trim()) return true
        switch (type) {
            case "cpf":
                return /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(key)
            case "cnpj":
                return /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(key)
            case "email":
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)
            case "phone":
                return /^\+?[\d\s()-]{8,20}$/.test(key)
            default:
                return true
        }
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setIsLoading(true)
        setError(null)

        const nextFieldErrors: Record<string, string> = {}

        if (!formData.name.trim()) {
            nextFieldErrors.name = "Nome é obrigatório"
        }
        if (!formData.default_finance_account_id) {
            nextFieldErrors.default_finance_account_id = "Selecione a conta financeira padrão"
        }

        if (isPix && formData.pix_key && !validatePixKey(formData.pix_key_type, formData.pix_key)) {
            nextFieldErrors.pix_key = "Formato de chave PIX inválido para o tipo selecionado"
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
                isOnlineDefault: formData.is_online_default,
                paymentType: formData.payment_type,
                feePercent: formData.has_fees && showFeeFields ? formData.fee_percent : 0,
                feeFixed: formData.has_fees && showFeeFields ? formData.fee_fixed : 0,
                receivingDays: formData.receiving_days,
                discountPercent: formData.discount_percent,
                feeBearer: formData.fee_bearer,
                supportsInstallments: isCreditCard ? formData.supports_installments : false,
                maxInstallments: isCreditCard && formData.supports_installments ? formData.max_installments : 1,
                installmentFees: isCreditCard && formData.supports_installments
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
                if (result.error) setError(result.error)
                else onBack(true)
            } else {
                const result = await createPaymentMethodAction({ partnerId, ...payload })
                if (result.error) setError(result.error)
                else onBack(true)
            }
        } catch {
            setError("Erro ao salvar método de pagamento")
        } finally {
            setIsLoading(false)
        }
    }

    const handleAttemptBack = () => {
        if (isDirty) setShowUnsavedModal(true)
        else onBack(false)
    }

    if (isLoadingDetails) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-brand-inactive-text animate-pulse">Carregando detalhes do método...</p>
            </div>
        )
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
            {/* Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border px-4 md:px-6 py-4">
                <div className="max-w-[1300px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="sm" onClick={handleAttemptBack} className="w-10 h-10 p-0 rounded-full">
                            <ChevronLeftIcon className="w-5 h-5" />
                        </Button>
                        <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            {editingMethod ? "Editar Método" : "Novo Método"}
                        </h1>
                    </div>
                    <Button onClick={() => handleSubmit()} isLoading={isLoading} leftIcon={<CheckCircleIcon className="w-5 h-5" />}>
                        Salvar Alterações
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
                <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Left Column: General Info */}
                        <div className="lg:col-span-7 space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm space-y-6">
                                <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-3">
                                    Informações Gerais
                                </h2>

                                <div className="space-y-4">
                                    <Input
                                        label="Nome / Descrição"
                                        required
                                        value={formData.name}
                                        onChange={(e) => {
                                            setFormData({ ...formData, name: e.target.value })
                                            clearFieldError("name")
                                        }}
                                        placeholder="Ex: Cartão Visa, PIX Dudit, etc"
                                        error={Boolean(fieldErrors.name)}
                                        errorMessage={fieldErrors.name}
                                    />

                                    <FormDropdown
                                        label="Tipo de Pagamento"
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
                                        }}
                                        options={[
                                            { value: "pix", label: "PIX" },
                                            { value: "credit_card", label: "Cartão de Crédito" },
                                            { value: "debit_card", label: "Cartão de Débito" },
                                            { value: "other", label: "Outros" },
                                        ]}
                                    />

                                    {isPix && (
                                        <div className="space-y-4 pt-2">
                                            <InfoCard
                                                color="red"
                                                title="Atenção!"
                                                message="O sistema não valida a chave PIX. Por favor, informe a chave correta."
                                            />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                    value={formData.pix_key}
                                                    onChange={(e) => {
                                                        setFormData({ ...formData, pix_key: e.target.value })
                                                        clearFieldError("pix_key")
                                                    }}
                                                    placeholder="Informe a chave PIX"
                                                    error={Boolean(fieldErrors.pix_key)}
                                                    errorMessage={fieldErrors.pix_key}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {isCard && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Bandeiras Aceitas</label>
                                                <Button variant="link" size="sm" onClick={() => setBrandsModalOpen(true)} className="px-0 h-auto">
                                                    Selecionar bandeiras
                                                </Button>
                                            </div>
                                            {selectedBrands.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedBrands.map(brand => (
                                                        <div key={brand.id} className="flex items-center gap-2 bg-gray-50 dark:bg-dark-border/30 px-3 py-1.5 rounded-full border border-brand-border dark:border-dark-border">
                                                            <img src={brand.image} alt={brand.label} className="w-5 h-5 object-contain" />
                                                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{brand.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-brand-inactive-text italic">Nenhuma bandeira selecionada (opcional)</p>
                                            )}
                                        </div>
                                    )}

                                    <Combobox
                                        label="Conta Padrão no Financeiro"
                                        value={formData.default_finance_account_id || undefined}
                                        onChange={(value) => {
                                            setFormData({ ...formData, default_finance_account_id: value })
                                            clearFieldError("default_finance_account_id")
                                        }}
                                        options={financeAccounts.map((account) => ({
                                            value: account.id,
                                            label: account.name, // Displaying only account name as requested
                                        }))}
                                        actionItem={{ label: "Criar conta", icon: <PlusIcon className="w-4 h-4" />, onClick: () => setIsAccountModalOpen(true) }}
                                        error={Boolean(fieldErrors.default_finance_account_id)}
                                        errorMessage={fieldErrors.default_finance_account_id}
                                    />

                                    <div className="pt-4 space-y-4 border-t border-brand-border dark:border-dark-border">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="is_active"
                                                checked={formData.is_active}
                                                onChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
                                            />
                                            <label htmlFor="is_active" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                                                Método Ativo
                                            </label>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="is_online_default"
                                                    checked={formData.is_online_default}
                                                    onChange={(checked) => setFormData({ ...formData, is_online_default: checked as boolean })}
                                                />
                                                <label htmlFor="is_online_default" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                                                    Método padrão na vitrine online
                                                </label>
                                            </div>
                                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body ml-7">
                                                Apenas um método padrão é permitido por tipo (Dinheiro, PIX, Crédito, Débito).
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Fees & Advanced */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm space-y-6">
                                <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-3">
                                    Taxas e Recebimento
                                </h2>

                                <div className="space-y-6">
                                    {isCreditCard && (
                                        <div className="space-y-4 p-4 rounded-xl bg-brand-gray/30 dark:bg-dark-border/10 border border-brand-border dark:border-dark-border">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="supports_installments"
                                                    checked={formData.supports_installments}
                                                    onChange={(checked) => setFormData({ ...formData, supports_installments: checked as boolean })}
                                                />
                                                <label htmlFor="supports_installments" className="text-sm font-bold text-brand-dark dark:text-dark-heading cursor-pointer">
                                                    Aceita parcelamento
                                                </label>
                                            </div>

                                            {formData.supports_installments && (
                                                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Máximo de parcelas</label>
                                                        <Button variant="link" size="sm" onClick={() => setInstallmentsModalOpen(true)} className="px-0 h-auto">
                                                            Configurar parcelas
                                                        </Button>
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="24"
                                                        value={formData.max_installments}
                                                        onChange={(e) => {
                                                            const nextMax = Math.max(1, Math.min(24, Number(e.target.value || 1)))
                                                            setFormData((prev) => ({
                                                                ...prev,
                                                                max_installments: nextMax,
                                                                installment_fees: buildInstallments(nextMax, prev.installment_fees),
                                                            }))
                                                            clearFieldError("max_installments")
                                                        }}
                                                        error={Boolean(fieldErrors.max_installments)}
                                                    />

                                                    {selectedInstallments.length > 0 && (
                                                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                                            {selectedInstallments.slice(0, 4).map((row) => (
                                                                <div key={row.installment_number} className="shrink-0 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg px-2 py-1">
                                                                    <p className="text-[10px] font-bold">{row.installment_number}x</p>
                                                                    <p className="text-[10px] text-brand-inactive-text">{row.fee_percent}%</p>
                                                                </div>
                                                            ))}
                                                            {selectedInstallments.length > 4 && <div className="flex items-center text-[10px] font-bold text-brand-inactive-text px-1">...</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Configurações de taxa - Hidden if credit card accepts installments as requested */}
                                    {(!isCreditCard || !formData.supports_installments) && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-border/10">
                                                <Checkbox
                                                    id="has_fees"
                                                    checked={formData.has_fees}
                                                    onChange={(checked) => setFormData({ ...formData, has_fees: checked as boolean })}
                                                />
                                                <label htmlFor="has_fees" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer select-none">
                                                    Possui taxas de recebimento
                                                </label>
                                            </div>

                                            {formData.has_fees && (
                                                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <FormDropdown
                                                        label="Quem paga a taxa?"
                                                        value={formData.fee_bearer}
                                                        setValue={(value: any) => setFormData({ ...formData, fee_bearer: value })}
                                                        options={[
                                                            { value: "merchant", label: "Empresa (absorve)" },
                                                            { value: "customer", label: "Cliente (acrescenta)" },
                                                        ]}
                                                    />
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <PercentageInput
                                                            label="Taxa %"
                                                            value={formData.fee_percent}
                                                            onChange={(value) => setFormData({ ...formData, fee_percent: value })}
                                                        />
                                                        <MoneyInput
                                                            label="Taxa fixa"
                                                            value={formData.fee_fixed}
                                                            onChange={(value) => setFormData({ ...formData, fee_fixed: value })}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                        <PercentageInput
                                            label="Desconto para este método"
                                            value={formData.discount_percent}
                                            onChange={(value) => setFormData({ ...formData, discount_percent: value })}
                                            placeholder="0"
                                        />
                                    </div>

                                    <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                        <Input
                                            label="Prazo de recebimento (dias)"
                                            type="number"
                                            min="0"
                                            value={formData.receiving_days}
                                            onChange={(e) => setFormData({ ...formData, receiving_days: Number(e.target.value || 0) })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {error && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <InfoCard color="red" title="Erro ao salvar" message={error} />
                </div>
            )}

            {/* Modals */}
            <DefaultModal isOpen={brandsModalOpen} onClose={() => setBrandsModalOpen(false)} title="Bandeiras Aceitas" maxWidth="lg">
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {AVAILABLE_BRANDS.map((brand) => (
                        <ListItem
                            key={brand.id}
                            title={brand.label}
                            left={<div className="pr-3">{renderBrandAvatar(brand)}</div>}
                            right={<Checkbox checked={selectedBrandIds.includes(brand.id)} onChange={() => handleBrandToggle(brand.id)} />}
                            onClick={() => handleBrandToggle(brand.id)}
                            className="px-3 py-3"
                        />
                    ))}
                </div>
            </DefaultModal>

            <DefaultModal isOpen={installmentsModalOpen} onClose={() => setInstallmentsModalOpen(false)} title="Taxas por Parcela" maxWidth="lg">
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {formData.installment_fees.map((row, index) => (
                        <ListItem
                            key={row.installment_number}
                            title={`${row.installment_number}x parcela`}
                            right={
                                <div className="w-[130px]" onClick={(e) => e.stopPropagation()}>
                                    <PercentageInput
                                        value={row.fee_percent}
                                        onChange={(value) => {
                                            const next = [...formData.installment_fees]
                                            next[index] = { ...row, fee_percent: value }
                                            setFormData({ ...formData, installment_fees: next })
                                        }}
                                    />
                                </div>
                            }
                            className="px-3 py-3"
                        />
                    ))}
                </div>
            </DefaultModal>

            <DefaultModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} title="Nova Conta Financeira">
                <div className="space-y-4 p-2">
                    <Input label="Nome" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Ex: Inter PJ" />
                    <FormDropdown label="Tipo" value={newAccountType} setValue={(v) => setNewAccountType(v as any)} options={ACCOUNT_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
                    <MoneyInput label="Saldo Inicial" value={newAccountInitialBalance} onChange={setNewAccountInitialBalance} />
                    <Button className="w-full" isLoading={isSavingAccount} onClick={handleCreateAccount}>Salvar Conta</Button>
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={showUnsavedModal}
                onClose={() => setShowUnsavedModal(false)}
                onConfirm={() => onBack(false)}
                title="Descartar alterações?"
                description="Você possui alterações não salvas. Deseja realmente sair sem salvar?"
                confirmText="Sair sem salvar"
                variant="danger"
            />

            <SavingStatusModal isOpen={isLoading} text="Salvando método de pagamento..." />
        </FadeIn>
    )
}
