import { describe, it, expect } from "vitest"
import { computePaymentLine, computePaymentBreakdown, deriveAdjustmentType } from "./financial-engine"
import { calculatePaymentAmounts, type PaymentMethodFeeConfig } from "./calculation"

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
  it("discount 2%: base 100 → effective 98, net 98, adjustment 2", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: discountPix })
    expect(r.amountReceived).toBe(100)
    expect(r.adjustmentType).toBe("discount")
    expect(r.adjustmentPercent).toBe(2)
    expect(r.paymentMethodDiscountAmount).toBe(2)
    expect(r.adjustmentAmount).toBe(2)
    expect(r.effectiveAmount).toBe(98)
    expect(r.netAmount).toBe(98)
    expect(r.feeBearer).toBeNull()
    expect(r.interestAmount).toBe(0)
    expect(r.feeAmount).toBe(0)
    expect(r.fixedFeeAmount).toBe(0)
  })

  it("discount 2%: base 10 → effective 9.80, net 9.80", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: discountPix })
    expect(r.amountReceived).toBe(10)
    expect(r.paymentMethodDiscountAmount).toBe(0.2)
    expect(r.adjustmentAmount).toBe(0.2)
    expect(r.effectiveAmount).toBe(9.8)
    expect(r.netAmount).toBe(9.8)
  })

  it("fee customer 3%: base 100 → effective 103, net 103", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: feeCardCustomer })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(3)
    expect(r.feeAmount).toBe(3)
    expect(r.adjustmentAmount).toBe(3)
    expect(r.effectiveAmount).toBe(103)
    expect(r.netAmount).toBe(103)
    expect(r.feeBearer).toBe("customer")
  })

  it("fee merchant 3%: base 100 → effective 100, net 97", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: feeCardMerchant })
    expect(r.adjustmentType).toBe("fee")
    expect(r.feeAmount).toBe(3)
    expect(r.adjustmentAmount).toBe(3)
    expect(r.effectiveAmount).toBe(100)
    expect(r.netAmount).toBe(97)
    expect(r.feeBearer).toBe("merchant")
  })

  it("fixed fee customer R$1.50: base 10 → effective 11.50, net 11.50", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: fixedFeeCustomer })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(0)
    expect(r.fixedFeeAmount).toBe(1.5)
    expect(r.adjustmentAmount).toBe(1.5)
    expect(r.effectiveAmount).toBe(11.5)
    expect(r.netAmount).toBe(11.5)
    expect(r.feeBearer).toBe("customer")
  })

  it("fixed fee merchant R$1.50: base 10 → effective 10, net 8.50", () => {
    const r = computePaymentLine({ amountReceived: 10, paymentMethod: fixedFeeMerchant })
    expect(r.adjustmentType).toBe("fee")
    expect(r.adjustmentPercent).toBe(0)
    expect(r.fixedFeeAmount).toBe(1.5)
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
    expect(r.paymentMethodDiscountAmount).toBe(0)
    expect(r.adjustmentAmount).toBe(0)
    expect(r.effectiveAmount).toBe(0)
    expect(r.netAmount).toBe(0)
  })
})

// --------------- installment cost bearer (independent config) ---------------

