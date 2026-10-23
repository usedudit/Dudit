export interface SalesSettings {
  maxDiscountPercent: number | null
  defaultMarginPercent: number | null
  allowNegativeStock: boolean
  requireSeller: boolean
  allowCustomItemPrice: boolean
  quoteValidityDays: number
  autoCancelManualOrdersHours: number // 0 = never, 24, 48, 72, 168
  cancelExpiredDepositOrders: boolean // when true, orders with expired sinal are auto-cancelled
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  maxDiscountPercent: 100,
  defaultMarginPercent: 30,
  allowNegativeStock: false,
  requireSeller: false,
  allowCustomItemPrice: true,
  quoteValidityDays: 15,
  autoCancelManualOrdersHours: 0, // 0 = never cancel manual orders
  cancelExpiredDepositOrders: false,
}

export interface ReceiptSettings {
  receiptMessage: string | null
  receiptShowPolicyBlock: boolean
  receiptShowAcknowledgment: boolean
  showStorePhone: boolean
  showStoreAddress: boolean
  showSellerName: boolean
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  receiptMessage: "Obrigado pela preferência e volte sempre!",
  receiptShowPolicyBlock: true,
  receiptShowAcknowledgment: true,
  showStorePhone: true,
  showStoreAddress: true,
  showSellerName: true,
}
