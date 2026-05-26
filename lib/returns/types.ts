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
  expiresAt?: string | null
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
    case "UNDER_ANALYSIS": return "Em analise"
    case "APPROVED": return "Aprovada"
    case "REJECTED": return "Recusada"
    case "WAITING_CUSTOMER": return "Aguardando cliente"
    case "WAITING_ITEM_RETURN": return "Aguardando cliente"
    case "PROCESSING": return "Aprovada"
    case "RESOLVED": return "Concluida"
    case "EXPIRED": return "Concluida"
    case "ESCALATED": return "Em analise"
    default: return status || "Pendente"
  }
}

export function getReturnResolutionLabel(resolution: string) {
  switch (resolution) {
    case "exchange": return "Troca"
    case "refund": return "Reembolso"
    case "store_credit": return "Vale-compra"
    case "none": return "Sem resolucao"
    case "rejected": return "Recusado"
    default: return resolution || "-"
  }
}
