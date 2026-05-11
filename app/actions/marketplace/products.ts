import { unstable_cache } from "next/cache"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { searchMarketplaceDirect } from "@/app/actions/marketplace/search"
import { getCurrentUser } from "@/lib/auth/server-user"
import { MarketplaceSearchType } from "@/lib/types/marketplace"

// --- 1. PRODUTOS DA HOME (LISTAGEM) ---
// NO unstable_cache - Redis is the single source of truth.
// searchMarketplaceDirect already uses react.cache() for per-request deduplication.
export const getCachedHomeProducts = async () => {
  const data = await searchMarketplaceDirect("", "produtos", { produtos: 24 })

  return data
}

// =============================================
// DIRECT FETCH FUNCTIONS (NO CACHE)
// Used by force-dynamic pages for strict consistency
// =============================================

async function _getMarketplaceProductBase(id: string) {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, description, price, promotional_price, stock_quantity, stock_available, availability_value, availability_unit,
      is_active, moderation_status,
      category, images, rating, partner_id, sku, 
      condition, brand, show_in_marketplace, technical_specs, created_at,
      product_logistics(weight_gross, length, width, height, preparation_days),
      partners(
        id, store_name, store_description, rating, user_id, 
        store_image_url, banner_url, max_installments, interest_rate_percent,
        mp_user_id, mp_public_key, opening_hours,
        logo_moderation_status, banner_moderation_status,
        addresses(city, state),
        payment_methods(*)
      )
    `)
    .eq("id", id)
    .single()

  if (error || !data) {
    if (error) console.error(`[Product] Fetch error for ${id}:`, error.message)
    return null
  }

  // Normalização básica (independente de usuário)
  if (data) {
    let p: any = data.partners
    if (Array.isArray(p)) p = p[0]

    if (!p) {
      p = { store_name: "Vendedor", store_avatar: null, banner_url: null, city: null, state: null }
    } else {
      p.store_avatar = p.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
      p.banner_url = p.banner_url || null
      p.logo_moderation_status = p.logo_moderation_status || "approved"
      p.banner_moderation_status = p.banner_moderation_status || "approved"
      p.city = p.addresses?.[0]?.city || null
      p.state = p.addresses?.[0]?.state || null
    }
    data.partners = p

    let logistics: any = data.product_logistics
    if (Array.isArray(logistics)) logistics = logistics[0]
    if (logistics) Object.assign(data, logistics)
    delete data.product_logistics
  }

  return data
}

async function _getMarketplaceProduct(id: string) {
  const data = await _getMarketplaceProductBase(id)
  if (!data) return null

  const user = await getCurrentUser()
  const partnerId = data.partners?.id
  const partnerUserId = data.partners?.user_id
  const isOwner = user && partnerUserId === user.id
  const isPubliclyVisible = data.is_active && data.moderation_status === 'approved' && data.show_in_marketplace !== false

  if (!isPubliclyVisible && !isOwner) {
    return null
  }

  return data
}

// --- VARIANTES (DIRECT - NO CACHE) ---
async function _getProductVariants(productId: string) {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("price_adjustment", { ascending: true })
  return data || []
}

// --- REVIEWS (DIRECT - NO CACHE) ---
async function _getProductReviews(productId: string) {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("reviews")
    .select(`
      id, rating, comment, created_at, user_id, product_id,
      profiles(full_name, profile_image_url)
    `)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(20)
  return data || []
}

// React cache() wrappers - deduplicate within SSR request
// (generateMetadata + page component share the same result)
export const getMarketplaceProduct = cache(_getMarketplaceProduct)
export const getProductVariants = cache(_getProductVariants)
export const getProductReviews = cache(_getProductReviews)

// =============================================
// CACHED FUNCTIONS (kept for home/explore pages)
// =============================================

// --- 2. DETALHES DO PRODUTO (CACHED - for detail pages & SEO) ---
/**
 * Fetches product data with Next.js tags for invalidation.
 * The product detail page uses this to ensure real-time updates via Supabase Webhooks.
 */
export const getCachedMarketplaceProduct = async (id: string) => {
  const fn = unstable_cache(
    async () => _getMarketplaceProductBase(id),
    [`product-details-${id}-v13`],
    { tags: ["marketplace-product", `product-${id}`] }
  )
  return fn()
}

// --- 3. VARIANTES ---
export const getCachedVariants = async (productId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("price_adjustment", { ascending: true })
      return data || []
    },
    [`marketplace-variants-${productId}`],
    { tags: ["marketplace-variants", `product-${productId}`] }
  )
  return fn()
}

// --- 4. REVIEWS ---
export const getCachedReviews = async (productId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("reviews")
        .select(`
          id, rating, comment, created_at, user_id, product_id,
          profiles(full_name, profile_image_url)
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(20)
      return data || []
    },
    [`marketplace-reviews-${productId}`],
    { tags: ["marketplace-reviews", `product-${productId}`] }
  )
  return fn()
}

// --- 5. RELATED PRODUCTS ---
export const getCachedRelatedProducts = async (partnerId: string, currentProductId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("products")
        .select(`
          id, name, price, promotional_price, images, rating, category,
          partners(id, store_name, store_image_url, addresses(city, state)),
          product_variants(variant_options, price_adjustment, is_active)
        `)
        .eq("is_active", true)
        .eq("show_in_marketplace", true)
        .eq("partner_id", partnerId)
        .neq("id", currentProductId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!data) return []

      const safeData = data.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const partner = rawPartner ? {
          ...rawPartner,
          store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
          city: rawPartner.addresses?.[0]?.city || null,
          state: rawPartner.addresses?.[0]?.state || null
        } : {
          store_name: "Vendedor Parceiro",
          store_avatar: "https://img.dudit.com.br/static/Placeholder.png",
          city: null,
          state: null
        }

        const fallbackUrl = item.product_variants?.[0]?.variant_options?.image || null
        const fallbackPrice = item.product_variants?.[0]?.price_adjustment || null

        const { product_variants, ...rest } = item as any
        return { ...rest, partners: partner, fallback_variant_image: fallbackUrl, fallback_variant_price: fallbackPrice }
      })

      return safeData
    },
    [`related-products-${partnerId}-${currentProductId}-v2`],
    { tags: ["related-products", `partner-${partnerId}`] }
  )
  return fn()
}

// NO unstable_cache - Redis is the single source of truth.
// searchMarketplaceDirect already uses react.cache() for per-request deduplication.
export const getCachedExploreProducts = async (query: string, type: MarketplaceSearchType) => {
  return await searchMarketplaceDirect(query, type, {
    vitrines: type === 'vitrines' ? 40 : 4,
    produtos: 20,
    servicos: 20
  })
}
