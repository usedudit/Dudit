import { describe, it, expect } from "vitest"
import { buildMpApprovedPaymentUpdate } from "./mp-order-payment-update"

describe("buildMpApprovedPaymentUpdate", () => {
  const baseOrder = {
    total_amount: 100,
    paid_amount: 0,
    situation: "pending",
  }

  it("sanitizes non-uuid mpPaymentMethodId ('pix') to null for paymentMethodId", () => {
    const update = buildMpApprovedPaymentUpdate({
      order: baseOrder,
      transactionAmount: 100,
      paymentMethodName: "Pix",
      mpPaymentId: "123456789",
      mpPaymentMethodId: "pix",
      mpPaymentTypeId: "bank_transfer",
      existingBreakdown: [],
    })

    const breakdown = update.payment_breakdown as any[]
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].paymentMethodId).toBeNull()
    expect(breakdown[0].mpPaymentMethodId).toBe("pix")
    expect(breakdown[0].method).toBe("Pix")
  })

  it("preserves valid UUID for paymentMethodId if provided", () => {
    const validUuid = "12345678-1234-1234-1234-123456789abc"
    const update = buildMpApprovedPaymentUpdate({
      order: baseOrder,
      transactionAmount: 100,
      paymentMethodName: "Pix",
      mpPaymentId: "123456789",
      mpPaymentMethodId: validUuid,
      existingBreakdown: [],
    })

    const breakdown = update.payment_breakdown as any[]
    expect(breakdown[0].paymentMethodId).toBe(validUuid)
  })

  it("cleans existing breakdown with non-uuid paymentMethodId", () => {
    const existing = [
      {
        amount: 50,
        method: "pix",
        paymentMethodId: "pix", // invalid uuid from older buggy flow
      },
    ]

    const update = buildMpApprovedPaymentUpdate({
      order: {
        total_amount: 100,
        paid_amount: 50,
        situation: "pending",
      },
      transactionAmount: 50,
      paymentMethodName: "Pix",
      mpPaymentId: "123456789",
      mpPaymentMethodId: "pix",
      existingBreakdown: existing,
    })

    const breakdown = update.payment_breakdown as any[]
    for (const leg of breakdown) {
      if (leg.paymentMethodId) {
        expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leg.paymentMethodId)).toBe(true)
      } else {
        expect(leg.paymentMethodId).toBeNull()
      }
    }
  })
})
