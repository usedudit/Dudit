"use client"

import { formatDate } from "@/lib/utils"
import { formatReceiptAmount } from "@/lib/sales/sale-receipt"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalFooter,
    ReceiptThermalItemsHeader,
    ReceiptThermalNotes,
    ReceiptThermalShell,
    ReceiptThermalSignature,
    ReceiptThermalStoreHeader,
    ReceiptThermalTitle,
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

const REFUND_TYPE_LABELS: Record<string, string> = {
    full: "Total",
    partial: "Parcial",
}

type ReturnReceiptThermalPreviewProps = {
    returnRequest: any
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    footerMessage?: string | null
    showAcknowledgment?: boolean
    printMode?: boolean
    thermalWidth?: "80mm" | "58mm"
}

export default function ReturnReceiptThermalPreview({
    returnRequest,
    partnerHeader,
    partnerName,
    footerMessage,
    showAcknowledgment = true,
    printMode = false,
    thermalWidth = "80mm",
}: ReturnReceiptThermalPreviewProps) {
    const isExchange = returnRequest.desiredResolution === "exchange" || returnRequest.approvedResolution === "exchange"
    const title = isExchange ? "COMPROVANTE DE TROCA" : "COMPROVANTE DE DEVOLUÇÃO"
    const resolutionLabel = isExchange ? "Troca" : "Devolução"
    const refundValue = Number(returnRequest.refundValue || 0)
    const storeCreditValue = Number(returnRequest.storeCreditValue || 0)
    const exchangeShortfallAmount = Number(returnRequest.exchangeShortfallAmount || 0)
    const exchangeSurplusAmount = Number(returnRequest.exchangeSurplusAmount || 0)
    const totalResolucao = refundValue + storeCreditValue + exchangeShortfallAmount
    const statusLabel = STATUS_LABELS[returnRequest.status] || returnRequest.status || "Pendente"
    const solicitationId = returnRequest.id ? returnRequest.id.slice(0, 8).toUpperCase() : ""

    const refundFormLabel = (() => {
        const resolution = returnRequest.approvedResolution || returnRequest.desiredResolution || returnRequest.requestType
        if (resolution === "store_credit") return "Vale-compra"
        if (resolution === "exchange") return refundValue > 0 ? "Troca com reembolso" : "Troca"
        if (storeCreditValue > 0 && refundValue <= 0) return "Vale-compra"
        return "Reembolso"
    })()
    const refundMethodLabel = returnRequest.refundPaymentMethod
        ? formatPaymentMethodLabel(returnRequest.refundPaymentMethod, null)
        : ""
    const refundTypeLabel = returnRequest.refundType
        ? REFUND_TYPE_LABELS[returnRequest.refundType] || returnRequest.refundType
        : ""

    return (
        <ReceiptThermalShell printMode={printMode} thermalWidth={thermalWidth}>
            {/* Header estabelecimento */}
            <ReceiptThermalStoreHeader partnerHeader={partnerHeader} partnerName={partnerName} />

            <DashedLine className="my-1.5" />

            {/* Título do documento */}
            <ReceiptThermalTitle>{title}</ReceiptThermalTitle>

            {/* Cliente / Pedido / Solicitação */}
            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <ReceiptRow left="Cliente:" right={returnRequest.customerName || "-"} />
                {returnRequest.customerPhone ? (
                    <ReceiptRow left="Telefone:" right={formatBrazilPhone(returnRequest.customerPhone)} />
                ) : null}
                <ReceiptRow left={`Nº do Pedido: ${returnRequest.orderNumber}`} right={formatDate(returnRequest.createdAt)} />
                {solicitationId ? (
                    <ReceiptRow left="Solicitação:" right={solicitationId} />
                ) : null}
            </div>

            <DashedLine className="my-1.5" />

            {/* Status / Solução / Reembolso */}
            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <ReceiptRow left="Status:" right={statusLabel} />
                <ReceiptRow left="Solução:" right={resolutionLabel} />
                <ReceiptRow left="Forma de reembolso:" right={refundFormLabel} />
                {refundTypeLabel ? (
                    <ReceiptRow left="Tipo de reembolso:" right={refundTypeLabel} />
                ) : null}
                {refundMethodLabel ? (
                    <ReceiptRow left="Método de reembolso:" right={refundMethodLabel} />
                ) : null}
            </div>

            <DashedLine className="my-1.5" />

            {/* Cabeçalho itens */}
            <ReceiptThermalItemsHeader
                columns={[
                    { label: "# COD DESC" },
                    { label: "QTD", align: "right" },
                    { label: "VL UN", align: "right" },
                    { label: "VL ITEM", align: "right" },
                ]}
            />
            <DashedLine className="my-1" />

            {/* Itens */}
            <div className="space-y-1.5 mb-1.5" style={{ color: "#000000" }}>
                {(returnRequest.items || []).map((item: any, idx: number) => {
                    const netPrice = Number(item.netItemValue || item.price || 0)
                    const quantity = Number(item.quantity || 0)
                    const subtotal = netPrice * quantity
                    const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                    const reasonLabel = REASON_LABELS[item.reason?.toLowerCase()] || item.reason || "Outro motivo"
                    const itemCode = item.sku || item.code || ""
                    return (
                        <div key={idx}>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                                <span className="break-words min-w-0 pr-1 leading-tight font-medium">
                                    {String(idx + 1).padStart(3, "0")} {itemCode ? `${itemCode} ` : ""}{item.productName || "Produto sem nome"}
                                </span>
                                <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                    {quantity}
                                </span>
                                <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                    {formatReceiptAmount(netPrice)}
                                </span>
                                <span className="text-right whitespace-nowrap font-bold shrink-0">
                                    {formatReceiptAmount(subtotal)}
                                </span>
                            </div>
                            <div className="text-[9px] leading-tight mt-0.5 space-y-0" style={{ color: "#000000" }}>
                                <p>
                                    <span className="font-bold">Motivo:</span> {reasonLabel}
                                </p>
                                <p>
                                    <span className="font-bold">Estado:</span> {conditionLabel}
                                </p>
                            </div>
                        </div>
                    )
                })}
            </div>

            <DashedLine className="my-1.5" />

            {/* Valores */}
            <div className="space-y-1" style={{ color: "#000000" }}>
                {refundValue > 0 && (
                    <ReceiptRow left="Valor reembolsado:" right={`R$ ${formatReceiptAmount(refundValue)}`} />
                )}
                {storeCreditValue > 0 && (
                    <ReceiptRow left="Vale-compra gerado:" right={`R$ ${formatReceiptAmount(storeCreditValue)}`} />
                )}
                {exchangeShortfallAmount > 0 && (
                    <ReceiptRow left="Complemento a pagar:" right={`R$ ${formatReceiptAmount(exchangeShortfallAmount)}`} />
                )}
                {exchangeSurplusAmount > 0 && (
                    <ReceiptRow left="Saldo de troca restante:" right={`R$ ${formatReceiptAmount(exchangeSurplusAmount)}`} />
                )}
                <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                    <span className="text-[10.5px]">Total:</span>
                    <span className="text-[10.5px]">R$ {formatReceiptAmount(totalResolucao)}</span>
                </div>
            </div>

            {/* Observações */}
            {returnRequest.observations && (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalNotes text={returnRequest.observations} />
                </>
            )}

            {/* Assinatura (apenas quando habilitada nas configurações) */}
            <ReceiptThermalSignature
                show={showAcknowledgment}
                acknowledgment={
                    isExchange
                        ? "Recebi a(s) mercadoria(s) de troca acima descrita(s), concordando com as condições informadas."
                        : "Declaro ciência da devolução e dos valores acima descritos."
                }
            />

            {/* Footer */}
            <ReceiptThermalFooter message={footerMessage} />
        </ReceiptThermalShell>
    )
}
