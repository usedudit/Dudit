"use client"

import { formatCurrency } from "@/lib/utils"
import {
    QUOTE_PREVIEW_PRIMARY_COLOR,
    QUOTE_PREVIEW_SECONDARY_COLOR,
} from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import type { TransactionDetailPayload } from "@/app/actions/erp/transactions"
import {
    ReceiptA4Footer,
    ReceiptA4StoreData,
} from "@/components/erp/orders/receipt/ReceiptComponents"

const TYPE_LABELS: Record<string, string> = {
    income: "Entrada",
    expense: "Saída",
    transfer: "Transferência",
    adjustment: "Ajuste de saldo",
    refund: "Estorno",
}

const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    overdue: "Atrasado",
}

type TransactionReceiptA4PreviewProps = {
    detail: TransactionDetailPayload
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    partnerAvatar?: string
    primaryColor?: string
    secondaryColor?: string
    printMode?: boolean
}

export default function TransactionReceiptA4Preview({
    detail,
    partnerHeader,
    partnerName,
    partnerAvatar,
    primaryColor,
    secondaryColor,
    printMode = false,
}: TransactionReceiptA4PreviewProps) {
    const primary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    const secondary = secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR
    const isOut = detail.ledgerDirection === "out"
    const installments = detail.installmentBreakdown || []
    const items = detail.items || []

    const contactAddress = detail.contactCard?.address
        ? [
            detail.contactCard.address.street,
            detail.contactCard.address.number,
            detail.contactCard.address.complement,
            detail.contactCard.address.neighborhood,
            detail.contactCard.address.city,
            detail.contactCard.address.state,
            detail.contactCard.address.zipCode,
        ].filter(Boolean).join(", ")
        : null

    const transactionId = detail.id ? detail.id.slice(0, 8).toUpperCase() : ""

    return (
        <div className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "sale-receipt-a4-print" : "md:border-l border-brand-border dark:border-dark-border"}`}>
            <div className={printMode
                ? "w-full flex flex-col items-center p-0"
                : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8 absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border"
            }>
                <div className="w-[210mm] min-w-[210mm] shrink-0 bg-white text-[#113833] shadow-md overflow-hidden relative font-sans rounded-sm min-h-[297mm] flex flex-col pdf-print-page">
                    {/* HEADER */}
                    <div
                        className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] shrink-0"
                        style={{ backgroundColor: primary }}
                    >
                        <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180">
                            <div className="flex flex-col gap-3">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="w-14 h-24 rounded-full"
                                        style={{ backgroundColor: secondary }}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-col gap-3 -mt-12">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={`b-${i}`}
                                        className="w-14 h-24 rounded-full"
                                        style={{ backgroundColor: secondary }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-6">
                                {partnerAvatar && !partnerAvatar.includes("Placeholder.png") ? (
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white shrink-0">
                                        <img src={partnerAvatar} className="w-full h-full object-cover" alt="Logo" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[15px] font-bold text-black shrink-0">
                                        {partnerName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span className="text-white font-bold text-sm">{partnerName}</span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-medium text-white">COMPROVANTE DE TRANSAÇÃO</h1>
                                <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                                    Transação #{transactionId}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Transaction info grid */}
                    <div className="px-8 py-6">
                        <div className="grid grid-cols-4 gap-4 border-b border-gray-100 pb-6 w-full">
                            <div className="flex flex-col">
                                <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                    Tipo
                                </span>
                                <span className="font-bold text-sm text-brand-dark">
                                    {TYPE_LABELS[detail.transactionType] || detail.typeBannerLabel}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                    Status
                                </span>
                                <span className="font-bold text-sm text-brand-dark">{detail.statusLabel}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                    Data
                                </span>
                                <span className="font-bold text-sm text-brand-dark">{detail.paymentDateLine || "-"}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                    Responsável
                                </span>
                                <span className="font-bold text-sm text-brand-dark truncate">{detail.creatorName}</span>
                            </div>
                        </div>
                    </div>

                    <ReceiptA4StoreData
                        partnerHeader={partnerHeader}
                        partnerName={partnerName}
                        customerName={detail.contactCard?.name}
                        customerPhone={detail.contactCard?.phone}
                        customerAddress={contactAddress}
                    />

                    {/* Details */}
                    <div className="px-8 pb-4">
                        <h3 className="font-bold text-sm text-[#113833] mb-3">Detalhes da transação</h3>
                        <div className="bg-brand-gray/40 p-5 rounded-lg text-xs text-black space-y-2">
                            <div className="flex justify-between gap-6">
                                <span className="text-gray-500 font-medium shrink-0">Descrição</span>
                                <span className="font-bold text-right break-words">{detail.headerTitle}</span>
                            </div>
                            <div className="flex justify-between gap-6">
                                <span className="text-gray-500 font-medium shrink-0">Categoria</span>
                                <span className="font-bold text-right">
                                    {detail.categoryLine}
                                    {detail.subcategoryLine ? ` / ${detail.subcategoryLine}` : ""}
                                </span>
                            </div>
                            {detail.accountLine && (
                                <div className="flex justify-between gap-6">
                                    <span className="text-gray-500 font-medium shrink-0">Conta</span>
                                    <span className="font-bold text-right">{detail.accountLine}</span>
                                </div>
                            )}
                            {detail.paymentMethodSubtitle && (
                                <div className="flex justify-between gap-6">
                                    <span className="text-gray-500 font-medium shrink-0">Forma de pagamento</span>
                                    <span className="font-bold text-right">{detail.paymentMethodSubtitle}</span>
                                </div>
                            )}
                            {detail.dueDateLine && (
                                <div className="flex justify-between gap-6">
                                    <span className="text-gray-500 font-medium shrink-0">Vencimento</span>
                                    <span className="font-bold text-right">{detail.dueDateLine}</span>
                                </div>
                            )}
                            <div className="flex justify-between gap-6">
                                <span className="text-gray-500 font-medium shrink-0">Origem</span>
                                <span className="font-bold text-right">{detail.originLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Items */}
                    {items.length > 0 && (
                        <div className="px-8 pb-4">
                            <h3 className="font-bold text-sm text-[#113833] mb-3">Itens</h3>
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                            Descrição
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">
                                            Qtd
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">
                                            Valor unit.
                                        </th>
                                        <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">
                                            Total
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={item.id || idx} className="bg-white">
                                            <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                <span className="font-bold text-[13px] text-black block truncate max-w-[300px]">
                                                    {item.title}
                                                </span>
                                                {item.sku && <span className="text-[10px] text-gray-400 block">SKU: {item.sku}</span>}
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                <span className="text-[13px] font-medium text-gray-600">{item.quantity}</span>
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                <span className="text-[13px] font-medium text-gray-600">{formatCurrency(item.unitPrice)}</span>
                                            </td>
                                            <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                <span className="text-[13px] font-bold text-black">{formatCurrency(item.lineTotal)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Installments */}
                    {installments.length > 0 && (
                        <div className="px-8 pb-4">
                            <h3 className="font-bold text-sm text-[#113833] mb-3">Parcelas</h3>
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                            Parcela
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                            Vencimento
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-right">
                                            Valor
                                        </th>
                                        <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 text-center">
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {installments.map((row) => (
                                        <tr key={row.id} className="bg-white">
                                            <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                <span className="font-bold text-[13px] text-black">
                                                    {String(row.installmentNumber).padStart(2, "0")}/{String(row.totalCount).padStart(2, "0")}
                                                </span>
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50">
                                                <span className="text-[13px] font-medium text-gray-600">{row.dueDate || "-"}</span>
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                <span className="text-[13px] font-bold text-black">{formatCurrency(row.originalAmount)}</span>
                                            </td>
                                            <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-center">
                                                <span className="text-[11px] font-bold uppercase text-gray-500">
                                                    {INSTALLMENT_STATUS_LABELS[row.status] || row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Notes */}
                    {detail.notesLine && (
                        <div className="px-8 mt-2">
                            <div className="bg-brand-gray/40 p-4 rounded-lg text-xs text-black">
                                <p className="font-bold text-[#113833] mb-1">Observações:</p>
                                <p className="italic whitespace-pre-line">{detail.notesLine}</p>
                            </div>
                        </div>
                    )}

                    {/* Financial block */}
                    <div className="px-8 mt-6">
                        <div className="bg-brand-gray/40 p-6 rounded-lg text-black space-y-2.5 w-full">
                            {detail.originalAmount != null && Number(detail.originalAmount) !== Number(detail.amount) && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Valor original</span>
                                    <span className="font-bold">{formatCurrency(detail.originalAmount)}</span>
                                </div>
                            )}
                            {Number(detail.interestAmount || 0) > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Juros</span>
                                    <span className="font-bold">+ {formatCurrency(detail.interestAmount || 0)}</span>
                                </div>
                            )}
                            {Number(detail.discountAmount || 0) > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Desconto</span>
                                    <span className="font-bold text-brand-green">- {formatCurrency(detail.discountAmount || 0)}</span>
                                </div>
                            )}
                            {detail.paidAmount != null && Number(detail.paidAmount) > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Valor pago</span>
                                    <span className="font-bold">{formatCurrency(detail.paidAmount)}</span>
                                </div>
                            )}
                            <div className="pt-3 border-t border-gray-200 flex justify-between items-center mt-2">
                                <span className="font-bold text-sm text-[#113833]">Total</span>
                                <span className={`font-bold text-lg ${isOut ? "text-red-600" : "text-brand-green"}`}>
                                    {isOut ? "- " : "+ "}{formatCurrency(detail.amount)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Signatures */}
                    <div className="px-8 mt-auto py-12 border-t border-gray-100 grid grid-cols-2 gap-8 text-center text-xs shrink-0">
                        <div className="space-y-1">
                            <div className="border-b border-gray-300 w-4/5 mx-auto h-8" />
                            <p className="font-semibold text-gray-400">{detail.contactCard?.name ? "Assinatura do contato" : "Assinatura"}</p>
                        </div>
                        <div className="space-y-1">
                            <div className="border-b border-gray-300 w-4/5 mx-auto h-8" />
                            <p className="font-semibold text-gray-400">Assinatura do responsável</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <ReceiptA4Footer primaryColor={primaryColor} />
                </div>
            </div>
        </div>
    )
}
