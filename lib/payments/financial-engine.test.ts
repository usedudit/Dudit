import { describe, it, expect } from "vitest"
import { computePaymentLine, computePaymentBreakdown, deriveAdjustmentType } from "./financial-engine"
import type { PaymentMethodFeeConfig } from "./calculation"

const discountPix: PaymentMethodFeeConfig = {
  feePercent: 0,
  feeFixed: 0,
  feeBearer: "merchant",
  discountPercent: 2,
  maxInstallments: 1,
}

const feeCardCustomer: PaymentMethodFeeConfig = {
  feePercent: 3,
  feeFixed: 0,
  feeBearer: "customer",
  discountPercent: 0,
  maxInstallments: 1,
}

const feeCardMerchant: PaymentMethodFeeConfig = {
  feePercent: 3,
  feeFixed: 0,
  feeBearer: "merchant",
  discountPercent: 0,
  maxInstallments: 1,
}

const fixedFeeCustomer: PaymentMethodFeeConfig = {
  feePercent: 0,
  feeFixed: 1.5,
  feeBearer: "customer",
  discountPercent: 0,
  maxInstallments: 1,
}

const fixedFeeMerchant: PaymentMethodFeeConfig = {
  feePercent: 0,
  feeFixed: 1.5,
  feeBearer: "merchant",
  discountPercent: 0,
  maxInstallments: 1,
}

const noAdjustment: PaymentMethodFeeConfig = {
  feePercent: 0,
  feeFixed: 0,
  feeBearer: "merchant",
  discountPercent: 0,
  maxInstallments: 1,
}

// --------------- deriveAdjustmentType ---------------

describe("deriveAdjustmentType", () => {
  it("returns discount when discountPercent > 0", () => {
    expect(deriveAdjustmentType(discountPix)).toBe("discount")
  })

  it("returns fee when only feePercent > 0", () => {
    expect(deriveAdjustmentType(feeCardCustomer)).toBe("fee")
    expect(deriveAdjustmentType(feeCardMerchant)).toBe("fee")
  })

  it("returns fee when only feeFixed > 0", () => {
    expect(deriveAdjustmentType(fixedFeeCustomer)).toBe("fee")
    expect(deriveAdjustmentType(fixedFeeMerchant)).toBe("fee")
  })

  it("returns none when both are zero", () => {
    expect(deriveAdjustmentType(noAdjustment)).toBe("none")
  })
})

// --------------- computePaymentLine ---------------

describe("computePaymentLine - single payment", () => {
  it("discount: received 98, effective 100, net 100, adjustment -2 (2%)", () => {
    const r = computePaymentLine({ amountReceived: 98, paymentMethod: discountPix })
    expect(r.amountReceived).toBe(98)
    expect(r.adjustmentType).toBe("discount")
    expect(r.adjustmentPercent).toBe(2)
    expect(r.adjustmentAmount).toBe(1.96) // 98 * 0.02
    expect(r.effectiveAmount).toBe(99.96) // 98 + 1.96
    expect(r.netAmount).toBe(99.96)
    expect(r.feeBearer).toBeNull()
  })

  it("discount: received 10,00 effective 10,20 net 10,20 adjustment 0,20 (2%)", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: discountPix })
    expect(r.amountReceived).toBe(10)
    expect(r.adjustmentAmount).toBe(0.2)
    expect(r.effectiveAmount).toBe(10.2)
    expect(r.netAmount).toBe(10.2)
  })

  it("discount: received 100, effective 102, net 102, adjustment 2 (2%)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: discountPix })
    expect(r.adjustmentAmount).toBe(2)
    expect(r.effectiveAmount).toBe(102)
    expect(r.netAmount).toBe(102)
  })

  it("fee customer: received 10, effective 9.70, net 9.70, adjustment 0.30 (3%)", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: feeCardCustomer })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(3)
    expect(r.adjustmentAmount).toBe(0.3)
    expect(r.effectiveAmount).toBe(9.7)
    expect(r.netAmount).toBe(9.7)
    expect(r.feeBearer).toBe("customer")
  })

  it("fee merchant: received 100, effective 100, net 97, adjustment 3 (3%)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: feeCardMerchant })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentAmount).toBe(3)
    expect(r.effectiveAmount).toBe(100)
    expect(r.netAmount).toBe(97)
    expect(r.feeBearer).toBe("merchant")
  })

  it("fixed fee customer: received 10, effective 8.50, net 8.50, adjustment 1.50", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: fixedFeeCustomer })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(0)
    expect(r.adjustmentAmount).toBe(1.5)
    expect(r.effectiveAmount).toBe(8.5)
    expect(r.netAmount).toBe(8.5)
    expect(r.feeBearer).toBe("customer")
  })

  it("fixed fee merchant: received 10, effective 10, net 8.50, adjustment 1.50", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: fixedFeeMerchant })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(0)
    expect(r.adjustmentAmount).toBe(1.5)
    expect(r.effectiveAmount).toBe(10)
    expect(r.netAmount).toBe(8.5)
    expect(r.feeBearer).toBe("merchant")
  })

  it("no adjustment: received = effective = net", () => {
    const r = computePaymentLine({ amountReceived: 50, paymentMethod: noAdjustment })
    expect(r.adjustmentType).toBe("none")
    expect(r.adjustmentAmount).toBe(0)
    expect(r.effectiveAmount).toBe(50)
    expect(r.netAmount).toBe(50)
  })

  it("handles zero received", () => {
    const r = computePaymentLine({ amountReceived: 0, paymentMethod: discountPix })
    expect(r.adjustmentAmount).toBe(0)
    expect(r.effectiveAmount).toBe(0)
    expect(r.netAmount).toBe(0)
  })
})

