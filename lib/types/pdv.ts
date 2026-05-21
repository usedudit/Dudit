export type PDVProduct = {
  id: string
  name: string
  category?: string | null
  sku?: string | null
  price: number
  stock_available: number
  allow_sell_without_stock?: boolean
  images?: string[] | null
  product_variants?: Array<{
    id: string
    variant_name: string
    sku?: string | null
    price_adjustment?: number | null
    stock_available?: number | null
    variant_options?: Record<string, any> | null
  }>
}

export type PDVPreSale = {
  id: string
  customer_id: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  shipping_fee?: number | null
  other_costs?: number | null
  notes: string | null
  status: "draft" | "completed"
  items: any[]
  created_at: string
  updated_at: string
  coupon_id?: string | null
  coupon_code?: string | null
  coupon_discount_amount?: number | null
}

export type PDVCustomer = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf?: string | null
}

export type PDVFinanceAccount = {
  id: string
  name: string
  /** Sempre `cash` no carregamento atual do PDV. */
  type?: string
  is_default?: boolean
  is_active?: boolean
}

export type PDVPaymentMethodOption = {
  id: string
  name: string
  type: string
  is_default?: boolean | null
  fee_percent?: number | null
  discount_percent?: number | null
  priority?: number | null
}

export type PDVPaymentBreakdownEntry = {
  method: string
  amount: number
  paymentMethodId?: string | null
}

export type PDVCartItem = {
  id: string
  productId: string | null
  variantId: string | null
  name: string
  variantName: string | null
  /** Preço unitário de lista (antes do desconto por linha). */
  listUnitPrice?: number | null
  /** Tipo de desconto aplicado só nesta linha (persistido na pré-venda). */
  lineDiscountType?: "fixed" | "percentage" | null
  /** Valor do desconto: R$ se fixed, ou % se percentage. */
  lineDiscountValue?: number | null
  price: number
  qty: number
  image: string | null
}
