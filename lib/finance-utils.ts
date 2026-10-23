export type FinanceAccountType = "cash" | "bank" | "wallet"

export function findMercadoPagoAccountId(
  accounts: { id: string; name: string; integration_source?: string | null; is_active?: boolean | null }[],
): string | null {
  const rows = accounts.filter((a) => a.is_active !== false)
  const bySource = rows.find((a) => a.integration_source === "mercadopago")
  if (bySource) return bySource.id
  const byName = rows.find((a) => a.name.toLowerCase().includes("mercado pago"))
  if (byName) return byName.id
  return null
}

export function isMercadoPagoPaymentType(paymentType: string | null | undefined): boolean {
  const norm = String(paymentType || "").toLowerCase().trim()
  return norm.includes("mercado pago") || norm.includes("mercadopago")
}

/** Conta padrão do tipo (caixa, banco ou carteira) entre contas ativas. */
export function pickDefaultAccountIdForType(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
  accountType: FinanceAccountType,
): string | undefined {
  const rows = accounts.filter((a) => a.is_active !== false)
  return rows.find((a) => a.type === accountType && a.is_default)?.id ?? rows.find((a) => a.type === accountType)?.id
}

/** Para formulários genéricos: prioriza padrão caixa, depois banco, depois carteira. */
export function pickPreferredDefaultAccountId(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
): string | undefined {
  for (const t of ["cash", "bank", "wallet"] as const) {
    const id = pickDefaultAccountIdForType(accounts, t)
    if (id) return id
  }
  return undefined
}

/** Pedidos ERP (não-PDV): padrão banco → caixa. PDV continua escolhendo só caixa na UI. */
export function pickBankThenCashDefaultFinanceAccountId(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
): string | undefined {
  const rows = accounts.filter((a) => a.is_active !== false)
  return (
    rows.find((a) => a.type === "bank" && a.is_default)?.id ??
    rows.find((a) => a.type === "bank")?.id ??
    pickPreferredDefaultAccountId(accounts)
  )
}


export const STANDARD_PAYMENT_METHODS = [
  { value: "Pix", label: "Pix" },
  { value: "Dinheiro", label: "Dinheiro" },
  { value: "Cartão de crédito", label: "Cartão de crédito" },
  { value: "Cartão de débito", label: "Cartão de débito" },
  { value: "Boleto", label: "Boleto" },
  { value: "TEF", label: "TEF" },
  { value: "Cheque", label: "Cheque" },
  { value: "Vale-compra", label: "Vale-compra" },
  { value: "Mercado Pago", label: "Mercado Pago" },
  { value: "Outro", label: "Outro" },
]

/**
 * Mapeia um rótulo de meio de pagamento (nome do método / payment_type, com
 * variações e composições tipo "Cartão de Crédito (Visa)") para o método
 * padrão correspondente. Retorna "" quando não reconhecido.
 */
export function resolveStandardPaymentMethod(label: string | null | undefined): string {
  const norm = (label || "").toLowerCase().trim()
  if (!norm) return ""
  if (
    norm.includes("vale-compra") ||
    norm.includes("vale_compra") ||
    norm.includes("store_credit") ||
    norm === "store-credit"
  ) {
    return "Vale-compra"
  }
  if (norm.includes("troca") || norm.includes("exchange")) return ""
  if (norm.includes("pix")) return "Pix"
  if (
    norm.includes("dinheiro") ||
    norm.includes("cash") ||
    norm.includes("money") ||
    norm.includes("espécie") ||
    norm.includes("espece")
  ) {
    return "Dinheiro"
  }
  if (norm.includes("crédito") || norm.includes("credito") || norm.includes("credit")) return "Cartão de crédito"
  if (norm.includes("débito") || norm.includes("debito") || norm.includes("debit")) return "Cartão de débito"
  if (norm.includes("boleto")) return "Boleto"
  if (norm.includes("tef")) return "TEF"
  if (norm.includes("cheque") || norm.includes("check")) return "Cheque"
  if (norm.includes("mercado pago") || norm.includes("mercadopago") || norm === "mercado pago") return "Mercado Pago"
  return ""
}

