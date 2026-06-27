export type ReturnShippingPayer = "customer" | "seller" | "case_by_case"

export type ReturnEligibilityStatus =
  | "elegivel"
  | "elegivel_comercial"
  | "elegivel_garantia"
  | "expirado"
  | "analise_manual"

export type ReturnSlaStatus = "aguardando_vendedor" | "respondido" | "vencido"

export type ReturnPolicySnapshot = {
  version: number
  captured_at: string
  partner_id: string
  store_name?: string | null
  legal_reference: {
    online_regret_days: number
    durable_product_days: number
    non_durable_product_days: number
  }
  commercial: {
    accepts_size_exchange: boolean
    accepts_color_exchange: boolean
    accepts_store_credit: boolean
    accepts_in_person_return: boolean
    accepts_shipping_return: boolean
    shipping_payer: ReturnShippingPayer
    commercial_deadline_days: number
    additional_warranty_days: number
    notes?: string | null
  }
  full_policy_text: string
  receipt_message?: string | null
  receipt_show_policy_block: boolean
  sla_response_days: number
}

export type PartnerReturnPolicy = {
  partnerId: string
  legalOnlineRegretDays: number
  legalDurableProductDays: number
  legalNonDurableProductDays: number
  acceptsSizeExchange: boolean
  acceptsColorExchange: boolean
  acceptsStoreCredit: boolean
  acceptsInPersonReturn: boolean
  acceptsShippingReturn: boolean
  shippingPayer: ReturnShippingPayer
  commercialDeadlineDays: number
  additionalWarrantyDays: number
  commercialNotes?: string | null
  fullPolicyText: string
  receiptMessage?: string | null
  receiptShowPolicyBlock: boolean
  slaResponseDays: number
  updatedAt?: string | null
}

export const DEFAULT_POLICY: Omit<PartnerReturnPolicy, "partnerId"> = {
  legalOnlineRegretDays: 7,
  legalDurableProductDays: 90,
  legalNonDurableProductDays: 30,
  acceptsSizeExchange: true,
  acceptsColorExchange: true,
  acceptsStoreCredit: true,
  acceptsInPersonReturn: true,
  acceptsShippingReturn: true,
  shippingPayer: "case_by_case",
  commercialDeadlineDays: 30,
  additionalWarrantyDays: 0,
  commercialNotes: null,
  fullPolicyText: "",
  receiptMessage: null,
  receiptShowPolicyBlock: true,
  slaResponseDays: 5,
}

export function buildDefaultPolicyText(storeName?: string | null): string {
  const name = storeName?.trim() || "nossa loja"
  return (
    `Política de Trocas e Devoluções - ${name}\n\n` +
    "1. Prazo comercial: consulte o prazo informado no momento da compra.\n" +
    "2. Trocas por tamanho ou cor: conforme disponibilidade de estoque.\n" +
    "3. Devoluções: produto deve estar em condições de revenda, com embalagem e acessórios.\n" +
    "4. Vale-compra: pode ser oferecido como alternativa ao reembolso.\n" +
    "5. Frete de devolução: conforme acordado entre cliente e loja.\n\n" +
    "Referência legal (CDC): arrependimento em compras online em até 7 dias; " +
    "produtos duráveis até 90 dias; não duráveis até 30 dias para vícios.\n\n" +
    "A Dudit não participa da transação nem realiza mediação jurídica."
  )
}

export function getEligibilityLabel(status: ReturnEligibilityStatus | string | null | undefined): string {
  switch (status) {
    case "elegivel": return "Elegível (arrependimento)"
    case "elegivel_comercial": return "Elegível (prazo comercial)"
    case "elegivel_garantia": return "Elegível (garantia adicional)"
    case "expirado": return "Prazo expirado"
    case "analise_manual": return "Análise manual"
    default: return "Não calculado"
  }
}

