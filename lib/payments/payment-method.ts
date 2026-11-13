export type CanonicalPaymentType = "pix" | "credit_card" | "debit_card" | "cash" | "other" | "bank_transfer" | "store_credit" | "vale_compra" | "vale-compra"

export function toCanonicalPaymentType(value: string | null | undefined): CanonicalPaymentType {
  const raw = String(value || "").trim().toLowerCase()
  if (raw === "pix") return "pix"
  if (["credit_card", "credito", "cartao_credito", "cartão", "cartao", "cartão de crédito", "cartao de credito", "credit", "card"].includes(raw)) return "credit_card"
  if (["debit_card", "debito", "cartao_debito", "cartão de débito", "cartao de debito", "debit"].includes(raw)) return "debit_card"
  if (["cash", "dinheiro"].includes(raw)) return "cash"
  if (["bank_transfer", "transferencia_bancaria", "transferencia", "ted", "doc", "transferência", "transferência bancária"].includes(raw)) return "bank_transfer"
  if (["store_credit", "vale_compra", "vale-compra"].includes(raw)) return "store_credit"
  return "other"
}

export function toLegacyPaymentType(value: string | null | undefined): string {
  const canonical = toCanonicalPaymentType(value)
  if (canonical === "credit_card") return "credito"
  if (canonical === "debit_card") return "debito"
  if (canonical === "cash") return "dinheiro"
  if (canonical === "pix") return "pix"
  if (canonical === "bank_transfer") return "transferencia_bancaria"
  return "outros"
}

/**
 * Detects store credit / vale-compra payment labels without matching regular
 * credit cards ("Cartão de Crédito") by accident.
 */
export function isStoreCreditMethod(value?: string | null): boolean {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return false
  if (raw === "exchange") return true
  if (
    raw.includes("store_credit") ||
    raw.includes("store-credit") ||
    raw.includes("store credit")
  ) {
    return true
  }
  if (
    raw.includes("vale-compra") ||
    raw.includes("vale_compra") ||
    raw.includes("vale compra")
  ) {
    return true
  }
  return (
    raw.includes("crédito de troca") ||
    raw.includes("credito de troca") ||
    raw.includes("crédito na loja") ||
    raw.includes("credito na loja") ||
    raw.includes("crédito em loja") ||
    raw.includes("credito em loja") ||
    raw.includes("crédito de loja") ||
    raw.includes("credito de loja") ||
    raw.includes("crédito do cliente") ||
    raw.includes("credito do cliente")
  )
}

export function formatPaymentMethodLabel(value?: string | null): string {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized || normalized === "pendente" || normalized === "método não definido") return "Método não definido"
  if (normalized === "cash" || normalized === "dinheiro" || normalized === "money") return "Dinheiro"
  if (normalized === "pix") return "Pix"
  if (normalized === "credito" || normalized === "credit_card" || normalized === "cartao_credito") return "Cartão de Crédito"
  if (normalized === "debito" || normalized === "debit_card" || normalized === "cartao_debito") return "Cartão de Débito"
  if (normalized === "cartão" || normalized === "cartao") return "Cartão"
  if (normalized === "bank_transfer" || normalized === "transferencia_bancaria") return "Transferência Bancária"
  return String(value || "").trim()
}

