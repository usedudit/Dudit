export type ReturnResolutionType = "exchange" | "store_credit" | "refund" | "none" | "rejected"
export type RefundCalculationType = "full" | "partial" | "none"

const MONEY_FACTOR = 100

function toFiniteNumber(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function roundMoney(value: unknown) {
  return Math.round(toFiniteNumber(value) * MONEY_FACTOR) / MONEY_FACTOR
}

export function getOrderAmountPaid(order: Record<string, unknown>) {
  const amountPaid = toFiniteNumber(order.amount_paid)
  if (amountPaid > 0) return roundMoney(amountPaid)

  const paidAmount = toFiniteNumber(order.paid_amount)
  if (paidAmount > 0) return roundMoney(paidAmount)

  return roundMoney(order.total_amount)
}

export function getOrderSubtotalOriginal(order: Record<string, unknown>, items: Array<Record<string, unknown>> = []) {
  const persisted = toFiniteNumber(order.subtotal_original)
  if (persisted > 0) return roundMoney(persisted)

  return roundMoney(items.reduce((sum, item) => {
    const subtotal = toFiniteNumber(item.subtotal)
    if (subtotal > 0) return sum + subtotal
    return sum + toFiniteNumber(item.product_price) * toFiniteNumber(item.quantity)
  }, 0))
}

export function getLineSubtotal(item: Record<string, unknown>) {
  const subtotal = toFiniteNumber(item.subtotal)
  if (subtotal > 0) return roundMoney(subtotal)
  return roundMoney(toFiniteNumber(item.product_price) * toFiniteNumber(item.quantity))
}

export function calculateLineNetValue(params: {
  itemSubtotal: number
  orderSubtotal: number
  amountPaid: number
}) {
  if (params.itemSubtotal <= 0 || params.orderSubtotal <= 0 || params.amountPaid <= 0) return 0
  return roundMoney((params.itemSubtotal / params.orderSubtotal) * params.amountPaid)
}

export function calculateReturnedLineNetValue(params: {
  lineNetValue: number
  orderedQuantity: number
  returnQuantity: number
}) {
  const orderedQuantity = Math.max(1, Math.floor(toFiniteNumber(params.orderedQuantity)))
  const returnQuantity = Math.max(0, Math.floor(toFiniteNumber(params.returnQuantity)))
  return roundMoney((roundMoney(params.lineNetValue) / orderedQuantity) * Math.min(returnQuantity, orderedQuantity))
}

export function calculateReturnNetTotal(items: Array<{
  netItemValue?: number | null
  price?: number | null
  quantity: number
  orderedQuantity?: number | null
}>) {
  return roundMoney(items.reduce((sum, item) => {
    const orderedQuantity = Math.max(1, Number(item.orderedQuantity || item.quantity || 1))
    const lineNetValue = roundMoney(item.netItemValue ?? (Number(item.price || 0) * orderedQuantity))
    return sum + calculateReturnedLineNetValue({
      lineNetValue,
      orderedQuantity,
      returnQuantity: item.quantity,
    })
  }, 0))
}

const CANCELLABLE_PAYMENT_STATES = new Set(["pending", "in_process", "paid", "partially_paid", "unpaid"])
const CANCELLABLE_DELIVERY_STATES = new Set(["", "pending", "not_sent", "preparing", "awaiting_payment", "awaiting_shipment", "awaiting_pickup", "pickup_available"])
const LOCKED_DELIVERY_STATES = new Set(["sent", "shipped", "out_for_delivery", "delivered", "picked_up", "completed", "delivery_failed", "cancelled"])

export function canRequestOrderCancellation(order: { situation?: string | null; delivery_status?: string | null }) {
  const situation = String(order.situation || "").toLowerCase()
  const deliveryStatus = String(order.delivery_status || "").toLowerCase()
  if (situation === "cancelled" || situation === "completed" || situation === "delivered" || situation === "shipped") return false
  if (LOCKED_DELIVERY_STATES.has(deliveryStatus)) return false
  return CANCELLABLE_PAYMENT_STATES.has(situation) || CANCELLABLE_DELIVERY_STATES.has(deliveryStatus)
}

export function canRequestPostFulfillmentResolution(order: { situation?: string | null; delivery_status?: string | null }) {
  const situation = String(order.situation || "").toLowerCase()
  const deliveryStatus = String(order.delivery_status || "").toLowerCase()
  if (situation === "cancelled") return false
  return LOCKED_DELIVERY_STATES.has(deliveryStatus) || situation === "shipped" || situation === "delivered"
}

/**
 * Extracts the total amount paid via Mercado Pago from the order's payment_breakdown.
 * Uses the canonical `provider` field (set at checkout as "Mercado Pago"), NOT display labels.
 * Falls back to the full order amount when the order was paid entirely via MP (no breakdown).
 */
export function extractMercadoPagoPaidAmount(order: any): number {
  const breakdown = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
  if (breakdown.length === 0) {
    // No breakdown = single payment method. Check if it was MP.
    const provider = String(order?.payment_provider || "").toLowerCase()
    if (provider.includes("mercado") || order?.mp_payment_id) {
      return getOrderAmountPaid(order)
    }
    return 0
  }
  // Sum only entries where provider is "Mercado Pago" (canonical value set by checkout)
  return breakdown.reduce((sum: number, entry: any) => {
    const entryProvider = String(entry.provider || "").toLowerCase()
    if (entryProvider.includes("mercado")) {
      return sum + Math.max(0, Number(entry.amount || entry.effectiveAmount || 0))
    }
    return sum
  }, 0)
}

