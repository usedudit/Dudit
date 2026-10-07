"use client"

import { formatCurrency } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { usePartnerTimezone } from "@/lib/store-context"
import { DashedLine, ReceiptRow } from "@/components/erp/orders/receipt/ReceiptComponents"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

export type CashSessionCouponData = {
    partnerName: string
    partnerDoc: string
    partnerPhone?: string | null
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
    thermalWidth?: "80mm" | "58mm"
}

const formatShortDateTime = (iso: string, tz?: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz })
    } catch { return iso }
}

export default function CashSessionCouponPreview({ data, type, printMode = false, thermalWidth = "80mm" }: CashSessionCouponPreviewProps) {
    const tz = usePartnerTimezone()
    const partnerAddressFormatted = data.partnerAddress
        .split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('CEP:'))
        .slice(0, 2)
        .join('\n')

    return (
        <div
            className={`thermal-receipt-root mx-auto bg-white text-black font-mono text-[11px] leading-snug break-inside-avoid print:bg-white print:text-black ${printMode ? "sale-receipt-thermal-print" : ""}`}
            style={{
                width: printMode ? thermalWidth : (thermalWidth === "58mm" ? "220px" : "320px"),
                maxWidth: "100%",
                boxSizing: "border-box",
                color: "#000000",
                backgroundColor: "#ffffff",
                fontFamily: "Consolas, 'Courier New', Monaco, monospace",
                fontWeight: 500,
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
            <div className="px-3 py-4">
                <div className="text-center mb-2">
                    <p className="font-bold text-[13px] uppercase tracking-tight">{data.partnerName}</p>
                    {data.partnerPhone ? <p className="text-[9px] mt-0.5">{formatBrazilPhone(data.partnerPhone)}</p> : null}
                    <p className="text-[10px] mt-0.5">{data.partnerDoc}</p>
                    <p className="text-[9px] mt-1 leading-tight whitespace-pre-line">{partnerAddressFormatted}</p>
                </div>

                <DashedLine className="my-1" />

                <p className="text-center font-bold text-[12px] uppercase">
                    {type === "opening" ? "CUPOM DE ABERTURA DE CAIXA" : "CUPOM DE FECHAMENTO DE CAIXA"}
                </p>

                <DashedLine className="my-1" />

                <div className="text-[10px] space-y-0.5 mb-2">
                    <ReceiptRow left="Sessão:" right={data.sessionId.slice(0, 8).toUpperCase()} />
                    <ReceiptRow left="Abertura:" right={formatShortDateTime(data.openedAt, tz)} />
                    <ReceiptRow left="Operador:" right={data.openOperator} />
                    {data.closedAt && <ReceiptRow left="Fechamento:" right={formatShortDateTime(data.closedAt, tz)} />}
                    {data.closeOperator && <ReceiptRow left="Fechado por:" right={data.closeOperator} />}
                </div>

                <DashedLine className="my-1" />

                <ReceiptRow left="Troco inicial:" right={formatCurrency(data.initialAmount)} bold />

                {type === "closing" && (
                    <>
                        <DashedLine className="my-1" />

                        <p className="text-[9px] font-bold uppercase mb-1">Resumo por forma de recebimento</p>

                        {data.summaryByPaymentMethod.map((row, i) => (
                            <ReceiptRow key={i} left={row.label} right={formatCurrency(row.calculated)} />
                        ))}

                        {data.summaryByPaymentMethod.length === 0 && (
                            <p className="text-[9px] text-center">Nenhuma venda registrada.</p>
                        )}

                        <DashedLine className="my-1" />
                    </>
                )}

                {type === "opening" && <DashedLine className="my-1" />}

                <div className="space-y-0.5">
                    {data.totals.totalSalesAllMethods > 0 && (
                        <ReceiptRow left="Total de vendas:" right={formatCurrency(data.totals.totalSalesAllMethods)} bold />
                    )}

                    {(data.totals.totalWithdrawals > 0 || data.totals.totalDeposits > 0) && (
                        <>
                            <ReceiptRow left="Sangrias:" right={formatCurrency(data.totals.totalWithdrawals)} />
                            <ReceiptRow left="Reforços:" right={formatCurrency(data.totals.totalDeposits)} />
                        </>
                    )}

                    <DashedLine className="my-1" />

                    <ReceiptRow left="Saldo calculado:" right={formatCurrency(data.totals.calculatedDrawerTotal)} bold />

                    {type === "closing" && data.totals.informedDrawerTotal != null && (
                        <ReceiptRow left="Saldo informado:" right={formatCurrency(data.totals.informedDrawerTotal)} bold />
                    )}
                    {type === "closing" && data.totals.difference != null && (
                        <ReceiptRow left="Diferença:" right={formatCurrency(data.totals.difference)} bold />
                    )}
                </div>

                {data.notes && (
                    <>
                        <DashedLine className="my-1" />
                        <p className="text-[9px] text-center">Obs: {data.notes}</p>
                    </>
                )}

                <DashedLine className="my-1" />
                <p className="text-center text-[10.5px] font-bold uppercase tracking-wide">
                    Criado via Dudit - dudit.com.br
                </p>
            </div>
        </div>
    )
}

export function buildCashSessionCouponData(details: any, partnerHeader: SaleReceiptPartnerHeader): CashSessionCouponData {
    return {
        partnerName: partnerHeader.fantasyName,
        partnerDoc: partnerHeader.taxIdLine,
        partnerPhone: partnerHeader.phone || null,
        partnerAddress: partnerHeader.addressLine,
        sessionId: details.session.id,
        status: details.session.status,
        openedAt: details.session.opened_at,
        closedAt: details.session.closed_at || null,
        openOperator: details.operators.open_name,
        closeOperator: details.operators.close_name,
        initialAmount: details.totals.initial,
        summaryByPaymentMethod: (details.summaryByPaymentMethod || []).map((row: any) => ({
            label: row.label,
            calculated: row.calculated,
            counted: row.counted,
            difference: row.difference,
        })),
        totals: {
            totalSalesAllMethods: details.totals.totalSalesAllMethods,
            totalWithdrawals: details.totals.totalWithdrawals,
            totalDeposits: details.totals.totalDeposits,
            calculatedDrawerTotal: details.totals.calculatedDrawerTotal,
            informedDrawerTotal: details.totals.informedDrawerTotal,
            difference: details.totals.difference,
        },
        notes: details.session.notes || null,
    }
}
