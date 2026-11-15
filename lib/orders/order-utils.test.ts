import { describe, it, expect } from "vitest"
import { normalizeOrderSource, resolveOrderPaymentMethodLabel, areTimestampsEquivalent } from "@/lib/orders/order-utils"
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
        expect(resolveOrderPaymentMethodLabel({ payment_method: "Assinatura (Créditos)" })).toBe("Assinatura (Créditos)")
    })

    it("resolves subscription credits with zero amount correctly", () => {
        expect(
            resolveOrderPaymentMethodLabel({
                payment_method: "Assinatura (Créditos)",
                payment_breakdown: [
                    {
                        method: "Assinatura (Créditos)",
                        amount: 0,
                        effectiveAmount: 0,
                        amountReceived: 0,
                        paymentType: "subscription_credits",
                    },
                ],
            }),
        ).toBe("Assinatura (Créditos)")
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

describe("areTimestampsEquivalent", () => {
    it("returns true for identical timestamp strings", () => {
        const ts = "2026-11-03T14:30:00.000Z"
        expect(areTimestampsEquivalent(ts, ts)).toBe(true)
    })

    it("returns true for both null or undefined", () => {
        expect(areTimestampsEquivalent(null, null)).toBe(true)
        expect(areTimestampsEquivalent(undefined, undefined)).toBe(true)
    })

    it("returns false if one is null and the other is defined", () => {
        expect(areTimestampsEquivalent("2026-11-03T14:30:00.000Z", null)).toBe(false)
        expect(areTimestampsEquivalent(null, "2026-11-03T14:30:00.000Z")).toBe(false)
    })

    it("handles ISO string with Z vs +00:00 offset seamlessly", () => {
        const isoZ = "2026-11-03T14:30:00.123Z"
        const isoOffset = "2026-11-03T14:30:00.123+00:00"
        expect(areTimestampsEquivalent(isoZ, isoOffset)).toBe(true)
    })

    it("handles microsecond truncation between Postgres and JS Date", () => {
        const postgresMicroseconds = "2026-11-03T14:30:00.123456+00:00"
        const jsMilliseconds = "2026-11-03T14:30:00.123Z"
        expect(areTimestampsEquivalent(postgresMicroseconds, jsMilliseconds)).toBe(true)
    })

    it("returns true for timestamps within 2000ms window (e.g. quick inline retry triggers)", () => {
        const t1 = "2026-11-03T14:30:00.000Z"
        const t2 = "2026-11-03T14:30:01.500Z"
        expect(areTimestampsEquivalent(t1, t2)).toBe(true)
    })

    it("returns false for timestamps further apart (> 2000ms)", () => {
        const t1 = "2026-11-03T14:30:00.000Z"
        const t2 = "2026-11-03T14:30:03.000Z"
        expect(areTimestampsEquivalent(t1, t2)).toBe(false)
    })
})

