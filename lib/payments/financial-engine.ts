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
  paymentMethodDiscountAmount: number
  interestAmount: number
  feeAmount: number
  fixedFeeAmount: number
  /** Custo de parcelamento (juros das parcelas), segue installmentFeeBearer */
  installmentCostAmount: number
  /** @deprecated Use installmentCostAmount + installmentFeeBearer for precise breakdown */
  installmentFeeBearer: "merchant" | "customer" | null
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
  paymentMethodDiscountAmount?: number
  interestAmount?: number
  feeAmount?: number
  fixedFeeAmount?: number
  installmentCostAmount?: number
  installmentFeeBearer?: "merchant" | "customer" | null
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
  paymentMethodDiscountAmount?: number
  interestAmount?: number
  feeAmount?: number
  fixedFeeAmount?: number
  installmentCostAmount?: number
  installmentFeeBearer?: "merchant" | "customer" | null
  /** Mercado Pago specific fields */
  provider?: string
  paymentTypeId?: string | null
  paymentStatus?: string | null
  paymentStatusDetail?: string | null
  feeDetails?: Array<{ type: string; amount: number; feePayer: string }>
  installmentAmount?: number
  cardLastDigits?: string | null
  cardFirstDigits?: string | null
  cardholderName?: string | null
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
 * `amountReceived` is always the BASE amount (pre-adjustment).
 * Operations are applied in forward order: discount → interest → fee.
 *
 * - Discount: subtracts from base (customer pays less)
 * - Interest: adds to base when feeBearer=customer
 * - Fee: adds to base when feeBearer=customer
 */
export function computePaymentLine(input: PaymentLineInput): PaymentLineDetails {
  const baseAmount = toSafeMoney(input.amountReceived)
  const pm = input.paymentMethod

  const discountPercent = Math.max(0, Number(pm.discountPercent || 0))
  const feePercent = Math.max(0, Number(pm.feePercent || 0))
  const feeFixed = Math.max(0, Number(pm.feeFixed || 0))
  const feeBearer = (pm.feeBearer || "merchant") as "merchant" | "customer"
  const installmentFeeBearer = (pm.installmentFeeBearer || "merchant") as "merchant" | "customer"

  const clampedInstallments = Math.min(Math.max(1, input.installmentNumber || 1), Math.max(1, pm.maxInstallments || 24))
  const installmentFeePercent = (pm.installmentFees || []).find(
    (entry) => Number(entry.installmentNumber) === clampedInstallments,
  )?.feePercent || 0
  const fixedInterestPercent = Math.max(0, Number(pm.fixedInterestPercent || 0))
  const interestPercent = Math.max(0, fixedInterestPercent + Number(installmentFeePercent || 0))

  const hasDiscount = discountPercent > 0
  const hasFee = feePercent > 0 || feeFixed > 0
  const hasInterest = interestPercent > 0

  // Step 1: Discount (always reduces base)
  const paymentMethodDiscountAmount = round2(baseAmount * (discountPercent / 100))
  let current = round2(baseAmount - paymentMethodDiscountAmount)

  // Step 2: Interest on discounted amount.
  // Juros fixos (fixedInterestPercent) seguem feeBearer; o custo de parcelamento
  // (installmentFeePercent) segue installmentFeeBearer (config independente).
  const fixedInterestAmount = round2(current * (fixedInterestPercent / 100))
  const installmentCostAmount = round2(current * (installmentFeePercent / 100))
  const interestAmount = round2(fixedInterestAmount + installmentCostAmount)
  if (hasInterest && feeBearer === "customer") {
    current = round2(current + fixedInterestAmount)
  }
  if (hasInterest && installmentFeeBearer === "customer") {
    current = round2(current + installmentCostAmount)
  }

  // Step 3: Fee on amount after interest
  const feeAmount = round2(current * (feePercent / 100))
  const fixedFeeAmount = feeFixed
  if (hasFee && feeBearer === "customer") {
    current = round2(current + feeAmount + fixedFeeAmount)
  }

  const effectiveAmount = round2(current)
  // Lucro líquido = valor cobrado (effectiveAmount) menos custos absorvidos:
  // - taxas/juros fixos seguem feeBearer; o custo de parcelamento segue
  //   installmentFeeBearer (independente).
  const netAmount = round2(
    effectiveAmount
      - (feeBearer === "merchant" ? fixedInterestAmount + feeAmount + fixedFeeAmount : 0)
      - (installmentFeeBearer === "merchant" ? installmentCostAmount : 0)
  )

  // Primary adjustment type for backward compatibility
  let adjustmentType: AdjustmentType = "none"
  let adjustmentPercent = 0
  if (hasDiscount) {
    adjustmentType = "discount"
    adjustmentPercent = discountPercent
  } else if (hasInterest) {
    adjustmentType = "interest"
    adjustmentPercent = interestPercent
  } else if (hasFee) {
    adjustmentType = "fee"
    adjustmentPercent = feePercent
  }

  const adjustmentAmount = round2(paymentMethodDiscountAmount + interestAmount + feeAmount + fixedFeeAmount)
  const onlyDiscount = hasDiscount && !hasFee && !hasInterest

  return {
    amountReceived: baseAmount,
    adjustmentType,
    adjustmentPercent,
    adjustmentAmount,
    feeBearer: onlyDiscount ? null : feeBearer,
    effectiveAmount,
    netAmount,
    paymentMethodDiscountAmount,
    interestAmount,
    feeAmount,
    fixedFeeAmount,
    installmentCostAmount,
    installmentFeeBearer: onlyDiscount ? null : installmentFeeBearer,
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
      paymentMethodDiscountAmount: details.paymentMethodDiscountAmount,
      interestAmount: details.interestAmount,
      feeAmount: details.feeAmount,
      fixedFeeAmount: details.fixedFeeAmount,
      installmentCostAmount: details.installmentCostAmount,
      installmentFeeBearer: details.installmentFeeBearer,
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
