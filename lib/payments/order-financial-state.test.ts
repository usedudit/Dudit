import { describe, expect, it } from "vitest"
import { getExpectedMpChargeAmount, getOrderPaidAmount, getOrderTotalAmount, getOrderRemainingBalance, getOrderDepositSummary } from "@/lib/payments/order-financial-state"
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
