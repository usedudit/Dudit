export type FinanceAccountType = "cash" | "bank" | "wallet"

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
  { value: "Outro", label: "Outro" },
]

