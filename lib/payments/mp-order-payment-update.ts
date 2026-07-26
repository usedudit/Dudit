import {
  getExpectedMpChargeAmount,
  getOrderPaidAmount,
  getOrderTotalAmount,
  patchDepositCheckoutOnPayment,
  resolveSituationFromPaid,
  type OrderFinancialSnapshot,
} from "@/lib/payments/order-financial-state"

const AMOUNT_TOLERANCE = 0.01

export function validateMpTransactionAmount(
  order: OrderFinancialSnapshot,
  transactionAmount: number,
): { ok: true; expectedAmount: number } | { ok: false; expectedAmount: number } {
  const expectedAmount = getExpectedMpChargeAmount(order)
  if (Math.abs(Number(transactionAmount) - expectedAmount) > AMOUNT_TOLERANCE) {
    return { ok: false, expectedAmount }
  }
  return { ok: true, expectedAmount }
}

export function buildMpApprovedPaymentUpdate(params: {
  order: OrderFinancialSnapshot
  transactionAmount: number
  paymentMethodName: string
  mpPaymentId: string
  mpDateApproved?: string | null
  existingBreakdown?: unknown[]
  mpInstallments?: number | null
  mpNetReceivedAmount?: number | null
  mpTotalFeeAmount?: number | null
  mpPaymentMethodId?: string | null
  mpPaymentTypeId?: string | null
  mpPaymentStatus?: string | null
  mpPaymentStatusDetail?: string | null
  mpFeeDetails?: Array<{ type: string; amount: number | string; fee_payer: string }> | null
  mpCardLastDigits?: string | null
  mpCardFirstDigits?: string | null
  mpCardholderName?: string | null
  mpInstallmentAmount?: number | null
}): {
  situation: string
  paid_amount: number
  amount_paid: number
  payment_breakdown: unknown[]
  payment_method: string
  payment_provider: string
  mp_payment_id: string
  mp_date_approved?: string
  checkout_fulfillment?: Record<string, unknown> | null
} {
  const totalAmount = getOrderTotalAmount(params.order)
  const currentPaid = getOrderPaidAmount(params.order)
  const chargeAmount = Math.max(0, Number(params.transactionAmount || 0))
  const nextPaid = Math.min(totalAmount, currentPaid > 0.009 ? currentPaid + chargeAmount : chargeAmount)
  const situation = resolveSituationFromPaid(nextPaid, totalAmount)

  const oldBreakdown = Array.isArray(params.existingBreakdown ?? params.order.payment_breakdown)
    ? [...(params.existingBreakdown ?? params.order.payment_breakdown) as any[]]
    : []

  const mpLegIndex = oldBreakdown.findIndex(
    (entry: any) =>
      String(entry?.provider || "").toLowerCase().includes("mercado pago") ||
      String(entry?.method || "").toLowerCase().includes("mercado pago"),
  )

  const mpLeg: Record<string, unknown> = {
    method: params.paymentMethodName,
    amount: chargeAmount,
    effectiveAmount: chargeAmount,
    amountReceived: params.mpNetReceivedAmount ?? chargeAmount,
    provider: "Mercado Pago",
    adjustmentType: "none",
    adjustmentPercent: 0,
    adjustmentAmount: 0,
    installmentNumber: params.mpInstallments ?? 1,
    feeAmount: params.mpTotalFeeAmount ?? 0,
    fixedFeeAmount: 0,
    interestAmount: 0,
    feeBearer: "merchant",
    paymentMethodId: params.mpPaymentMethodId ?? null,
    paymentTypeId: params.mpPaymentTypeId ?? null,
    paymentStatus: params.mpPaymentStatus ?? null,
    paymentStatusDetail: params.mpPaymentStatusDetail ?? null,
  }

  if (params.mpFeeDetails && params.mpFeeDetails.length > 0) {
    mpLeg.feeDetails = params.mpFeeDetails.map((fd) => ({
      type: fd.type,
      amount: Number(fd.amount),
      feePayer: fd.fee_payer,
    }))
  }

  if (params.mpInstallmentAmount != null) {
    mpLeg.installmentAmount = Number(params.mpInstallmentAmount)
  }

  if (params.mpCardLastDigits) {
    mpLeg.cardLastDigits = params.mpCardLastDigits
    mpLeg.cardFirstDigits = params.mpCardFirstDigits ?? null
    mpLeg.cardholderName = params.mpCardholderName ?? null
  }

  const payment_breakdown =
    mpLegIndex >= 0
      ? oldBreakdown.map((entry: any, i: number) =>
          i === mpLegIndex
            ? { ...entry, ...mpLeg }
            : entry,
        )
      : [...oldBreakdown, mpLeg]

  const checkout_fulfillment = patchDepositCheckoutOnPayment(
    params.order.checkout_fulfillment ?? null,
    nextPaid,
    totalAmount,
  )

  return {
    situation,
    paid_amount: nextPaid,
    amount_paid: nextPaid,
    payment_breakdown,
    payment_method: params.paymentMethodName,
    payment_provider: "Mercado Pago",
    mp_payment_id: params.mpPaymentId,
    ...(checkout_fulfillment ? { checkout_fulfillment } : {}),
    ...(params.mpDateApproved ? { mp_date_approved: params.mpDateApproved } : {}),
  }
}
