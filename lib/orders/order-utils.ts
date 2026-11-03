import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"

/**
 * Sanitizes and cleans order notes by removing internal tracking markers
 * and cancellation system lines, returning only genuine user/customer notes.
 */
export function cleanOrderNotes(value?: string | null): string {
  if (!value) return ""
  return String(value)
    .replace(/\n*Pedido cancelado por:[\s\S]*$/i, "")
    .replace(/service_order:[0-9a-f-]+:order/gi, "")
    .replace(/^Pedido criado a partir do orçamento\s+[^\n.]*(\.|\n|$)/gim, "")
    .trim()
}

/**
 * Normalizes order source labels for UI display.
 * E.g., maps legacy 'admin_service_order' to 'Ordem de Serviço'.
 */
export function normalizeOrderSource(source?: string | null): string {
  if (!source) return "Manual"
  const trimmed = source.trim()
  if (trimmed === "admin_service_order") return "Ordem de Serviço"
  if (trimmed === "Direct Sales") return "Manual"
  if (trimmed === "Online Store") return "Loja Online"
  return trimmed
}

/**
 * Placeholders used by orders when no real payment method was registered.
 */
export const UNDEFINED_PAYMENT_PLACEHOLDERS = [
  "método não definido",
  "metodo nao definido",
  "não informado",
  "nao informado",
  "",
]

interface PaymentMethodSource {
  payment_method?: string | null
  payment_breakdown?: unknown
  checkout_fulfillment?: Record<string, unknown> | null
}

/**
 * Resolves the payment method label used to display/filter an order.
 * Mirrors the breakdown-aware logic used by the order list rows and
 * normalizes it ("credit_card" -> "Cartão de Crédito", drops " - 2x", etc).
 */
export function resolveOrderPaymentMethodLabel(order?: PaymentMethodSource | null): string {
  const breakdown = Array.isArray(order?.payment_breakdown) ? (order?.payment_breakdown as any[]) : []
  const entries = breakdown.filter((leg) => leg?.method && !leg?.checkoutPricing)
  const paidEntries = entries.filter((leg) => Number(leg?.amountReceived ?? leg?.amount ?? 0) > 0.009)
  const paidKeys = new Set(
    paidEntries.map((leg) => String(leg?.method || "").toLowerCase().trim()).filter(Boolean),
  )

  if (paidKeys.size > 1) return "Múltiplos meios"

  const source = paidEntries[0]?.method || entries[0]?.method || order?.payment_method || ""
  const cleaned = String(source)
    .trim()
    .replace(/\s+-\s*\d+x\s*$/i, "")

  if (!UNDEFINED_PAYMENT_PLACEHOLDERS.includes(cleaned.toLowerCase())) {
    return formatPaymentMethodLabel(cleaned, null) || "Não informado"
  }

  const checkout = order?.checkout_fulfillment as any
  const checkoutMethod = String(checkout?.depositCheckout?.paymentMethod || checkout?.paymentMethod || "").trim()
  if (checkoutMethod && !UNDEFINED_PAYMENT_PLACEHOLDERS.includes(checkoutMethod.toLowerCase())) {
    return formatPaymentMethodLabel(checkoutMethod, null) || "Não informado"
  }

  return "Não informado"
}

/**
 * Compares two ISO timestamps or DB date strings for equivalence.
 * Returns true if both represent the same point in time, tolerating timezone offset
 * differences (+00:00 vs Z) and subsecond/microsecond precision truncation (up to 2000ms window).
 */
export function areTimestampsEquivalent(
  t1?: string | null,
  t2?: string | null,
): boolean {
  if (!t1 && !t2) return true;
  if (!t1 || !t2) return false;
  if (t1 === t2) return true;
  const timeA = new Date(t1).getTime();
  const timeB = new Date(t2).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return false;
  return Math.abs(timeA - timeB) <= 2000;
}

