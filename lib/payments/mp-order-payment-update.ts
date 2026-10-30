import {
  getExpectedMpChargeAmount,
  getOrderPaidAmount,
  getOrderTotalAmount,
  patchDepositCheckoutOnPayment,
  resolveSituationFromPaid,
  type OrderFinancialSnapshot,
} from "@/lib/payments/order-financial-state"
import {
  buildOrderPaymentMethodLabel,
  hasReceivedAmount,
} from "@/lib/payments/payment-ledger"
import { isUuid } from "@/lib/utils/short-id"

const AMOUNT_TOLERANCE = 0.01

/**
 * Verifica se um pagamento do Mercado Pago já foi registrado no ledger do
 * pedido (ex.: sinal confirmado manualmente). Nesse caso, eventos posteriores
 * do MP (aprovação, cancelamento, expiração) não devem alterar o pedido nem
 * somar o valor novamente.
 */
export function isMpPaymentAlreadyRecorded(
  order: OrderFinancialSnapshot,
  mpPaymentId: string | number | null | undefined,
): boolean {
  return findRecordedMpPaymentEntry(order, mpPaymentId) !== null
}

/**
 * Mesmo que `isMpPaymentAlreadyRecorded`, mas exige que o registro tenha sido
 * feito manualmente pelo vendedor ("Confirmar recebimento"). Usado para
 * bloquear eventos do MP (aprovação tardia, cancelamento, expiração) que
 * poderiam cancelar o pedido ou duplicar o valor do sinal.
 */
export function isMpPaymentManuallyRecorded(
  order: OrderFinancialSnapshot,
  mpPaymentId: string | number | null | undefined,
): boolean {
  const entry = findRecordedMpPaymentEntry(order, mpPaymentId)
  return Boolean(entry?.manuallyConfirmed)
}

