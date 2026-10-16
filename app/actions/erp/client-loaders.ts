"use server"

import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission, getCurrentUser } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerSuppliersCached } from "@/lib/data/suppliers"
import { requireAuthorizedCustomerContext } from "@/lib/services/authorized-customer-access"

export async function fetchERPOrdersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const storeId = context.activeStoreId || ""
  const { allowed } = await checkPermission(partnerId, "orders", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerOrdersCached(partnerId, storeId)
}

import { getERPProductsPageData } from "@/app/actions/erp/products"
import { fetchCustomersWithStorePriority } from "@/lib/store-queries"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

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
  const { allowed } = await checkPermission(partnerId, "customers", "view")
  if (!allowed) throw new Error("Forbidden")

  return fetchCustomersWithStorePriority(partnerId, storeId)
}

export async function fetchERPSuppliersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const storeId = context.activeStoreId || ""
  const { allowed } = await checkPartnerPermission(partnerId, "suppliers", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerSuppliersCached(partnerId, storeId)
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
  const storeId = context.activeStoreId
  const { allowed } = await checkPermission(partnerId, "products", "view")
  if (!allowed) throw new Error("Forbidden")

  const { getAdminClient } = await import("@/lib/supabase/admin")
  const supabase = getAdminClient()

  let query = supabase
    .from("products")
    .select("id, name, sku, gtin, price, promotional_price, category_id, stock_available, allow_sell_without_stock, images, unit, technical_specs, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query
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
    gtin: p.gtin || null,
    price: p.price || 0,
    promotional_price: p.promotional_price,
    category_id: p.category_id || null,
    stock: p.stock_available || 0,
    allow_sell_without_stock: Boolean(p.allow_sell_without_stock),
    image: p.images && p.images.length > 0 ? p.images[0] : null,
    has_variants: p.product_variants && p.product_variants.length > 0,
    unit: p.unit || null,
    addon_groups: (Array.isArray(p.addon_groups) && p.addon_groups.length > 0)
      ? p.addon_groups
      : (Array.isArray(p.technical_specs?.addon_groups) && p.technical_specs.addon_groups.length > 0)
        ? p.technical_specs.addon_groups
        : [],
    variants: (p.product_variants || []).map((variant: any) => ({
      id: variant.id,
      name: variant.variant_name,
      sku: variant.sku || "N/A",
      price: Number(p.price || 0) + Number(variant.price_adjustment || 0),
      stock: Number(variant.stock_available || 0),
      image: typeof variant.variant_options === "object" && variant.variant_options
        ? variant.variant_options.image || null
        : null,
    })),
  }))
}

/**
 * Fetch a lightweight bucket of active coupons for the current partner.
 * Used for instant client-side filtering (no debounced server roundtrips).
 */
export async function fetchPartnerCouponsBucket(): Promise<Array<{
  id: string
  code: string
  discount_type: string
  discount_value: number | null
  is_active: boolean
  is_automatic?: boolean
}>> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId

  const { allowed } = await checkPermission(partnerId, "coupons", "view")
  if (!allowed) throw new Error("Forbidden")

  const { getAdminClient } = await import("@/lib/supabase/admin")
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, discount_type, discount_value, is_active, is_automatic")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("code")
    .limit(500)

  if (error) {
    console.error("[fetchPartnerCouponsBucket] Error:", error)
    return []
  }

  return (data || []).map((c: any) => ({
    id: String(c.id),
    code: String(c.code || "").trim(),
    discount_type: String(c.discount_type || ""),
    discount_value: c.discount_value == null ? null : Number(c.discount_value),
    is_active: Boolean(c.is_active),
    is_automatic: Boolean(c.is_automatic),
  }))
}

/** Lista única em cache para busca instantânea em pickers (client-side), p.ex. PDV / orçamentos. */
export type PartnerCustomerBucketItem = {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url?: string | null
}

