import type { PaymentMethodFeeConfig } from "./calculation"
export type { PaymentMethodFeeConfig }

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toSafeMoney = (value: number) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, round2(n))
}

export type AdjustmentType = "none" | "discount" | "fee" | "interest"

export type PaymentLineInput = {
  amountReceived: number
  paymentMethod: PaymentMethodFeeConfig
  installmentNumber?: number
}

export type PaymentLineDetails = {
  amountReceived: number
  adjustmentType: AdjustmentType
  adjustmentPercent: number
  adjustmentAmount: number
  feeBearer: "merchant" | "customer" | null
  effectiveAmount: number
  netAmount: number
  interestAmount?: number
  feeAmount?: number
  fixedFeeAmount?: number
}

export type PaymentBreakdownLine = {
  method: string
  /** @deprecated Use effectiveAmount instead */
  amount: number
  amountReceived: number
  adjustmentType: AdjustmentType
  adjustmentPercent: number
  adjustmentAmount: number
  feeBearer: "merchant" | "customer" | null
  effectiveAmount: number
  netAmount: number
  paymentMethodId: string | null
  installmentNumber: number
  interestAmount?: number
  feeAmount?: number
  fixedFeeAmount?: number
}

export type PaymentBreakdownEntry = {
  method: string
  /** @deprecated Use effectiveAmount */
  amount: number
  amountReceived?: number
  adjustmentType?: string
  adjustmentPercent?: number
  adjustmentAmount?: number
  effectiveAmount?: number
  netAmount?: number
  feeBearer?: string | null
  paymentMethodId?: string | null
  installmentNumber?: number
  interestAmount?: number
  feeAmount?: number
  fixedFeeAmount?: number
}

export type PaymentBreakdownResult = {
  lines: PaymentBreakdownLine[]
  totalEffectiveAmount: number
  totalNetAmount: number
  totalReceived: number
  remainingBalance: number
}

/**
 * Determines the adjustment type from a payment method config.
 * - discountPercent > 0 → discount
 * - feePercent > 0 || feeFixed > 0 → fee
 * - otherwise → none
 */
export function deriveAdjustmentType(pm: PaymentMethodFeeConfig): AdjustmentType {
  const dp = Math.max(0, Number(pm.discountPercent || 0))
  const fp = Math.max(0, Number(pm.feePercent || 0))
  const fx = Math.max(0, Number(pm.feeFixed || 0))
  if (dp > 0) return "discount"
  if (fp > 0 || fx > 0) return "fee"
  return "none"
}

/**
 * Computes one payment line.
 *
 * Rules:
 *  DISCOUNT:  effective = received + adjustment,  net = effective
 *  FEE (customer): effective = received - adjustment, net = effective
 *  FEE (merchant): effective = received,            net = received - adjustment
 *  NONE:          effective = received,             net = received
 */
