export type CanonicalPaymentType = "pix" | "credit_card" | "debit_card" | "cash" | "other" | "bank_transfer"

export function toCanonicalPaymentType(value: string | null | undefined): CanonicalPaymentType {
  const raw = String(value || "").trim().toLowerCase()
  if (raw === "pix") return "pix"
  if (["credit_card", "credito", "cartao_credito", "cartão", "cartao"].includes(raw)) return "credit_card"
  if (["debit_card", "debito", "cartao_debito"].includes(raw)) return "debit_card"
  if (["cash", "dinheiro"].includes(raw)) return "cash"
  if (["bank_transfer", "transferencia_bancaria", "transferencia", "ted", "doc"].includes(raw)) return "bank_transfer"
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

