import { describe, expect, it } from "vitest"
import { computePaymentExpiresAt, computePickupPaymentExpiresAt, EXPIRATION_TIMES } from "@/lib/services/order-expiration"

describe("computePaymentExpiresAt", () => {
  const now = new Date("2026-06-12T10:00:00Z")

  it("returns 30 minutes for PIX", () => {
    const result = computePaymentExpiresAt("pix", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.pix * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for PIX (Mercado Pago)", () => {
    const result = computePaymentExpiresAt("pix (mercado pago)", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.pix * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for credit card", () => {
    const result = computePaymentExpiresAt("credit_card", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for debit card", () => {
    const result = computePaymentExpiresAt("debit_card", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for cartão de crédito", () => {
    const result = computePaymentExpiresAt("cartão de crédito", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for cartão (mercado pago)", () => {
    const result = computePaymentExpiresAt("cartão (mercado pago)", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for Mercado Pago balance", () => {
    const result = computePaymentExpiresAt("account_money", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.mercado_pago_wallet * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 30 minutes for saldo mercado pago", () => {
    const result = computePaymentExpiresAt("saldo mercado pago", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.mercado_pago_wallet * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 3 days for boleto", () => {
    const result = computePaymentExpiresAt("bolbradesco", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.boleto * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("returns 3 days for boleto (mercado pago)", () => {
    const result = computePaymentExpiresAt("boleto (mercado pago)", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.boleto * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("defaults to 30 minutes for unknown method", () => {
    const result = computePaymentExpiresAt("unknown_method", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })

  it("is case insensitive", () => {
    const result = computePaymentExpiresAt("PIX", now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.pix * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })
})

describe("computePickupPaymentExpiresAt", () => {
  it("returns 24 hours from now", () => {
    const now = new Date("2026-06-12T10:00:00Z")
    const result = computePickupPaymentExpiresAt(now)
    const expected = new Date(now.getTime() + EXPIRATION_TIMES.pickup_payment * 1000)
    expect(result.getTime()).toBe(expected.getTime())
  })
})

describe("checkAndExpireDeposit", () => {
  it("returns false for order without deposit", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: {
                checkout_fulfillment: null,
                paid_amount: 0,
                payment_expires_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
    }

    const { checkAndExpireDeposit } = await import("@/lib/services/order-expiration")
    const result = await checkAndExpireDeposit(mockClient, "test-order-id")
    expect(result.expired).toBe(false)
    expect(result.reason).toBe("no_deposit")
  })

  it("returns false for order with paid deposit", async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: {
                checkout_fulfillment: {
                  depositCheckout: {
                    usesDeposit: true,
                    depositStatus: "paid",
                    sinalPaid: true,
                  },
                },
                paid_amount: 5,
                payment_expires_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
    }

    const { checkAndExpireDeposit } = await import("@/lib/services/order-expiration")
    const result = await checkAndExpireDeposit(mockClient, "test-order-id")
    expect(result.expired).toBe(false)
  })
})
