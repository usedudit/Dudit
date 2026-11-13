import { describe, expect, it } from "vitest"
import { isStoreCreditMethod } from "./payment-method"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"

describe("isStoreCreditMethod", () => {
  it("recognizes store credit labels", () => {
    expect(isStoreCreditMethod("store_credit")).toBe(true)
    expect(isStoreCreditMethod("store-credit")).toBe(true)
    expect(isStoreCreditMethod("Vale-compra")).toBe(true)
    expect(isStoreCreditMethod("vale_compra")).toBe(true)
    expect(isStoreCreditMethod("Crédito de troca")).toBe(true)
    expect(isStoreCreditMethod("Crédito do cliente")).toBe(true)
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
