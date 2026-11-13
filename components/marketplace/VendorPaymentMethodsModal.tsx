"use client"

import React, { useEffect, useMemo, useState } from "react"
import { DefaultModal, ListItem, FormSection } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { formatCurrency } from "@/lib/utils"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"

interface VendorPaymentMethodsModalProps {
    isOpen: boolean
    onClose: () => void
    storeName: string
    paymentMethods: any[]
    price: number
    partnerId?: string
    mpConnected?: boolean
    mpAcceptedPaymentMethods?: {
        credit_card: boolean
        debit_card: boolean
        pix: boolean
        boleto: boolean
        mercado_pago_wallet: boolean
    }
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

const isPaymentActive = (pm: any) => pm.is_active !== false
const getUniqueBrands = (methods: any[]) => {
    const brandSet = new Set(
        methods
            .flatMap(pm => String(pm.card_brand || pm.card_brands || "").split(/[;,]/))
            .map(brand => brand.trim().toLowerCase())
            .filter(Boolean)
    )
    return AVAILABLE_BRANDS.filter(b => brandSet.has(b.id))
}

const PaymentPill = ({ icon, label }: { icon?: string; label: string }) => (
    <div className="h-9 px-3 rounded-[8px] border border-brand-border bg-white dark:bg-dark-surface flex items-center gap-2">
        {icon && <img src={icon} alt={label} className="h-4 max-w-[52px] object-contain" />}
        <span className="text-[13px] text-brand-dark dark:text-dark-heading font-medium">{label}</span>
    </div>
)

const CardBrands = ({ brands }: { brands: typeof AVAILABLE_BRANDS }) => {
    if (!brands.length) return null
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {brands.map(brand => {
                return <PaymentPill key={brand.id} icon={brand.image} label={brand.label} />
            })}
        </div>
    )
}

