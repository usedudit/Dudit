export type PaymentMethodFeeConfig = {
  feePercent: number
  feeFixed: number
  feeBearer: "merchant" | "customer"
  discountPercent?: number
  fixedInterestPercent?: number
  maxInstallments?: number
  installmentFees?: Array<{ installmentNumber: number; feePercent: number }>
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
  paymentMethodDiscountAmount: number
  amountBeforeInterest: number
  amountBeforeFee: number
  installmentNumber: number
  installmentAmounts: number[]
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

  // Step: discount by payment method (cumulative with previous discounts)
  const paymentMethodDiscountAmount = round2(originalAmount * (paymentMethodDiscountPercent / 100))
  const amountBeforeInterest = toSafeMoney(originalAmount - paymentMethodDiscountAmount)

  // Step: installment interest (supports fixed + per-installment)
  const totalInterestPercent = Math.max(0, fixedInterestPercent + Number(installmentFeePercent || 0))
  const interestAmount = round2(amountBeforeInterest * (totalInterestPercent / 100))
  const amountBeforeFee = toSafeMoney(amountBeforeInterest + interestAmount)

  // Step: payment method fee
  const feeAmount = round2(((amountBeforeFee * feePercent) / 100) + feeFixed)
  const finalAmount =
    input.paymentMethod.feeBearer === "customer"
      ? toSafeMoney(amountBeforeFee + feeAmount)
      : amountBeforeFee

  return {
    finalAmount,
    interestAmount,
    feeAmount,
    paymentMethodDiscountAmount,
    amountBeforeInterest,
    amountBeforeFee,
    installmentNumber: clampedInstallments,
    installmentAmounts: distributeInstallments(finalAmount, clampedInstallments),
  }
}
