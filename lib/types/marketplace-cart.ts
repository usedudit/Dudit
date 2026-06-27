export type MarketplaceCartItemType = "product" | "service_booking" | "subscription"

export type ServiceBookingMetadata = {
  staffId: string
  staffName: string
  date: string
  time: string
  serviceName: string
  durationMinutes: number
  price: number
  notes?: string | null
  /** Non-scheduled service purchase (no appointment row). */
  instantPurchase?: boolean
}

export type LineFulfillmentMode = "delivery" | "pickup" | "on_site" | "customer_location"

export type CheckoutFulfillmentLine = {
  cartItemId?: string
  itemType: MarketplaceCartItemType
  productId?: string | null
  variantId?: string | null
  serviceId?: string | null
  recurringPlanId?: string | null
  quantity: number
  unitPrice: number
  lineName: string
  fulfillmentMode?: LineFulfillmentMode | null
  bookingMetadata?: ServiceBookingMetadata | null
  payDepositOnly?: boolean
  depositAmount?: number | null
  fullPrice?: number | null
}

export type CheckoutFulfillmentPayload = {
  version: 1
  buyerId: string
  partnerId: string
  lines: CheckoutFulfillmentLine[]
  deliveryType?: "delivery" | "pickup"
  deliveryAddress?: string | null
}

export type CheckoutFulfillmentResult = {
  appointmentIds?: string[]
  subscriptionIds?: string[]
  executionIds?: string[]
  /** Paid orders where the selected slot was taken - buyer must reschedule */
  rescheduleRequired?: Array<{
    serviceId?: string | null
    serviceName?: string
    date?: string
    time?: string
  }>
}
