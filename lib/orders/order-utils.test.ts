import { describe, it, expect } from "vitest"
import { normalizeOrderSource, resolveOrderPaymentMethodLabel } from "@/lib/orders/order-utils"
import { canonicalDeliveryStatus } from "@/lib/orders/status"

describe("normalizeOrderSource", () => {
    it("normalizes legacy sources", () => {
        expect(normalizeOrderSource(null)).toBe("Manual")
        expect(normalizeOrderSource("Direct Sales")).toBe("Manual")
        expect(normalizeOrderSource("Online Store")).toBe("Loja Online")
        expect(normalizeOrderSource("admin_service_order")).toBe("Ordem de Serviço")
        expect(normalizeOrderSource("Marketplace")).toBe("Marketplace")
    })
})

describe("resolveOrderPaymentMethodLabel", () => {
    it("uses the paid leg from the payment breakdown", () => {
        expect(
            resolveOrderPaymentMethodLabel({ payment_breakdown: [{ method: "pix", amountReceived: 100 }] }),
        ).toBe("Pix")
    })

    it("flags orders paid with more than one method", () => {
        expect(
            resolveOrderPaymentMethodLabel({
                payment_breakdown: [
                    { method: "pix", amountReceived: 50 },
                    { method: "dinheiro", amountReceived: 50 },
                ],
            }),
        ).toBe("Múltiplos meios")
    })

    it("ignores unpaid legs when a paid one exists", () => {
        expect(
            resolveOrderPaymentMethodLabel({
                payment_breakdown: [
                    { method: "Pix", amountReceived: 100 },
                    { method: "Boleto", amountReceived: 0 },
                ],
            }),
        ).toBe("Pix")
    })

    it("groups installments under the same method", () => {
        const twice = resolveOrderPaymentMethodLabel({ payment_method: "Cartão de Crédito - 2x" })
        const threeTimes = resolveOrderPaymentMethodLabel({ payment_method: "Cartão de Crédito - 3x" })
        expect(twice).toBe(threeTimes)
        expect(twice.toLowerCase()).toContain("crédito")
    })

    it("falls back to payment_method when there is no breakdown", () => {
        expect(resolveOrderPaymentMethodLabel({ payment_method: "Dinheiro" })).toBe("Dinheiro")
        expect(resolveOrderPaymentMethodLabel({ payment_method: "credit_card" })).toBe("Cartão De Crédito")
    })

    it("uses the checkout deposit method when nothing else is registered", () => {
        expect(
            resolveOrderPaymentMethodLabel({
                checkout_fulfillment: { depositCheckout: { paymentMethod: "Pix" } },
            }),
        ).toBe("Pix")
    })

    it("returns 'Não informado' for placeholders and empty orders", () => {
        expect(resolveOrderPaymentMethodLabel({ payment_method: "Método não definido" })).toBe("Não informado")
        expect(resolveOrderPaymentMethodLabel({ payment_method: "" })).toBe("Não informado")
        expect(resolveOrderPaymentMethodLabel({})).toBe("Não informado")
        expect(resolveOrderPaymentMethodLabel(null)).toBe("Não informado")
    })
})

describe("canonicalDeliveryStatus", () => {
    it("maps legacy and empty values to not_sent", () => {
        expect(canonicalDeliveryStatus("pending")).toBe("not_sent")
        expect(canonicalDeliveryStatus(null)).toBe("not_sent")
        expect(canonicalDeliveryStatus("")).toBe("not_sent")
        expect(canonicalDeliveryStatus(undefined)).toBe("not_sent")
    })

    it("keeps canonical values", () => {
        expect(canonicalDeliveryStatus("not_sent")).toBe("not_sent")
        expect(canonicalDeliveryStatus("preparing")).toBe("preparing")
        expect(canonicalDeliveryStatus("sent")).toBe("sent")
        expect(canonicalDeliveryStatus("pickup_available")).toBe("pickup_available")
        expect(canonicalDeliveryStatus("delivered")).toBe("delivered")
        expect(canonicalDeliveryStatus("delivery_failed")).toBe("delivery_failed")
    })
})