function findRecordedMpPaymentEntry(
  order: OrderFinancialSnapshot,
  mpPaymentId: string | number | null | undefined,
): Record<string, any> | null {
  const id = String(mpPaymentId || "").trim()
  if (!id) return null

  const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
  const entry = breakdown.find((item: any) => {
    if (!item?.mpPaymentId) return false
    if (String(item.mpPaymentId) !== id) return false
    return Number(item?.amountReceived ?? 0) > AMOUNT_TOLERANCE
  })

  return (entry as Record<string, any> | undefined) ?? null
}

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

  // Idempotência: o mesmo pagamento já está registrado (ex.: sinal confirmado
  // manualmente). Não soma o valor novamente nem altera o status.
  if (isMpPaymentAlreadyRecorded(params.order, params.mpPaymentId)) {
    const currentBreakdown = Array.isArray(params.order.payment_breakdown)
      ? [...(params.order.payment_breakdown as any[])]
      : []
    const currentMethodLabel = buildOrderPaymentMethodLabel(currentBreakdown, {
      fallbackMethod: params.paymentMethodName,
      usesDeposit: Boolean((params.order.checkout_fulfillment as any)?.depositCheckout),
      paidAmount: currentPaid,
      totalAmount,
    })

    return {
      situation: String(params.order.situation || resolveSituationFromPaid(currentPaid, totalAmount)),
      paid_amount: currentPaid,
      amount_paid: currentPaid,
      payment_breakdown: currentBreakdown,
      payment_method: currentMethodLabel,
      payment_provider: "Mercado Pago",
      mp_payment_id: params.mpPaymentId,
      ...(params.order.checkout_fulfillment
        ? { checkout_fulfillment: params.order.checkout_fulfillment }
        : {}),
    }
  }

  const chargeAmount = Math.max(0, Number(params.transactionAmount || 0))
  const nextPaid = Math.min(totalAmount, currentPaid > 0.009 ? currentPaid + chargeAmount : chargeAmount)
  const situation = resolveSituationFromPaid(nextPaid, totalAmount)

  const rawBreakdown = Array.isArray(params.existingBreakdown ?? params.order.payment_breakdown)
    ? [...(params.existingBreakdown ?? params.order.payment_breakdown) as any[]]
    : []

  const oldBreakdown = rawBreakdown.map((entry: any) => {
    if (entry?.paymentMethodId && !isUuid(entry.paymentMethodId)) {
      return { ...entry, paymentMethodId: null, mpPaymentMethodId: entry.paymentMethodId }
    }
    return entry
  })

  const mpLegIndex = (() => {
    const exactPaymentIndex = oldBreakdown.findIndex(
      (entry: any) =>
        params.mpPaymentId &&
        entry?.mpPaymentId &&
        String(entry.mpPaymentId) === String(params.mpPaymentId),
    )
    if (exactPaymentIndex >= 0) return exactPaymentIndex

    return oldBreakdown.findIndex(
      (entry: any) =>
        !hasReceivedAmount(entry) &&
        (String(entry?.provider || "").toLowerCase().includes("mercado pago") ||
          String(entry?.method || "").toLowerCase().includes("mercado pago")),
    )
  })()

  // Split fee_details into feeAmount (mercadopago_fee) and interestAmount (installment_fee)
  let feeAmount = 0
  let interestAmount = 0
  if (params.mpFeeDetails && params.mpFeeDetails.length > 0) {
    for (const fd of params.mpFeeDetails) {
      const amt = Number(fd.amount) || 0
      if (fd.type === "installment_fee") {
        interestAmount += amt
      } else {
        feeAmount += amt
      }
    }
  } else {
    feeAmount = params.mpTotalFeeAmount ?? 0
  }

  let paymentKind =
    currentPaid > 0.009
      ? "balance"
      : nextPaid < totalAmount - 0.005
        ? "deposit"
        : "full"

  // Check if deposit (sinal) has expired - payment after expiry is "full" not "deposit"
  const depositMeta = params.order.checkout_fulfillment as Record<string, any> | null | undefined
  const depositMetaObj = depositMeta?.depositCheckout as Record<string, any> | undefined
  if (
    depositMetaObj?.usesDeposit &&
    depositMetaObj?.depositStatus === "expired" &&
    paymentKind === "deposit"
  ) {
    // Payment covers the full amount after deposit expiry - mark as "full" instead of "deposit"
    paymentKind = "full"
  }

  const mpLeg: Record<string, unknown> = {
    mpPaymentId: params.mpPaymentId,
    method: params.paymentMethodName,
    amount: chargeAmount,
    effectiveAmount: chargeAmount,
    amountReceived: chargeAmount,
    netReceivedAmount: params.mpNetReceivedAmount ?? chargeAmount,
    paymentKind,
    provider: "Mercado Pago",
    adjustmentType: "none",
    adjustmentPercent: 0,
    adjustmentAmount: 0,
    installmentNumber: params.mpInstallments ?? 1,
    feeAmount,
    fixedFeeAmount: 0,
    interestAmount,
    feeBearer: "merchant",
    paymentMethodId: params.mpPaymentMethodId && isUuid(params.mpPaymentMethodId) ? params.mpPaymentMethodId : null,
    mpPaymentMethodId: params.mpPaymentMethodId ?? null,
    paymentTypeId: params.mpPaymentTypeId ?? null,
    paymentStatus: params.mpPaymentStatus ?? null,
    paymentStatusDetail: params.mpPaymentStatusDetail ?? null,
    ...(currentPaid + chargeAmount > totalAmount + AMOUNT_TOLERANCE
      ? { overpaymentAmount: Math.round((currentPaid + chargeAmount - totalAmount) * 100) / 100 }
      : {}),
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
    params.mpDateApproved || null,
  )
  const paymentMethodLabel = buildOrderPaymentMethodLabel(payment_breakdown, {
    fallbackMethod: params.paymentMethodName,
    usesDeposit: Boolean(checkout_fulfillment?.depositCheckout),
    paidAmount: nextPaid,
    totalAmount,
  })

  return {
    situation,
    paid_amount: nextPaid,
    amount_paid: nextPaid,
    payment_breakdown,
    payment_method: paymentMethodLabel,
    payment_provider: "Mercado Pago",
    mp_payment_id: params.mpPaymentId,
    ...(checkout_fulfillment ? { checkout_fulfillment } : {}),
    ...(params.mpDateApproved ? { mp_date_approved: params.mpDateApproved } : {}),
  }
}
