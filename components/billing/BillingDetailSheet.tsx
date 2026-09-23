"use client"

import { useState } from "react"
import { DefaultModal, Badge, Button, ThreeDotsLoader } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { XIcon, PrinterIcon } from "@/lib/icons"
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
            <DefaultModal isOpen={isOpen} onClose={onClose} title="Detalhes da Compra" maxWidth="2xl">
                <div className="space-y-6 pt-2 pb-4">
                    <div className="flex items-center justify-between">
                        <Badge variant={getStatusVariant(purchase.status, purchase.metadata)}>
                            {getStatusLabel(purchase.status, purchase.metadata)}
                        </Badge>
                        <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(purchase.total_amount)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-brand-inactive-text font-medium">Tipo</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{getTypeLabel(purchase.purchase_type)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-brand-inactive-text font-medium">Data</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(purchase.created_at)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-brand-inactive-text font-medium">Parceiro</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{purchase.partner_name || purchase.partner_id}</p>
                        </div>
                        {purchase.description && (
                            <div className="col-span-2">
                                <p className="text-xs text-brand-inactive-text font-medium">Descrição</p>
                                <p className="text-sm text-brand-dark dark:text-dark-heading">{purchase.description}</p>
                            </div>
                        )}
                    </div>

                    {payments.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Pagamentos</h4>
                            <div className="space-y-2">
                                 {payments.map((payment) => {
                                    const pm = paymentMethodFor(payment)
                                    return (
                                    <div key={payment.id} className="flex items-center justify-between p-3 rounded-xl bg-brand-gray dark:bg-dark-border/50">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-3">
                                                <Badge variant={PAYMENT_VARIANTS[payment.status] || "gray"}>
                                                    {getStatusLabel(payment.status)}
                                                </Badge>
                                                <span className="text-xs text-brand-inactive-text">
                                                    {pm.name}
                                                </span>
                                            </div>
                                            {pm.detailsText && (
                                                <span className="text-[10px] text-brand-inactive-text">
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
                    </div>
                )}

                    {(isHydrating && !invoice && payments.length === 0) && (
                        <div className="flex items-center justify-center gap-2 py-6 text-brand-inactive-text">
                            <ThreeDotsLoader className="p-0 h-4" />
                            Carregando detalhes…
                        </div>
                    )}

                    {invoice && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-brand-green/5 border border-brand-green/20">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center">
                                    <PrinterIcon className="w-4 h-4 text-brand-green" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Fatura {invoice.invoice_number}</p>
                                    <p className="text-xs text-brand-inactive-text">Clique para visualizar</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" leftIcon={<PrinterIcon />} onClick={() => onInvoice?.(invoice)}>
                                Visualizar
                            </Button>
                        </div>
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

                        <div className="flex items-center justify-between pt-4 border-t border-brand-border dark:border-dark-border">
                            <Button variant="ghost" leftIcon={<XIcon />} onClick={onClose}>
                                Fechar
                            </Button>
                            <div className="flex items-center gap-2">
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
                        </div>
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
