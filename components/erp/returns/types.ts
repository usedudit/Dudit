import type { ReturnRequestListItem } from "@/lib/returns/types"

export interface ReturnItem {
  id: string
  orderItemId?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string | null
  image?: string | null
  price: number
  quantity: number
  orderedQuantity?: number
  reason: string
  condition: "sealed" | "opened" | "damaged" | "aberto" | "lacrado" | "danificado"
  resolution: "refund" | "exchange" | "store_credit" | "reembolso" | "troca" | "vale_compra"
}

export type ReturnRequest = Omit<ReturnRequestListItem, "items"> & {
  orderNumber: string
  customerName: string
  customerAddress?: string
  createdAt: string
  refundType?: "full" | "partial" | "none" | "pix" | "credit_card" | "store_credit" | "other"
  refundValue: number
  returnDate?: string
  items: any[]
}
