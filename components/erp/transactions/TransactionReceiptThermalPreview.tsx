"use client"

import { formatCurrency } from "@/lib/utils"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import type { TransactionDetailPayload } from "@/app/actions/erp/transactions"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalStoreHeader,
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

type TransactionReceiptThermalPreviewProps = {
    detail: TransactionDetailPayload
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    footerMessage?: string
    printMode?: boolean
    thermalWidth?: "80mm" | "58mm"
}

export default function TransactionReceiptThermalPreview({
    detail,
    partnerHeader,
    partnerName,
    footerMessage,
    printMode = false,
    thermalWidth = "80mm",
}: TransactionReceiptThermalPreviewProps) {
    const isOut = detail.ledgerDirection === "out"
    const signedAmount = `${isOut ? "-" : "+"} ${formatCurrency(detail.amount)}`
    const items = detail.items || []
    const installments = detail.installmentBreakdown || []
    const hasAdjustments =
        Number(detail.interestAmount || 0) > 0 ||
        Number(detail.discountAmount || 0) > 0 ||
        (detail.originalAmount != null && Number(detail.originalAmount) !== Number(detail.amount))

    return (
        <div
            className={`thermal-receipt-root mx-auto break-inside-avoid ${printMode ? "sale-receipt-thermal-print" : ""}`}
            style={{
                width: printMode ? thermalWidth : (thermalWidth === "58mm" ? "220px" : "320px"),
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
                <ReceiptThermalStoreHeader partnerHeader={partnerHeader} partnerName={partnerName} />

                <DashedLine className="my-1.5" />

                <p className="text-[12px] font-bold text-center uppercase tracking-wide mb-1.5" style={{ color: "#000000" }}>
                    Comprovante de transação
                </p>

                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <p className="leading-tight font-bold break-words">{detail.headerTitle}</p>
                    <div className="flex justify-between items-baseline gap-2 pt-0.5">
                        <span className="font-bold">{TYPE_LABELS[detail.transactionType] || detail.typeBannerLabel}</span>
                        <span>{detail.paymentDateLine || "-"}</span>
                    </div>
                    <p className="leading-tight">
                        <span className="font-bold">Status:</span> {detail.statusLabel}
                    </p>
                </div>

                <DashedLine className="my-1.5" />

                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    {detail.contactCard?.name && (
                        <>
                            <p className="leading-tight font-bold break-words">{detail.contactCard.name}</p>
                            {detail.contactCard.phone && (
                                <p className="leading-tight">{detail.contactCard.phone}</p>
                            )}
                        </>
                    )}
                    {detail.categoryLine && (
                        <p className="leading-tight">
                            <span className="font-bold">Categoria:</span> {detail.categoryLine}
                            {detail.subcategoryLine ? ` / ${detail.subcategoryLine}` : ""}
                        </p>
                    )}
                    {detail.accountLine && (
                        <p className="leading-tight">
                            <span className="font-bold">Conta:</span> {detail.accountLine}
                        </p>
                    )}
                    {detail.paymentMethodSubtitle && (
                        <p className="leading-tight">
                            <span className="font-bold">Pagamento:</span> {detail.paymentMethodSubtitle}
                        </p>
                    )}
                    {detail.dueDateLine && (
                        <p className="leading-tight">
                            <span className="font-bold">Vencimento:</span> {detail.dueDateLine}
                        </p>
                    )}
                </div>

                {items.length > 0 && (
                    <>
                        <DashedLine className="my-1.5" />
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#000000" }}>
                            <span># DESC</span>
                            <span className="text-right">QTD</span>
                            <span className="text-right">VL ITEM</span>
                        </div>
                        <DashedLine className="my-1" />
                        <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                            {items.map((item, idx) => (
                                <div key={item.id || idx} className="grid grid-cols-[1fr_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                                    <span className="break-words min-w-0 pr-1 leading-tight font-medium">
                                        {String(idx + 1).padStart(3, "0")} {item.title}
                                    </span>
                                    <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                        {item.quantity}
                                    </span>
                                    <span className="text-right whitespace-nowrap font-bold shrink-0">
                                        {formatCurrency(item.lineTotal)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {installments.length > 0 && (
                    <>
                        <DashedLine className="my-1.5" />
                        <p className="font-bold text-[9.5px] uppercase mb-0.5" style={{ color: "#000000" }}>
                            Parcelas
                        </p>
                        <div className="space-y-0.5" style={{ color: "#000000" }}>
                            {installments.map((row) => (
                                <div key={row.id} className="flex justify-between items-baseline gap-2 text-[9.5px] leading-tight">
                                    <span className="shrink-0">
                                        {String(row.installmentNumber).padStart(2, "0")}/{String(row.totalCount).padStart(2, "0")}
                                        {row.dueDate ? ` · ${row.dueDate}` : ""}
                                    </span>
                                    <span className="text-right shrink-0">
                                        {formatCurrency(row.originalAmount)} · {INSTALLMENT_STATUS_LABELS[row.status] || row.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <DashedLine className="my-1.5" />

                <div className="space-y-1" style={{ color: "#000000" }}>
                    {hasAdjustments && detail.originalAmount != null && (
                        <ReceiptRow left="Valor original" right={formatCurrency(detail.originalAmount)} />
                    )}
                    {Number(detail.interestAmount || 0) > 0 && (
                        <ReceiptRow left="Juros" right={`+ ${formatCurrency(detail.interestAmount || 0)}`} />
                    )}
                    {Number(detail.discountAmount || 0) > 0 && (
                        <ReceiptRow left="Desconto" right={`- ${formatCurrency(detail.discountAmount || 0)}`} />
                    )}
                    {detail.paidAmount != null && Number(detail.paidAmount) > 0 && (
                        <ReceiptRow left="Valor pago" right={formatCurrency(detail.paidAmount)} />
                    )}
                    <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                        <span className="text-[10.5px]">Total:</span>
                        <span className="text-[10.5px]">{signedAmount}</span>
                    </div>
                </div>

                {detail.notesLine && (
                    <>
                        <DashedLine className="my-1.5" />
                        <div style={{ color: "#000000" }}>
                            <p className="font-bold text-[9.5px] uppercase" style={{ color: "#000000" }}>OBSERVAÇÕES:</p>
                            <p className="text-[9.5px] leading-tight whitespace-pre-line mt-0.5 font-medium" style={{ color: "#000000" }}>
                                {detail.notesLine}
                            </p>
                        </div>
                    </>
                )}

                <DashedLine className="my-1.5" />

                <p className="leading-tight text-[9.5px] font-medium" style={{ color: "#000000" }}>
                    <span className="font-bold">Responsável:</span> {detail.creatorName}
                </p>
                <p className="leading-tight text-[9.5px] font-medium" style={{ color: "#000000" }}>
                    <span className="font-bold">Origem:</span> {detail.originLabel}
                </p>

                <DashedLine className="my-2" />
                <p className="text-center text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#000000" }}>
                    {footerMessage || "Criado via Dudit - dudit.com.br"}
                </p>
            </div>
        </div>
    )
}
