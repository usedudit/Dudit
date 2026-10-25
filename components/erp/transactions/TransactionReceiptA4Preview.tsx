"use client"

import { useMemo } from "react"
import { formatCurrency } from "@/lib/utils"
import {
    QUOTE_PREVIEW_PRIMARY_COLOR,
    QUOTE_PREVIEW_SECONDARY_COLOR,
} from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import type { TransactionDetailPayload } from "@/app/actions/erp/transactions"
import { paginateRows } from "@/lib/pdf/a4-pagination"
import {
    ReceiptA4Document,
    ReceiptA4Page,
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
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

// Altura aproximada dos blocos fixos da página 1 (header + grid + store data + detalhes + header da tabela)
const FIRST_PAGE_FIXED_HEIGHT = 160 + 100 + 160 + 220 + 40
// Altura fixa das páginas seguintes (header + header da tabela)
const NEXT_PAGE_FIXED_HEIGHT = 160 + 40
// Espaço reservado para o final da última página
const FINANCIAL_BLOCK_HEIGHT = 210
const SIGNATURES_HEIGHT = 110
const NOTES_HEIGHT = 90

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

    const lastPageExtrasHeight = useMemo(() => {
        const notes = detail.notesLine ? NOTES_HEIGHT : 0
        const installmentsBlock = installments.length > 0 ? 40 + installments.length * 40 : 0
        return installmentsBlock + notes + FINANCIAL_BLOCK_HEIGHT + SIGNATURES_HEIGHT
    }, [installments, detail.notesLine])

    const pages = useMemo(
        () =>
            paginateRows({
                items,
                firstPageFixedHeight: FIRST_PAGE_FIXED_HEIGHT,
                nextPageFixedHeight: NEXT_PAGE_FIXED_HEIGHT,
                lastPageExtrasHeight,
            }),
        [items, lastPageExtrasHeight]
    )

    return (
        <ReceiptA4Document printMode={printMode} printClassName="sale-receipt-a4-print">
            {pages.map((page, pageIndex) => (
                <ReceiptA4Page key={pageIndex} printMode={printMode}>
                    <ReceiptStoreHeaderA4
                        partnerName={partnerName}
                        partnerAvatar={partnerAvatar}
                        primaryColor={primary}
                        secondaryColor={secondary}
                        title="Comprovante de transação"
                        subtitle={`Transação #${transactionId}`}
                    />

                    <div className="flex-1 flex flex-col">
                        {page.type === "first" && (
                            <>
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

                                {/* Detalhes da transação (apenas na primeira página) */}
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
                            </>
                        )}

                        {/* Items */}
                        <div className={`px-8 pb-4 ${page.type !== "first" ? "pt-8" : ""}`}>
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
                                    {page.items.map((item, idx) => (
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

                        {/* Última página: parcelas, observações, bloco financeiro e assinaturas */}
                        {page.hasTotals && (
                            <>
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
                            </>
                        )}

                        {!page.hasTotals && <div className="mt-auto" />}
                    </div>

                    <ReceiptA4Footer primaryColor={primary} />
                </ReceiptA4Page>
            ))}
        </ReceiptA4Document>
    )
}
