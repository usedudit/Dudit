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
        // amountReceived = 12.75, 2% discount → effective = 13.01 (settles more), discount = 0.26
        const rows = [
            { method: "pix", amount: 12.75, amountReceived: 12.75, paymentMethodId: "pix", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(12.75, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(13.01) // 12.75 + 0.26 discount = 13.01 effective
            expect(res.paymentMethodDiscountAmount).toBe(0.26)
            expect(res.adjustedRows[0].finalAmount).toBe(13.01)
            expect(res.adjustedRows[0].amountReceived).toBe(12.75)
            expect(res.adjustedRows[0].adjustmentType).toBe("discount")
            expect(res.adjustedRows[0].effectiveAmount).toBe(13.01)
        }
    })

    it("should calculate correctly for partial payment with a payment method discount", () => {
        const methods = createMethodMap([
            { id: "pix", discount_percent: 2 }
        ])
        // amountReceived = 8.00, 2% discount → effective = 8.16, discount = 0.16
        const rows = [
            { method: "pix", amount: 8.00, amountReceived: 8.00, paymentMethodId: "pix", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(12.75, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(8.16) // effective = 8 + 0.16 = 8.16
            expect(res.paymentMethodDiscountAmount).toBe(0.16) // discount on 8.00 = 0.16
            expect(res.adjustedRows[0].finalAmount).toBe(8.16)
        }
    })

    it("should calculate correctly for full payment with customer-borne method fee", () => {
        const methods = createMethodMap([
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        // amountReceived = 100, 5% fee customer → effective = 95 (settles less), fee = 5
        const rows = [
            { method: "credit", amount: 100.00, amountReceived: 100.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(95.00) // 100 - 5 fee = 95 effective
            expect(res.feeAmount).toBe(5.00)
            expect(res.adjustedRows[0].finalAmount).toBe(95.00)
            expect(res.adjustedRows[0].adjustmentType).toBe("fee")
            expect(res.adjustedRows[0].effectiveAmount).toBe(95.00)
            expect(res.adjustedRows[0].netAmount).toBe(95.00)
        }
    })

    it("should calculate correctly for partial payment with customer-borne method fee", () => {
        const methods = createMethodMap([
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        // amountReceived = 60, 5% fee customer → effective = 57, fee = 3
        const rows = [
            { method: "credit", amount: 60.00, amountReceived: 60.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.finalTotal).toBe(57.00) // 60 - 3 = 57
            expect(res.feeAmount).toBe(3.00) // fee on 60 = 3
            expect(res.adjustedRows[0].finalAmount).toBe(57.00)
        }
    })
})

describe("recalculateSplitPaymentFromBaseAmounts - Multiple Split Payment Mode", () => {
    const emptyFees = new Map<string, InstallmentFee[]>()

    it("should calculate correctly for split payment between two methods (one discount, one fee)", () => {
        const methods = createMethodMap([
            { id: "pix", discount_percent: 2 },
            { id: "credit", fee_percent: 5, fee_bearer: "customer" }
        ])
        const rows = [
            { method: "pix", amount: 40.00, amountReceived: 40.00, paymentMethodId: "pix", installmentNumber: 1 },
            { method: "credit", amount: 60.00, amountReceived: 60.00, paymentMethodId: "credit", installmentNumber: 1 }
        ]
        // Base sum matches total (40 + 60 = 100)
        const res = recalculateSplitPaymentFromBaseAmounts(100.00, rows, methods, emptyFees)

        expect(res.ok).toBe(true)
        if (res.ok) {
            // Pix leg: received 40 -> 2% discount (0.80) -> effective 40.80
            // Credit leg: received 60 -> 5% fee customer (3.00) -> effective 57.00
            // Final total = 40.80 + 57.00 = 97.80
            expect(res.finalTotal).toBe(97.80)
            expect(res.paymentMethodDiscountAmount).toBe(0.80)
            expect(res.feeAmount).toBe(3.00)
            expect(res.adjustedRows[0].finalAmount).toBe(40.80)
            expect(res.adjustedRows[0].adjustmentType).toBe("discount")
            expect(res.adjustedRows[0].effectiveAmount).toBe(40.80)
            expect(res.adjustedRows[1].finalAmount).toBe(57.00)
            expect(res.adjustedRows[1].adjustmentType).toBe("fee")
            expect(res.adjustedRows[1].effectiveAmount).toBe(57.00)
        }
    })
})
