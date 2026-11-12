"use client"

import { formatReceiptAmount } from "@/lib/sales/sale-receipt"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import { usePartnerTimezone } from "@/lib/store-context"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalFooter,
    ReceiptThermalNotes,
    ReceiptThermalSectionTitle,
    ReceiptThermalShell,
    ReceiptThermalStoreHeader,
    ReceiptThermalTitle,
} from "@/components/erp/orders/receipt/ReceiptComponents"

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

const money = (value: number) => `R$ ${formatReceiptAmount(value)}`

export default function CashSessionCouponPreview({ data, type, printMode = false, thermalWidth = "80mm" }: CashSessionCouponPreviewProps) {
    const tz = usePartnerTimezone()
    const partnerAddressFormatted = data.partnerAddress
        .split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('CEP:'))
        .slice(0, 2)
        .join('\n')

    const partnerHeader: SaleReceiptPartnerHeader = {
        fantasyName: data.partnerName,
        legalName: "",
        addressLine: partnerAddressFormatted,
        taxIdLine: data.partnerDoc,
        phone: data.partnerPhone || null,
    }

    return (
        <ReceiptThermalShell printMode={printMode} thermalWidth={thermalWidth}>
            <ReceiptThermalStoreHeader partnerHeader={partnerHeader} partnerName={data.partnerName} />

            <DashedLine className="my-1.5" />

            <ReceiptThermalTitle>
                {type === "opening" ? "CUPOM DE ABERTURA DE CAIXA" : "CUPOM DE FECHAMENTO DE CAIXA"}
            </ReceiptThermalTitle>

            <div className="space-y-0.5 mb-2" style={{ color: "#000000" }}>
                <ReceiptRow left="Sessão:" right={data.sessionId.slice(0, 8).toUpperCase()} />
                <ReceiptRow left="Abertura:" right={formatShortDateTime(data.openedAt, tz)} />
                <ReceiptRow left="Operador:" right={data.openOperator} />
                {data.closedAt && <ReceiptRow left="Fechamento:" right={formatShortDateTime(data.closedAt, tz)} />}
                {data.closeOperator && <ReceiptRow left="Fechado por:" right={data.closeOperator} />}
            </div>

            <DashedLine className="my-1.5" />

            <ReceiptRow left="Troco inicial:" right={money(data.initialAmount)} bold />

            {type === "closing" && (
                <>
                    <DashedLine className="my-1.5" />

                    <ReceiptThermalSectionTitle>Resumo por forma de recebimento</ReceiptThermalSectionTitle>

                    {data.summaryByPaymentMethod.map((row, i) => (
                        <ReceiptRow key={i} left={row.label} right={money(row.calculated)} />
                    ))}

                    {data.summaryByPaymentMethod.length === 0 && (
                        <p className="text-[9px] text-center" style={{ color: "#000000" }}>
                            Nenhuma venda registrada.
                        </p>
                    )}

                    <DashedLine className="my-1.5" />
                </>
            )}

            {type === "opening" && <DashedLine className="my-1.5" />}

            <div className="space-y-0.5" style={{ color: "#000000" }}>
                {data.totals.totalSalesAllMethods > 0 && (
                    <ReceiptRow left="Total de vendas:" right={money(data.totals.totalSalesAllMethods)} bold />
                )}

                {(data.totals.totalWithdrawals > 0 || data.totals.totalDeposits > 0) && (
                    <>
                        <ReceiptRow left="Sangrias:" right={money(data.totals.totalWithdrawals)} />
                        <ReceiptRow left="Reforços:" right={money(data.totals.totalDeposits)} />
                    </>
                )}

                <DashedLine className="my-1" />

                <ReceiptRow left="Saldo calculado:" right={money(data.totals.calculatedDrawerTotal)} bold />

                {type === "closing" && data.totals.informedDrawerTotal != null && (
                    <ReceiptRow left="Saldo informado:" right={money(data.totals.informedDrawerTotal)} bold />
                )}
                {type === "closing" && data.totals.difference != null && (
                    <ReceiptRow left="Diferença:" right={money(data.totals.difference)} bold />
                )}
            </div>

            {data.notes && (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalNotes text={data.notes} />
                </>
            )}

            <ReceiptThermalFooter />
        </ReceiptThermalShell>
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
