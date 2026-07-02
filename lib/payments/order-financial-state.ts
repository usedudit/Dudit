export type OrderFinancialSnapshot = {
  total_amount?: number | null
  paid_amount?: number | null
  amount_paid?: number | null
  situation?: string | null
  payment_breakdown?: unknown[] | null
  checkout_fulfillment?: Record<string, unknown> | null
}

export function getOrderPaidAmount(order: OrderFinancialSnapshot): number {
  const paid = Number(order.paid_amount ?? order.amount_paid ?? 0)
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

/** Deposit metadata stored in checkout_fulfillment (no new tables). */
export type DepositCheckoutMeta = {
  depositCheckout?: boolean
  payDepositOnly?: boolean
  depositAmount?: number
  fullOrderTotal?: number
  initialChargeAmount?: number
  servicesSubtotal?: number
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
