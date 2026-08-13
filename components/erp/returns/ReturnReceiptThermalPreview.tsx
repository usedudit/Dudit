"use client"

import { formatDate, formatCurrency } from "@/lib/utils"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

const DASH = "-".repeat(60)

function DashedLine({ className = "my-1" }: { className?: string }) {
    return (
        <p className={`text-center overflow-hidden whitespace-nowrap select-none ${className}`}>
            {DASH}
        </p>
    )
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between gap-2 text-[11px] leading-tight ${bold ? "font-bold" : ""}`}>
            <span className="shrink-0">{left}</span>
            <span className="text-right shrink-0">{right}</span>
        </div>
    )
}

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

type ReturnReceiptThermalPreviewProps = {
    returnRequest: any
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    printMode?: boolean
}

export default function ReturnReceiptThermalPreview({
    returnRequest,
    partnerHeader,
    partnerName,
    printMode = false,
}: ReturnReceiptThermalPreviewProps) {
    const isExchange = returnRequest.desiredResolution === "exchange" || returnRequest.approvedResolution === "exchange"
    const title = isExchange ? "COMPROVANTE DE TROCA" : "COMPROVANTE DE DEVOLUÇÃO"
    const resolutionLabel = isExchange ? "Troca" : "Devolução"
    const totalResolucao = Number(returnRequest.refundValue || 0) + Number(returnRequest.storeCreditValue || 0) + Number(returnRequest.exchangeShortfallAmount || 0)
    const statusLabel = STATUS_LABELS[returnRequest.status] || returnRequest.status || "Pendente"
    const customerAddress = returnRequest.customerAddress ? String(returnRequest.customerAddress) : undefined

    return (
        <div
            className={`mx-auto bg-[#fffef5] text-black font-mono text-[11px] leading-snug shadow-md ${printMode ? "sale-receipt-thermal-print" : ""
                }`}
            style={{ width: printMode ? "80mm" : "320px", maxWidth: "100%" }}
        >
            <div className="px-3 py-4">
                {/* Header estabelecimento */}
                <div className="text-center mb-2">
                    <p className="font-bold text-[13px] uppercase tracking-tight">{partnerHeader.fantasyName || partnerName}</p>
                    {partnerHeader.phone ? <p className="text-[9px] mt-0.5">{partnerHeader.phone}</p> : null}
                    {partnerHeader.addressLine ? (
                        <p className="text-[9px] mt-1 leading-tight whitespace-pre-line">{partnerHeader.addressLine}</p>
                    ) : null}
                    {partnerHeader.taxIdLine ? (
                        <p className="text-[9px] mt-1 leading-tight">{partnerHeader.taxIdLine}</p>
                    ) : null}
                </div>

                <DashedLine className="my-1" />

                {/* Título do documento */}
                <p className="text-[12px] font-bold text-center uppercase tracking-wide">{title}</p>
                <p className="text-center text-[9px] mt-0.5">Solicitação #{returnRequest.id.slice(0, 8).toUpperCase()}</p>
                <DashedLine className="my-1" />

                {/* Cliente + pedido/data */}
                <p className="text-[10px]">
                    <span className="font-bold">Cliente:</span> {returnRequest.customerName}
                </p>
                {returnRequest.customerPhone ? (
                    <p className="text-[10px]">{returnRequest.customerPhone}</p>
                ) : null}
                {customerAddress ? (
                    <p className="text-[10px] whitespace-pre-line">{customerAddress}</p>
                ) : null}
                <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span>PEDIDO: {returnRequest.orderNumber}</span>
                    <span>{formatDate(returnRequest.createdAt)}</span>
                </div>
                <p className="text-[10px]">
                    <span className="font-bold">Status:</span> {statusLabel}
                </p>
                <p className="text-[10px]">
                    <span className="font-bold">Resolução:</span> {resolutionLabel}
                </p>

                <DashedLine className="my-1" />

                {/* Cabeçalho itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[10px] font-bold uppercase">
                    <span># DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">VL ITEM</span>
                </div>
                <DashedLine className="mb-1" />

                {/* Itens */}
                <div className="space-y-1 mb-2">
                    {(returnRequest.items || []).map((item: any, idx: number) => {
                        const unitPrice = Number(item.price || 0)
                        const netPrice = Number(item.netItemValue || item.price || 0)
                        const subtotal = netPrice * Number(item.quantity || 0)
                        const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                        const reasonLabel = REASON_LABELS[item.reason?.toLowerCase()] || item.reason || "Outro motivo"
                        return (
                            <div key={idx}>
                                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[10px] items-start">
                                    <span className="break-words min-w-0 pr-1">
                                        {String(idx + 1).padStart(3, "0")} {item.productName || "Produto sem nome"}
                                    </span>
                                    <span className="text-right whitespace-nowrap shrink-0">
                                        {item.quantity}
                                    </span>
                                    <span className="text-right whitespace-nowrap shrink-0 text-gray-700">
                                        {new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(unitPrice)}
                                    </span>
                                    <span className="text-right whitespace-nowrap font-bold shrink-0">
                                        {new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(subtotal)}
                                    </span>
                                </div>
                                <p className="text-[9px] text-gray-700 leading-tight">
                                    {reasonLabel} · Estado: {conditionLabel}
                                </p>
                            </div>
                        )
                    })}
                </div>

                <DashedLine className="my-1" />

                {/* Valores */}
                <div className="space-y-1">
                    {Number(returnRequest.refundValue || 0) > 0 && (
                        <Row left="Valor reembolsado" right={formatCurrency(returnRequest.refundValue)} />
                    )}
                    {Number(returnRequest.storeCreditValue || 0) > 0 && (
                        <Row left="Vale-compra gerado" right={formatCurrency(returnRequest.storeCreditValue)} />
                    )}
                    {Number(returnRequest.exchangeShortfallAmount || 0) > 0 && (
                        <Row left="Complemento a pagar" right={formatCurrency(returnRequest.exchangeShortfallAmount || 0)} />
                    )}
                    {Number(returnRequest.exchangeSurplusAmount || 0) > 0 && (
                        <Row left="Saldo de troca restante" right={formatCurrency(returnRequest.exchangeSurplusAmount || 0)} />
                    )}
                    <div className="flex justify-between items-baseline my-1">
                        <span className="font-bold text-[14px]">TOTAL R$</span>
                        <span className="font-bold text-[14px]">{formatCurrency(totalResolucao)}</span>
                    </div>
                </div>

                {returnRequest.observations && (
                    <>
                        <DashedLine className="my-2" />
                        <p className="text-[9px] leading-relaxed">
                            <span className="font-bold">Observações:</span> {returnRequest.observations}
                        </p>
                    </>
                )}

                <DashedLine className="my-2" />
                <p className="text-[9px] font-bold text-center uppercase tracking-wide">Assinatura do cliente</p>
                <p className="text-[8px] text-center text-gray-600 mt-0.5">* COMPROVANTE DE TROCA E DEVOLUÇÃO *</p>
            </div>
        </div>
    )
}