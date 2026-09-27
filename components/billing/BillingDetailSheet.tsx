"use client"

import { useState } from "react"
import { DefaultModal, Badge, Button, ThreeDotsLoader, FormSection, ListItem } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { XIcon, PrinterIcon, FileIcon } from "@/lib/icons"
import { RotateCcw } from "lucide-react"
import { resolvePaymentMethodDetails } from "@/lib/billing/payment-method-helper"
import type { PurchaseWithRelations, BillingInvoice } from "@/lib/billing/types"
import { BillingRefundModal } from "./BillingRefundModal"

interface BillingDetailSheetProps {
    isOpen: boolean
    onClose: () => void
    purchase: PurchaseWithRelations | null
    onInvoice?: (invoice: BillingInvoice) => void
    onCancel?: (purchase: PurchaseWithRelations) => void
    onGenerateInvoice?: () => void
    generateLoading?: boolean
    onRefundSuccess?: (token: string) => void
    isHydrating?: boolean
}

const STATUS_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "purple" | "gray"> = {
    pending: "orange",
    completed: "green",
    failed: "red",
    refunded: "purple",
    cancelled: "gray",
    partially_refunded: "orange",
}

const PAYMENT_VARIANTS: Record<string, "green" | "red" | "orange" | "blue" | "purple" | "gray"> = {
    pending: "orange",
    processing: "blue",
    approved: "green",
    rejected: "red",
    refunded: "purple",
    cancelled: "gray",
    chargeback: "red",
}

function getStatusLabel(status: string, metadata?: any): string {
    if (status === "pending" && metadata?.billing_cycle === "next") {
        return "A pagar"
    }
    if (status === "pending" && metadata?.subscription_status === "past_due") {
        return "Em atraso"
    }
    const labels: Record<string, string> = {
        pending: "Pendente",
        completed: "Pago",
        approved: "Pago",
        failed: "Falhou",
        rejected: "Recusado",
        refunded: "Reembolsado",
        cancelled: "Cancelado",
        partially_refunded: "Reembolso parcial",
        processing: "Processando",
        chargeback: "Chargeback",
    }
    return labels[status] || status
}

function getStatusVariant(status: string, metadata?: any): "green" | "red" | "orange" | "blue" | "purple" | "gray" {
    if (status === "pending" && metadata?.subscription_status === "past_due") {
        return "red"
    }
    return STATUS_VARIANTS[status] || "gray"
}

function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        subscription: "Assinatura",
        addon: "Add-on",
        marketplace_feature: "Funcionalidade Marketplace",
        credit_pack: "Pacote de Créditos",
        service: "Serviço",
        order_payment: "Pagamento de Pedido",
        future: "Futuro",
    }
    return labels[type] || type
}

export function BillingDetailSheet({ isOpen, onClose, purchase, onInvoice, onCancel, onGenerateInvoice, generateLoading, onRefundSuccess, isHydrating }: BillingDetailSheetProps) {
    const [refundModalOpen, setRefundModalOpen] = useState(false)

    if (!purchase) return null

    const payments = purchase.payments || []
    const invoice = purchase.invoice

    const paymentMethodFor = (payment: any) => resolvePaymentMethodDetails(payment, purchase)

    return (
        <>
            <DefaultModal
                isOpen={isOpen}
                onClose={onClose}
                title="Detalhes da Compra"
                maxWidth="2xl"
                footer={
                    <div className="flex justify-end w-full">
                        {purchase.status === "completed" && Number(purchase.total_amount || purchase.amount || 0) > 0 && (
                            <Button
                                variant="outline"
                                leftIcon={<RotateCcw className="w-4 h-4 text-brand-orange" />}
                                onClick={() => setRefundModalOpen(true)}
                            >
                                Solicitar Reembolso
                            </Button>
                        )}
                        {purchase.status === "pending" && onCancel && (
                            <Button
                                variant="destructive"
                                leftIcon={<XIcon />}
                                onClick={() => onCancel(purchase)}
                            >
                                Cancelar compra
                            </Button>
                        )}
                    </div>
                }>
                <div className="space-y-6 pt-2 pb-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-brand-inactive-text font-medium">Tipo</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{getTypeLabel(purchase.purchase_type)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-brand-inactive-text font-medium">Data</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(purchase.created_at)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-brand-inactive-text font-medium">Parceiro</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{purchase.partner_name || purchase.partner_id}</p>
                        </div>
                        {purchase.description && (
                            <div>
                                <p className="text-sm text-brand-inactive-text font-medium">Descrição</p>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{purchase.description}</p>
                            </div>
                        )}
                    </div>

                    {payments.length > 0 && (
                        <FormSection title="Pagamentos" hasSeparator>
                            <div className="space-y-2">
                                {payments.map((payment) => {
                                    const pm = paymentMethodFor(payment)
                                    return (
                                        <div key={payment.id} className="flex items-center justify-between">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-brand-inactive-text">
                                                        {pm.name}
                                                    </span>
                                                    <Badge variant={PAYMENT_VARIANTS[payment.status] || "gray"} className="scale-90 whitespace-nowrap">
                                                        {getStatusLabel(payment.status)}
                                                    </Badge>
                                                </div>
                                                {pm.detailsText && (
                                                    <span className="text-xs text-brand-inactive-text">
                                                        {pm.detailsText}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(payment.amount)}</span>
                                                {payment.paid_at && (
                                                    <p className="text-[11px] text-brand-inactive-text">{formatDate(payment.paid_at)}</p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                }
                                )
                                }
                            </div>
                        </FormSection>
                    )}

                    {(isHydrating && !invoice && payments.length === 0) && (
                        <div className="flex items-center justify-center gap-2 py-6 text-brand-inactive-text">
                            <ThreeDotsLoader className="p-0 h-4" />
                            Carregando detalhes…
                        </div>
                    )}

                    {invoice && (
                        <ListItem
                            icon={FileIcon}
                            title={`Fatura ${invoice.invoice_number}`}
                            description="Sua fatura está disponível"
                            right={
                                <Button variant="link" onClick={() => onInvoice?.(invoice)}>
                                    Imprimir
                                </Button>
                            }
                            className="px-4 py-3"
                        />
                    )}

                    {!invoice && purchase.status === "completed" && onGenerateInvoice && (
                        <Button
                            variant="default"
                            leftIcon={<PrinterIcon />}
                            onClick={onGenerateInvoice}
                            isLoading={generateLoading}
                            disabled={isHydrating}
                        >
                            Gerar Fatura
                        </Button>
                    )}
                </div>
            </DefaultModal>

            <BillingRefundModal
                isOpen={refundModalOpen}
                onClose={() => setRefundModalOpen(false)}
                purchase={purchase}
                partnerId={purchase.partner_id}
                onSuccess={onRefundSuccess}
            />
        </>
    )
}
