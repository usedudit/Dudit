import { describe, it, expect } from "vitest"
import { buildCashSessionCouponData } from "./cash-session-coupon"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

describe("buildCashSessionCouponData", () => {
    const mockPartnerHeader: SaleReceiptPartnerHeader = {
        fantasyName: "Loja Teste",
        legalName: "Loja Teste LTDA",
        addressLine: "Rua das Flores, 123",
        taxIdLine: "12.345.678/0001-90",
        phone: "(11) 99999-9999",
    }

    it("correctly builds coupon data for an open session", () => {
        const details = {
            session: {
                id: "sess-12345678",
                status: "open",
                opened_at: "2026-11-17T10:00:00Z",
                closed_at: null,
                notes: null,
            },
            operators: {
                open_name: "Operador A",
                close_name: null,
            },
            totals: {
                initial: 100,
                totalSalesAllMethods: 0,
                totalWithdrawals: 0,
                totalDeposits: 0,
                calculatedDrawerTotal: 100,
                informedDrawerTotal: null,
                difference: null,
            },
            summaryByPaymentMethod: [],
        }

        const coupon = buildCashSessionCouponData(details, mockPartnerHeader)

        expect(coupon.partnerName).toBe("Loja Teste")
        expect(coupon.partnerDoc).toBe("12.345.678/0001-90")
        expect(coupon.sessionId).toBe("sess-12345678")
        expect(coupon.status).toBe("open")
        expect(coupon.openOperator).toBe("Operador A")
        expect(coupon.closeOperator).toBeNull()
        expect(coupon.initialAmount).toBe(100)
        expect(coupon.totals.calculatedDrawerTotal).toBe(100)
        expect(coupon.totals.informedDrawerTotal).toBeNull()
    })

    it("correctly builds coupon data for a closed session with sales and movements", () => {
        const details = {
            session: {
                id: "sess-87654321",
                status: "closed",
                opened_at: "2026-11-17T08:00:00Z",
                closed_at: "2026-11-17T18:00:00Z",
                notes: "Fechamento conferido",
            },
            operators: {
                open_name: "Operador A",
                close_name: "Gerente B",
            },
            totals: {
                initial: 100,
                totalSalesAllMethods: 450,
                totalWithdrawals: 50,
                totalDeposits: 20,
                calculatedDrawerTotal: 520,
                informedDrawerTotal: 520,
                difference: 0,
            },
            summaryByPaymentMethod: [
                { label: "Dinheiro", calculated: 200, counted: 200, difference: 0 },
                { label: "Cartão de Crédito", calculated: 250, counted: 250, difference: 0 },
            ],
        }

        const coupon = buildCashSessionCouponData(details, mockPartnerHeader)

        expect(coupon.status).toBe("closed")
        expect(coupon.closedAt).toBe("2026-11-17T18:00:00Z")
        expect(coupon.closeOperator).toBe("Gerente B")
        expect(coupon.summaryByPaymentMethod).toHaveLength(2)
        expect(coupon.totals.calculatedDrawerTotal).toBe(520)
        expect(coupon.totals.informedDrawerTotal).toBe(520)
        expect(coupon.totals.difference).toBe(0)
        expect(coupon.notes).toBe("Fechamento conferido")
    })
})