export function VendorPaymentMethodsModal({
    isOpen,
    onClose,
    storeName,
    paymentMethods = [],
    price,
    partnerId,
    mpConnected = false,
    mpAcceptedPaymentMethods,
}: VendorPaymentMethodsModalProps) {
    const paymentMethodsArr = (paymentMethods || []).filter(isPaymentActive)
    const pixMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "pix")
    const cashMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "cash")
    const transferMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "bank_transfer")
    const creditMethods = useMemo(() => {
        return paymentMethodsArr
            .filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "credit_card")
            .sort((a: any, b: any) => {
                // Prioritize online default payment method
                if (a.is_online_default && !b.is_online_default) return -1
                if (!a.is_online_default && b.is_online_default) return 1
                // Next prioritize default payment method
                if (a.is_default && !b.is_default) return -1
                if (!a.is_default && b.is_default) return 1
                // Priority
                const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0)
                if (priorityDiff !== 0) return priorityDiff
                // Max installments
                return Number(b.max_installments || 1) - Number(a.max_installments || 1)
            })
    }, [paymentMethodsArr])
    const debitMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "debit_card")

    const creditBrands = getUniqueBrands(creditMethods)
    const debitBrands = getUniqueBrands(debitMethods)

    const hasSimplePayments = pixMethods.length > 0 || cashMethods.length > 0 || transferMethods.length > 0
    const hasPaymentSections = hasSimplePayments || creditMethods.length > 0 || debitMethods.length > 0

    const mp = mpAcceptedPaymentMethods
    const mpMethods = mp ? [
        mp.pix && { label: "Pix", icon: "https://img.dudit.com.br/static/icons/payments/Pix.png" },
        mp.boleto && { label: "Boleto" },
        mp.credit_card && { label: "Cartão de Crédito" },
        mp.debit_card && { label: "Cartão de Débito" },
        mp.mercado_pago_wallet && { label: "Saldo MP" },
    ].filter(Boolean) as Array<{ label: string; icon?: string }> : []

    const [selectedCreditMethodId, setSelectedCreditMethodId] = useState<string | null>(null)

    // Select the best/default credit method when opening or when methods list changes
    useEffect(() => {
        if (isOpen && creditMethods.length > 0) {
            setSelectedCreditMethodId((prev) => {
                if (prev && creditMethods.some((m: any) => m.id === prev)) {
                    return prev
                }
                return creditMethods[0].id
            })
        }
    }, [isOpen, creditMethods])

    const ccMethod = useMemo(() => {
        if (!creditMethods.length) return null
        if (selectedCreditMethodId) {
            const found = creditMethods.find((m: any) => m.id === selectedCreditMethodId)
            if (found) return found
        }
        return creditMethods[0]
    }, [creditMethods, selectedCreditMethodId])

    const maxCcInstallments = ccMethod ? Math.max(1, Number(ccMethod.max_installments || 1)) : 1

    const [installmentOptions, setInstallmentOptions] = useState<any[]>([])
    const [isLoadingInstallments, setIsLoadingInstallments] = useState(false)
    const [activeTab, setActiveTab] = useState("payment-methods")

    // Determine if we should show tabs (only if there's a credit card method with installment capability)
    const hasInstallmentCapability = creditMethods.some((m: any) => Number(m.max_installments || 1) > 1)
    const shouldShowTabs = hasInstallmentCapability
    const effectivePartnerId = partnerId || ccMethod?.partner_id

    useEffect(() => {
        if (!isOpen || !ccMethod?.id || !effectivePartnerId || price <= 0) {
            setInstallmentOptions([])
            return
        }

        let active = true
        setIsLoadingInstallments(true)

        previewMarketplacePaymentAction({
            partnerId: effectivePartnerId,
            paymentMethodId: ccMethod.id,
            originalAmount: price,
        })
            .then((res) => {
                if (active && res.success && res.installmentOptions) {
                    setInstallmentOptions(res.installmentOptions)
                }
            })
            .catch((err) => {
                console.error("Error loading installments in modal:", err)
            })
            .finally(() => {
                if (active) setIsLoadingInstallments(false)
            })

        return () => {
            active = false
        }
    }, [isOpen, ccMethod?.id, effectivePartnerId, price])

    const renderPaymentMethodsContent = () => (
        <div className="space-y-6">
            {mpConnected && (
                <FormSection title="Pagamento online">
                    <div className="space-y-3">
                        <ListItem
                            className="!border-none !bg-transparent p-0 cursor-default"
                            icon={
                                <img
                                    src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                    alt="Mercado Pago"
                                    className="w-6 h-6 object-contain shrink-0"
                                />
                            }
                            title="Mercado Pago"
                            description={mpMethods.length > 0 ? mpMethods.map(m => m.label).join(", ") : "Pague com cartão, Pix ou saldo MP."}
                        />
                    </div>
                </FormSection>
            )}

            {hasPaymentSections ? (
                <FormSection title="Pagamento na retirada/entrega">
                    <div className="space-y-5">
                        {hasSimplePayments && (
                            <div>
                                <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-2">À Vista / Imediato</h4>
                                <div className="flex flex-wrap gap-2.5">
                                    {pixMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Pix.png" label="Pix" />}
                                    {cashMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" label="Dinheiro" />}
                                    {transferMethods.length > 0 && <PaymentPill label="Transferência bancária" />}
                                </div>
                            </div>
                        )}

                        {debitMethods.length > 0 && (
                            <div>
                                <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-1">Cartão de Débito</h4>
                                {debitBrands.length > 0 ? (
                                    <CardBrands brands={debitBrands} />
                                ) : (
                                    <p className="text-[13px] text-brand-inactive-text dark:text-dark-body">Bandeiras não informadas.</p>
                                )}
                            </div>
                        )}

                        {creditMethods.length > 0 && (
                            <div>
                                <h4 className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading mb-1">Cartão de Crédito</h4>
                                {creditBrands.length > 0 ? (
                                    <CardBrands brands={creditBrands} />
                                ) : (
                                    <p className="text-[13px] text-brand-inactive-text dark:text-dark-body">Bandeiras não informadas.</p>
                                )}
                            </div>
                        )}
                    </div>
                </FormSection>
            ) : !mpConnected ? (
                <div className="text-center py-8 text-brand-inactive-text dark:text-dark-body text-sm">
                    Nenhum meio de pagamento cadastrado por este vendedor.
                </div>
            ) : null}
        </div>
    )

    const formatInterestPercent = (pct: number) => {
        if (!pct || pct <= 0) return ""
        const formatted = Number(pct.toFixed(2)).toString().replace(".", ",")
        return `(${formatted}% a.m.)`
    }

    const renderInstallmentOptionsContent = () => (
        <div className="space-y-4">
            {creditMethods.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 pb-1">
                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Opção de cartão:</span>
                    {creditMethods.map((m: any) => {
                        const isSelected = ccMethod?.id === m.id
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setSelectedCreditMethodId(m.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                    isSelected
                                        ? "border-brand-green bg-green-50 text-brand-green dark:bg-green-950/40 dark:text-green-400"
                                        : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-body hover:bg-brand-gray/20"
                                }`}
                            >
                                {m.name || "Cartão de Crédito"}
                                {m.is_online_default ? " (Padrão Online)" : ""}
                            </button>
                        )
                    })}
                </div>
            )}

            {creditMethods.length === 0 ? (
                <div className="text-center py-8 text-brand-inactive-text dark:text-dark-body text-sm">
                    Nenhuma opção de parcelamento disponível (sem cartão de crédito configurado).
                </div>
            ) : isLoadingInstallments ? (
                <div className="text-center py-6 text-xs text-brand-inactive-text dark:text-dark-body select-none">
                    Carregando opções de parcelamento...
                </div>
            ) : installmentOptions.length > 0 ? (
                <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border select-none">
                    {installmentOptions.map((opt, idx) => {
                        const isEven = idx % 2 === 0
                        return (
                            <div
                                key={opt.installments}
                                className={`flex justify-between items-center py-2.5 px-4 text-brand-dark dark:text-dark-heading transition-colors ${isEven ? "bg-brand-gray/30 dark:bg-dark-border/30" : "bg-white dark:bg-dark-surface"}`}
                            >
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[13px] sm:text-sm">
                                        {opt.installments}x de {formatCurrency(opt.installmentValue)}
                                    </span>
                                    {opt.hasInterest ? (
                                        <span className="text-[11px] text-brand-green dark:text-green-400 mt-0.5 font-medium">
                                            {opt.interestPercent > 0
                                                ? `Com juros ${formatInterestPercent(opt.interestPercent)}`
                                                : "Com juros"}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Sem Juros
                                        </span>
                                    )}
                                </div>
                                <span className="text-[13px] sm:text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(opt.finalAmount)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            ) : maxCcInstallments > 1 ? (
                // Fallback: show basic installments without interest info
                <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border select-none">
                    {Array.from({ length: maxCcInstallments }, (_, idx) => {
                        const count = idx + 1
                        const val = price / count
                        const isEven = idx % 2 === 0
                        return (
                            <div
                                key={count}
                                className={`flex justify-between items-center py-2.5 px-4 text-brand-dark dark:text-dark-heading ${isEven ? "bg-brand-gray/30 dark:bg-dark-border/30" : "bg-white dark:bg-dark-surface"}`}
                            >
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[13px] sm:text-sm">
                                        {count}x de {formatCurrency(val)}
                                    </span>
                                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                        {count === 1 ? "À vista" : "Consultar juros"}
                                    </span>
                                </div>
                                <span className="text-[13px] sm:text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(price)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-8 text-brand-inactive-text dark:text-dark-body text-sm">
                    Parcelamento não disponível para este meio de pagamento.
                </div>
            )}
        </div>
    )

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Meios de pagamento de ${storeName}`}
            maxWidth="2xl"
        >
            <div className="py-2">
                {shouldShowTabs ? (
                    <>
                        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="payment-methods">
                            <TabsList className="border-b border-brand-border dark:border-dark-border">
                                <TabsTrigger value="payment-methods">Meios de pagamento</TabsTrigger>
                                <TabsTrigger value="installments">Opções de parcelamento</TabsTrigger>
                            </TabsList>
                            <TabsContent value="payment-methods">
                                {renderPaymentMethodsContent()}
                            </TabsContent>
                            <TabsContent value="installments">
                                {renderInstallmentOptionsContent()}
                            </TabsContent>
                        </Tabs>
                    </>
                ) : (
                    // No tabs - just show payment methods (installments not available or not loaded)
                    renderPaymentMethodsContent()
                )}
            </div>
        </DefaultModal>
    )
}