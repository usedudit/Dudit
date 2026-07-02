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

  const mpLeg = {
    method: params.paymentMethodName,
    amount: chargeAmount,
    effectiveAmount: chargeAmount,
    amountReceived: chargeAmount,
    provider: "Mercado Pago",
    adjustmentType: "none" as const,
    adjustmentPercent: 0,
    adjustmentAmount: 0,
    installmentNumber: 1,
  }

  const payment_breakdown =
    mpLegIndex >= 0
      ? oldBreakdown.map((entry: any, i: number) =>
          i === mpLegIndex
            ? { ...entry, ...mpLeg, amountReceived: chargeAmount, amount: chargeAmount, effectiveAmount: chargeAmount }
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
