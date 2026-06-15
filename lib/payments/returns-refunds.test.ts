import { describe, it, expect } from "vitest"
import { extractMercadoPagoPaidAmount } from "../../app/actions/erp/returns"

describe("extractMercadoPagoPaidAmount", () => {
    it("should extract full amount when no breakdown is present and provider is Mercado Pago", () => {
        const order = {
            amount_paid: 150.00,
            payment_provider: "Mercado Pago",
            mp_payment_id: "12345678"
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(150.00)
    })

    it("should extract full amount when no breakdown is present, provider is lowercase mercado pago, and mp_payment_id is missing", () => {
        const order = {
            amount_paid: 200.00,
            payment_provider: "mercado pago"
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(200.00)
    })

    it("should extract full amount when mp_payment_id is present, even if payment_provider is different/missing", () => {
        const order = {
            amount_paid: 120.00,
            mp_payment_id: "987654321"
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(120.00)
    })

    it("should return 0 when no breakdown is present and it is not a Mercado Pago payment", () => {
        const order = {
            amount_paid: 100.00,
            payment_provider: "Safe2Pay"
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(0)
    })

    it("should sum only Mercado Pago entries from breakdown", () => {
        const order = {
            amount_paid: 250.00,
            payment_breakdown: [
                { provider: "Mercado Pago", amount: 100.00, effectiveAmount: 100.00 },
                { provider: "Safe2Pay", amount: 150.00, effectiveAmount: 150.00 }
            ]
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(100.00)
    })

    it("should sum multiple Mercado Pago entries from breakdown if there are any", () => {
        const order = {
            amount_paid: 300.00,
            payment_breakdown: [
                { provider: "Mercado Pago", amount: 100.00 },
                { provider: "mercado pago", amount: 50.00 },
                { provider: "Pix", amount: 150.00 }
            ]
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(150.00)
    })

    it("should use effectiveAmount if amount is missing in breakdown", () => {
        const order = {
            amount_paid: 200.00,
            payment_breakdown: [
                { provider: "Mercado Pago", effectiveAmount: 120.00 },
                { provider: "Boleto", amount: 80.00 }
            ]
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(120.00)
    })

    it("should return 0 if breakdown is present but has no Mercado Pago entries", () => {
        const order = {
            amount_paid: 180.00,
            payment_breakdown: [
                { provider: "Safe2Pay", amount: 100.00 },
                { provider: "Dinheiro", amount: 80.00 }
            ]
        }
        expect(extractMercadoPagoPaidAmount(order)).toBe(0)
    })
})

describe("Refund Capping Logic Simulating User Scenarios", () => {
    function calculateCappedMpRefund(requestedRefundAmount: number, order: any, hasMercadoPago: boolean): number {
        if (!hasMercadoPago || requestedRefundAmount <= 0) return 0
        const mpPaidAmount = extractMercadoPagoPaidAmount(order)
        return Math.min(requestedRefundAmount, mpPaidAmount)
    }

    it("Reembolso total Mercado Pago — single payment MP", () => {
        const order = {
            amount_paid: 150.00,
            payment_provider: "Mercado Pago",
            mp_payment_id: "mp-123"
        }
        const hasMercadoPago = true
        const requestedRefund = 150.00
        expect(calculateCappedMpRefund(requestedRefund, order, hasMercadoPago)).toBe(150.00)
    })

    it("Reembolso parcial Mercado Pago — single payment MP", () => {
        const order = {
            amount_paid: 150.00,
            payment_provider: "Mercado Pago",
            mp_payment_id: "mp-123"
        }
        const hasMercadoPago = true
        const requestedRefund = 50.00
        expect(calculateCappedMpRefund(requestedRefund, order, hasMercadoPago)).toBe(50.00)
    })

    it("Pedido pago parcialmente via Mercado Pago + outro meio (Reembolso parcial dentro do limite MP)", () => {
        const order = {
            amount_paid: 200.00,
            mp_payment_id: "mp-123",
            payment_breakdown: [
                { provider: "Mercado Pago", amount: 120.00 },
                { provider: "Pix", amount: 80.00 }
            ]
        }
        const hasMercadoPago = true
        const requestedRefund = 100.00
        expect(calculateCappedMpRefund(requestedRefund, order, hasMercadoPago)).toBe(100.00)
    })

    it("Refund acima do valor pago via Mercado Pago (deve limitar corretamente ao teto de MP)", () => {
        const order = {
            amount_paid: 200.00,
            mp_payment_id: "mp-123",
            payment_breakdown: [
                { provider: "Mercado Pago", amount: 120.00 },
                { provider: "Pix", amount: 80.00 }
            ]
        }
        const hasMercadoPago = true
        const requestedRefund = 150.00 // requested is 150, but MP paid was only 120
        expect(calculateCappedMpRefund(requestedRefund, order, hasMercadoPago)).toBe(120.00)
    })
})