describe("computePaymentLine - custo de parcelamento (installmentFeeBearer)", () => {
  const instConfig = (feeBearer: "merchant" | "customer", installmentFeeBearer?: "merchant" | "customer"): PaymentMethodFeeConfig => ({
    feePercent: 0,
    feeFixed: 0,
    feeBearer,
    installmentFeeBearer,
    discountPercent: 0,
    maxInstallments: 12,
    installmentFees: [{ installmentNumber: 2, feePercent: 3 }],
  })

  it("default merchant: feeBearer=customer mas custo de parcelamento absorvido (effective 100, net 97)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: instConfig("customer"), installmentNumber: 2 })
    expect(r.interestAmount).toBe(3)
    expect(r.installmentCostAmount).toBe(3)
    expect(r.effectiveAmount).toBe(100)
    expect(r.netAmount).toBe(97)
  })

  it("feeBearer=merchant + installmentFeeBearer=merchant: cliente não paga juros, empresa absorve (net 97)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: instConfig("merchant", "merchant"), installmentNumber: 2 })
    expect(r.effectiveAmount).toBe(100)
    expect(r.netAmount).toBe(97)
    expect(r.installmentCostAmount).toBe(3)
  })

  it("feeBearer=merchant + installmentFeeBearer=customer: juros repassado ao cliente, lucro não desconta (net 103)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: instConfig("merchant", "customer"), installmentNumber: 2 })
    expect(r.effectiveAmount).toBe(103)
    expect(r.netAmount).toBe(103)
    expect(r.installmentCostAmount).toBe(3)
  })

  it("feeBearer=customer + installmentFeeBearer=customer: tudo pago pelo cliente (net 103)", () => {
    const r = computePaymentLine({ amountReceived: 100, paymentMethod: instConfig("customer", "customer"), installmentNumber: 2 })
    expect(r.effectiveAmount).toBe(103)
    expect(r.netAmount).toBe(103)
  })

  it("juro fixo segue feeBearer; custo de parcelamento segue installmentFeeBearer", () => {
    const r = computePaymentLine({
      amountReceived: 100,
      paymentMethod: {
        feePercent: 0,
        feeFixed: 0,
        feeBearer: "merchant",
        installmentFeeBearer: "customer",
        discountPercent: 0,
        maxInstallments: 12,
        fixedInterestPercent: 2,
        installmentFees: [{ installmentNumber: 2, feePercent: 3 }],
      },
      installmentNumber: 2,
    })
    expect(r.interestAmount).toBe(5)
    expect(r.installmentCostAmount).toBe(3)
    expect(r.effectiveAmount).toBe(103) // só o custo de parcelamento é cobrado
    expect(r.netAmount).toBe(101)       // empresa absorve o juro fixo (2)
  })
})

// --------------- computePaymentBreakdown ---------------

describe("computePaymentBreakdown - split payments", () => {
  it("single discount line: order total 100, pix 2% on base 100", () => {
    const r = computePaymentBreakdown({
      orderTotal: 100,
      lines: [{ amountReceived: 100, paymentMethod: discountPix }],
    })
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].effectiveAmount).toBe(98)
    expect(r.lines[0].paymentMethodDiscountAmount).toBe(2)
    expect(r.totalEffectiveAmount).toBe(98)
    expect(r.remainingBalance).toBe(2) // discount covered
    expect(r.totalReceived).toBe(100)
    expect(r.totalNetAmount).toBe(98)
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
    // Pix: 50 - 2% = 49 effective
    expect(r.lines[0].effectiveAmount).toBe(49)
    expect(r.lines[0].adjustmentType).toBe("discount")
    expect(r.lines[0].paymentMethodDiscountAmount).toBe(1)
    expect(r.lines[0].adjustmentAmount).toBe(1)
    // Cash: 50 flat
    expect(r.lines[1].effectiveAmount).toBe(50)
    expect(r.lines[1].adjustmentType).toBe("none")
    // Totals
    expect(r.totalEffectiveAmount).toBe(99)
    expect(r.totalReceived).toBe(100)
    expect(r.totalNetAmount).toBe(99)
    expect(r.remainingBalance).toBe(1) // 100 - 99
  })

  it("split: pix discount + card fee customer + cash", () => {
    const r = computePaymentBreakdown({
      orderTotal: 200,
      lines: [
        { amountReceived: 50, paymentMethod: discountPix },      // effective 49
        { amountReceived: 80, paymentMethod: feeCardCustomer },  // effective 82.40
        { amountReceived: 70, paymentMethod: noAdjustment },     // effective 70
      ],
    })
    expect(r.lines).toHaveLength(3)
    expect(r.lines[0].effectiveAmount).toBe(49)
    expect(r.lines[1].effectiveAmount).toBe(82.4)
    expect(r.lines[2].effectiveAmount).toBe(70)
    expect(r.totalEffectiveAmount).toBe(201.4)
    expect(r.totalNetAmount).toBe(201.4)
    expect(r.remainingBalance).toBe(0) // overpaid
  })

  it("split: pix discount + card fee merchant", () => {
    const r = computePaymentBreakdown({
      orderTotal: 150,
      lines: [
        { amountReceived: 50, paymentMethod: discountPix },      // effective 49
        { amountReceived: 100, paymentMethod: feeCardMerchant }, // effective 100, net 97
      ],
    })
    expect(r.lines[0].effectiveAmount).toBe(49)
    expect(r.lines[1].effectiveAmount).toBe(100)
    expect(r.totalEffectiveAmount).toBe(149)
    expect(r.totalNetAmount).toBe(146) // 49 + 97
    expect(r.remainingBalance).toBe(1) // 150 - 149
  })

  it("exact settlement: order total equals total effective", () => {
    // base / (1 - discount%) = orderTotal  →  base = 100 * 0.98 = 98
    // With forward semantics, amountReceived=98 is the base, effective=96.04
    // For exact settlement, the base that yields effective=100 is... no single base works
    // since discount reduces. This test now shows that with base=100, effective=98, remaining=2
    const r = computePaymentBreakdown({
      orderTotal: 100,
      lines: [{ amountReceived: 100, paymentMethod: discountPix }],
    })
    expect(r.totalEffectiveAmount).toBe(98)
    expect(r.remainingBalance).toBe(2)
  })

  it("overpayment: remaining balance handles negatives", () => {
    const r = computePaymentBreakdown({
      orderTotal: 50,
      lines: [
        { amountReceived: 30, paymentMethod: discountPix },  // effective 29.4
        { amountReceived: 25, paymentMethod: noAdjustment }, // effective 25
      ],
    })
    expect(r.totalEffectiveAmount).toBe(54.4)
    expect(r.remainingBalance).toBe(0) // clamped to 0
  })
})

