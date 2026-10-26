import { describe, it, expect } from "vitest"
import {
  buildMpApprovedPaymentUpdate,
  isMpPaymentAlreadyRecorded,
  isMpPaymentManuallyRecorded,
} from "./mp-order-payment-update"

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

  const manuallyConfirmedOrder = {
    total_amount: 100,
    paid_amount: 30,
    situation: "partially_paid",
    checkout_fulfillment: {
      depositCheckout: {
        usesDeposit: true,
        payDepositOnly: true,
        depositAmount: 30,
        initialChargeAmount: 30,
        fullOrderTotal: 100,
        sinalPaid: true,
        depositStatus: "partially_paid",
      },
    },
    payment_breakdown: [
      {
        method: "Pix (Mercado Pago)",
        amount: 30,
        amountReceived: 30,
        provider: "Mercado Pago",
        paymentKind: "deposit",
        paymentStatus: "approved",
        paymentStatusDetail: "manually_confirmed",
        manuallyConfirmed: true,
        mpPaymentId: "999",
      },
    ],
  }

  it("identifies a manually recorded MP payment", () => {
    expect(isMpPaymentAlreadyRecorded(manuallyConfirmedOrder, "999")).toBe(true)
    expect(isMpPaymentManuallyRecorded(manuallyConfirmedOrder, "999")).toBe(true)
    expect(isMpPaymentManuallyRecorded(manuallyConfirmedOrder, "123")).toBe(false)
  })

  it("does not treat a normal MP payment as manually recorded", () => {
    const normalOrder = {
      ...manuallyConfirmedOrder,
      payment_breakdown: [
        {
          ...manuallyConfirmedOrder.payment_breakdown[0],
          manuallyConfirmed: false,
          paymentStatusDetail: null,
        },
      ],
    }

    expect(isMpPaymentAlreadyRecorded(normalOrder, "999")).toBe(true)
    expect(isMpPaymentManuallyRecorded(normalOrder, "999")).toBe(false)
  })

  it("does not add the amount again when the payment was manually confirmed", () => {
    const update = buildMpApprovedPaymentUpdate({
      order: manuallyConfirmedOrder,
      transactionAmount: 30,
      paymentMethodName: "Pix",
      mpPaymentId: "999",
      mpPaymentMethodId: "pix",
      existingBreakdown: manuallyConfirmedOrder.payment_breakdown,
    })

    expect(update.paid_amount).toBe(30)
    expect(update.amount_paid).toBe(30)
    expect(update.situation).toBe("partially_paid")
    expect(update.payment_breakdown).toHaveLength(1)
    expect((update.payment_breakdown as any[])[0].manuallyConfirmed).toBe(true)
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
