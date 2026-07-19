import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

/**
 * Fetch products for a specific store (uses store_products for overrides)
 */
export async function fetchStoreProducts(partnerId: string, storeId: string | null) {
  if (!storeId) return fetchAllPartnerProducts(partnerId)
  const { data, error } = await supabase
    .from("store_products")
    .select("id, product_id, override_stock_quantity, override_price, is_active, visibility_scope, marketplace_visible, created_at, store_id, partner_id, product:product_id(id, name, price, promotional_price, stock_quantity, sku, image_url, category_id, has_variants)")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return (data || []).map((sp: any) => ({
    ...sp.product,
    id: sp.product_id,
    store_product_id: sp.id,
    stock: sp.override_stock_quantity ?? sp.product?.stock_quantity ?? 0,
    price: sp.override_price ?? sp.product?.price ?? 0,
    store_id: sp.store_id,
    partner_id: sp.partner_id,
    visibility_scope: sp.visibility_scope ?? 'all',
    marketplace_visible: sp.marketplace_visible ?? true,
  }))
}

/**
 * Fetch all products for a partner (for fallback)
 */
/**
 * Fetch all partner products (admin/ERP context).
 * NOT for marketplace display — does NOT filter by marketplace_visible.
 */
export async function fetchAllPartnerProducts(partnerId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, promotional_price, stock_quantity as stock, sku, image_url, is_active, category_id, created_at, partner_id, has_variants")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

/**
 * Fetch partner products for marketplace display.
 * Filters by show_in_marketplace for backward compatibility.
 */
export async function fetchMarketplacePartnerProducts(partnerId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, promotional_price, stock_quantity as stock, sku, image_url, is_active, category_id, created_at, partner_id, has_variants, show_in_marketplace")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("show_in_marketplace", true)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

import { getPartnerCustomersAction } from "@/app/actions/erp/customers"

/**
 * Fetch customers with store prioritization
 * Returns customers from the selected store first, then others
 * Uses server action first, falls back to direct client query
 */
export async function fetchCustomersWithStorePriority(partnerId: string, currentStoreId: string | null) {
  try {
    const response = await getPartnerCustomersAction(partnerId, currentStoreId)
    
    if (response.error) {
      console.error("[fetchCustomersWithStorePriority] Server Action Error:", response.error)
      // Fall through to client-side fallback
    } else {
      return response.customers || []
    }
  } catch (err) {
    console.error("[fetchCustomersWithStorePriority] Server Action threw:", err)
    // Fall through to client-side fallback
  }

  // Client-side fallback: query Supabase directly
  console.warn("[fetchCustomersWithStorePriority] Using client-side fallback for partnerId:", partnerId)
  try {
    let query = supabase
      .from("customers")
      .select("id, name, email, phone, status, store_credit, created_at, partner_id, person_type")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(500)

    const { data, error } = await query

    if (error) {
      console.error("[fetchCustomersWithStorePriority] Client fallback error:", error)
      throw new Error(error.message)
    }

    let result = data || []

    return result
  } catch (fallbackErr) {
    console.error("[fetchCustomersWithStorePriority] All attempts failed:", fallbackErr)
    throw fallbackErr // Let SWR handle the error properly
  }
}

/**
 * Fetch orders for a specific store
 */
export async function fetchStoreOrders(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  let query = supabase.from("orders")
    .select("id, order_number, customer_name, total_amount, situation, delivery_status, payment_method, created_at, store_id, partner_id, source")
    .eq("partner_id", partnerId)

  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(200)

  if (error) throw error
  return data || []
}

/**
 * Fetch services for a specific store
 */
export async function fetchStoreServices(partnerId: string, storeId: string | null) {
  if (!storeId) {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) throw error
    return data || []
  }

  const { data, error } = await supabase
    .from("store_services")
    .select("id, service_id, override_price, is_active, visibility_scope, marketplace_visible, created_at, store_id, partner_id, service:service_id(id, name, price, promotional_price, sku, image_url, is_active, show_in_marketplace, duration_minutes, category_id)")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) throw error
  return (data || []).map((ss: any) => ({
    ...ss.service,
    id: ss.service_id,
    store_service_id: ss.id,
    price: ss.override_price ?? ss.service?.price ?? 0,
    store_id: ss.store_id,
    partner_id: ss.partner_id,
    is_active: ss.is_active ?? ss.service?.is_active ?? true,
    visibility_scope: ss.visibility_scope ?? 'all',
    marketplace_visible: ss.marketplace_visible ?? ss.service?.show_in_marketplace ?? true,
  }))
}

/**
 * Fetch suppliers for a specific store
 */
export async function fetchStoreSuppliers(partnerId: string, storeId: string | null) {
  if (storeId) {
    const { data: links } = await supabase
      .from("store_suppliers")
      .select("supplier_id")
      .eq("store_id", storeId)
    const ids = (links || []).map((l: { supplier_id: string }) => l.supplier_id)
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("partner_id", partnerId)
      .in("id", ids)
      .order("name", { ascending: true })
    if (error) throw error
    return data || []
  }

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("partner_id", partnerId)
    .order("name", { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Fetch stock movements for a specific store
 */
export async function fetchStoreStockMovements(partnerId: string, storeId: string | null, limit = 50) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Fetch payment methods for a specific store
 */
export async function fetchStorePaymentMethods(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) throw error
  return data || []
}
