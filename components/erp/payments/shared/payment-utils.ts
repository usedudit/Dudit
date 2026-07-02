import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"

export const PAYMENT_METHODS_UPDATED_EVENT = "payment-methods-updated"

export function normalizePaymentMethodLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return ""
  if (normalized.includes("dinheiro") || normalized.includes("cash") || normalized.includes("money")) return "Dinheiro"
  if (normalized.includes("pix")) return "Pix"
  if (normalized.includes("cartão de crédito") || normalized.includes("cartao de credito") || normalized.includes("credito") || normalized.includes("crédito") || normalized.includes("credit")) return "Cartão de Crédito"
  if (normalized.includes("cartão de débito") || normalized.includes("cartao de debito") || normalized.includes("debito") || normalized.includes("débito") || normalized.includes("debit")) return "Cartão de Débito"
  if (normalized.includes("transferência") || normalized.includes("transferencia") || normalized.includes("ted") || normalized.includes("doc")) return "Transferência"
  if (normalized.includes("cartao") || normalized.includes("cartão") || normalized.includes("card")) return "Cartão"
  if (normalized.includes("pendente") || normalized.includes("método não definido")) return "Método não definido"
  return String(value || "").trim()
}

export function formatPaymentMethodToFullLabel(value?: string | null) {
  if (!value) return ""
  return formatPaymentMethodLabel(value, null)
}

export function normalizeMethodType(value?: string | null) {
  const raw = String(value || "").toLowerCase().trim()
  if (raw === "cash" || raw === "dinheiro") return "cash"
  if (raw === "pix") return "pix"
  if (["credit_card", "credito", "cartao_credito", "cartão de crédito"].includes(raw)) return "credit_card"
  if (["debit_card", "debito", "cartao_debito", "cartão de débito"].includes(raw)) return "debit_card"
  if (["bank_transfer", "transferencia_bancaria", "transferencia", "ted", "doc", "transferência", "transferência bancária"].includes(raw)) return "bank_transfer"
  if (["card", "cartao", "cartão", "credit", "debit"].includes(raw)) return "credit_card"
  return "other"
}

export function getTargetViewForMethodType(type: string) {
  if (type === "cash") return "money"
  if (type === "pix") return "pix"
  return "card"
}

export type PaymentFlowView =
  | "methods"
  | "method_type_select"
  | "money"
  | "card"
  | "pix"
  | "split"
  | "split_method_select"

export type PartnerPaymentMethod = {
  id: string
  name: string
  type: string
  is_active?: boolean
  fee_percent?: number | null
  fee_fixed?: number | null
  fee_bearer?: "merchant" | "customer"
  discount_percent?: number | null
  max_installments?: number | null
}

export type PaymentBreakdownLeg = {
  method: string
  amount: number
  effectiveAmount?: number
  amountReceived?: number
  paymentMethodId?: string | null
  installmentNumber?: number
  provider?: string | null
  adjustmentType?: string
  adjustmentPercent?: number
  adjustmentAmount?: number
}
