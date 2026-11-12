"use client"

import { formatReceiptAmount } from "@/lib/sales/sale-receipt"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import type { TransactionDetailPayload } from "@/app/actions/erp/transactions"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalFooter,
    ReceiptThermalItemsHeader,
    ReceiptThermalNotes,
    ReceiptThermalSectionTitle,
    ReceiptThermalShell,
    ReceiptThermalStoreHeader,
    ReceiptThermalTitle,
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
    const items = detail.items || []
    const installments = detail.installmentBreakdown || []
    const hasAdjustments =
        Number(detail.interestAmount || 0) > 0 ||
        Number(detail.discountAmount || 0) > 0 ||
        (detail.originalAmount != null && Number(detail.originalAmount) !== Number(detail.amount))

    return (
        <ReceiptThermalShell printMode={printMode} thermalWidth={thermalWidth}>
            <ReceiptThermalStoreHeader partnerHeader={partnerHeader} partnerName={partnerName} />

            <DashedLine className="my-1.5" />

            <ReceiptThermalTitle>Comprovante de transação</ReceiptThermalTitle>

            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <p className="leading-tight font-bold break-words">{detail.headerTitle}</p>
                <ReceiptRow
                    left="Tipo:"
                    right={TYPE_LABELS[detail.transactionType] || detail.typeBannerLabel}
                />
                <ReceiptRow left="Data:" right={detail.paymentDateLine || "-"} />
                <ReceiptRow left="Status:" right={detail.statusLabel} />
            </div>

            <DashedLine className="my-1.5" />

            <div className="space-y-0.5" style={{ color: "#000000" }}>
                {detail.contactCard?.name && (
                    <ReceiptRow left="Cliente:" right={detail.contactCard.name} />
                )}
                {detail.contactCard?.phone && (
                    <ReceiptRow left="Telefone:" right={detail.contactCard.phone} />
                )}
                {detail.categoryLine && (
                    <ReceiptRow
                        left="Categoria:"
                        right={
                            detail.subcategoryLine
                                ? `${detail.categoryLine} / ${detail.subcategoryLine}`
                                : detail.categoryLine
                        }
                    />
                )}
                {detail.accountLine && (
                    <ReceiptRow left="Conta:" right={detail.accountLine} />
                )}
                {detail.paymentMethodSubtitle && (
                    <ReceiptRow left="Pagamento:" right={detail.paymentMethodSubtitle} />
                )}
                {detail.dueDateLine && (
                    <ReceiptRow left="Vencimento:" right={detail.dueDateLine} />
                )}
            </div>

            {items.length > 0 && (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalItemsHeader
                        columns={[
                            { label: "# DESC" },
                            { label: "QTD", align: "right" },
                            { label: "VL UN", align: "right" },
                            { label: "VL ITEM", align: "right" },
                        ]}
                    />
                    <DashedLine className="my-1" />
                    <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                        {items.map((item, idx) => (
                            <div key={item.id || idx} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                                <span className="break-words min-w-0 pr-1 leading-tight font-medium">
                                    {String(idx + 1).padStart(3, "0")} {item.title}
                                </span>
                                <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                    {item.quantity}
                                </span>
                                <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                    {formatReceiptAmount(item.unitPrice)}
                                </span>
                                <span className="text-right whitespace-nowrap font-bold shrink-0">
                                    {formatReceiptAmount(item.lineTotal)}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {installments.length > 0 && (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalSectionTitle>Parcelas</ReceiptThermalSectionTitle>
                    <div className="space-y-0.5" style={{ color: "#000000" }}>
                        {installments.map((row) => (
                            <div key={row.id} className="text-[9.5px] leading-tight">
                                <ReceiptRow
                                    left={`${String(row.installmentNumber).padStart(2, "0")}/${String(row.totalCount).padStart(2, "0")}${row.dueDate ? ` · ${row.dueDate}` : ""}`}
                                    right={`R$ ${formatReceiptAmount(row.originalAmount)}`}
                                />
                                <p className="text-[9px] font-bold uppercase" style={{ color: "#000000" }}>
                                    Status: {INSTALLMENT_STATUS_LABELS[row.status] || row.status}
                                </p>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <DashedLine className="my-1.5" />

            <div className="space-y-1" style={{ color: "#000000" }}>
                {hasAdjustments && detail.originalAmount != null && (
                    <ReceiptRow left="Valor original:" right={`R$ ${formatReceiptAmount(detail.originalAmount)}`} />
                )}
                {Number(detail.interestAmount || 0) > 0 && (
                    <ReceiptRow left="Juros:" right={`+R$ ${formatReceiptAmount(detail.interestAmount || 0)}`} />
                )}
                {Number(detail.discountAmount || 0) > 0 && (
                    <ReceiptRow left="Desconto:" right={`-R$ ${formatReceiptAmount(detail.discountAmount || 0)}`} />
                )}
                {detail.paidAmount != null && Number(detail.paidAmount) > 0 && (
                    <ReceiptRow left="Valor pago:" right={`R$ ${formatReceiptAmount(detail.paidAmount)}`} />
                )}
                <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                    <span className="text-[10.5px]">Total:</span>
                    <span className="text-[10.5px]">
                        {isOut ? "- " : "+ "}R$ {formatReceiptAmount(detail.amount)}
                    </span>
                </div>
            </div>

            {detail.notesLine && (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalNotes text={detail.notesLine} />
                </>
            )}

            <DashedLine className="my-1.5" />

            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <ReceiptRow left="Responsável:" right={detail.creatorName} />
                <ReceiptRow left="Origem:" right={detail.originLabel} />
            </div>

            <ReceiptThermalFooter message={footerMessage} />
        </ReceiptThermalShell>
    )
}