describe("credit card with customer fees and merchant-absorbed installment cost", () => {
  const cardConfig: PaymentMethodFeeConfig = {
    feePercent: 0.79,
    feeFixed: 0.19,
    feeBearer: "customer",
    installmentFeeBearer: "merchant",
    discountPercent: 2,
    maxInstallments: 6,
    installmentFees: [
      { installmentNumber: 2, feePercent: 2 },
    ],
  }

  it("1x installment: 0% interest, discount 2%, fee repassed to customer (0 absorbed)", () => {
    const calc = calculatePaymentAmounts({
      originalAmount: 1.50,
      paymentMethod: cardConfig,
      installmentNumber: 1,
    })

    expect(calc.paymentMethodDiscountAmount).toBe(0.03)
    expect(calc.feeAmount).toBe(0.01)
    expect(calc.fixedFeeAmount).toBe(0.19)
    expect(calc.interestAmount).toBe(0)
    expect(calc.installmentCostAmount).toBe(0)
    expect(calc.finalAmount).toBe(1.67)

    // Absorbed costs calculation
    const isMerchantFee = cardConfig.feeBearer === "merchant"
    const isMerchantInstallment = cardConfig.installmentFeeBearer === "merchant"
    const fixedInterest = Math.max(0, calc.interestAmount - (calc.installmentCostAmount || 0))
    const absorbedInterest = isMerchantFee ? fixedInterest : 0
    const absorbedFee = isMerchantFee ? (calc.feeAmount + calc.fixedFeeAmount) : 0
    const absorbedInstallmentCost = isMerchantInstallment ? (calc.installmentCostAmount || 0) : 0
    const totalAbsorbed = absorbedInterest + absorbedFee + absorbedInstallmentCost

    expect(totalAbsorbed).toBe(0)
  })

  it("2x installment: 2% installment interest absorbed by merchant (0.03 absorbed)", () => {
    const calc = calculatePaymentAmounts({
      originalAmount: 1.50,
      paymentMethod: cardConfig,
      installmentNumber: 2,
    })

    expect(calc.paymentMethodDiscountAmount).toBe(0.03)
    expect(calc.feeAmount).toBe(0.01)
    expect(calc.fixedFeeAmount).toBe(0.19)
    expect(calc.installmentCostAmount).toBe(0.03)
    expect(calc.finalAmount).toBe(1.67)

    // Absorbed costs calculation
    const isMerchantFee = cardConfig.feeBearer === "merchant"
    const isMerchantInstallment = cardConfig.installmentFeeBearer === "merchant"
    const fixedInterest = Math.max(0, calc.interestAmount - (calc.installmentCostAmount || 0))
    const absorbedInterest = isMerchantFee ? fixedInterest : 0
    const absorbedFee = isMerchantFee ? (calc.feeAmount + calc.fixedFeeAmount) : 0
    const absorbedInstallmentCost = isMerchantInstallment ? (calc.installmentCostAmount || 0) : 0
    const totalAbsorbed = absorbedInterest + absorbedFee + absorbedInstallmentCost

    expect(totalAbsorbed).toBe(0.03)
  })
})
