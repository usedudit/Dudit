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
  video_type?: "upload" | "youtube" | "vimeo" | null
  video_url?: string | null
  video_thumbnail?: string | null
  video_duration?: number | null
  video_provider_id?: string | null
  created_at: string
  partner_id: string
  store_id: string
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
  variant_min_price?: number
  variant_max_price?: number
  variant_total_stock?: number
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

export interface ProductSupplierWithDetails extends ProductSupplier {
  supplier_name: string
  supplier_email: string | null
  supplier_phone: string | null
  supplier_document: string | null
  last_purchase_price: number | null
  last_purchase_date: string | null
  last_invoice_key: string | null
}

/**
 * Store-level overrides for a product.
 * NULL fields fall back to the base product values.
 */
export interface StoreProductOverride {
  id: string
  product_id: string
  store_id: string
  override_price: number | null
  override_stock_quantity: number | null
  override_sku: string | null
  is_active: boolean
  visibility_scope: 'all' | 'selected' | 'exclusive'
  marketplace_visible: boolean
  created_at: string
  updated_at: string
}

/**
 * Store-level overrides for a product variant.
 * NULL fields fall back to the base variant values.
 */
export interface StoreVariantOverride {
  id: string
  variant_id: string
  store_id: string
  partner_id: string
  override_stock_quantity: number | null
  is_active: boolean
  stock_reserved: number
  stock_available: number
  created_at: string
  updated_at: string
}

/**
 * Resolved variant = base variant + store overrides merged.
 */
export interface ResolvedVariant extends ProductVariant {
  resolved_stock_quantity: number
  store_is_active: boolean
  store_variant_id: string | null
  has_store_override: boolean
}

/**
 * Resolved product = base product + store overrides merged.
 * override_price/override_stock/override_sku reflect the effective
 * values after fallback (never null for price/stock).
 */
export interface ResolvedProduct extends Product {
  resolved_price: number
  resolved_stock_quantity: number
  resolved_sku: string | null
  store_is_active: boolean
  store_product_id: string | null
  has_store_override: boolean
  visibility_scope: 'all' | 'selected' | 'exclusive'
  marketplace_visible: boolean
}
