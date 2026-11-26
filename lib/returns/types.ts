export const RETURN_STATUSES = [
  "PENDING_REVIEW",
  "UNDER_ANALYSIS",
  "APPROVED",
  "REJECTED",
  "WAITING_CUSTOMER",
  "WAITING_ITEM_RETURN",
  "PROCESSING",
  "RESOLVED",
  "EXPIRED",
  "ESCALATED",
] as const

export type ReturnStatus = (typeof RETURN_STATUSES)[number]

export const RETURN_RESOLUTIONS = ["exchange", "refund", "store_credit", "none", "rejected"] as const
export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number]

export const RETURN_REQUEST_TYPES = ["cancellation", "return", "exchange", "refund", "store_credit"] as const
export type ReturnRequestType = (typeof RETURN_REQUEST_TYPES)[number]

export const REVERSE_LOGISTICS_METHODS = [
  "not_required",
  "in_person",
  "own_pickup",
  "carrier_label",
  "customer_shipping",
] as const
export type ReverseLogisticsMethod = (typeof REVERSE_LOGISTICS_METHODS)[number]

export const REVERSE_LOGISTICS_STATUSES = [
  "not_required",
  "pending",
  "scheduled",
  "in_transit",
  "received",
] as const
export type ReverseLogisticsStatus = (typeof REVERSE_LOGISTICS_STATUSES)[number]

export const RETURN_REASONS = [
  "wrong_item",
  "defective",
  "damaged",
  "different_from_description",
  "missing_parts",
  "arrived_late",
  "changed_mind",
  "other",
] as const

export type ReturnReason = (typeof RETURN_REASONS)[number]

export type ReturnEvidenceInput = {
  file_url: string
  file_key?: string | null
  file_name?: string | null
  file_type?: string | null
  file_size?: number | null
  thumbnail_url?: string | null
  metadata?: Record<string, unknown>
}

export type ReturnItemInput = {
  order_item_id: string
  quantity: number
  reason?: string | null
  condition?: "sealed" | "opened" | "damaged" | null
  sku?: string | null
  metadata?: Record<string, unknown>
}

export type ReturnRequestListItem = {
  id: string
  partnerId: string
  orderId: string
  orderNumber: string
  customerId: string
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  orderStatus?: string
  deliveryStatus?: string
  deliveryType?: string
  createdAt: string
  updatedAt: string
  source: "erp" | "marketplace" | "moderation"
  requestType?: ReturnRequestType
  desiredResolution: ReturnResolution
  approvedResolution?: ReturnResolution | null
  reason: string
  status: ReturnStatus
  refundValue: number
  storeCreditValue: number
  evidenceImages: string[]
  observations?: string
  customerMessage?: string
  sellerNotes?: string
  expiresAt?: string | null
  eligibilityStatus?: string | null
  eligibilityDetails?: Record<string, unknown> | null
  policySnapshot?: Record<string, unknown> | null
  slaDueAt?: string | null
  slaStatus?: string | null
  slaExpiredAt?: string | null
  reportedToDuditAt?: string | null
  duditReportId?: string | null
  paymentProvider?: string
  mpPaymentId?: string | null
  orderTotal?: number
  orderPaidAmount?: number
  refundPaymentMethod?: string
  refundType?: "full" | "partial" | "none" | "store_credit" | string | null
  exchangeOrderId?: string | null
  exchangeOrderNumber?: string | null
  exchangeOrderDeliveryStatus?: string | null
  exchangeOrderDeliveryType?: string | null
  exchangeSubstatus?: string | null
  exchangeShortfallAmount?: number
  exchangeSurplusAmount?: number
  exchangeItemsSnapshot?: Array<{
    product_id: string
    variant_id?: string | null
    quantity: number
    unit_price: number
    product_name?: string | null
    sku?: string | null
    image?: string | null
  }> | null
  exchangeBalanceResolution?: "store_credit" | "refund" | null
  reverseLogisticsMethod?: ReverseLogisticsMethod | null
  reverseLogisticsStatus?: ReverseLogisticsStatus | null
  returnFreightPayer?: "customer" | "seller" | "case_by_case" | null
  reverseLogisticsTrackingCode?: string | null
  reverseLogisticsNotes?: string | null
  items: Array<{
    id: string
    orderItemId: string
    productId?: string | null
    variantId?: string | null
    productName: string
    sku?: string | null
    image?: string | null
    price: number
    netItemValue?: number
    quantity: number
    orderedQuantity: number
    reason?: string | null
    condition?: string | null
  }>
}

export function getReturnStatusLabel(status: string) {
  switch (status) {
    case "PENDING_REVIEW": return "Pendente"
    case "UNDER_ANALYSIS": return "Em análise"
    case "APPROVED": return "Aprovada"
    case "REJECTED": return "Recusada"
    case "WAITING_CUSTOMER": return "Aguardando cliente"
    case "WAITING_ITEM_RETURN": return "Aguardando cliente"
    case "PROCESSING": return "Aprovada"
    case "RESOLVED": return "Concluida"
    case "EXPIRED": return "Concluida"
    case "ESCALATED": return "Em análise"
    default: return status || "Pendente"
  }
}

export function getReturnResolutionLabel(resolution: string) {
  switch (resolution) {
    case "exchange": return "Troca"
    case "refund": return "Reembolso"
    case "store_credit": return "Vale-compra"
    case "none": return "Sem resolução"
    case "rejected": return "Recusado"
    default: return resolution || "-"
  }
}

export function getReverseLogisticsMethodLabel(method?: string | null): string {
  switch (method) {
    case "not_required": return "Não precisa devolver"
    case "in_person": return "Devolução presencial na loja"
    case "own_pickup": return "Coleta própria / motoboy"
    case "carrier_label": return "Transportadora / Correios (Etiqueta)"
    case "customer_shipping": return "Envio por conta do cliente"
    default: return "Não definido"
  }
}

export function getReverseLogisticsStatusLabel(status?: string | null): string {
  switch (status) {
    case "not_required": return "Não aplicável"
    case "pending": return "Aguardando devolução"
    case "scheduled": return "Coleta / entrega agendada"
    case "in_transit": return "Em trânsito"
    case "received": return "Recebido na loja"
    default: return "Não definido"
  }
}

export function getReverseLogisticsCustomerDescription(method?: string | null): string | null {
  switch (method) {
    case "not_required":
      return "Não é necessário devolver o produto fisicamente."
    case "in_person":
      return "Leve o produto diretamente até a loja para concluir a devolução."
    case "own_pickup":
      return "A loja enviará um motoboy/coleta própria para retirar o produto no seu endereço."
    case "carrier_label":
      return "A devolução será feita via transportadora/Correios com etiqueta fornecida pela loja."
    case "customer_shipping":
      return "Envie o produto pelos Correios ou transportadora de sua preferência para o endereço da loja."
    default:
      return null
  }
}
