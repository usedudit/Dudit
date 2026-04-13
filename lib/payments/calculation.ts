export type PaymentMethodFeeConfig = {
  feePercent: number
  feeFixed: number
  feeBearer: "merchant" | "customer"
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
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function calculatePaymentAmounts(input: PaymentCalculationInput): PaymentCalculationResult {
  const originalAmount = Math.max(0, Number(input.originalAmount || 0))
  const installmentNumber = Math.max(1, Number(input.installmentNumber || 1))
  const feePercent = Math.max(0, Number(input.paymentMethod.feePercent || 0))
  const feeFixed = Math.max(0, Number(input.paymentMethod.feeFixed || 0))

  const installmentFeePercent = (input.paymentMethod.installmentFees || []).find(
    (entry) => Number(entry.installmentNumber) === installmentNumber,
  )?.feePercent || 0

  const interestAmount = input.paymentMethod.feeBearer === "customer"
    ? round2((originalAmount * Number(installmentFeePercent || 0)) / 100)
    : 0

  const finalAmount = round2(originalAmount + interestAmount)
  const feeAmount = round2(((finalAmount * feePercent) / 100) + feeFixed)

  return { finalAmount, interestAmount, feeAmount }
}
