import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

/**
 * Fetch products for a specific store
 */
export async function fetchStoreProducts(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, promotional_price, stock, sku, image_url, is_active, category_id, created_at, store_id, partner_id, has_variants")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) throw error
  return data || []
}

/**
 * Fetch all products for a partner (for fallback)
 */
export async function fetchAllPartnerProducts(partnerId: string) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, promotional_price, stock, sku, image_url, is_active, category_id, created_at, store_id, partner_id, has_variants")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
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
      .select("id, name, email, phone, status, store_credit, created_at, store_id, partner_id, person_type")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(500)

    const { data, error } = await query

    if (error) {
      console.error("[fetchCustomersWithStorePriority] Client fallback error:", error)
      throw new Error(error.message)
    }

    let result = data || []

    // Prioritize: current store customers first, then others
    if (currentStoreId) {
      result = [...result].sort((a: any, b: any) => {
        if (a.store_id === currentStoreId && b.store_id !== currentStoreId) return -1
        if (a.store_id !== currentStoreId && b.store_id === currentStoreId) return 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

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
    .select("id, order_number, customer_name, total_amount, situation, delivery_status, payment_status, payment_method, created_at, store_id, partner_id, source")
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
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch suppliers for a specific store
 */
export async function fetchStoreSuppliers(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
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