export async function fetchPartnerCustomersBucket(explicitPartnerId?: string): Promise<PartnerCustomerBucketItem[]> {
  const customerAccess = await requireAuthorizedCustomerContext(explicitPartnerId, "view")
  const { data, error } = await customerAccess.admin
    .from("customers")
    .select("id, name, email, phone, image_url, partner_id")
    .eq("partner_id", customerAccess.partnerId)
    .eq("status", "ativo")
    .order("name", { ascending: true })
    .limit(500)

  if (error) {
    console.error("[fetchPartnerCustomersBucket]", error)
    return []
  }

  return (data || []).map((c: any) => ({
    id: String(c.id),
    name: String(c.name || ""),
    email: c.email ?? null,
    phone: c.phone ?? null,
    avatar_url: c.image_url || null,
  }))
}

export type PartnerSupplierBucketItem = {
  id: string
  name: string
  email: string | null
  phone: string | null
  cnpj: string | null
  avatar_url: string | null
}

export async function fetchPartnerSuppliersBucket(explicitPartnerId?: string): Promise<PartnerSupplierBucketItem[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")

  let partnerId = explicitPartnerId
  if (!partnerId) {
    const context = await getCurrentPartnerContext()
    if (!context) throw new Error("No context")
    partnerId = context.partnerId
  }

  const { allowed } = await checkPermission(partnerId, "suppliers", "view")
  if (!allowed) throw new Error("Forbidden")

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, cnpj, image_url")
    .eq("partner_id", partnerId)
    .eq("status", "ativo")
    .order("name", { ascending: true })
    .limit(500)

  if (error) {
    console.error("[fetchPartnerSuppliersBucket]", error)
    return []
  }

  return (data || []).map((c: any) => ({
    id: String(c.id),
    name: String(c.name || ""),
    email: c.email ?? null,
    phone: c.phone ?? null,
    cnpj: c.cnpj ?? null,
    avatar_url: c.image_url || null,
  }))
}

export type PartnerTeamMemberBucketItem = {
  id: string
  fullName: string | null
  email: string
  role: string
  avatarUrl: string | null
}

export async function fetchPartnerTeamMembersBucket(): Promise<PartnerTeamMemberBucketItem[]> {
  const { getPDVSellersAction } = await import("@/app/actions/erp/team")
  const res = await getPDVSellersAction()
  if (res.error || !res.members?.length) return []
  return res.members.map((m) => ({
    id: m.id,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
    avatarUrl: m.avatarUrl,
  }))
}

/**
 * Fetch a lightweight bucket of active services for the current partner.
 * Used for instant service selection in appointment creation (replaces mock data).
 * Structured so a future business_hours table can be plugged in without refactoring.
 */
export type PartnerServiceBucketItem = {
  id: string
  name: string
  price: number
  promotional_price?: number | null
  category_id?: string | null
  duration: number
  bufferMinutes: number
  category: string | null
  billingUnit: string
  image?: string | null
}

export async function fetchPartnerServicesBucket(): Promise<PartnerServiceBucketItem[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const storeId = context.activeStoreId

  const { getAdminClient } = await import("@/lib/supabase/admin")
  const supabase = getAdminClient()

  let query = supabase
    .from("services")
    .select("id, name, price, promotional_price, category_id, duration_minutes, buffer_minutes, billing_unit, is_active, images")
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query
    .order("name")
    .limit(500)

  if (error) {
    console.error("[fetchPartnerServicesBucket] Error:", error)
    return []
  }

  return (data || []).map((s: any) => ({
    id: String(s.id),
    name: String(s.name || ""),
    price: Number(s.price || 0),
    promotional_price: s.promotional_price ? Number(s.promotional_price) : null,
    category_id: s.category_id || null,
    duration: Number(s.duration_minutes || 60),
    bufferMinutes: Number(s.buffer_minutes || 0),
    category: null,
    billingUnit: String(s.billing_unit || "per_service"),
    image: s.images && s.images.length > 0 ? s.images[0] : null,
  }))
}

/**
 * Consolidates products, customers, coupons, and services buckets fetching
 * in a single Server Action request (Promise.all) to save round-trips.
 */
export async function fetchERPInitializationData() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")

  const [products, customers, coupons, services] = await Promise.all([
    fetchPartnerProductsBucket(),
    fetchPartnerCustomersBucket(),
    fetchPartnerCouponsBucket(),
    fetchPartnerServicesBucket(),
  ])

  return {
    products,
    customers,
    coupons,
    services,
  }
}

