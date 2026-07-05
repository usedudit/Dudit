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
  customerPhone?: string
  orderStatus?: string
  deliveryStatus?: string
  createdAt: string
  refundType?: "full" | "partial" | "none" | "pix" | "credit_card" | "store_credit" | "other"
  creditType?: "full" | "partial"
  refundValue: number
  storeCreditValue: number
  orderTotal?: number
  orderPaidAmount?: number
  returnDate?: string
  items: any[]
  returnEvents?: ReturnEvent[]
  exchangeOrderId?: string | null
  exchangeSubstatus?: string | null
  exchangeShortfallAmount?: number
  exchangeSurplusAmount?: number
  exchangeItemsSnapshot?: Array<{
    product_id: string
    variant_id?: string | null
    quantity: number
    unit_price: number
  }> | null
  exchangeBalanceResolution?: "store_credit" | "refund" | null
}

export interface ReturnEvent {
  id: string
  return_request_id: string
  previous_status: string | null
  new_status: string | null
  changed_by: string | null
  actor_name?: string
  notes: string | null
  created_at: string
}
