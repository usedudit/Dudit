"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
    Button,
    Input,
    Checkbox,
    RadioButton,
    AlertModal,
    SavingStatusModal,
    FormSection,
    FormDropdown,
    DefaultModal,
    MoneyInput,
    PercentageInput,
    ListItem,
    IconPlaceholder,
    ThreeDotsLoader,
} from "@/components/reusable"
import {
    CpfCnpjInput,
    EmailInput,
    PhoneInput,
} from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import {
    createPaymentMethodAction,
    updatePaymentMethodAction,
    getPaymentMethodDetailsAction,
    getPartnerFinanceAccountsForPaymentMethodsAction
} from "@/app/actions/erp/payment-methods"
import { ChevronLeftIcon, SaveIcon, InfoIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"

const AVAILABLE_BRANDS = [
    { id: "visa", name: "Visa", image: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
    { id: "mastercard", name: "Mastercard", image: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" },
    { id: "elo", name: "Elo", image: "https://img.dudit.com.br/static/icons/payments/Elo.png" },
    { id: "american_express", name: "Amex", image: "https://img.dudit.com.br/static/icons/payments/Amex.png" },
    { id: "hipercard", name: "Hipercard", image: "https://img.dudit.com.br/static/icons/payments/Hipercard.png" },
    { id: "diners", name: "Diners", image: "https://img.dudit.com.br/static/icons/payments/Diners.png" },
]

const PIX_KEY_TYPES = [
    { id: "cpf", name: "CPF" },
    { id: "cnpj", name: "CNPJ" },
    { id: "email", name: "E-mail" },
    { id: "phone", name: "Celular" },
    { id: "random", name: "Chave Aleatória" },
]

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {children}
    </div>
)

interface PaymentMethod {
    id: string
    name: string
    type?: string
    payment_type?: string
    is_active: boolean
    is_online_default?: boolean
    fee_percent?: number | null
    fee_fixed?: number | null
    discount_percent?: number | null
    fee_bearer?: "merchant" | "customer"
    card_brand?: string | null
    max_installments?: number | null
    pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
    pix_key?: string | null
    use_partner_pix_data?: boolean
    default_finance_account_id?: string | null
}

interface PaymentMethodEditPageProps {
    partnerId: string
    editingMethod: PaymentMethod | null
    existingMethods?: any[]
    onBack: (shouldReload?: boolean) => void
    embedded?: boolean
}

export function PaymentMethodEditPage({ partnerId, editingMethod, existingMethods = [], onBack, embedded }: PaymentMethodEditPageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)
    const [financeAccounts, setFinanceAccounts] = useState<any[]>([])
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        type: "credit_card",
        is_active: true,
        is_online_default: false,
        fee_percent: 0,
        fee_fixed: 0,
        fee_bearer: "merchant" as "merchant" | "customer",
        discount_percent: 0,
        card_brand: null as string | null,
        max_installments: 1,
        pix_key_type: "cpf" as "cpf" | "cnpj" | "email" | "phone" | "random",
        pix_key: "",
        use_partner_pix_data: false,
        supports_installments: true,
        default_finance_account_id: "" as string,
        installment_fees: [] as { installmentNumber: number; feePercent: number }[],
    })

    const [baselineFormData, setBaselineFormData] = useState<any>(null)

    useEffect(() => {
        const loadAccounts = async () => {
            const res = await getPartnerFinanceAccountsForPaymentMethodsAction(partnerId)
            if (res.success) setFinanceAccounts(res.accounts || [])
        }
        loadAccounts()
    }, [partnerId])

    useEffect(() => {
        const loadDetails = async () => {
            if (!editingMethod) {
                const initial = {
                    name: "",
                    type: "credit_card",
                    is_active: true,
                    is_online_default: false,
                    fee_percent: 0,
                    fee_fixed: 0,
                    fee_bearer: "merchant" as const,
                    discount_percent: 0,
                    card_brand: null,
                    max_installments: 1,
                    pix_key_type: "cpf" as const,
                    pix_key: "",
                    use_partner_pix_data: false,
                    supports_installments: true,
                    default_finance_account_id: "",
                    installment_fees: [],
                }

                // Initial online default check for the default type "credit_card"
                const hasDefault = existingMethods.some(m => (m.type === "credit_card" || m.payment_type === "credit_card") && m.is_online_default)
                initial.is_online_default = !hasDefault

                setFormData(initial)
                setBaselineFormData(JSON.parse(JSON.stringify(initial)))
                return
            }

            setIsLoadingDetails(true)
            try {
                const res = await getPaymentMethodDetailsAction(editingMethod.id)
                if (res.success && res.method) {
                    const m = res.method
                    const initial = {
                        name: m.name || "",
                        type: m.type || m.payment_type || "credit_card",
                        is_active: m.is_active ?? true,
                        is_online_default: m.is_online_default ?? false,
                        fee_percent: Number(m.fee_percent || 0),
                        fee_fixed: Number(m.fee_fixed || 0),
                        fee_bearer: (m.fee_bearer || "merchant") as "merchant" | "customer",
                        discount_percent: Number(m.discount_percent || 0),
                        card_brand: m.card_brand || null,
                        max_installments: Number(m.max_installments || 1),
                        pix_key_type: (m.pix_key_type || "cpf") as any,
                        pix_key: m.pix_key || "",
                        use_partner_pix_data: Boolean(m.use_partner_pix_data),
                        supports_installments: Boolean(m.supports_installments ?? ((m.max_installments || 1) > 1)),
                        default_finance_account_id: m.default_finance_account_id || "",
                        installment_fees: m.installment_fees?.map((f: any) => ({
                            installmentNumber: Number(f.installment_number),
                            feePercent: Number(f.fee_percent)
                        })) || [],
                    }
                    setFormData(initial)
                    setBaselineFormData(JSON.parse(JSON.stringify(initial)))
                }
            } catch (err) {
                notifyError("Erro ao carregar detalhes")
            } finally {
                setIsLoadingDetails(false)
            }
        }
        loadDetails()
    }, [editingMethod]) // eslint-disable-line react-hooks/exhaustive-deps

    const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false)

    const isDirty = useMemo(() => {
        if (!baselineFormData) return false
        return JSON.stringify(formData) !== JSON.stringify(baselineFormData)
    }, [formData, baselineFormData])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const isPix = formData.type === "pix"
    const isCard = formData.type === "credit_card" || formData.type === "debit_card"
    const isCredit = formData.type === "credit_card"

    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    const validate = () => {
        const errors: Record<string, string> = {}
        if (!formData.name.trim()) errors.name = "Nome é obrigatório"
        if (isPix && !formData.use_partner_pix_data && !formData.pix_key.trim()) {
            errors.pix_key = "Chave PIX é obrigatória"
        }
        setFieldErrors(errors)
        return Object.keys(errors).length === 0
    }

    const handleSubmit = async () => {
        if (!validate()) {
            notifyError("Preencha os campos obrigatórios")
            return
        }

        setIsLoading(true)
        try {
            const payload = {
                name: formData.name,
                paymentType: formData.type,
                isActive: formData.is_active,
                isOnlineDefault: formData.is_online_default,
                feePercent: Number(formData.fee_percent || 0),
                feeFixed: Number(formData.fee_fixed || 0),
                feeBearer: formData.fee_bearer || "merchant",
                discountPercent: Number(formData.discount_percent || 0),
                maxInstallments: isCredit ? Number(formData.max_installments || 1) : 1,
                supportsInstallments: isCredit && formData.supports_installments,
                pixKeyType: isPix ? formData.pix_key_type : null,
                pixKey: isPix ? formData.pix_key : null,
                usePartnerPixData: isPix ? formData.use_partner_pix_data : false,
                cardBrand: isCard ? formData.card_brand : null,
                defaultFinanceAccountId: formData.default_finance_account_id || null,
                partnerId: partnerId,
                installmentFees: isCredit && formData.supports_installments ? formData.installment_fees : [],
            }

            let res
            if (editingMethod) {
                res = await updatePaymentMethodAction(editingMethod.id, payload as any)
            } else {
                res = await createPaymentMethodAction(payload as any)
            }

            if (res.success) {
                notifySuccess(editingMethod ? "Método atualizado!" : "Método criado!")
                onBack(true)
            } else {
                notifyError(res.error || "Erro ao salvar")
            }
        } catch (err) {
            notifyError("Erro inesperado ao salvar")
        } finally {
            setIsLoading(false)
        }
    }

    const [isScrolled, setIsScrolled] = useState(false)

    // --- Handlers ---
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => {
        handleNavigation(() => onBack())
    }, [handleNavigation, onBack])

    if (isLoadingDetails) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (embedded) {
        return (
            <>
                <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                        {/* Left Column */}
                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-10">
                            <FormSection title="Informações Gerais">
                                <div className="grid grid-cols-1 gap-6">
                                    <Input
                                        label="Nome do método"
                                        placeholder="Ex: Cartão de Crédito - Loja"
                                        value={formData.name}
                                        onChange={(e) => {
                                            setFormData({ ...formData, name: e.target.value })
                                            if (fieldErrors.name) setFieldErrors(p => { const n = { ...p }; delete n.name; return n })
                                        }}
                                        error={!!fieldErrors.name}
                                        errorMessage={fieldErrors.name}
                                    />

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormDropdown
                                            label="Tipo de método"
                                            placeholder="Selecione o tipo"
                                            value={formData.type}
                                            setValue={(val) => {
                                                const updates: any = { type: val }
                                                if (val === "credit_card") updates.supports_installments = true
                                                else {
                                                    updates.supports_installments = false
                                                    updates.max_installments = 1
                                                }
                                                if (!editingMethod) {
                                                    const hasDefault = existingMethods.some(m => (m.type === val || m.payment_type === val) && m.is_online_default)
                                                    updates.is_online_default = !hasDefault
                                                }
                                                setFormData({ ...formData, ...updates })
                                            }}
                                            options={[
                                                { value: "credit_card", label: "Crédito" },
                                                { value: "debit_card", label: "Débito" },
                                                { value: "pix", label: "Pix" },
                                                { value: "bank_transfer", label: "Transferência Bancária" },
                                            ]}
                                        />

                                        <FormDropdown
                                            label="Conta Financeira (Opcional)"
                                            placeholder="Selecione uma conta"
                                            value={formData.default_finance_account_id}
                                            setValue={(val) => setFormData({ ...formData, default_finance_account_id: val })}
                                            options={[
                                                { value: "", label: "Nenhuma (não vincular)" },
                                                ...financeAccounts.map(a => ({ value: a.id, label: a.name }))
                                            ]}
                                        />
                                    </div>
                                </div>
                            </FormSection>

                            {isCard && (
                                <FormSection hasSeparator title="Configurações do Cartão">
                                    <div className="grid grid-cols-1 gap-6">
                                        {isCredit && (
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <FormDropdown
                                                        label="Modo de Pagamento"
                                                        placeholder="Selecione o modo"
                                                        value={formData.supports_installments ? "installments" : "single"}
                                                        setValue={(val) => {
                                                            const isInstallments = val === "installments"
                                                            setFormData({
                                                                ...formData,
                                                                supports_installments: isInstallments,
                                                                max_installments: isInstallments ? formData.max_installments : 1
                                                            })
                                                        }}
                                                        options={[
                                                            { value: "single", label: "Pagamento Único" },
                                                            { value: "installments", label: "Permitir Parcelamento" },
                                                        ]} />

                                                    {formData.supports_installments && (
                                                        <FormDropdown
                                                            label="Parcelamento Máximo"
                                                            placeholder="Selecione o limite"
                                                            value={String(formData.max_installments)}
                                                            setValue={(val) => {
                                                                const n = Number(val)
                                                                setFormData(prev => {
                                                                    const newFees = [...prev.installment_fees].filter(f => f.installmentNumber <= n)
                                                                    for (let i = 1; i <= n; i++) {
                                                                        if (!newFees.find(f => f.installmentNumber === i)) {
                                                                            newFees.push({ installmentNumber: i, feePercent: 0 })
                                                                        }
                                                                    }
                                                                    newFees.sort((a, b) => a.installmentNumber - b.installmentNumber)
                                                                    return { ...prev, max_installments: n, installment_fees: newFees }
                                                                })
                                                            }}
                                                            options={[
                                                                { value: "1", label: "1x" },
                                                                { value: "2", label: "2x" },
                                                                { value: "3", label: "3x" },
                                                                { value: "4", label: "4x" },
                                                                { value: "6", label: "6x" },
                                                                { value: "10", label: "10x" },
                                                                { value: "12", label: "12x" },
                                                            ]}
                                                        />
                                                    )}
                                                </div>

                                                {formData.supports_installments && formData.max_installments > 1 && (
                                                    <div className="flex items-center justify-between py-2">
                                                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Taxas por parcela</label>
                                                        <Button variant="link" onClick={() => setIsInstallmentModalOpen(true)}>Configurar</Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Bandeiras aceitas</label>
                                            <div className="flex flex-wrap gap-3">
                                                {AVAILABLE_BRANDS.map((brand) => (
                                                    <button
                                                        key={brand.id}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, card_brand: formData.card_brand === brand.id ? null : brand.id })}
                                                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${formData.card_brand === brand.id ? "border-brand-green bg-brand-green/5" : "border-brand-border dark:border-dark-border hover:border-brand-green/50"}`}
                                                    >
                                                        <img src={brand.image} alt={brand.name} className="w-10 h-7 object-contain" />
                                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading leading-tight text-center">{brand.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </FormSection>
                            )}

                            {isPix && (
                                <FormSection hasSeparator title="Chave PIX">
                                    <div className="grid grid-cols-1 gap-6">
                                        <FormDropdown
                                            label="Tipo de chave"
                                            placeholder="Selecione o tipo"
                                            value={formData.pix_key_type}
                                            setValue={(val) => setFormData({ ...formData, pix_key_type: val as any })}
                                            options={PIX_KEY_TYPES.map(t => ({ value: t.id, label: t.name }))}
                                        />
                                        {!formData.use_partner_pix_data && (
                                            <>
                                                {formData.pix_key_type === "cpf" && (
                                                    <CpfCnpjInput
                                                        label="Chave PIX (CPF)"
                                                        placeholder="000.000.000-00"
                                                        value={formData.pix_key}
                                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                        name="pix_key"
                                                        error={!!fieldErrors.pix_key}
                                                        errorMessage={fieldErrors.pix_key}
                                                    />
                                                )}
                                                {formData.pix_key_type === "cnpj" && (
                                                    <CpfCnpjInput
                                                        label="Chave PIX (CNPJ)"
                                                        placeholder="00.000.000/0000-00"
                                                        value={formData.pix_key}
                                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                        name="pix_key_cnpj"
                                                        error={!!fieldErrors.pix_key}
                                                        errorMessage={fieldErrors.pix_key}
                                                    />
                                                )}
                                                {formData.pix_key_type === "email" && (
                                                    <EmailInput
                                                        label="Chave PIX (E-mail)"
                                                        placeholder="exemplo@email.com"
                                                        value={formData.pix_key}
                                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                        error={!!fieldErrors.pix_key}
                                                        errorMessage={fieldErrors.pix_key}
                                                    />
                                                )}
                                                {formData.pix_key_type === "phone" && (
                                                    <PhoneInput
                                                        label="Chave PIX (Celular)"
                                                        placeholder="(00) 00000-0000"
                                                        value={formData.pix_key}
                                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                        error={!!fieldErrors.pix_key}
                                                        errorMessage={fieldErrors.pix_key}
                                                    />
                                                )}
                                                {formData.pix_key_type === "random" && (
                                                    <Input
                                                        label="Chave PIX (Aleatória)"
                                                        placeholder="123e4567-e89b-12d3-a456-426614174000"
                                                        value={formData.pix_key}
                                                        onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                        error={!!fieldErrors.pix_key}
                                                        errorMessage={fieldErrors.pix_key}
                                                    />
                                                )}
                                            </>
                                        )}
                                        {formData.use_partner_pix_data && (
                                            <div className="bg-brand-gray/20 dark:bg-dark-border/20 p-4 rounded-xl border border-dashed border-brand-border dark:border-dark-border">
                                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">Usando dados PIX padrão do parceiro</p>
                                                <p className="text-xs text-brand-inactive-text mt-1">A chave PIX cadastrada nos dados do negócio será utilizada.</p>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                checked={formData.use_partner_pix_data}
                                                onChange={(checked) => setFormData({ ...formData, use_partner_pix_data: checked })}
                                            />
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Usar chave PIX do parceiro</span>
                                        </div>
                                        <p className="text-[11px] text-brand-inactive-text mt-2 bg-brand-gray/20 dark:bg-dark-border/20 p-3 rounded-lg border border-dashed border-brand-border dark:border-dark-border">
                                            Sua chave é armazenada com criptografia de ponta a ponta para sua segurança.
                                        </p>
                                    </div>
                                </FormSection>
                            )}
                        </div>

                        {/* Right Column */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                            <SidebarCard hasTopStrip>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Taxas e Custos</h3>
                                <div className="grid grid-cols-1 gap-6">
                                    <FormDropdown
                                        label="Quem paga a taxa?"
                                        value={formData.fee_bearer}
                                        setValue={(val: any) => setFormData({ ...formData, fee_bearer: val })}
                                        options={[
                                            { value: "merchant", label: "Empresa (absorve)" },
                                            { value: "customer", label: "Cliente (acrescenta no valor)" },
                                        ]}
                                    />
                                    <PercentageInput
                                        label="Taxa Administrativa (%)"
                                        value={formData.fee_percent}
                                        onChange={(value) => setFormData({ ...formData, fee_percent: value })}
                                        suffix="%"
                                    />
                                    <MoneyInput
                                        label="Taxa Fixa por Venda (R$)"
                                        value={formData.fee_fixed}
                                        onChange={(value) => setFormData({ ...formData, fee_fixed: value })}
                                        prefix="R$"
                                    />
                                    <PercentageInput
                                        label="Desconto (%)"
                                        value={formData.discount_percent}
                                        onChange={(value) => setFormData({ ...formData, discount_percent: value })}
                                        suffix="%"
                                    />
                                </div>
                            </SidebarCard>

                            <SidebarCard>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Preferências</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Ativo</p>
                                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Disponível para seleção nas vendas</p>
                                        </div>
                                        <Checkbox
                                            checked={formData.is_active}
                                            disabled={formData.type === "cash"}
                                            onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Padrão Online</p>
                                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pré-selecionado na vitrine do marketplace</p>
                                        </div>
                                        <Checkbox
                                            checked={formData.is_online_default}
                                            onChange={(checked) => setFormData({ ...formData, is_online_default: checked })}
                                        />
                                    </div>
                                </div>
                            </SidebarCard>
                        </div>
                    </div>
                </div>

                <SavingStatusModal isOpen={isLoading} text="Salvando..." />

                {showConfirmDialog && (
                    <AlertModal
                        isOpen={showConfirmDialog}
                        onClose={cancelNavigation}
                        onConfirm={confirmNavigation}
                        title="Sair sem salvar?"
                        description="Você tem alterações no método de pagamento que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}

                <DefaultModal
                    isOpen={isInstallmentModalOpen}
                    onClose={() => setIsInstallmentModalOpen(false)}
                    title="Taxas por Parcela"
                    maxWidth="md"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-brand-inactive-text">
                            Defina a taxa administrativa (em %) que será cobrada para cada quantidade de parcelas.
                        </p>
                        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
                            {Array.from({ length: formData.max_installments }).map((_, i) => {
                                const installment = i + 1;
                                const fee = formData.installment_fees.find(f => f.installmentNumber === installment)?.feePercent || 0;
                                return (
                                    <div key={installment} className="flex items-center justify-between gap-4">
                                        <div className="w-16 font-bold text-brand-dark dark:text-dark-heading">{installment}x</div>
                                        <div className="flex-1">
                                            <Input
                                                type="number"
                                                value={fee}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setFormData(prev => {
                                                        const newFees = [...prev.installment_fees];
                                                        const index = newFees.findIndex(f => f.installmentNumber === installment);
                                                        if (index >= 0) {
                                                            newFees[index].feePercent = val;
                                                        } else {
                                                            newFees.push({ installmentNumber: installment, feePercent: val });
                                                        }
                                                        newFees.sort((a, b) => a.installmentNumber - b.installmentNumber);
                                                        return { ...prev, installment_fees: newFees };
                                                    })
                                                }}
                                                suffix="%"
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="pt-4 flex justify-end gap-3">
                            <Button onClick={() => setIsInstallmentModalOpen(false)}>
                                Concluir
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            </>
        )
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        {editingMethod ? "Editar método de pagamento" : "Novo método de pagamento"}
                                    </h1>
                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {editingMethod ? `Configurando ${formData.name}` : "Configure um novo meio de pagamento para sua loja."}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleSubmit} disabled={isLoading} leftIcon={<SaveIcon size={18} />}>
                                        {isLoading ? "Salvando..." : "Salvar"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto no-scrollbar pb-24 md:pb-8">
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">

                                {/* Left Column */}
                                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-10">
                                    <FormSection title="Informações Gerais">
                                        <div className="grid grid-cols-1 gap-6">
                                            <Input
                                                label="Nome do método"
                                                placeholder="Ex: Cartão de Crédito - Loja"
                                                value={formData.name}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, name: e.target.value })
                                                    if (fieldErrors.name) setFieldErrors(p => { const n = { ...p }; delete n.name; return n })
                                                }}
                                                error={!!fieldErrors.name}
                                                errorMessage={fieldErrors.name}
                                            />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormDropdown
                                                    label="Tipo de método"
                                                    placeholder="Selecione o tipo"
                                                    value={formData.type}
                                                    setValue={(val) => {
                                                        const updates: any = { type: val }
                                                        if (val === "credit_card") updates.supports_installments = true
                                                        else {
                                                            updates.supports_installments = false
                                                            updates.max_installments = 1
                                                        }

                                                        // Online default logic for new methods
                                                        if (!editingMethod) {
                                                            const hasDefault = existingMethods.some(m => (m.type === val || m.payment_type === val) && m.is_online_default)
                                                            updates.is_online_default = !hasDefault
                                                        }

                                                        setFormData({ ...formData, ...updates })
                                                    }}
                                                    options={[
                                                        { value: "credit_card", label: "Crédito" },
                                                        { value: "debit_card", label: "Débito" },
                                                        { value: "pix", label: "Pix" },
                                                        { value: "bank_transfer", label: "Transferência Bancária" },
                                                    ]}
                                                />

                                                <FormDropdown
                                                    label="Conta Financeira (Opcional)"
                                                    placeholder="Selecione uma conta"
                                                    value={formData.default_finance_account_id}
                                                    setValue={(val) => setFormData({ ...formData, default_finance_account_id: val })}
                                                    options={[
                                                        { value: "", label: "Nenhuma (não vincular)" },
                                                        ...financeAccounts.map(a => ({ value: a.id, label: a.name }))
                                                    ]}
                                                />
                                            </div>
                                        </div>
                                    </FormSection>

                                    {isCard && (
                                        <FormSection hasSeparator title="Configurações do Cartão">
                                            <div className="grid grid-cols-1 gap-6">
                                                {isCredit && (
                                                    <div className="space-y-6">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <FormDropdown
                                                                label="Modo de Pagamento"
                                                                placeholder="Selecione o modo"
                                                                value={formData.supports_installments ? "installments" : "single"}
                                                                setValue={(val) => {
                                                                    const isInstallments = val === "installments"
                                                                    setFormData({
                                                                        ...formData,
                                                                        supports_installments: isInstallments,
                                                                        max_installments: isInstallments ? formData.max_installments : 1
                                                                    })
                                                                }}
                                                                options={[
                                                                    { value: "single", label: "Pagamento Único" },
                                                                    { value: "installments", label: "Permitir Parcelamento" },
                                                                ]} />

                                                            {formData.supports_installments && (
                                                                <FormDropdown
                                                                    label="Parcelamento Máximo"
                                                                    placeholder="Selecione o limite"
                                                                    value={String(formData.max_installments)}
                                                                    setValue={(val) => {
                                                                        const n = Number(val)
                                                                        setFormData(prev => {
                                                                            const newFees = [...prev.installment_fees].filter(f => f.installmentNumber <= n)
                                                                            for (let i = 1; i <= n; i++) {
                                                                                if (!newFees.find(f => f.installmentNumber === i)) {
                                                                                    newFees.push({ installmentNumber: i, feePercent: 0 })
                                                                                }
                                                                            }
                                                                            newFees.sort((a, b) => a.installmentNumber - b.installmentNumber)
                                                                            return { ...prev, max_installments: n, installment_fees: newFees }
                                                                        })
                                                                    }}
                                                                    options={[
                                                                        { value: "1", label: "1x" },
                                                                        { value: "2", label: "2x" },
                                                                        { value: "3", label: "3x" },
                                                                        { value: "4", label: "4x" },
                                                                        { value: "6", label: "6x" },
                                                                        { value: "10", label: "10x" },
                                                                        { value: "12", label: "12x" },
                                                                        { value: "18", label: "18x" },
                                                                        { value: "24", label: "24x" },
                                                                    ]} />
                                                            )}
                                                        </div>

                                                        {formData.supports_installments && (
                                                            <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading">Taxas por Parcela</label>
                                                                    {formData.installment_fees.length > 0 && formData.installment_fees.some(f => f.feePercent > 0) && (
                                                                        <Button variant="link" size="sm" onClick={() => setIsInstallmentModalOpen(true)} className="p-0 h-auto font-bold text-brand-green">
                                                                            Configurar Taxas
                                                                        </Button>
                                                                    )}
                                                                </div>

                                                                {formData.installment_fees.length === 0 || !formData.installment_fees.some(f => f.feePercent > 0) ? (
                                                                    <div className="flex flex-col items-center text-center">
                                                                        <IconPlaceholder
                                                                            icon={InfoIcon}
                                                                            containerSize="w-16 h-16"
                                                                            iconSize="w-8 h-8"
                                                                            title="Taxas não configuradas"
                                                                            subtitle="Você ainda não definiu as taxas para cada parcela deste método."
                                                                            itemButton={{
                                                                                text: "Configurar Taxas",
                                                                                action: () => setIsInstallmentModalOpen(true),
                                                                                variant: "outline"
                                                                            }} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex overflow-x-auto no-scrollbar gap-3 pb-2 -mx-1 px-1">
                                                                        {formData.installment_fees.map((fee) => (
                                                                            <div
                                                                                key={fee.installmentNumber}
                                                                                className="flex-shrink-0 bg-brand-gray/30 dark:bg-dark-surface/50 border border-brand-border dark:border-dark-border rounded-2xl p-3 w-[120px] flex flex-col items-center justify-center gap-3 transition-all hover:border-brand-green/50"
                                                                            >
                                                                                <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{fee.installmentNumber}x</span>
                                                                                <div className={`flex items-center justify-center px-2 py-1.5 rounded-full border w-full ${fee.feePercent > 0 ? 'bg-brand-green/10 border-brand-green/20 dark:bg-brand-green/5 dark:border-brand-green/10' : 'bg-white dark:bg-dark-background border-brand-border/50 dark:border-dark-border/50'}`}>
                                                                                    <span className={`text-[11px] font-bold whitespace-nowrap ${fee.feePercent > 0 ? 'text-brand-green' : 'text-brand-inactive-text'}`}>
                                                                                        {fee.feePercent > 0 ? `${fee.feePercent}% juros` : 'Sem juros'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="space-y-4">
                                                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading">Bandeiras Aceitas</label>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {AVAILABLE_BRANDS.map((brand) => (
                                                            <ListItem
                                                                key={brand.id}
                                                                title={brand.name}
                                                                left={<img src={brand.image} alt={brand.name} className="w-5 h-5 object-contain opacity-80" />}
                                                                right={<Checkbox checked={!!formData.card_brand?.includes(brand.id)} onChange={() => { }} />}
                                                                onClick={() => {
                                                                    const current = formData.card_brand ? formData.card_brand.split(",") : []
                                                                    const next = current.includes(brand.id)
                                                                        ? current.filter((b) => b !== brand.id)
                                                                        : [...current, brand.id]
                                                                    setFormData({ ...formData, card_brand: next.join(",") || null })
                                                                }}
                                                                className="px-4 py-3" />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </FormSection>
                                    )}

                                    {isPix && (
                                        <FormSection hasSeparator title="Configuração de Chave PIX">
                                            <div className="space-y-6">
                                                <div className="bg-brand-gray/30 dark:bg-dark-surface/50 p-4 rounded-2xl border border-brand-border dark:border-dark-border flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Importar da Empresa</p>
                                                        <p className="text-xs text-brand-inactive-text">Usa a chave já cadastrada no perfil da loja.</p>
                                                    </div>
                                                    <Checkbox
                                                        checked={formData.use_partner_pix_data}
                                                        onChange={(checked) => setFormData({ ...formData, use_partner_pix_data: checked })}
                                                    />
                                                </div>

                                                {!formData.use_partner_pix_data && (
                                                    <div className="grid grid-cols-1 gap-8">
                                                        <div>
                                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Tipo de Chave</label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {PIX_KEY_TYPES.map((type) => (
                                                                    <RadioButton
                                                                        key={type.id}
                                                                        name="pixKeyType"
                                                                        value={type.id}
                                                                        checked={formData.pix_key_type === type.id}
                                                                        onChange={() => setFormData({ ...formData, pix_key_type: type.id as any, pix_key: "" })}
                                                                        label={type.name}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            {formData.pix_key_type === "cpf" || formData.pix_key_type === "cnpj" ? (
                                                                <CpfCnpjInput
                                                                    label={`Chave ${formData.pix_key_type === "cpf" ? "CPF" : "CNPJ"}`}
                                                                    value={formData.pix_key}
                                                                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                                    error={!!fieldErrors.pix_key}
                                                                    errorMessage={fieldErrors.pix_key}
                                                                />
                                                            ) : formData.pix_key_type === "email" ? (
                                                                <EmailInput
                                                                    label="Chave E-mail"
                                                                    value={formData.pix_key}
                                                                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                                    error={!!fieldErrors.pix_key}
                                                                    errorMessage={fieldErrors.pix_key}
                                                                />
                                                            ) : formData.pix_key_type === "phone" ? (
                                                                <PhoneInput
                                                                    label="Chave Celular"
                                                                    value={formData.pix_key}
                                                                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                                    error={!!fieldErrors.pix_key}
                                                                    errorMessage={fieldErrors.pix_key}
                                                                />
                                                            ) : (
                                                                <Input
                                                                    label="Chave Aleatória"
                                                                    placeholder="Digite a chave..."
                                                                    value={formData.pix_key}
                                                                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                                                                    error={!!fieldErrors.pix_key}
                                                                    errorMessage={fieldErrors.pix_key}
                                                                />
                                                            )}
                                                            <p className="text-[11px] text-brand-inactive-text mt-3 bg-brand-gray/20 dark:bg-dark-border/20 p-3 rounded-lg border border-dashed border-brand-border dark:border-dark-border">
                                                                Sua chave é armazenada com criptografia de ponta a ponta para sua segurança.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </FormSection>
                                    )}
                                </div>

                                {/* Right Column */}
                                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                    <SidebarCard hasTopStrip>
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Taxas e Custos</h3>
                                        <div className="grid grid-cols-1 gap-6">
                                            <FormDropdown
                                                label="Quem paga a taxa?"
                                                value={formData.fee_bearer}
                                                setValue={(val: any) => setFormData({ ...formData, fee_bearer: val })}
                                                options={[
                                                    { value: "merchant", label: "Empresa (absorve)" },
                                                    { value: "customer", label: "Cliente (acrescenta no valor)" },
                                                ]}
                                            />
                                            <PercentageInput
                                                label="Taxa Administrativa (%)"
                                                value={formData.fee_percent}
                                                onChange={(value) => setFormData({ ...formData, fee_percent: value })}
                                                suffix="%"
                                            />
                                            <MoneyInput
                                                label="Taxa Fixa por Venda (R$)"
                                                value={formData.fee_fixed}
                                                onChange={(value) => setFormData({ ...formData, fee_fixed: value })}
                                                prefix="R$"
                                            />
                                            <PercentageInput
                                                label="Desconto (%)"
                                                value={formData.discount_percent}
                                                onChange={(value) => setFormData({ ...formData, discount_percent: value })}
                                                suffix="%"
                                            />
                                        </div>
                                    </SidebarCard>

                                    <SidebarCard>
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Preferências</h3>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Ativo</p>
                                                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Disponível para seleção nas vendas</p>
                                                </div>
                                                <Checkbox
                                                    checked={formData.is_active}
                                                    disabled={formData.type === "cash"}
                                                    onChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Padrão Online</p>
                                                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pré-selecionado na vitrine do marketplace</p>
                                                </div>
                                                <Checkbox
                                                    checked={formData.is_online_default}
                                                    onChange={(checked) => setFormData({ ...formData, is_online_default: checked })}
                                                />
                                            </div>
                                        </div>
                                    </SidebarCard>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button variant="outline" onClick={handleBack} className="flex-1 h-12" disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} className="flex-1 h-12" disabled={isLoading}>
                        Salvar
                    </Button>
                </div>

                <SavingStatusModal isOpen={isLoading} text="Salvando..." />

                {showConfirmDialog && (
                    <AlertModal
                        isOpen={showConfirmDialog}
                        onClose={cancelNavigation}
                        onConfirm={confirmNavigation}
                        title="Sair sem salvar?"
                        description="Você tem alterações no método de pagamento que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}

                <DefaultModal
                    isOpen={isInstallmentModalOpen}
                    onClose={() => setIsInstallmentModalOpen(false)}
                    title="Taxas por Parcela"
                    maxWidth="md"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-brand-inactive-text">
                            Defina a taxa administrativa (em %) que será cobrada para cada quantidade de parcelas.
                        </p>
                        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
                            {Array.from({ length: formData.max_installments }).map((_, i) => {
                                const installment = i + 1;
                                const fee = formData.installment_fees.find(f => f.installmentNumber === installment)?.feePercent || 0;
                                return (
                                    <div key={installment} className="flex items-center justify-between gap-4">
                                        <div className="w-16 font-bold text-brand-dark dark:text-dark-heading">{installment}x</div>
                                        <div className="flex-1">
                                            <Input
                                                type="number"
                                                value={fee}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setFormData(prev => {
                                                        const newFees = [...prev.installment_fees];
                                                        const index = newFees.findIndex(f => f.installmentNumber === installment);
                                                        if (index >= 0) {
                                                            newFees[index].feePercent = val;
                                                        } else {
                                                            newFees.push({ installmentNumber: installment, feePercent: val });
                                                        }
                                                        newFees.sort((a, b) => a.installmentNumber - b.installmentNumber);
                                                        return { ...prev, installment_fees: newFees };
                                                    })
                                                }}
                                                suffix="%"
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="pt-4 flex justify-end gap-3">
                            <Button onClick={() => setIsInstallmentModalOpen(false)}>
                                Concluir
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            </div>
        </FadeIn>
    )
}
