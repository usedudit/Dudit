import type React from "react"
export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock_quantity: number
  stock_reserved?: number
  stock_available?: number
  category: string | null
  category_id: string | null
  subcategory: string | null
  subcategory_id: string | null
  is_active: boolean
  sku: string | null
  rating: number
  images: string[] | null
  created_at: string
  partner_id: string
  brand: string | null
  brand_id: string | null
  product_type: string | null
  condition: string | null
  gtin: string | null
  location: string | null
  location_id: string | null
  cost_price: number | null
  profit_margin: number | null
  min_stock: number | null
  show_price_in_store: boolean | null
  is_on_promotion: boolean | null
  promotion_value: number | null
  promotional_price: number | null
  unit: string | null
  fci_code: string | null
  show_in_marketplace?: boolean
  variants?: { count: number }[] | any[]
  availability_value?: number | null
  availability_unit?: string | null
  moderation_status?: 'approved' | 'pending_moderation' | 'rejected' | null
}

export interface ProductDisplay extends Product {
  // Additional fields for display
  icon?: React.ComponentType<{ className?: string }>
  productId?: string
  stock?: number
  status?: "Active" | "Inactive"
  visibility?: "Published" | "Unpublished"
  dateAdded?: string
  stockNum?: number
  priceNum?: number
}

export interface ProductInput {
  partner_id: string
  store_id: string
  name: string
  description?: string | null
  price: number
  stock_quantity: number
  category?: string | null
  category_id?: string | null
  subcategory?: string | null
  subcategory_id?: string | null
  brand?: string | null
  brand_id?: string | null
  sku?: string | null
  gtin?: string | null
  unit?: string | null
  product_type?: string
  condition?: string
  location?: string | null
  cost_price?: number | null
  min_stock?: number | null
  images?: string[]
  is_active?: boolean
  ncm?: string | null
  cest?: string | null
  origin?: number
  item_type?: string
  cfop_internal?: string
  cfop_external?: string
  csosn?: string
  tax_percentage?: number | null
  pis_cst?: string
  pis_rate?: number
  cofins_cst?: string
  cofins_rate?: number
  ipi_cst?: string
  ipi_code?: string | null
  product_situation?: string
  c_benef?: string | null
  inf_ad_prod?: string | null
  weight_gross?: number
  weight_net?: number
  width?: number
  height?: number
  length?: number
  fci_code?: string | null
  packaging_type?: string | null
  preparation_days?: number | null
  allow_sell_without_stock?: boolean
  max_stock?: number | null
  promotional_price?: number | null
  availability_value?: number | null
  availability_unit?: string | null
  moderation_status?: 'approved' | 'pending_moderation' | 'rejected' | null
}

export interface ProductWithDetails extends Product {
  variants?: ProductVariant[]
  suppliers?: ProductSupplier[]
}

export interface ProductVariant {
  id: string
  product_id: string
  variant_type: string
  variant_name: string
  sku: string | null
  price_adjustment: number
  stock_quantity: number
  stock_reserved?: number
  stock_available?: number
  is_active: boolean
}

export interface ProductSupplier {
  id: string
  product_id: string
  supplier_id: string
  cost_price: number | null
  supplier_sku: string | null
  lead_time_days: number | null
}
