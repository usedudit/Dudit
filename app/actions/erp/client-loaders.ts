"use server"

import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission, getCurrentUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerSuppliersCached } from "@/lib/data/suppliers"

export async function fetchERPOrdersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "orders", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerOrdersCached(partnerId)
}

import { getERPProductsPageData } from "@/app/actions/erp/products"
import { fetchCustomersWithStorePriority } from "@/lib/store-queries"

export async function fetchERPProductsClient() {
  const data = await getERPProductsPageData()
  if (!data || !data.products) throw new Error("Forbidden or no data")
  return data.products
}

export async function fetchERPCustomersClient(storeId: string | null = null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "customers", "view")
  if (!allowed) throw new Error("Forbidden")

  return fetchCustomersWithStorePriority(partnerId, storeId)
}

export async function fetchERPSuppliersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "suppliers", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerSuppliersCached(partnerId)
}

/**
 * Fetch a lightweight bucket of ALL active products for the current partner.
 * Used for instant client-side search filtering (no repeated server roundtrips).
 * Pattern inspired by MarketplaceHeader's getSearchSuggestionsBucket.
 */
export async function fetchPartnerProductsBucket() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId

  const { getAdminClient } = await import("@/lib/supabase/admin")
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, price, stock_quantity, images, product_variants(id)")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("name")
    .limit(500)

  if (error) {
    console.error("[fetchPartnerProductsBucket] Error:", error)
    return []
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku || "N/A",
    price: p.price || 0,
    stock: p.stock_quantity || 0,
    image: p.images && p.images.length > 0 ? p.images[0] : null,
    has_variants: p.product_variants && p.product_variants.length > 0,
  }))
}
