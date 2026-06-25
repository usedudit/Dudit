"use client"

import { formatCurrency } from "@/lib/utils"

const DASH = "-".repeat(60)

function DashedLine({ className = "my-1" }: { className?: string }) {
    return (
        <p className={`text-center overflow-hidden whitespace-nowrap select-none ${className}`}>
            {DASH}
        </p>
    )
}

type CashSessionCouponData = {
    partnerName: string
    partnerDoc: string
    partnerAddress: string
    sessionId: string
    status: "open" | "closed"
    openedAt: string
    closedAt: string | null
    openOperator: string
    closeOperator: string | null
    initialAmount: number
    summaryByPaymentMethod: Array<{ label: string; calculated: number; counted: number | null; difference: number | null }>
    totals: {
        totalSalesAllMethods: number
        totalWithdrawals: number
        totalDeposits: number
        totalRefunds: number
        calculatedDrawerTotal: number
        informedDrawerTotal: number | null
        difference: number | null
    }
    notes?: string | null
}

type CashSessionCouponPreviewProps = {
    data: CashSessionCouponData
    type: "opening" | "closing"
    printMode?: boolean
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between gap-2 text-[11px] leading-tight ${bold ? "font-bold" : ""}`}>
            <span className="shrink-0">{left}</span>
            <span className="text-right shrink-0">{right}</span>
        </div>
    )
}

const formatShortDateTime = (iso: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch { return iso }
}

export default function CashSessionCouponPreview({ data, type, printMode = false }: CashSessionCouponPreviewProps) {
    return (
        <div
            className={`mx-auto bg-[#fffef5] text-black font-mono text-[11px] leading-snug shadow-md ${printMode ? "sale-receipt-thermal-print" : ""}`}
            style={{ width: printMode ? "80mm" : "320px", maxWidth: "100%" }}
        >
            <div className="px-3 py-4">
                <div className="text-center mb-2">
                    <p className="font-bold text-[13px] uppercase tracking-tight">{data.partnerName}</p>
                    <p className="text-[10px] mt-0.5">{data.partnerDoc}</p>
                    <p className="text-[9px] mt-1 leading-tight">{data.partnerAddress}</p>
                </div>

                <DashedLine className="my-1" />

                <p className="text-center font-bold text-[12px] uppercase">
                    {type === "opening" ? "CUPOM DE ABERTURA DE CAIXA" : "CUPOM DE FECHAMENTO DE CAIXA"}
                </p>

                <DashedLine className="my-1" />

                <div className="text-[10px] space-y-0.5 mb-2">
                    <Row left="Caixa:" right={data.sessionId.slice(0, 8).toUpperCase()} />
                    <Row left="Abertura:" right={formatShortDateTime(data.openedAt)} />
                    <Row left="Operador:" right={data.openOperator} />
                    {data.closedAt && <Row left="Fechamento:" right={formatShortDateTime(data.closedAt)} />}
                    {data.closeOperator && <Row left="Fechado por:" right={data.closeOperator} />}
                </div>

                <DashedLine className="my-1" />

                <Row left="Troco inicial:" right={formatCurrency(data.initialAmount)} bold />

                <DashedLine className="my-1" />

                <p className="text-[9px] font-bold uppercase mb-1">Resumo por forma de recebimento</p>

                {data.summaryByPaymentMethod.map((row, i) => (
                    <Row key={i} left={row.label} right={formatCurrency(row.calculated)} />
                ))}

                {data.summaryByPaymentMethod.length === 0 && (
                    <p className="text-[9px] text-center">Nenhuma venda registrada.</p>
                )}

                <DashedLine className="my-1" />

                <div className="space-y-0.5">
                    <Row left="Total de vendas:" right={formatCurrency(data.totals.totalSalesAllMethods)} bold />

                    {(data.totals.totalWithdrawals > 0 || data.totals.totalDeposits > 0) && (
                        <>
                            <Row left="Sangrias:" right={formatCurrency(data.totals.totalWithdrawals)} />
                            <Row left="Reforços:" right={formatCurrency(data.totals.totalDeposits)} />
                        </>
                    )}

                    {data.totals.totalRefunds > 0 && (
                        <Row left="Devoluções:" right={formatCurrency(data.totals.totalRefunds)} />
                    )}

                    <DashedLine className="my-1" />

                    <Row left="Saldo calculado:" right={formatCurrency(data.totals.calculatedDrawerTotal)} bold />

                    {type === "closing" && data.totals.informedDrawerTotal != null && (
                        <Row left="Saldo informado:" right={formatCurrency(data.totals.informedDrawerTotal)} bold />
                    )}
                    {type === "closing" && data.totals.difference != null && (
                        <Row left="Diferença:" right={formatCurrency(data.totals.difference)} bold />
                    )}
                </div>

                {data.notes && (
                    <>
                        <DashedLine className="my-1" />
                        <p className="text-[9px] text-center">Obs: {data.notes}</p>
                    </>
                )}

                <DashedLine className="my-2" />

                <p className="text-[10px] font-bold text-center uppercase tracking-wide">* OBRIGADO E VOLTE SEMPRE *</p>
            </div>
        </div>
    )
}
