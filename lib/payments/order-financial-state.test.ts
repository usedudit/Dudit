import { describe, expect, it } from "vitest"
import { getExpectedMpChargeAmount, getOrderPaidAmount, getOrderTotalAmount, getOrderRemainingBalance, getOrderDepositSummary, mergeCheckoutFulfillment } from "@/lib/payments/order-financial-state"
import type { OrderFinancialSnapshot } from "@/lib/payments/order-financial-state"

describe("getOrderPaidAmount", () => {
  it("returns 0 for order with no paid amount", () => {
    const order: OrderFinancialSnapshot = { total_amount: 100 }
    expect(getOrderPaidAmount(order)).toBe(0)
  })

  it("returns paid_amount when present", () => {
    const order: OrderFinancialSnapshot = { total_amount: 100, paid_amount: 50 }
    expect(getOrderPaidAmount(order)).toBe(50)
  })
})

describe("getOrderTotalAmount", () => {
  it("returns 0 for order with no total", () => {
    const order: OrderFinancialSnapshot = {}
    expect(getOrderTotalAmount(order)).toBe(0)
  })
})

describe("getOrderRemainingBalance", () => {
  it("returns total minus paid", () => {
    const order: OrderFinancialSnapshot = { total_amount: 100, paid_amount: 30 }
    expect(getOrderRemainingBalance(order)).toBe(70)
  })
})

describe("getOrderDepositSummary", () => {
  it("returns not_required for order without deposit", () => {
    const order: OrderFinancialSnapshot = { total_amount: 100 }
    const summary = getOrderDepositSummary(order)
    expect(summary.usesDeposit).toBe(false)
    expect(summary.depositStatus).toBe("not_required")
  })

  it("returns expired status from deposit metadata", () => {
    const order: OrderFinancialSnapshot = {
      total_amount: 100,
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "expired",
        },
      },
    }
    const summary = getOrderDepositSummary(order)
    expect(summary.usesDeposit).toBe(true)
    expect(summary.depositStatus).toBe("expired")
    expect(summary.sinalPaid).toBe(false)
  })
})

describe("mergeCheckoutFulfillment", () => {
  const existing = {
    version: 1,
    buyerId: "buyer-1",
    partnerId: "partner-1",
    deliveryType: "pickup",
    deliveryAddress: "",
    lines: [
      {
        itemType: "service_booking",
        bookingMetadata: { date: "2026-10-30", time: "14:00", staffId: "staff-1" },
      },
    ],
    depositCheckout: { usesDeposit: true, depositStatus: "pending" },
  }

  it("keeps booking lines when a deposit-only payload is written", () => {
    const merged = mergeCheckoutFulfillment(existing, {
      usesDeposit: true,
      depositAmount: 5,
      depositCheckout: { usesDeposit: true, depositStatus: "paid", depositAmount: 5 },
    })

    expect(merged?.lines).toEqual(existing.lines)
    expect(merged?.buyerId).toBe("buyer-1")
    expect(merged?.deliveryType).toBe("pickup")
    expect((merged?.depositCheckout as any).depositStatus).toBe("paid")
    expect((merged?.depositCheckout as any).depositAmount).toBe(5)
  })

  it("keeps existing structural values when incoming has empty lines", () => {
    const merged = mergeCheckoutFulfillment(existing, { lines: [] })
    expect(merged?.lines).toEqual(existing.lines)
  })

  it("returns the incoming value when there is nothing stored", () => {
    const incoming = { lines: [{ itemType: "product" }] }
    expect(mergeCheckoutFulfillment(null, incoming)).toBe(incoming)
  })

  it("returns the stored value when nothing is written", () => {
    expect(mergeCheckoutFulfillment(existing, null)).toEqual(existing)
  })
})

describe("getExpectedMpChargeAmount", () => {
  it("returns full total for order without deposit", () => {
    const order: OrderFinancialSnapshot = { total_amount: 100 }
    expect(getExpectedMpChargeAmount(order)).toBe(100)
  })

  it("returns initial charge amount for pending deposit", () => {
    const order: OrderFinancialSnapshot = {
      total_amount: 100,
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "pending",
        },
      },
    }
    expect(getExpectedMpChargeAmount(order)).toBe(50)
  })

  it("returns full total for expired deposit with no payment", () => {
    const order: OrderFinancialSnapshot = {
      total_amount: 100,
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "expired",
          fullOrderTotal: 100,
        },
      },
    }
    expect(getExpectedMpChargeAmount(order)).toBe(100)
  })

  it("returns remaining balance when deposit is paid", () => {
    const order: OrderFinancialSnapshot = {
      total_amount: 100,
      paid_amount: 50,
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "partially_paid",
          sinalPaid: true,
          fullOrderTotal: 100,
        },
      },
    }
    expect(getExpectedMpChargeAmount(order)).toBe(50)
  })
})
