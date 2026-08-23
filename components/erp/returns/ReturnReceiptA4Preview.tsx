"use client"

import { formatCurrency, formatDate } from "@/lib/utils"
import { stripCep } from "@/lib/utils/format-address"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

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
    const partnerAddress = partnerHeader.addressLine || "Endereço não cadastrado"
    const customerAddress = returnRequest.customerAddress ? stripCep(String(returnRequest.customerAddress)) : undefined

    return (
        <div className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "quote-a4-print" : "border-l border-brand-border dark:border-dark-border"}`}>
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
                                <h1 className="text-2xl font-medium text-white">{title}</h1>
                                <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                                    Solicitação #{returnRequest.id.slice(0, 8).toUpperCase()}
                                </p>
                            </div>
                        </div>
                    </div>

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

                    <div className="px-8 pb-6">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h3 className="font-bold text-sm text-brand-dark mb-3">Dados da empresa</h3>
                                <div className="text-xs text-gray-600 space-y-1">
                                    <p className="font-bold text-sm text-brand-dark">{partnerHeader.fantasyName || partnerName}</p>
                                    {partnerHeader.phone && <p>{formatBrazilPhone(partnerHeader.phone)}</p>}
                                    <p className="whitespace-pre-wrap">{partnerAddress}</p>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-brand-dark mb-3">Dados do cliente</h3>
                                <div className="text-xs text-gray-600 space-y-1">
                                    <p className="font-bold text-sm text-brand-dark">{returnRequest.customerName}</p>
                                    {returnRequest.customerPhone && <p>{formatBrazilPhone(returnRequest.customerPhone)}</p>}
                                    {customerAddress && <p className="whitespace-pre-wrap">{customerAddress}</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table items */}
                    <div className="px-8 pb-4">
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
                                {(returnRequest.items || []).map((item: any, idx: number) => {
                                    const unitPrice = Number(item.price || 0)
                                    const netPrice = Number(item.netItemValue || item.price || 0)
                                    const subtotal = netPrice * Number(item.quantity || 0)
                                    const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                                    const reasonLabel = REASON_LABELS[item.reason?.toLowerCase()] || item.reason || "Outro motivo"
                                    return (
                                        <tr key={idx} className="bg-white">
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
                                        returnRequest.requestType === "refund" || returnRequest.desiredResolution === "refund" ? returnRequest.refundValue :
                                            returnRequest.requestType === "store_credit" || returnRequest.desiredResolution === "store_credit" ? returnRequest.storeCreditValue :
                                                (Number(returnRequest.refundValue || 0) + Number(returnRequest.storeCreditValue || 0) + Number(returnRequest.exchangeShortfallAmount || 0))
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
                </div>
            </div>
        </div>
    )
}