import { describe, expect, it } from "vitest"
import { isStoreCreditMethod, toCanonicalPaymentType, formatPaymentMethodLabel } from "./payment-method"
import { formatPaymentMethodLabel as formatPaymentMethodLabelFull } from "@/lib/utils/payment-method-label"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"

describe("subscription credits payment method handling", () => {
  it("resolves subscription credits to canonical type subscription_credits and NOT credit_card", () => {
    expect(toCanonicalPaymentType("Assinatura (Créditos)")).toBe("subscription_credits")
    expect(toCanonicalPaymentType("Créditos de Assinatura")).toBe("subscription_credits")
    expect(toCanonicalPaymentType("subscription_credits")).toBe("subscription_credits")
    expect(toCanonicalPaymentType("assinatura")).toBe("subscription_credits")
  })

  it("formats subscription credits label correctly and not as Cartão de Crédito", () => {
    expect(formatPaymentMethodLabel("Assinatura (Créditos)")).toBe("Assinatura (Créditos)")
    expect(formatPaymentMethodLabel("subscription_credits")).toBe("Assinatura (Créditos)")
    expect(formatPaymentMethodLabel("Créditos de Assinatura")).toBe("Assinatura (Créditos)")
  })
})

describe("store credit payment method handling", () => {
  it("resolves store credit to canonical type store_credit and NOT credit_card", () => {
    expect(toCanonicalPaymentType("Crédito do cliente")).toBe("store_credit")
    expect(toCanonicalPaymentType("Crédito de cliente")).toBe("store_credit")
    expect(toCanonicalPaymentType("store_credit")).toBe("store_credit")
    expect(toCanonicalPaymentType("store-credit")).toBe("store_credit")
    expect(toCanonicalPaymentType("Vale-compra")).toBe("store_credit")
  })

  it("formats store credit label correctly and not as Cartão de Crédito", () => {
    expect(formatPaymentMethodLabel("store_credit")).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabel("Crédito do cliente")).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabel("Crédito de cliente")).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabel("Vale-compra")).toBe("Vale-compra")
    expect(formatPaymentMethodLabel("exchange")).toBe("Crédito de troca")

    expect(formatPaymentMethodLabelFull("store_credit", null)).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabelFull("Crédito do cliente", null)).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabelFull("Crédito de cliente", null)).toBe("Crédito do cliente")
    expect(formatPaymentMethodLabelFull("Vale-compra", null)).toBe("Vale-compra")
    expect(formatPaymentMethodLabelFull("exchange", null)).toBe("Crédito de troca")
  })
})

describe("isStoreCreditMethod", () => {
  it("recognizes store credit labels", () => {
    expect(isStoreCreditMethod("store_credit")).toBe(true)
    expect(isStoreCreditMethod("store-credit")).toBe(true)
    expect(isStoreCreditMethod("Vale-compra")).toBe(true)
    expect(isStoreCreditMethod("vale_compra")).toBe(true)
    expect(isStoreCreditMethod("Crédito de troca")).toBe(true)
    expect(isStoreCreditMethod("Crédito do cliente")).toBe(true)
    expect(isStoreCreditMethod("crédito de cliente")).toBe(true)
    expect(isStoreCreditMethod("credito cliente")).toBe(true)
  })

  it("does not confuse regular credit cards with store credit", () => {
    expect(isStoreCreditMethod("Cartão de Crédito")).toBe(false)
    expect(isStoreCreditMethod("credito")).toBe(false)
    expect(isStoreCreditMethod("credit_card")).toBe(false)
    expect(isStoreCreditMethod("Pix")).toBe(false)
    expect(isStoreCreditMethod(null)).toBe(false)
  })
})

describe("pickBestPaymentMethod online default prioritization", () => {
  it("prioritizes is_online_default over is_default when preferOnlineDefault is true or default", async () => {
    const mockMethods = [
      {
        id: "offline-cc",
        partner_id: "partner-1",
        type: "credit_card",
        payment_type: "credito",
        is_active: true,
        is_default: true,
        is_online_default: false,
        max_installments: 3,
        name: "Cartão Balcão",
      },
      {
        id: "online-cc",
        partner_id: "partner-1",
        type: "credit_card",
        payment_type: "credito",
        is_active: true,
        is_default: false,
        is_online_default: true,
        max_installments: 6,
        name: "Cartão Online",
      },
    ]

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: (field: string, val: any) => {
            if (field === "partner_id") {
              return {
                eq: (f2: string, v2: any) => ({
                  data: mockMethods,
                }),
              }
            }
            return { data: mockMethods }
          },
        }),
      }),
    }

    const selected = await pickBestPaymentMethod(mockSupabase as any, "credit_card", "partner-1", { preferDefault: true })
    expect(selected?.id).toBe("online-cc")
    expect(selected?.max_installments).toBe(6)
  })
})
