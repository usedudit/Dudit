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
 * - feePercent > 0 → fee
 * - otherwise → none
 */
export function deriveAdjustmentType(pm: PaymentMethodFeeConfig): AdjustmentType {
  const dp = Math.max(0, Number(pm.discountPercent || 0))
  const fp = Math.max(0, Number(pm.feePercent || 0))
  if (dp > 0) return "discount"
  if (fp > 0) return "fee"
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
  const feeBearer = (pm.feeBearer || "merchant") as "merchant" | "customer"

  let adjustmentPercent = 0
  let adjustmentAmount = 0
  let effectiveAmount = amountReceived
  let netAmount = amountReceived

  switch (adjustmentType) {
    case "discount": {
      adjustmentPercent = discountPercent
      adjustmentAmount = round2(amountReceived * (adjustmentPercent / 100))
      effectiveAmount = round2(amountReceived + adjustmentAmount)
      netAmount = effectiveAmount
      break
    }
    case "fee": {
      adjustmentPercent = feePercent
      adjustmentAmount = round2(amountReceived * (adjustmentPercent / 100))
      if (feeBearer === "customer") {
        effectiveAmount = round2(amountReceived - adjustmentAmount)
        netAmount = effectiveAmount
      } else {
        effectiveAmount = amountReceived
        netAmount = round2(amountReceived - adjustmentAmount)
      }
      break
    }
    case "interest": {
      adjustmentPercent = feePercent
      adjustmentAmount = round2(amountReceived * (adjustmentPercent / 100))
      if (feeBearer === "customer") {
        effectiveAmount = round2(amountReceived - adjustmentAmount)
        netAmount = effectiveAmount
      } else {
        effectiveAmount = amountReceived
        netAmount = round2(amountReceived - adjustmentAmount)
      }
      break
    }
    case "none":
    default: {
      adjustmentAmount = 0
      effectiveAmount = amountReceived
      netAmount = amountReceived
      break
    }
  }

  return {
    amountReceived,
    adjustmentType,
    adjustmentPercent,
    adjustmentAmount,
    feeBearer: adjustmentType === "fee" || adjustmentType === "interest" ? feeBearer : null,
    effectiveAmount,
    netAmount,
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