export function getSlaStatusLabel(status: ReturnSlaStatus | string | null | undefined): string {
  switch (status) {
    case "aguardando_vendedor": return "Aguardando vendedor"
    case "respondido": return "Respondido"
    case "vencido": return "Prazo vencido"
    default: return "-"
  }
}

export function getShippingPayerLabel(payer: ReturnShippingPayer | string): string {
  switch (payer) {
    case "customer": return "Cliente"
    case "seller": return "Vendedor"
    case "case_by_case": return "A combinar"
    default: return payer
  }
}

export function canReportReturnToDudit(params: {
  status: string
  slaStatus?: string | null
  reportedToDuditAt?: string | null
}): boolean {
  if (params.reportedToDuditAt) return false
  return (
    params.slaStatus === "vencido" ||
    params.status === "REJECTED"
  )
}

export const DUDIT_REPORT_LEGAL_NOTICE =
  "A Dudit não participa da transação nem realiza mediação jurídica. " +
  "O reporte serve apenas para análise de possível abuso da plataforma."

export function policyRowToSnapshot(row: PartnerReturnPolicy, storeName?: string): ReturnPolicySnapshot {
  return {
    version: 1,
    captured_at: new Date().toISOString(),
    partner_id: row.partnerId,
    store_name: storeName,
    legal_reference: {
      online_regret_days: row.legalOnlineRegretDays,
      durable_product_days: row.legalDurableProductDays,
      non_durable_product_days: row.legalNonDurableProductDays,
    },
    commercial: {
      accepts_size_exchange: row.acceptsSizeExchange,
      accepts_color_exchange: row.acceptsColorExchange,
      accepts_store_credit: row.acceptsStoreCredit,
      accepts_in_person_return: row.acceptsInPersonReturn,
      accepts_shipping_return: row.acceptsShippingReturn,
      shipping_payer: row.shippingPayer,
      commercial_deadline_days: row.commercialDeadlineDays,
      additional_warranty_days: row.additionalWarrantyDays,
      notes: row.commercialNotes,
    },
    full_policy_text: row.fullPolicyText || buildDefaultPolicyText(storeName),
    receipt_message: row.receiptMessage,
    receipt_show_policy_block: row.receiptShowPolicyBlock,
    sla_response_days: row.slaResponseDays,
  }
}

export function normalizePolicyRow(row: Record<string, unknown>, partnerId: string): PartnerReturnPolicy {
  return {
    partnerId,
    legalOnlineRegretDays: Number(row.legal_online_regret_days ?? DEFAULT_POLICY.legalOnlineRegretDays),
    legalDurableProductDays: Number(row.legal_durable_product_days ?? DEFAULT_POLICY.legalDurableProductDays),
    legalNonDurableProductDays: Number(row.legal_non_durable_product_days ?? DEFAULT_POLICY.legalNonDurableProductDays),
    acceptsSizeExchange: row.accepts_size_exchange !== false,
    acceptsColorExchange: row.accepts_color_exchange !== false,
    acceptsStoreCredit: row.accepts_store_credit !== false,
    acceptsInPersonReturn: row.accepts_in_person_return !== false,
    acceptsShippingReturn: row.accepts_shipping_return !== false,
    shippingPayer: (row.shipping_payer as ReturnShippingPayer) || "case_by_case",
    commercialDeadlineDays: Number(row.commercial_deadline_days ?? DEFAULT_POLICY.commercialDeadlineDays),
    additionalWarrantyDays: Number(row.additional_warranty_days ?? 0),
    commercialNotes: (row.commercial_notes as string) || null,
    fullPolicyText: String(row.full_policy_text || ""),
    receiptMessage: (row.receipt_message as string) || null,
    receiptShowPolicyBlock: row.receipt_show_policy_block !== false,
    slaResponseDays: Number(row.sla_response_days ?? DEFAULT_POLICY.slaResponseDays),
    updatedAt: (row.updated_at as string) || null,
  }
}
