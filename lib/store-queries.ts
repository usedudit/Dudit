import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"

export async function fetchStoreProducts(partnerId: string, storeId: string | null) {
  if (!storeId) return fetchAllPartnerProducts(partnerId)
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, promotional_price, stock_quantity as stock, sku, image_url, is_active, category_id, created_at, partner_id, has_variants, store_id")
    .eq("partner_id", partnerId)
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

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

export async function fetchCustomersWithStorePriority(partnerId: string, currentStoreId: string | null) {
  try {
    const response = await getPartnerCustomersAction(partnerId, currentStoreId)
    
    if (response.error) {
      console.error("[fetchCustomersWithStorePriority] Server Action Error:", response.error)
    } else {
      return response.customers || []
    }
  } catch (err) {
    console.error("[fetchCustomersWithStorePriority] Server Action threw:", err)
  }

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
    throw fallbackErr
  }
}

export async function fetchStoreOrders(partnerId: string, storeId: string | null) {
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

export async function fetchStoreServices(partnerId: string, storeId: string | null) {
  let query = supabase
    .from("services")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchStoreSuppliers(partnerId: string, storeId: string | null) {
  if (storeId) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("store_id", storeId)
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

export async function fetchStoreStockMovements(partnerId: string, storeId: string | null, limit = 50) {
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

export async function fetchStorePaymentMethods(partnerId: string, storeId: string | null) {
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
