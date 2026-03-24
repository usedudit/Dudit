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

/**
 * Fetch customers with store prioritization
 * Returns customers from the selected store first, then others
 */
export async function fetchCustomersWithStorePriority(partnerId: string, currentStoreId: string | null) {
  // supabase singleton imported directly

  // Get all customers for the partner
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })

  if (error) throw error

  const customers = data || []

  // Prioritize: current store customers first, then others
  if (currentStoreId) {
    return customers.sort((a: any, b: any) => {
      // Current store customers come first
      if (a.store_id === currentStoreId && b.store_id !== currentStoreId) return -1
      if (a.store_id !== currentStoreId && b.store_id === currentStoreId) return 1
      // Secondary sort: newer first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  return customers
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
