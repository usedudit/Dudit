import {
  normalizeDepositCheckoutMeta,
  type DepositCheckoutMetaLike,
} from "@/lib/payments/payment-ledger"

export type OrderFinancialSnapshot = {
  total_amount?: number | null
  paid_amount?: number | null
  amount_paid?: number | null
  paidAmount?: number | null
  situation?: string | null
  payment_breakdown?: unknown[] | null
  checkout_fulfillment?: Record<string, unknown> | null
  payment_expires_at?: string | null
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

/** Check if the order actually received payment via Mercado Pago (approved or received > 0). */
export function hasReceivedMpPayment(order: OrderFinancialSnapshot): boolean {
  const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
  return breakdown.some((entry: any) =>
    String(entry?.provider || "").toLowerCase().includes("mercado pago") &&
    (entry?.paymentStatus === "approved" || Number(entry?.amountReceived ?? 0) > 0.009)
  );
}

export function resolveSituationFromPaid(paidAmount: number, totalAmount: number): "pending" | "partially_paid" | "paid" {
  const paid = Math.max(0, Number(paidAmount || 0))
  const total = Math.max(0, Number(totalAmount || 0))
  if (paid >= total - 0.005 && total > 0.005) return "paid"
  if (paid > 0.005) return "partially_paid"
  return "pending"
}

/** Deposit metadata stored in checkout_fulfillment.depositCheckout (no new tables). */
export type DepositCheckoutMeta = DepositCheckoutMetaLike & {
  usesDeposit?: boolean
  payDepositOnly?: boolean
  depositAmount?: number
  serviceDepositAmount?: number
  depositPercent?: number
  fullOrderTotal?: number
  initialChargeAmount?: number
  remainingAfterDeposit?: number
  remainingBalance?: number
  depositStatus?: "pending" | "paid" | "partially_paid" | "not_required" | "expired"
  paymentProvider?: string
  mpInitialPayment?: boolean
}

export type OrderDepositSummary = {
  usesDeposit: boolean
  depositAmount: number
  depositPercent: number
  depositStatus: "pending" | "partially_paid" | "paid" | "not_required" | "expired"
  balanceStatus: "pending" | "partially_paid" | "paid" | "not_required"
  sinalPaid: boolean
  fullOrderTotal: number
  paidAmount: number
  remainingBalance: number
  initialChargeAmount: number
  balanceAmount: number
  payDepositOnly: boolean
  paymentProvider: string | null
  depositPaidAt: string | null
  balancePaidAt: string | null
}

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending: "Sinal pendente",
  partially_paid: "Sinal pago - saldo pendente",
  paid: "Sinal pago - pedido quitado",
  not_required: "Sem sinal",
  expired: "Sinal expirado",
};

/** Returns true when the sinal is still actionable (can generate/pay it). */
export function canPaySinal(depositSummary: OrderDepositSummary | null): boolean {
  if (!depositSummary?.usesDeposit) return false;
  return !depositSummary.sinalPaid && depositSummary.depositStatus === "pending";
}

/** Returns true when the sinal row should be displayed (pending or paid). */
export function shouldShowSinal(depositSummary: OrderDepositSummary | null): boolean {
  return Boolean(
    depositSummary?.usesDeposit && depositSummary.depositAmount > 0.009,
  );
}

export function getOrderDepositSummary(order: OrderFinancialSnapshot): OrderDepositSummary {
  const rawMeta = getDepositCheckoutMeta(order.checkout_fulfillment ?? null)
  const paidAmount = getOrderPaidAmount(order)
  const isExpired = Boolean(
    order.payment_expires_at &&
      new Date(order.payment_expires_at) < new Date() &&
      paidAmount <= 0.009,
  )
  const normalized = normalizeDepositCheckoutMeta(
    rawMeta,
    getOrderTotalAmount(order),
    paidAmount,
    { expired: isExpired },
  )
  const meta = normalized ?? rawMeta
  const usesDeposit = Boolean(meta.usesDeposit || meta.payDepositOnly)

  return {
    usesDeposit,
    depositAmount: Number(meta.depositAmount ?? meta.serviceDepositAmount ?? 0),
    depositPercent: Number(meta.depositPercent ?? 0),
    depositStatus: usesDeposit
      ? ((meta.depositStatus as OrderDepositSummary["depositStatus"]) || "pending")
      : "not_required",
    balanceStatus: usesDeposit
      ? ((meta.balanceStatus as OrderDepositSummary["balanceStatus"]) || "not_required")
      : "not_required",
    sinalPaid: Boolean(meta.sinalPaid),
    fullOrderTotal: Number(meta.fullOrderTotal ?? getOrderTotalAmount(order)),
    paidAmount,
    remainingBalance: Math.max(
      0,
      Number(meta.remainingBalance ?? getOrderRemainingBalance(order)),
    ),
    initialChargeAmount: Number(meta.initialChargeAmount ?? 0),
    balanceAmount: Number(meta.balanceAmount ?? 0),
    payDepositOnly: Boolean(meta.payDepositOnly),
    paymentProvider: (meta.paymentProvider as string | undefined) ?? null,
    depositPaidAt: (meta.depositPaidAt as string | undefined) ?? null,
    balancePaidAt: (meta.balancePaidAt as string | undefined) ?? null,
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
  paidAt?: string | null,
): Record<string, unknown> | null | undefined {
  if (!checkoutFulfillment) return checkoutFulfillment
  const meta = getDepositCheckoutMeta(checkoutFulfillment)
  if (!meta.usesDeposit && !meta.payDepositOnly) return checkoutFulfillment

  const normalized = normalizeDepositCheckoutMeta(meta, totalAmount, paidAmount, {
    nowIso: paidAt || new Date().toISOString(),
  })
  if (!normalized) return checkoutFulfillment

  return {
    ...checkoutFulfillment,
    depositCheckout: {
      ...normalized,
      lastPaymentAt: paidAt || new Date().toISOString(),
    },
  }
}

/** Expected MP charge: full total, initial charge when deposit-only checkout, or remaining balance when partial/exchange paid. */
export function getExpectedMpChargeAmount(order: OrderFinancialSnapshot): number {
  const paidAmount = getOrderPaidAmount(order)
  if (paidAmount > 0.009) {
    return getOrderRemainingBalance(order)
  }
  const depositSummary = getOrderDepositSummary(order)
  // If deposit (sinal) was already paid or partially paid, charge remaining balance
  if (depositSummary.sinalPaid && depositSummary.usesDeposit) {
    return Math.max(0, depositSummary.remainingBalance)
  }
  // If deposit expired and nothing was paid, charge the full order total
  if (depositSummary.usesDeposit && depositSummary.depositStatus === "expired") {
    return getOrderTotalAmount(order)
  }
  // If deposit is pending, charge the initial deposit amount
  if (
    depositSummary.usesDeposit &&
    depositSummary.initialChargeAmount > 0.009
  ) {
    return depositSummary.initialChargeAmount
  }
  return getOrderTotalAmount(order)
}

export const FINANCIAL_FREEZE_INFO_MESSAGE =
  "Esta venda já possui recebimentos registrados. Descontos, taxas e juros não podem mais ser alterados. Os métodos abaixo servem apenas para registrar o recebimento do saldo restante."
