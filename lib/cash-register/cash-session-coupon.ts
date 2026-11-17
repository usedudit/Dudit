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
        openOperator: details.operators?.open_name || details.operators?.openName || "-",
        closeOperator: details.operators?.close_name || details.operators?.closeName || null,
        initialAmount: details.totals?.initial ?? 0,
        summaryByPaymentMethod: (details.summaryByPaymentMethod || []).map((row: any) => ({
            label: row.label,
            calculated: row.calculated,
            counted: row.counted,
            difference: row.difference,
        })),
        totals: {
            totalSalesAllMethods: details.totals?.totalSalesAllMethods ?? 0,
            totalWithdrawals: details.totals?.totalWithdrawals ?? 0,
            totalDeposits: details.totals?.totalDeposits ?? 0,
            calculatedDrawerTotal: details.totals?.calculatedDrawerTotal ?? 0,
            informedDrawerTotal: details.totals?.informedDrawerTotal ?? null,
            difference: details.totals?.difference ?? null,
        },
        notes: details.session?.notes || null,
    }
}
