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
  netItemValue?: number
  quantity: number
  orderedQuantity?: number
  reason: string
  condition: "sealed" | "opened" | "damaged" | "aberto" | "lacrado" | "danificado"
}

export type ReturnRequest = Omit<ReturnRequestListItem, "items"> & {
  orderNumber: string
  customerName: string
  customerAddress?: string
  createdAt: string
  refundType?: "full" | "partial" | "none" | "pix" | "credit_card" | "store_credit" | "other"
  creditType?: "full" | "partial"
  refundValue: number
  storeCreditValue: number
  returnDate?: string
  items: any[]
}
