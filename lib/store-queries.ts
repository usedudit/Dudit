import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

/**
 * Fetch products for a specific store
 */
export async function fetchStoreProducts(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

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
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

import { getPartnerCustomersAction } from "@/app/actions/erp/customers"

/**
 * Fetch customers with store prioritization
 * Returns customers from the selected store first, then others
 * Uses server action for reliability and RLS bypass
 */
export async function fetchCustomersWithStorePriority(partnerId: string, currentStoreId: string | null) {
  const response = await getPartnerCustomersAction(partnerId, currentStoreId)
  
  if (response.error) {
    console.error("[fetchCustomersWithStorePriority] Server Action Error:", response.error)
    // Fallback to empty array if error
    return []
  }

  return response.customers || []
}

/**
 * Fetch orders for a specific store
 */
export async function fetchStoreOrders(partnerId: string, storeId: string | null) {
  // supabase singleton imported directly

  let query = supabase.from("orders").select("*").eq("partner_id", partnerId)

  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query.order("created_at", { ascending: false })

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
