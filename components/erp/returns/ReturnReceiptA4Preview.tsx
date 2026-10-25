"use client"

import { useMemo } from "react"
import { formatDate, formatCurrency } from "@/lib/utils"
import { stripCep } from "@/lib/utils/format-address"
import {
    QUOTE_PREVIEW_PRIMARY_COLOR,
    QUOTE_PREVIEW_SECONDARY_COLOR,
} from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import {
    paginateRows,
    A4_HEADER_HEIGHT,
    A4_TABLE_HEADER_HEIGHT,
    A4_ROW_HEIGHT,
    A4_FOOTER_HEIGHT,
    A4_CONTENT_HEIGHT_PX,
} from "@/lib/pdf/a4-pagination"
import {
    ReceiptA4Document,
    ReceiptA4Page,
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
} from "@/components/erp/orders/receipt/ReceiptComponents"

const STATUS_LABELS: Record<string, string> = {
    PENDING_REVIEW: "Pendente",
    UNDER_ANALYSIS: "Em Análise",
    APPROVED: "Aprovado",
    RESOLVED: "Concluído",
    COMPLETED: "Concluído",
    CANCELLED: "Cancelado",
    REJECTED: "Rejeitado",
    EXPIRED: "Expirado",
    WAITING_CUSTOMER: "Aguardando cliente",
    WAITING_ITEM_RETURN: "Aguardando cliente",
    PROCESSING: "Em processamento",
    ESCALATED: "Em análise",
}

const CONDITION_LABELS: Record<string, string> = {
    sealed: "Lacrado",
    lacrado: "Lacrado",
    opened: "Aberto",
    aberto: "Aberto",
    damaged: "Danificado",
    danificado: "Danificado",
}

const REASON_LABELS: Record<string, string> = {
    size_fit: "Tamanho / Caimento",
    defect: "Defeito",
    defective: "Defeito",
    not_as_described: "Diferente do anunciado",
    regret: "Arrependimento / Desistência",
    changed_mind: "Arrependimento / Desistência",
    damaged: "Danificado no transporte",
    wrong_item: "Item incorreto enviado",
    other: "Outro motivo",
}

const OBSERVATIONS_HEIGHT = 80
const FINANCIAL_BLOCK_HEIGHT = 190
const SIGNATURES_HEIGHT = 130

type ReturnReceiptA4PreviewProps = {
    returnRequest: any
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    partnerAvatar?: string
    primaryColor?: string
    secondaryColor?: string
    printMode?: boolean
}

