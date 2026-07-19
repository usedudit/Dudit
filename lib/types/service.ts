export interface Service {
  id: string
  partner_id: string
  store_id: string | null
  name: string
  description: string | null
  price: number
  duration_minutes: number | null
  images: string[] | null
  is_active: boolean
  rating: number
  category: string | null
  category_id: string | null
  subcategory: string | null
  subcategory_id: string | null
  sku: string | null
  unit: string | null
  cost_price: number | null
  brand: string | null
  show_in_marketplace: boolean
  tags: string[] | null
  notes: string | null
  price_type: "fixed" | "starting_at" | "free" | null
  billing_unit: "per_service" | "per_hour" | "per_day" | "per_week" | "per_month" | "per_year" | null
  resources: any | null
  video_url: string | null
  video_type: "upload" | "youtube" | "vimeo" | null
  video_thumbnail: string | null
  video_duration: number | null
  video_provider_id: string | null
  service_type: "in_person" | "online" | "hybrid" | null
  warranty: string | null
  technical_details: any | null
  highlight_service: boolean
  assigned_staff: any | null
  buffer_minutes: number
  marketplace_category_id: string | null
  fulfillment_modes: string[] | null
  payment_requirement: "full_payment" | "deposit_only" | "pay_on_service" | null
  show_price_in_store: boolean
  promotional_price: number | null
  moderation_status: "approved" | "pending_moderation" | "rejected" | null
  created_at: string
  updated_at: string
}

/**
 * Store-level overrides for a service.
 * NULL fields fall back to the base service values.
 *
 * EXCEÇÃO: services não têm stock_quantity, portanto
 * override_stock_quantity não existe aqui (diferente de store_products).
 */
export interface StoreServiceOverride {
  id: string
  service_id: string
  store_id: string
  override_price: number | null
  override_sku: string | null
  is_active: boolean
  visibility_scope: 'all' | 'selected' | 'exclusive'
  marketplace_visible: boolean
  created_at: string
  updated_at: string
}

/**
 * Resolved service = base service + store overrides merged.
 * resolved_price/resolved_sku reflect the effective values after fallback.
 */
export interface ResolvedService extends Service {
  resolved_price: number
  resolved_sku: string | null
  store_is_active: boolean
  store_service_id: string | null
  has_store_override: boolean
  visibility_scope: 'all' | 'selected' | 'exclusive'
  marketplace_visible: boolean
}
