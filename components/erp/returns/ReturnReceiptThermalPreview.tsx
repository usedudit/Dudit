"use client"

import { formatDate, formatCurrency } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalStoreHeader,
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
    const solicitationId = returnRequest.id ? returnRequest.id.slice(0, 8).toUpperCase() : ""

    return (
        <div
            className={`thermal-receipt-root mx-auto break-inside-avoid ${printMode ? "sale-receipt-thermal-print" : ""
                }`}
            style={{
                width: printMode ? "80mm" : "320px",
                maxWidth: "100%",
                boxSizing: "border-box",
                color: "#000000",
                backgroundColor: "#ffffff",
                fontFamily: "Consolas, 'Courier New', Monaco, monospace",
                fontWeight: 500,
                lineHeight: "1.35",
                fontSize: "10.5px",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
            }}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        .thermal-receipt-root,
                        .thermal-receipt-root * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            -webkit-text-fill-color: #000000 !important;
                            text-shadow: none !important;
                            box-sizing: border-box !important;
                        }
                    `,
                }}
            />

            <div className="px-3 py-3" style={{ backgroundColor: "#ffffff" }}>
                {/* Header estabelecimento */}
        <ReceiptThermalStoreHeader partnerHeader={partnerHeader} partnerName={partnerName} />

                <DashedLine className="my-1.5" />

                {/* Título do documento */}
                <p className="text-[12px] font-bold text-center uppercase tracking-wide mb-1.5" style={{ color: "#000000" }}>
                    {title}
                </p>

                {/* Cliente / Pedido / Solicitação */}
                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <p className="leading-tight font-bold">{returnRequest.customerName}</p>
                    {returnRequest.customerPhone ? (
                        <p className="leading-tight">{formatBrazilPhone(returnRequest.customerPhone)}</p>
                    ) : null}
                    <div className="flex justify-between items-baseline font-bold pt-0.5 text-[10.5px]">
                        <span>Nº DO PEDIDO: {returnRequest.orderNumber}</span>
                        <span>{formatDate(returnRequest.createdAt)}</span>
                    </div>
                    {solicitationId ? (
                        <p className="leading-tight">
                            <span className="font-bold">Solicitação:</span> {solicitationId}
                        </p>
                    ) : null}
                </div>

                <DashedLine className="my-1.5" />

                {/* Status e Solução */}
                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <p className="leading-tight">
                        <span className="font-bold">Status:</span> {statusLabel}
                    </p>
                    <p className="leading-tight">
                        <span className="font-bold">Solução:</span> {resolutionLabel}
                    </p>
                </div>

                <DashedLine className="my-1.5" />

                {/* Cabeçalho itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#000000" }}>
                    <span># DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">VL ITEM</span>
                </div>
                <DashedLine className="my-1" />

                {/* Itens */}
                <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                    {(returnRequest.items || []).map((item: any, idx: number) => {
                        const unitPrice = Number(item.price || 0)
                        const netPrice = Number(item.netItemValue || item.price || 0)
                        const subtotal = netPrice * Number(item.quantity || 0)
                        const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                        const reasonLabel = REASON_LABELS[item.reason?.toLowerCase()] || item.reason || "Outro motivo"
                        return (
                            <div key={idx}>
                                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                                    <span className="break-words min-w-0 pr-1 leading-tight font-medium">
                                        {String(idx + 1).padStart(3, "0")} {item.productName || "Produto sem nome"}
                                    </span>
                                    <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                        {item.quantity}
                                    </span>
                                    <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                        R$ {formatCurrency(unitPrice)}
                                    </span>
                                    <span className="text-right whitespace-nowrap font-bold shrink-0">
                                        R$ {formatCurrency(subtotal)}
                                    </span>
                                </div>
                                <p className="text-[9px] leading-tight" style={{ color: "#000000" }}>
                                    {reasonLabel} · Estado: {conditionLabel}
                                </p>
                            </div>
                        )
                    })}
                </div>

                <DashedLine className="my-1.5" />

                {/* Valores */}
                <div className="space-y-1" style={{ color: "#000000" }}>
                    {Number(returnRequest.refundValue || 0) > 0 && (
                        <ReceiptRow left="Valor reembolsado" right={`R$ ${formatCurrency(returnRequest.refundValue)}`} />
                    )}
                    {Number(returnRequest.storeCreditValue || 0) > 0 && (
                        <ReceiptRow left="Vale-compra gerado" right={`R$ ${formatCurrency(returnRequest.storeCreditValue)}`} />
                    )}
                    {Number(returnRequest.exchangeShortfallAmount || 0) > 0 && (
                        <ReceiptRow left="Complemento a pagar" right={`R$ ${formatCurrency(returnRequest.exchangeShortfallAmount || 0)}`} />
                    )}
                    {Number(returnRequest.exchangeSurplusAmount || 0) > 0 && (
                        <ReceiptRow left="Saldo de troca restante" right={`R$ ${formatCurrency(returnRequest.exchangeSurplusAmount || 0)}`} />
                    )}
                    <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                        <span className="text-[10.5px]">Total:</span>
                        <span className="text-[10.5px]">R$ {formatCurrency(totalResolucao)}</span>
                    </div>
                </div>

                {/* Observações */}
                {returnRequest.observations && (
                    <>
                        <DashedLine className="my-1.5" />
                        <div style={{ color: "#000000" }}>
                            <p className="font-bold text-[9.5px] uppercase" style={{ color: "#000000" }}>OBSERVAÇÕES:</p>
                            <p className="text-[9.5px] leading-tight whitespace-pre-line mt-0.5 font-medium" style={{ color: "#000000" }}>
                                {returnRequest.observations}
                            </p>
                        </div>
                    </>
                )}

                {/* Assinatura */}
                <DashedLine className="my-2" />
                <p className="text-[9.5px] font-bold text-center uppercase tracking-wide" style={{ color: "#000000" }}>
                    Assinatura do cliente
                </p>

                {/* Footer */}
                <DashedLine className="my-2" />
                <p className="text-center text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#000000" }}>
                    Criado via Dudit - dudit.com.br
                </p>
            </div>
        </div>
    )
}