export default function ReturnReceiptA4Preview({
    returnRequest,
    partnerHeader,
    partnerName,
    partnerAvatar,
    primaryColor,
    secondaryColor,
    printMode = false,
}: ReturnReceiptA4PreviewProps) {
    const isExchange = returnRequest.desiredResolution === "exchange" || returnRequest.approvedResolution === "exchange"
    const title = isExchange ? "COMPROVANTE DE TROCA" : "COMPROVANTE DE DEVOLUÇÃO"
    const primary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    const secondary = secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR
    const customerAddress = returnRequest.customerAddress
        ? stripCep(String(returnRequest.customerAddress))
        : undefined
    const solicitationId = returnRequest.id ? returnRequest.id.slice(0, 8).toUpperCase() : ""

    const items = returnRequest.items || []

    const pages = useMemo(() => {
        const firstPageFixedHeight = A4_HEADER_HEIGHT + 100 + 160 + A4_TABLE_HEADER_HEIGHT
        const nextPageFixedHeight = A4_HEADER_HEIGHT + A4_TABLE_HEADER_HEIGHT
        const lastPageExtrasHeight =
            (returnRequest.observations ? OBSERVATIONS_HEIGHT : 0) +
            FINANCIAL_BLOCK_HEIGHT +
            SIGNATURES_HEIGHT
        return paginateRows({
            items,
            firstPageFixedHeight,
            nextPageFixedHeight,
            lastPageExtrasHeight,
            rowHeight: A4_ROW_HEIGHT,
            footerHeight: A4_FOOTER_HEIGHT,
            totalPageHeight: A4_CONTENT_HEIGHT_PX,
        })
    }, [items, returnRequest.observations])

    return (
        <ReceiptA4Document printMode={printMode} printClassName="sale-receipt-a4-print">
            {pages.map((page, pageIndex) => (
                <ReceiptA4Page key={pageIndex} printMode={printMode}>
                    <ReceiptStoreHeaderA4
                        partnerName={partnerName}
                        partnerAvatar={partnerAvatar}
                        primaryColor={primary}
                        secondaryColor={secondary}
                        title={title}
                        subtitle={`Solicitação #${solicitationId}`}
                    />

                    <div className="flex-1 flex flex-col">
                        {page.type === "first" && (
                            <>
                                {/* Order info grid */}
                                <div className="px-8 py-6">
                                    <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-6 w-full">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                                Pedido Original
                                            </span>
                                            <span className="font-bold text-sm text-brand-dark">#{returnRequest.orderNumber}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                                Data Abertura
                                            </span>
                                            <span className="font-bold text-sm text-brand-dark">{formatDate(returnRequest.createdAt)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                                Status Atual
                                            </span>
                                            <span className="font-bold text-sm text-brand-dark">
                                                {STATUS_LABELS[returnRequest.status] || returnRequest.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <ReceiptA4StoreData
                                    partnerHeader={partnerHeader}
                                    partnerName={partnerName}
                                    customerName={returnRequest.customerName}
                                    customerPhone={returnRequest.customerPhone}
                                    customerAddress={customerAddress}
                                />
                            </>
                        )}

                        {/* Itens Solicitados (paginado) */}
                        <div className={`px-8 pb-4 ${page.type !== "first" ? "pt-8" : ""}`}>
                            <h3 className="font-bold text-sm text-[#113833] mb-3">Itens Solicitados</h3>
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Produto
                                        </th>
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Qtd
                                        </th>
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Preço Unit.
                                        </th>
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Preço Pago
                                        </th>
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Subtotal
                                        </th>
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Motivo / Estado
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {page.items.map((item: any, idx: number) => {
                                        const unitPrice = Number(item.price || 0)
                                        const netPrice = Number(item.netItemValue || item.price || 0)
                                        const subtotal = netPrice * Number(item.quantity || 0)
                                        const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                                        const reasonLabel = REASON_LABELS[item.reason?.toLowerCase()] || item.reason || "Outro motivo"
                                        return (
                                            <tr key={item.id || idx} className="bg-white">
                                                <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                    <span className="font-bold text-[13px] text-black block truncate max-w-[200px]">
                                                        {item.productName || "Produto sem nome"}
                                                    </span>
                                                    {item.sku && <span className="text-[10px] text-gray-400 block">SKU: {item.sku}</span>}
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                    <span className="text-[13px] font-medium text-gray-600">{item.quantity}</span>
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                    <span className="text-[13px] font-medium text-gray-600">
                                                        {formatCurrency(unitPrice)}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                    <span className="text-[13px] font-medium text-gray-600">
                                                        {formatCurrency(netPrice)}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                    <span className="text-[13px] font-bold text-black">
                                                        {formatCurrency(subtotal)}
                                                    </span>
                                                </td>
                                                <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-xs">
                                                    <p className="text-gray-600 font-medium line-clamp-2">{reasonLabel}</p>
                                                    <span className="text-[10px] text-gray-400">Estado: {conditionLabel}</span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Última página: observações, financeiro e assinaturas */}
                        {page.hasTotals && (
                            <>
                                {/* Observations block */}
                                {returnRequest.observations && (
                                    <div className="px-8 mt-6">
                                        <div className="bg-brand-gray/40 p-4 rounded-lg text-xs text-black">
                                            <p className="font-bold text-[#113833] mb-1">Observações:</p>
                                            <p className="italic">"{returnRequest.observations}"</p>
                                        </div>
                                    </div>
                                )}

                                {/* Financial block taking full width */}
                                <div className="px-8 mt-6">
                                    <div className="bg-brand-gray/40 p-6 rounded-lg text-black space-y-2.5 w-full">
                                        {Number(returnRequest.refundValue || 0) > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500 font-medium">Valor Reembolsado</span>
                                                <span className="font-bold">{formatCurrency(returnRequest.refundValue)}</span>
                                            </div>
                                        )}
                                        {Number(returnRequest.storeCreditValue || 0) > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500 font-medium">Vale-Compra Gerado</span>
                                                <span className="font-bold text-brand-green">{formatCurrency(returnRequest.storeCreditValue)}</span>
                                            </div>
                                        )}
                                        {Number(returnRequest.exchangeShortfallAmount || 0) > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500 font-medium">Complemento a Pagar</span>
                                                <span className="font-bold text-red-600">{formatCurrency(returnRequest.exchangeShortfallAmount || 0)}</span>
                                            </div>
                                        )}
                                        {Number(returnRequest.exchangeSurplusAmount || 0) > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500 font-medium">Saldo de Troca Restante</span>
                                                <span className="font-bold text-brand-green">{formatCurrency(returnRequest.exchangeSurplusAmount || 0)}</span>
                                            </div>
                                        )}
                                        <div className="pt-3 border-t border-gray-200 flex justify-between items-center mt-2">
                                            <span className="font-bold text-sm text-[#113833]">Total da Resolução</span>
                                            <span className="font-bold text-lg text-black">
                                                {formatCurrency(
                                                    returnRequest.requestType === "refund" || returnRequest.desiredResolution === "refund"
                                                        ? returnRequest.refundValue
                                                        : returnRequest.requestType === "store_credit" ||
                                                          returnRequest.desiredResolution === "store_credit"
                                                        ? returnRequest.storeCreditValue
                                                        : Number(returnRequest.refundValue || 0) +
                                                          Number(returnRequest.storeCreditValue || 0) +
                                                          Number(returnRequest.exchangeShortfallAmount || 0)
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Signatures at bottom */}
                                <div className="px-8 mt-auto py-12 border-t border-gray-100 grid grid-cols-2 gap-8 text-center text-xs shrink-0">
                                    <div className="space-y-1">
                                        <div className="border-b border-gray-300 w-4/5 mx-auto h-8" />
                                        <p className="font-semibold text-gray-400">Assinatura do Cliente</p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="border-b border-gray-300 w-4/5 mx-auto h-8" />
                                        <p className="font-semibold text-gray-400">Assinatura do Responsável</p>
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
