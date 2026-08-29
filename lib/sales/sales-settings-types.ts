export interface SalesSettings {
  maxDiscountPercent: number | null
  allowNegativeStock: boolean
  requireSeller: boolean
  allowCustomItemPrice: boolean
  quoteValidityDays: number
  autoCancelManualOrdersHours: number // 0 = never, 24, 48, 72, 168
  defaultReceiptFormat: "thermal" | "a4"
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  maxDiscountPercent: 100,
  allowNegativeStock: false,
  requireSeller: false,
  allowCustomItemPrice: true,
  quoteValidityDays: 15,
  autoCancelManualOrdersHours: 0, // 0 = never cancel manual orders
  defaultReceiptFormat: "thermal",
}

export interface ReceiptSettings {
  receiptMessage: string | null
  receiptShowPolicyBlock: boolean
  receiptShowAcknowledgment: boolean
  defaultReceiptFormat: "thermal" | "a4"
  showStorePhone: boolean
  showStoreAddress: boolean
  showSellerName: boolean
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  receiptMessage: "Obrigado pela preferência e volte sempre!",
  receiptShowPolicyBlock: true,
  receiptShowAcknowledgment: true,
  defaultReceiptFormat: "thermal",
  showStorePhone: true,
  showStoreAddress: true,
  showSellerName: true,
}
