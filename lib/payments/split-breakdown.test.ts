import { describe, it, expect } from "vitest"
import { recalculateSplitPaymentFromBaseAmounts, type MethodRow, type InstallmentFee } from "./split-breakdown"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMethodMap(methods: Partial<MethodRow & { id: string }>[]) {
    const map = new Map<string, MethodRow>()
    for (const m of methods) {
        const fullMethod: MethodRow = {
            id: m.id || "pm-1",
            fee_percent: m.fee_percent ?? 0,
            fee_fixed: m.fee_fixed ?? 0,
            fee_bearer: m.fee_bearer ?? "merchant",
            discount_percent: m.discount_percent ?? 0,
            max_installments: m.max_installments ?? 1,
            ...m
        }
        map.set(fullMethod.id, fullMethod)
    }
    return map
}

describe("recalculateSplitPaymentFromBaseAmounts - Single Payment Mode", () => {
    const emptyFees = new Map<string, InstallmentFee[]>()

    it("should calculate correctly for full payment with a payment method discount", () => {
        const methods = createMethodMap([
            { id: "pix", discount_percent: 2 }
        ])
        const rows = [
            { method: "pix", amount: 12.75, paymentMethodId: "pix", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(12.75, rows, methods, emptyFees)
        
        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(12.49) // 12.75 - 2% (0.26 discount) = 12.49
            expect(res.paymentMethodDiscountAmount).toBe(0.26)
            expect(res.adjustedRows[0].finalAmount).toBe(12.49)
        }
    })

    it("should calculate correctly for partial payment with a payment method discount (anchor discount to full total)", () => {
        const methods = createMethodMap([
            { id: "pix", discount_percent: 2 }
        ])
        // Total of order is 12.75, user chooses Pix (2% discount -> final total 12.49) but types amount to receive = 8.00
        const rows = [
            { method: "pix", amount: 8.00, paymentMethodId: "pix", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(12.75, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(12.49) // Total is still 12.49
            expect(res.paymentMethodDiscountAmount).toBe(0.26) // Discount is still computed on 12.75 (0.26)
            expect(res.adjustedRows[0].finalAmount).toBe(8.00) // The row stores the exact amount paid (8.00)
        }
    })

    it("should calculate correctly for full payment with customer-borne method fee", () => {
        const methods = createMethodMap([
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        const rows = [
            { method: "credit", amount: 100.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(105.00)
            expect(res.feeAmount).toBe(5.00)
            expect(res.adjustedRows[0].finalAmount).toBe(105.00)
        }
    })

    it("should calculate correctly for partial payment with customer-borne method fee", () => {
        const methods = createMethodMap([
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        const rows = [
            { method: "credit", amount: 60.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(105.00) // Base calculation on 100 -> fee is 5.00 -> final total is 105.00
            expect(res.feeAmount).toBe(5.00)
            expect(res.adjustedRows[0].finalAmount).toBe(60.00) // Row stores the actual paid amount (60.00)
        }
    })
})

describe("recalculateSplitPaymentFromBaseAmounts - Multiple Split Payment Mode", () => {
    const emptyFees = new Map<string, InstallmentFee[]>()

    it("should calculate correctly for split payment between two methods (one with fee)", () => {
        const methods = createMethodMap([
            { id: "pix", discount_percent: 2 },
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        const rows = [
            { method: "pix", amount: 40.00, paymentMethodId: "pix", installmentNumber: 1 },
            { method: "credit", amount: 60.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        // Base sum matches total (40 + 60 = 100)
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            // Pix leg: base 40 -> 2% discount (0.80) -> final amount 39.20
            // Credit leg: base 60 -> 5% fee customer-borne (3.00) -> final amount 63.00
            // Final total = 39.20 + 63.00 = 102.20
            expect(res.finalTotal).toBe(102.20)
            expect(res.paymentMethodDiscountAmount).toBe(0.80)
            expect(res.feeAmount).toBe(3.00)
            expect(res.adjustedRows[0].finalAmount).toBe(39.20)
            expect(res.adjustedRows[1].finalAmount).toBe(63.00)
        }
    })
})
