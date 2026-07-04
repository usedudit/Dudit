export type OrderFinancialSnapshot = {
  total_amount?: number | null
  paid_amount?: number | null
  amount_paid?: number | null
  paidAmount?: number | null
  situation?: string | null
  payment_breakdown?: unknown[] | null
  checkout_fulfillment?: Record<string, unknown> | null
}

export function getOrderPaidAmount(order: OrderFinancialSnapshot): number {
  const paid = Number(order.paid_amount ?? order.amount_paid ?? order.paidAmount ?? 0)
  return Number.isFinite(paid) ? Math.max(0, paid) : 0
}

export function getOrderTotalAmount(order: OrderFinancialSnapshot): number {
  const total = Number(order.total_amount ?? 0)
  return Number.isFinite(total) ? Math.max(0, total) : 0
}

export function getOrderRemainingBalance(order: OrderFinancialSnapshot): number {
  return Math.max(0, getOrderTotalAmount(order) - getOrderPaidAmount(order))
}

/** After any confirmed receipt (including deposit), financial terms are frozen. */
export function isOrderFinanciallyFrozen(order: OrderFinancialSnapshot): boolean {
  return getOrderPaidAmount(order) > 0.009
}

export function resolveSituationFromPaid(paidAmount: number, totalAmount: number): "pending" | "partially_paid" | "paid" {
  const paid = Math.max(0, Number(paidAmount || 0))
  const total = Math.max(0, Number(totalAmount || 0))
  if (paid >= total - 0.005 && total > 0.005) return "paid"
  if (paid > 0.005) return "partially_paid"
  return "pending"
}

/** Deposit metadata stored in checkout_fulfillment.depositCheckout (no new tables). */
export type DepositCheckoutMeta = {
  usesDeposit?: boolean
  payDepositOnly?: boolean
  depositAmount?: number
  serviceDepositAmount?: number
  depositPercent?: number
  fullOrderTotal?: number
  initialChargeAmount?: number
  remainingAfterDeposit?: number
  remainingBalance?: number
  depositStatus?: "pending" | "paid" | "partially_paid" | "not_required"
  paymentProvider?: string
  mpInitialPayment?: boolean
}

export type OrderDepositSummary = {
  usesDeposit: boolean
  depositAmount: number
  depositPercent: number
  depositStatus: "pending" | "partially_paid" | "paid" | "not_required"
  fullOrderTotal: number
  paidAmount: number
  remainingBalance: number
  initialChargeAmount: number
  payDepositOnly: boolean
  paymentProvider: string | null
}

export function getOrderDepositSummary(order: OrderFinancialSnapshot): OrderDepositSummary {
  const meta = getDepositCheckoutMeta(order.checkout_fulfillment ?? null)
  const fullOrderTotal = Number(meta.fullOrderTotal ?? order.total_amount ?? 0)
  const paidAmount = getOrderPaidAmount(order)
  const remainingBalance = Math.max(0, fullOrderTotal - paidAmount)
  const usesDeposit = Boolean(meta.usesDeposit || meta.payDepositOnly)

  let depositStatus: OrderDepositSummary["depositStatus"] = "not_required"
  if (usesDeposit) {
    if (paidAmount <= 0.009) {
      depositStatus = "pending"
    } else if (paidAmount >= fullOrderTotal - 0.005) {
      depositStatus = "paid"
    } else {
      depositStatus = "partially_paid"
    }
    if (meta.depositStatus === "paid" && paidAmount > 0.009 && remainingBalance > 0.009) {
      depositStatus = "partially_paid"
    }
  }

  return {
    usesDeposit,
    depositAmount: Number(meta.depositAmount ?? meta.serviceDepositAmount ?? 0),
    depositPercent: Number(meta.depositPercent ?? 0),
    depositStatus,
    fullOrderTotal,
    paidAmount,
    remainingBalance,
    initialChargeAmount: Number(meta.initialChargeAmount ?? 0),
    payDepositOnly: Boolean(meta.payDepositOnly),
    paymentProvider: meta.paymentProvider ?? null,
  }
}

export function getDepositCheckoutMeta(
  checkoutFulfillment?: Record<string, unknown> | null,
): DepositCheckoutMeta {
  const raw = checkoutFulfillment?.depositCheckout
  if (!raw || typeof raw !== "object") {
    return {}
  }
  return raw as DepositCheckoutMeta
}

export function patchDepositCheckoutOnPayment(
  checkoutFulfillment: Record<string, unknown> | null | undefined,
  paidAmount: number,
  totalAmount: number,
): Record<string, unknown> | null | undefined {
  if (!checkoutFulfillment) return checkoutFulfillment
  const meta = getDepositCheckoutMeta(checkoutFulfillment)
  if (!meta.usesDeposit && !meta.payDepositOnly) return checkoutFulfillment

  const paid = Math.max(0, Number(paidAmount || 0))
  const total = Math.max(0, Number(totalAmount || 0))
  const remainingBalance = Math.max(0, total - paid)

    let depositStatus: DepositCheckoutMeta["depositStatus"] = "pending"
    if (paid >= total - 0.005 && total > 0.005) {
        depositStatus = "paid"
    } else if (paid > 0.005) {
        depositStatus = "partially_paid"
    }

  return {
    ...checkoutFulfillment,
    depositCheckout: {
      ...meta,
      remainingBalance,
      remainingAfterDeposit: remainingBalance,
      depositStatus,
    },
  }
}

/** Expected MP charge: full total, or initial charge when deposit-only checkout. */
export function getExpectedMpChargeAmount(order: OrderFinancialSnapshot): number {
  const meta = getDepositCheckoutMeta(order.checkout_fulfillment ?? null)
  if (meta.initialChargeAmount != null && Number(meta.initialChargeAmount) > 0.009) {
    return Number(meta.initialChargeAmount)
  }
  return getOrderTotalAmount(order)
}

export const FINANCIAL_FREEZE_INFO_MESSAGE =
  "Esta venda já possui recebimentos registrados. Descontos, taxas e juros não podem mais ser alterados. Os métodos abaixo servem apenas para registrar o recebimento do saldo restante."
