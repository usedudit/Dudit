"use client"

import React, { useEffect, useState } from "react"
import { DefaultModal, ListItem } from "@/components/reusable"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { formatCurrency } from "@/lib/utils"
import { previewMarketplacePaymentAction } from "@/app/actions/marketplace/payment-preview"

interface VendorPaymentMethodsModalProps {
    isOpen: boolean
    onClose: () => void
    storeName: string
    paymentMethods: any[]
    price: number
    mpConnected?: boolean
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
const getUniqueBrands = (methods: any[]) => Array.from(new Set(methods
    .flatMap(pm => String(pm.card_brand || pm.card_brands || "").split(/[;,]/))
    .map(brand => brand.trim().toLowerCase())
    .filter(Boolean)))

const PaymentPill = ({ icon, label }: { icon?: string; label: string }) => (
    <div className="h-9 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
        {icon && <img src={icon} alt={label} className="h-4 max-w-[52px] object-contain" />}
        <span className="text-[13px] text-brand-dark font-medium">{label}</span>
    </div>
)

const CardBrands = ({ brands }: { brands: string[] }) => {
    if (!brands.length) return null
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {brands.map(brandId => {
                const brand = AVAILABLE_BRANDS.find(item => item.id === brandId)
                if (!brand) return null
                return <PaymentPill key={brandId} icon={brand.image} label={brand.label} />
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
    mpConnected = false,
}: VendorPaymentMethodsModalProps) {
    const paymentMethodsArr = (paymentMethods || []).filter(isPaymentActive)
    const pixMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "pix")
    const cashMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "cash")
    const transferMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "bank_transfer")
    const creditMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "credit_card")
    const debitMethods = paymentMethodsArr.filter((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type) === "debit_card")

    const creditBrands = getUniqueBrands(creditMethods)
    const debitBrands = getUniqueBrands(debitMethods)

    const hasSimplePayments = pixMethods.length > 0 || cashMethods.length > 0 || transferMethods.length > 0
    const hasPaymentSections = hasSimplePayments || creditMethods.length > 0 || debitMethods.length > 0

    const ccMethod = creditMethods[0]
    const maxCcInstallments = ccMethod ? Math.max(1, Number(ccMethod.max_installments || 1)) : 1

    const [installmentOptions, setInstallmentOptions] = useState<any[]>([])
    const [isLoadingInstallments, setIsLoadingInstallments] = useState(false)

    useEffect(() => {
        if (!isOpen || !ccMethod?.id || price <= 0) {
            setInstallmentOptions([])
            return
        }

        let active = true
        setIsLoadingInstallments(true)

        previewMarketplacePaymentAction({
            partnerId: ccMethod.partner_id,
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
    }, [isOpen, ccMethod?.id, price])

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Meios de pagamento de ${storeName}`}
            maxWidth="md"
        >
            <div className="py-2 space-y-6">
                {mpConnected && (
                    <div>
                        <h4 className="text-[14px] font-bold text-brand-dark mb-3">Mercado Pago</h4>
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
                            description="Pague com cartão, Pix ou saldo MP."
                        />
                    </div>
                )}

                {hasPaymentSections ? (
                    <div className="space-y-6">
                        {hasSimplePayments && (
                            <div>
                                <h4 className="text-[14px] font-bold text-brand-dark mb-3">À Vista / Imediato</h4>
                                <div className="flex flex-wrap gap-2.5">
                                    {pixMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Pix.png" label="Pix" />}
                                    {cashMethods.length > 0 && <PaymentPill icon="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" label="Dinheiro" />}
                                    {transferMethods.length > 0 && <PaymentPill label="Transferência bancária" />}
                                </div>
                            </div>
                        )}

                        {debitMethods.length > 0 && (
                            <div>
                                <h4 className="text-[14px] font-bold text-brand-dark mb-1">Cartão de Débito</h4>
                                {debitBrands.length > 0 ? (
                                    <CardBrands brands={debitBrands} />
                                ) : (
                                    <p className="text-[13px] text-brand-inactive-text">Bandeiras não informadas.</p>
                                )}
                            </div>
                        )}

                        {creditMethods.length > 0 && (
                            <div>
                                <h4 className="text-[14px] font-bold text-brand-dark mb-1">Cartão de Crédito</h4>
                                {creditBrands.length > 0 ? (
                                    <CardBrands brands={creditBrands} />
                                ) : (
                                    <p className="text-[13px] text-brand-inactive-text">Bandeiras não informadas.</p>
                                )}

                                {maxCcInstallments > 1 && price > 0 && (
                                    <div className="mt-4">
                                        <span className="text-[13px] font-bold text-brand-dark">Opções de parcelamento</span>

                                        {isLoadingInstallments ? (
                                            <div className="mt-2 py-6 text-center text-xs text-brand-inactive-text select-none">
                                                Carregando opções de parcelamento...
                                            </div>
                                        ) : installmentOptions.length > 0 ? (
                                            <div className="mt-2 border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border select-none">
                                                {installmentOptions.map((opt, idx) => {
                                                    const isEven = idx % 2 === 0
                                                    return (
                                                        <div
                                                            key={opt.installments}
                                                            className={`flex justify-between items-center py-2.5 px-4 text-brand-dark transition-colors ${isEven ? "bg-brand-gray/30" : "bg-white"
                                                                }`}
                                                        >
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-bold text-[13px] sm:text-sm">
                                                                    {opt.installments}x de {formatCurrency(opt.installmentValue)}
                                                                </span>
                                                                {!opt.hasInterest && (
                                                                    <span className="text-[11px] text-brand-inactive-text mt-0.5">
                                                                        Sem Juros
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[13px] sm:text-sm font-semibold text-brand-dark">
                                                                {formatCurrency(opt.finalAmount)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="mt-2 border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border select-none">
                                                {Array.from({ length: maxCcInstallments }, (_, idx) => {
                                                    const count = idx + 1
                                                    const val = price / count
                                                    const isEven = idx % 2 === 0
                                                    return (
                                                        <div
                                                            key={count}
                                                            className={`flex justify-between items-center py-2.5 px-4 text-brand-dark ${isEven ? "bg-brand-gray/30" : "bg-white"
                                                                }`}
                                                        >
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-bold text-[13px] sm:text-sm">
                                                                    {count}x de {formatCurrency(val)}
                                                                </span>
                                                                <span className="text-[11px] text-brand-inactive-text mt-0.5">
                                                                    Sem Juros
                                                                </span>
                                                            </div>
                                                            <span className="text-[13px] sm:text-sm font-semibold text-brand-dark">
                                                                {formatCurrency(price)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : !mpConnected ? (
                    <div className="text-center py-8 text-brand-inactive-text text-sm">
                        Nenhum meio de pagamento cadastrado por este vendedor.
                    </div>
                ) : null}
            </div>
        </DefaultModal>
    )
}
