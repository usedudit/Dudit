export type PaymentMethodFeeConfig = {
  feePercent: number
  feeFixed: number
  feeBearer: "merchant" | "customer"
  discountPercent?: number
  fixedInterestPercent?: number
  maxInstallments?: number
  installmentFees?: Array<{ installmentNumber: number; feePercent: number }>
  /**
   * Quem paga o custo de parcelamento (juros das parcelas do cartão de crédito).
   * Independente de feeBearer. Default: merchant (empresa absorve).
   */
  installmentFeeBearer?: "merchant" | "customer"
}

export type PaymentCalculationInput = {
  originalAmount: number
  paymentMethod: PaymentMethodFeeConfig
  installmentNumber?: number
}

export type PaymentCalculationResult = {
  finalAmount: number
  interestAmount: number
  feeAmount: number
  fixedFeeAmount: number
  paymentMethodDiscountAmount: number
  amountBeforeInterest: number
  amountBeforeFee: number
  installmentNumber: number
  installmentAmounts: number[]
  appliedDiscountPercent: number
  appliedFeePercent: number
  appliedInterestPercent: number
  /** Juros do parcelamento (parcela do interestAmount atribuída ao custo de parcelamento) */
  installmentCostAmount: number
  /** @deprecated Use amountReceived from financial-engine */
  amountReceived?: number
  /** @deprecated Use effectiveAmount from financial-engine */
  effectiveAmount?: number
  /** @deprecated Use netAmount from financial-engine */
  netAmount?: number
  /** @deprecated Use adjustmentAmount from financial-engine */
  adjustmentAmount?: number
  /** @deprecated Use adjustmentType from financial-engine */
  adjustmentType?: string
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const toSafeMoney = (value: number) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, round2(n))
}

function distributeInstallments(total: number, installments: number): number[] {
  const count = Math.max(1, Math.floor(Number(installments || 1)))
  const cents = Math.round(toSafeMoney(total) * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    out.push((base + (i < remainder ? 1 : 0)) / 100)
  }
  return out
}

export function calculatePaymentAmounts(input: PaymentCalculationInput): PaymentCalculationResult {
  const originalAmount = toSafeMoney(Number(input.originalAmount || 0))
  const installmentNumber = Math.max(1, Number(input.installmentNumber || 1))
  const maxInstallments = Math.max(1, Number(input.paymentMethod.maxInstallments || 24))
  const clampedInstallments = Math.min(installmentNumber, maxInstallments)
  const feePercent = Math.max(0, Number(input.paymentMethod.feePercent || 0))
  const feeFixed = Math.max(0, Number(input.paymentMethod.feeFixed || 0))
  const paymentMethodDiscountPercent = Math.min(100, Math.max(0, Number(input.paymentMethod.discountPercent || 0)))
  const fixedInterestPercent = Math.max(0, Number(input.paymentMethod.fixedInterestPercent || 0))

  const installmentFeePercent = (input.paymentMethod.installmentFees || []).find(
    (entry) => Number(entry.installmentNumber) === clampedInstallments,
  )?.feePercent || 0

  let currentTotal = originalAmount

  // Step 1: payment method discount over the running total
  const paymentMethodDiscountAmount = round2(currentTotal * (paymentMethodDiscountPercent / 100))
  currentTotal = toSafeMoney(currentTotal - paymentMethodDiscountAmount)
  const amountBeforeInterest = currentTotal

  // Step 2: installment interest over the discounted running total
  // Juros fixos (fixedInterestPercent) seguem feeBearer; o custo de parcelamento
  // (installmentFeePercent) segue installmentFeeBearer, config independente.
  const totalInterestPercent = Math.max(0, fixedInterestPercent + Number(installmentFeePercent || 0))
  const interestAmount = round2(currentTotal * (totalInterestPercent / 100))
  const feeBearer = input.paymentMethod.feeBearer
  const installmentFeeBearer = input.paymentMethod.installmentFeeBearer || "merchant"
  const fixedInterestAmount = round2(currentTotal * (fixedInterestPercent / 100))
  const installmentCostAmount = round2(currentTotal * (installmentFeePercent / 100))
  if (feeBearer === "customer") {
    currentTotal = toSafeMoney(currentTotal + fixedInterestAmount)
  }
  if (installmentFeeBearer === "customer") {
    currentTotal = toSafeMoney(currentTotal + installmentCostAmount)
  }
  const amountBeforeFee = currentTotal

  // Step 3: payment method fee over the running total after interest
  const percentageFeeAmount = round2((currentTotal * feePercent) / 100)
  const fixedFeeAmount = feeFixed
  const totalFeeAmount = round2(percentageFeeAmount + fixedFeeAmount)
  const finalAmount =
    input.paymentMethod.feeBearer === "customer"
      ? toSafeMoney(currentTotal + totalFeeAmount)
      : currentTotal

  return {
    finalAmount,
    interestAmount,
    feeAmount: percentageFeeAmount,
    fixedFeeAmount,
    paymentMethodDiscountAmount,
    amountBeforeInterest,
    amountBeforeFee,
    installmentNumber: clampedInstallments,
    installmentAmounts: distributeInstallments(finalAmount, clampedInstallments),
    appliedDiscountPercent: paymentMethodDiscountPercent,
    appliedFeePercent: feePercent,
    appliedInterestPercent: totalInterestPercent,
    installmentCostAmount,
  }
}