export function computePaymentLine(input: PaymentLineInput): PaymentLineDetails {
  const amountReceived = toSafeMoney(input.amountReceived)
  const pm = input.paymentMethod
  const adjustmentType = deriveAdjustmentType(pm)
  const discountPercent = Math.max(0, Number(pm.discountPercent || 0))
  const feePercent = Math.max(0, Number(pm.feePercent || 0))
  const feeFixed = Math.max(0, Number(pm.feeFixed || 0))
  const feeBearer = (pm.feeBearer || "merchant") as "merchant" | "customer"

  const clampedInstallments = Math.min(Math.max(1, input.installmentNumber || 1), Math.max(1, pm.maxInstallments || 24))
  const installmentFeePercent = (pm.installmentFees || []).find(
    (entry) => Number(entry.installmentNumber) === clampedInstallments,
  )?.feePercent || 0
  const fixedInterestPercent = Math.max(0, Number(pm.fixedInterestPercent || 0))
  const interestPercent = Math.max(0, fixedInterestPercent + Number(installmentFeePercent || 0))

  if (adjustmentType === "discount") {
    const adjustmentPercent = discountPercent
    const adjustmentAmount = round2(amountReceived * (adjustmentPercent / 100))
    const effectiveAmount = round2(amountReceived + adjustmentAmount)
    const netAmount = effectiveAmount
    return {
      amountReceived,
      adjustmentType: "discount",
      adjustmentPercent,
      adjustmentAmount,
      feeBearer: null,
      effectiveAmount,
      netAmount,
      interestAmount: 0,
      feeAmount: 0,
      fixedFeeAmount: 0,
    }
  }

  if (feePercent > 0 || feeFixed > 0 || interestPercent > 0) {
    const passesCostToCustomer = feeBearer === "customer"

    if (passesCostToCustomer) {
      const effectiveAmount = round2((amountReceived - feeFixed) / ((1 + interestPercent / 100) * (1 + feePercent / 100)))
      const interestAmount = round2(effectiveAmount * (interestPercent / 100))
      const fixedFeeAmount = feeFixed
      const feeAmount = Math.max(0, round2(amountReceived - effectiveAmount - interestAmount - fixedFeeAmount))
      const adjustmentAmount = Math.max(0, round2(amountReceived - effectiveAmount))
      
      const adjustmentPercent = feePercent + interestPercent
      const derivedAdjType: AdjustmentType = interestAmount > 0.009 ? "interest" : "fee"

      return {
        amountReceived,
        adjustmentType: derivedAdjType,
        adjustmentPercent,
        adjustmentAmount,
        feeBearer,
        effectiveAmount,
        netAmount: effectiveAmount,
        interestAmount,
        feeAmount,
        fixedFeeAmount,
      }
    } else {
      const effectiveAmount = amountReceived
      const interestAmount = round2(effectiveAmount * (interestPercent / 100))
      const percentageFeeAmount = round2((effectiveAmount + interestAmount) * (feePercent / 100))
      const fixedFeeAmount = feeFixed
      const adjustmentAmount = round2(interestAmount + percentageFeeAmount + fixedFeeAmount)
      const netAmount = round2(amountReceived - adjustmentAmount)
      
      const adjustmentPercent = feePercent + interestPercent
      const derivedAdjType: AdjustmentType = interestAmount > 0.009 ? "interest" : "fee"

      return {
        amountReceived,
        adjustmentType: derivedAdjType,
        adjustmentPercent,
        adjustmentAmount,
        feeBearer,
        effectiveAmount,
        netAmount,
        interestAmount,
        feeAmount: percentageFeeAmount,
        fixedFeeAmount,
      }
    }
  }

  return {
    amountReceived,
    adjustmentType: "none",
    adjustmentPercent: 0,
    adjustmentAmount: 0,
    feeBearer: null,
    effectiveAmount: amountReceived,
    netAmount: amountReceived,
    interestAmount: 0,
    feeAmount: 0,
    fixedFeeAmount: 0,
  }
}

/**
 * Computes a full payment breakdown from an order total and payment lines.
 * Returns per-line details, totals, and remaining balance.
 */
export function computePaymentBreakdown(input: {
  orderTotal: number
  lines: PaymentLineInput[]
}): PaymentBreakdownResult {
  const orderTotal = toSafeMoney(input.orderTotal)
  const lines = input.lines.map((line, i) => {
    const details = computePaymentLine(line)
    return {
      method: `method_${i}`,
      amount: details.effectiveAmount,
      amountReceived: details.amountReceived,
      adjustmentType: details.adjustmentType,
      adjustmentPercent: details.adjustmentPercent,
      adjustmentAmount: details.adjustmentAmount,
      feeBearer: details.feeBearer,
      effectiveAmount: details.effectiveAmount,
      netAmount: details.netAmount,
      paymentMethodId: null,
      installmentNumber: line.installmentNumber || 1,
    }
  })

  const totalEffectiveAmount = round2(lines.reduce((s, l) => s + l.effectiveAmount, 0))
  const totalNetAmount = round2(lines.reduce((s, l) => s + l.netAmount, 0))
  const totalReceived = round2(lines.reduce((s, l) => s + l.amountReceived, 0))
  const remainingBalance = round2(Math.max(0, orderTotal - totalEffectiveAmount))

  return {
    lines,
    totalEffectiveAmount,
    totalNetAmount,
    totalReceived,
    remainingBalance,
  }
}

/**
 * Legacy adapter: calls computePaymentLine then maps to the old calculatePaymentAmounts result shape.
 * Used by existing code that still expects the old return type.
 */
export function computePaymentAmountsLegacy(input: PaymentLineInput) {
  const line = computePaymentLine(input)
  const { amountReceived, adjustmentPercent, adjustmentAmount, effectiveAmount, adjustmentType } = line
  const isDiscount = adjustmentType === "discount"
  const isFee = adjustmentType === "fee" || adjustmentType === "interest"
  return {
    finalAmount: effectiveAmount,
    paymentMethodDiscountAmount: isDiscount ? adjustmentAmount : 0,
    feeAmount: isFee ? adjustmentAmount : 0,
    interestAmount: 0,
    amountBeforeInterest: amountReceived,
    amountBeforeFee: amountReceived,
    installmentNumber: input.installmentNumber || 1,
    installmentAmounts: [effectiveAmount],
    appliedDiscountPercent: isDiscount ? adjustmentPercent : 0,
    appliedFeePercent: isFee ? adjustmentPercent : 0,
    appliedInterestPercent: 0,
  }
}
