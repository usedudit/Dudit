export interface ReturnItem {
  id: string // order_item_id
  productId: string
  productName: string
  sku?: string
  image?: string
  price: number
  quantity: number
  reason: "defeito" | "arrependimento" | "tamanho_incorreto" | "outro"
  condition: "aberto" | "lacrado" | "danificado"
  resolution: "reembolso" | "troca" | "vale_compra"
}

export interface ReturnRequest {
  id: string
  partnerId: string
  orderId: string
  orderNumber: string
  customerId: string
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  createdAt: string
  refundType: "full" | "partial" | "none" | "pix" | "credit_card" | "store_credit" | "other"
  status: "pending" | "approved" | "rejected"
  items: ReturnItem[]
  evidenceImages: string[]
  observations?: string
  refundValue: number
  returnDate: string
}