// --------------- computePaymentBreakdown ---------------

describe("computePaymentBreakdown - split payments", () => {
  it("single discount line: order total 100, pix 2% on 98", () => {
    const r = computePaymentBreakdown({
      orderTotal: 100,
      lines: [{ amountReceived: 98, paymentMethod: discountPix }],
    })
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].effectiveAmount).toBe(99.96)
    expect(r.totalEffectiveAmount).toBe(99.96)
    expect(r.remainingBalance).toBeCloseTo(0.04, 4)
    expect(r.totalReceived).toBe(98)
    expect(r.totalNetAmount).toBe(99.96)
  })

  it("split: pix discount 50 + cash 50 = order 100", () => {
    const r = computePaymentBreakdown({
      orderTotal: 100,
      lines: [
        { amountReceived: 50, paymentMethod: discountPix },
        { amountReceived: 50, paymentMethod: noAdjustment },
      ],
    })
    expect(r.lines).toHaveLength(2)
    // Pix: 50 * 1.02 = 51 effective
    expect(r.lines[0].effectiveAmount).toBe(51)
    expect(r.lines[0].adjustmentType).toBe("discount")
    expect(r.lines[0].adjustmentAmount).toBe(1)
    // Cash: 50 flat
    expect(r.lines[1].effectiveAmount).toBe(50)
    expect(r.lines[1].adjustmentType).toBe("none")
    // Totals
    expect(r.totalEffectiveAmount).toBe(101)
    expect(r.totalReceived).toBe(100)
    expect(r.totalNetAmount).toBe(101)
    expect(r.remainingBalance).toBe(0) // 100 - 101 = -1 → clamped to 0
  })

  it("split: pix discount + card fee customer + cash", () => {
    const r = computePaymentBreakdown({
      orderTotal: 200,
      lines: [
        { amountReceived: 50, paymentMethod: discountPix },      // effective 51
        { amountReceived: 80, paymentMethod: feeCardCustomer },  // effective 77.6
        { amountReceived: 70, paymentMethod: noAdjustment },     // effective 70
      ],
    })
    expect(r.lines).toHaveLength(3)
    expect(r.lines[0].effectiveAmount).toBe(51)
    expect(r.lines[1].effectiveAmount).toBe(77.6)
    expect(r.lines[2].effectiveAmount).toBe(70)
    expect(r.totalEffectiveAmount).toBe(198.6)
    expect(r.totalNetAmount).toBe(198.6)
    expect(r.remainingBalance).toBe(1.4) // 200 - 198.6
  })

  it("split: pix discount + card fee merchant", () => {
    const r = computePaymentBreakdown({
      orderTotal: 150,
      lines: [
        { amountReceived: 50, paymentMethod: discountPix },       // effective 51
        { amountReceived: 100, paymentMethod: feeCardMerchant },  // effective 100, net 97
      ],
    })
    expect(r.lines[0].effectiveAmount).toBe(51)
    expect(r.lines[1].effectiveAmount).toBe(100)
    expect(r.totalEffectiveAmount).toBe(151)
    expect(r.totalNetAmount).toBe(148) // 51 + 97
    expect(r.remainingBalance).toBe(0) // overpaid
  })

  it("exact settlement: order total equals total effective", () => {
    // Pix 2% on 98.04 → effective ~100
    const r = computePaymentBreakdown({
      orderTotal: 100,
      lines: [{ amountReceived: 98.04, paymentMethod: discountPix }],
    })
    expect(r.totalEffectiveAmount).toBeCloseTo(100, 1)
    expect(r.remainingBalance).toBeCloseTo(0, 1)
  })

  it("overpayment: remaining balance handles negatives", () => {
    const r = computePaymentBreakdown({
      orderTotal: 50,
      lines: [
        { amountReceived: 30, paymentMethod: discountPix },  // effective 30.6
        { amountReceived: 25, paymentMethod: noAdjustment }, // effective 25
      ],
    })
    expect(r.totalEffectiveAmount).toBe(55.6)
    expect(r.remainingBalance).toBe(0) // clamped to 0
  })
})
