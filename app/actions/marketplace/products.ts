import { unstable_cache } from "next/cache"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { searchMarketplaceDirect, searchMarketplaceDirectFull } from "@/app/actions/marketplace/search"
import { applySellerDiversity, sortByTrendingScore } from "@/lib/marketplace/ranking"
import { MarketplaceSearchType } from "@/lib/types/marketplace"
import { resolveProduct } from "@/lib/store-products"
import { filterMarketplaceVisibleProducts } from "@/lib/resolve-marketplace-visibility"
import { isUuid } from "@/lib/utils/short-id"
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration"
import { isShowcaseAdminSuspended } from "@/lib/commerce/store-showcase"
import { isExploreProductPublic } from "@/lib/redis-explore-serializer"

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

async function _getMarketplaceProductBase(id: string, storeId?: string | null) {
  const supabase = getAdminClient()

  let query = supabase
    .from("products")
    .select(`
      id, short_id, store_id, name, description, price, promotional_price, stock_quantity, stock_available, availability_value, availability_unit,
      is_active, status, deleted_at, moderation_status, moderation_reason,
      category_id, category:product_categories!category_id(name),
      subcategory_id, subcategory:product_categories!subcategory_id(name),
      brand, brand_id, brand_entity:brands!brand_id(name),
      location, location_id, location_entity:storage_locations!location_id(name),
      images, rating, partner_id, sku, gtin, warranty, tags,
      condition, show_in_marketplace, technical_specs, created_at,
      show_price_in_store,
      fulfillment_modes,
      video_type, video_url, video_thumbnail, video_duration, video_provider_id,
      marketplace_category_id, marketplace_category:marketplace_product_categories!marketplace_category_id(name, parent:marketplace_product_categories!parent_id(name)),
      product_logistics(weight_gross, length, width, height, preparation_days),
      partners(
        id, user_id, created_at, is_showcase_active, showcase_suspended_at, showcase_suspended_until,
        partner_integrations(provider_slug, status, account_id, connected_at, config, metadata),
        addresses(city, state),
        payment_methods(*)
      ),
      stores!left(
        id, short_id, name, slug, description, logo_url, banner_url,
        phone, opening_hours, gallery,
        is_showcase_active, showcase_suspended_at, showcase_suspended_until, accept_orders_when_closed, timezone, business_info,
        rating, vendas_totais,
        addresses!store_id!left(city, state, latitude, longitude)
      )
    `)

  if (isUuid(id)) {
    query = query.eq("id", id)
  } else {
    query = query.eq("short_id", id)
  }


  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error(`[Product] Fetch error for ${id}:`, error.message)
    return null
  }

  if (!data) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[MarketplaceTrace] produto:${id} ausente na query PDP`)
    }
    return null
  }

  // Hide deleted, archived, inactive, moderation-rejected or non-marketplace products
  if (!isExploreProductPublic(data)) {
    return null
  }

  // Hide completely from marketplace if store or partner showcase is admin-suspended
  const rawPartnerCheck = Array.isArray(data.partners) ? data.partners[0] : data.partners
  const rawStoreCheck = Array.isArray(data.stores) ? data.stores[0] : data.stores
  if (isShowcaseAdminSuspended(rawStoreCheck) || isShowcaseAdminSuspended(rawPartnerCheck)) {
    return null
  }

  // Validate store visibility if store context is available
  if (storeId) {
    const resolvedProduct = await resolveProduct(id, storeId)
    if (!resolvedProduct) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[MarketplaceTrace] produto:${id} rejeitado pelo resolver (store:${storeId})`)
      }
      return null
    }
    // Override resolved fields from the resolver
    data.price = resolvedProduct.resolved_price
    data.stock_quantity = resolvedProduct.resolved_stock_quantity
    data.sku = resolvedProduct.resolved_sku
    data.is_active = resolvedProduct.store_is_active
    data.status = resolvedProduct.store_is_active ? "ativo" : "inativo"
    data.marketplace_visible = resolvedProduct.marketplace_visible
  }

  if (process.env.NODE_ENV !== "production" && data.video_type && data.video_url) {
    console.info(`[MarketplaceTrace] produto:${id} PDP com vídeo type=${data.video_type} duration=${data.video_duration ?? "null"}`)
  }

  // Normalização básica (independente de usuário)
  if (data) {
    data.category = (data.category as any)?.name || null
    data.subcategory = (data.subcategory as any)?.name || null
    data.brand = (data.brand_entity as any)?.name || data.brand || null
    data.location = (data.location_entity as any)?.name || data.location || null
    data.marketplace_category = data.marketplace_category as any

    let p: any = data.partners
    if (Array.isArray(p)) p = p[0]
    // mp_* status fields are sourced from partner_integrations.
    if (p) Object.assign(p, withMpPartnerFields(p))

    // Merge store data over partner data (store fields take precedence)
    const s: any = data.stores
    const store = Array.isArray(s) ? s[0] : s
    if (store) {
      p.store_id = store.id
      p.store_name = store.name
      p.slug = store.slug || p.slug || null
      p.store_description = store.description || p.store_description
      p.store_image_url = store.logo_url || p.store_image_url
      p.banner_url = store.banner_url || p.banner_url
      p.phone = store.phone || p.phone
      p.city = store.addresses?.[0]?.city || store.city || p.addresses?.[0]?.city || null
      p.state = store.addresses?.[0]?.state || store.state || p.addresses?.[0]?.state || null
      p.opening_hours = store.opening_hours || p.opening_hours
      p.timezone = store.timezone || p.timezone || "America/Sao_Paulo"
      p.latitude = store.addresses?.[0]?.latitude || p.latitude
      p.longitude = store.addresses?.[0]?.longitude || p.longitude
      p.business_info = store.business_info || p.business_info
      p.gallery = store.gallery || p.gallery
      p.is_showcase_active = store.is_showcase_active !== false
      p.rating = store.rating ?? p.rating ?? 0
      p.vendas_totais = store.vendas_totais ?? p.vendas_totais ?? 0
    } else if (p) {
      p.is_showcase_active = p.is_showcase_active !== false
    }

    if (!p) {
      p = { store_name: "Vendedor", store_avatar: null, banner_url: null, city: null, state: null }
    } else {
      p.store_avatar = p.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
      p.banner_url = p.banner_url || null
      p.city = p.city || p.addresses?.[0]?.city || null
      p.state = p.state || p.addresses?.[0]?.state || null
      delete p.user_id
      delete p.partner_integrations
    }
    data.partners = p

    let logistics: any = data.product_logistics
    if (Array.isArray(logistics)) logistics = logistics[0]
    if (logistics) Object.assign(data, logistics)
    delete data.product_logistics
  }

  return data
}

async function _getMarketplaceProduct(id: string, storeId?: string | null) {
  const storeKey = storeId || "none"
  return unstable_cache(
    async () => {
      const data = await _getMarketplaceProductBase(id, storeId)
      if (!data) return null
      return data
    },
    ["marketplace-product-detail", id, storeKey],
    {
      tags: ["marketplace-product", "products", `product-${id}`],
      revalidate: 300,
    }
  )()
}

// --- VARIANTES (DIRECT - NO CACHE) ---
async function _getProductVariants(productId: string) {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient()
      let resolvedId = productId
      if (!isUuid(productId)) {
        const { data: prod } = await supabase.from("products").select("id").eq("short_id", productId).maybeSingle()
        if (prod?.id) resolvedId = prod.id
      }
      const { data } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", resolvedId)
        .eq("is_active", true)
        .order("price_adjustment", { ascending: true })
      return data || []
    },
    ["marketplace-product-variants", productId],
    {
      tags: ["marketplace-variants", `product-${productId}`],
      revalidate: 300,
    }
  )()
}

// --- REVIEWS (DIRECT - NO CACHE) ---
async function _getProductReviews(productId: string, storeId?: string | null) {
  const storeKey = storeId || "none"
  return unstable_cache(
    async () => {
  const supabase = getAdminClient()
  let resolvedId = productId
  if (!isUuid(productId)) {
    const { data: prod } = await supabase.from("products").select("id").eq("short_id", productId).maybeSingle()
    if (prod?.id) resolvedId = prod.id
  }
  let query = supabase
    .from("reviews")
    .select("id, rating, comment, created_at, updated_at, user_id, order_id, product_id, store_id")
    .eq("product_id", resolvedId)
    .is("deleted_at", null)
    .not("is_hidden", "is", true)

  if (storeId) {
    query = query.or(`store_id.eq.${storeId},store_id.is.null`)
  }

  const { data: reviewsData, error } = await query
    .order("created_at", { ascending: false })
    .limit(20)


  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return []
  }

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
        })
      })
    }
  }

  const orderIds = Array.from(new Set(reviewsData.map((r: any) => r.order_id).filter(Boolean)))
  let orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

  if (orderIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(`
        id, order_id, quantity, product_id, service_id,
        product_variants(id, variant_name, variant_options)
      `)
      .in("order_id", orderIds)

    if (itemsData) {
      itemsData.forEach((item: any) => {
        const key = `${item.order_id}_${item.product_id || item.service_id}`
        orderItemsMap.set(key, {
          quantity: item.quantity,
          variant_name: item.product_variants?.variant_name || null,
          variant_options: item.product_variants?.variant_options || null,
        })
      })
    }
  }

  return reviewsData.map((r: any) => {
    const itemKey = `${r.order_id}_${r.product_id}`
    const orderItem = orderItemsMap.get(itemKey)
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
    }
  })
    },
    ["marketplace-product-reviews", productId, storeKey],
    {
      tags: ["marketplace-reviews", `product-${productId}`],
      revalidate: 300,
    }
  )()
}

// React cache() wrappers - deduplicate within SSR request
// (generateMetadata + page component share the same result)
export const getMarketplaceProduct = cache(_getMarketplaceProduct)
export const getProductVariants = cache(_getProductVariants)
export const getProductReviews = cache(_getProductReviews) as unknown as typeof _getProductReviews

// --- SOLD COUNT ---
async function _getProductSoldCount(productId: string): Promise<number> {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, orders!inner(situation)")
        .eq("product_id", productId)

      if (error || !data) return 0

      return data
        .filter((item: any) => item.orders?.situation === "paid")
        .reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
    },
    ["marketplace-product-sold-count", productId],
    {
      tags: ["marketplace-sold-count", `product-${productId}`],
      revalidate: 300,
    }
  )()
}

export const getProductSoldCount = cache(_getProductSoldCount)

// =============================================
// CACHED FUNCTIONS (kept for home/explore pages)
// =============================================

// --- 2. DETALHES DO PRODUTO (CACHED - for detail pages & SEO) ---
/**
 * Fetches product data with Next.js tags for invalidation.
 * The product detail page uses this to ensure real-time updates via Supabase Webhooks.
 */
export const getCachedMarketplaceProduct = async (id: string, storeId?: string | null) => {
  const fn = unstable_cache(
    async () => _getMarketplaceProductBase(id, storeId),
    [`product-details-${id}-v14`],
    { tags: ["marketplace-product", "products", `product-${id}`], revalidate: 300 }
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
      const { data: reviewsData, error } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, updated_at, user_id, product_id")
        .eq("product_id", productId)
        .is("deleted_at", null)
        .not("is_hidden", "is", true)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error || !reviewsData) {
        console.error("[Reviews] Fetch error:", error?.message)
        return []
      }

      const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
      const profilesMap = new Map<string, { full_name: string }>()

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("user_profiles")
          .select("user_id, full_name")
          .in("user_id", userIds)

        if (profilesData) {
          profilesData.forEach((p: any) => {
            profilesMap.set(p.user_id, {
              full_name: p.full_name,
            })
          })
        }
      }

      return reviewsData.map((r: any) => ({
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
      }))
    },
    [`marketplace-reviews-${productId}`],
    { tags: ["marketplace-reviews", `product-${productId}`] }
  )
  return fn()
}

// --- 5. RELATED PRODUCTS ---
export const getCachedRelatedProducts = async (partnerId: string, currentProductId: string, storeId?: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      let q = supabase
        .from("products")
        .select(`
          id, name, price, promotional_price, images, video_thumbnail, rating,
          category_id, category:product_categories!category_id(name),
          partners(id),
        stores(id, name, logo_url, banner_url, phone, addresses!store_id!left(city, state)),
        product_variants(variant_options, price_adjustment, is_active)
      `)
        .eq("status", "ativo")
        .eq("show_in_marketplace", true)
        .eq("partner_id", partnerId)
      if (storeId) q = q.eq("store_id", storeId)
      const result = await q.order("created_at", { ascending: false }).limit(10)

      let data = result.data as any
      if (!data) return []

      if (data && data.length > 0) {
        const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
        data = data.filter((p: any) => visibleIds.has(p.id)) as any
      }

      const safeData = data.map((item: any) => {
        const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
        const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
        const partner = rawPartner ? {
          ...rawPartner,
          store_name: rawStore?.name,
          store_image_url: rawStore?.logo_url,
          store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
          rating: rawStore?.rating ?? rawPartner?.rating ?? 0,
          vendas_totais: rawStore?.vendas_totais ?? rawPartner?.vendas_totais ?? 0,
          city: rawStore?.addresses?.[0]?.city || null,
          state: rawStore?.addresses?.[0]?.state || null
        } : {
          store_name: "Vendedor Parceiro",
          store_avatar: "https://img.dudit.com.br/static/Placeholder.png",
          city: null,
          state: null
        }

        const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
        const basePrice = Number(item.promotional_price || item.price || 0)
        const effectivePrice = (!item.promotional_price && variantFallback.fallback_variant_price)
          ? Number(variantFallback.fallback_variant_price)
          : (basePrice > 0 ? basePrice : Number(variantFallback.fallback_variant_price || 0))

        const { product_variants, ...rest } = item as any
        return {
          ...rest,
          category: item.category?.name || null,
          partners: partner,
          price: effectivePrice,
          fallback_variant_image: variantFallback.fallback_variant_image,
          fallback_variant_price: variantFallback.fallback_variant_price
        }
      })

      return safeData
    },
    storeId ? [`related-products-${partnerId}-${currentProductId}-${storeId}`] : [`related-products-${partnerId}-${currentProductId}-v2`],
    { tags: storeId ? ["related-products", `partner-${partnerId}`, `store-${storeId}`] : ["related-products", `partner-${partnerId}`] }
  )
  return fn()
}

// NO unstable_cache - Redis is the single source of truth.
// searchMarketplaceDirect already uses react.cache() for per-request deduplication.
export const getCachedExploreProducts = async (
  query: string,
  type: MarketplaceSearchType,
  cidade?: string,
  section?: string,
  coords?: { lat: number; lng: number } | null
) => {
  const { results, moreDistantSellers, moreDistantItems, searchIntent, proximityRings } = await searchMarketplaceDirectFull(query, type, {
    vitrines: type === 'vitrines' ? 40 : 4,
    produtos: 40,
    servicos: 40,
    planos: 40,
    geral: 40,
    cidade,
    section,
    latitude: coords?.lat,
    longitude: coords?.lng,
    centerCoords: coords,
  })
  return { items: results, moreDistantSellers, moreDistantItems, searchIntent, proximityRings }
}

function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice?: number) {
  if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }
  const activeVariants = variants.filter((v: any) => v.is_active !== false)
  const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
  const image = withImage?.variant_options?.image || null

  const prices = (activeVariants.length > 0 ? activeVariants : variants)
    .map((v: any) => Number(v.price_adjustment || 0))
    .filter((p: number) => p > 0)

  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null

  return { fallback_variant_image: image, fallback_variant_price: lowestPrice }
}
const cityResolveCache = new Map<string, { city: string; state: string } | null>()


const BRAZIL_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
])

/**
 * Resolves a city-uf slug to capitalized/accented city name and state.
 * Queries unique addresses in the DB to match them. Fallback to formatting.
 *
 * Performance: the state-wide scan is expensive (no index on addresses.state), so it runs
 * behind unstable_cache (shared across instances) and behind a cheap targeted lookup that
 * answers most cities with a single row. React cache() dedupes concurrent calls per request.
 */
const resolveCityAndStateFromSlugDb = async (slug: string): Promise<{ city: string; state: string } | null> => {
  const parts = slug.split("-")
  const state = parts.pop()?.toUpperCase()
  const citySlugWithoutState = parts.join("-")
  if (!state || state.length !== 2 || !BRAZIL_UFS.has(state) || !citySlugWithoutState) return null

  const supabase = getAdminClient()
  const guess = citySlugWithoutState.split("-").join(" ")
  // Use lowercase for state matching since DB may store lowercase (sp) vs uppercase (SP)
  const stateLower = state.toLowerCase()

  // Fast path: exact (case-insensitive) match - 1 row instead of the whole state.
  const fast = await supabase
    .from("addresses")
    .select("city, state")
    .ilike("state", stateLower)
    .not("city", "is", null)
    .ilike("city", guess)
    .limit(1)
  if (!fast.error && fast.data && fast.data.length > 0) {
    return { city: fast.data[0].city, state: fast.data[0].state }
  }

  const { data: addresses } = await supabase
    .from("addresses")
    .select("city, state")
    .ilike("state", stateLower)

  if (addresses && addresses.length > 0) {
    const targetSlug = citySlugWithoutState
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const match = addresses.find((a: any) => {
      const addrSlug = (a.city || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
      // Compare state case-insensitively
      return addrSlug === targetSlug && a.state.toLowerCase() === stateLower
    })
    if (match) {
      return { city: match.city, state: match.state }
    }
  }

  const fallbackCityName = citySlugWithoutState.split('-').join(' ').replace(/\b\w/g, l => l.toUpperCase())
  return { city: fallbackCityName, state: stateLower }
}

const resolveCityAndStateFromSlugCached = unstable_cache(
  (slug: string) => resolveCityAndStateFromSlugDb(slug),
  ["marketplace-city-resolve"],
  { revalidate: 86400, tags: ["addresses"] }
)

export const resolveCityAndStateFromSlug = cache(async (slug: string): Promise<{ city: string; state: string } | null> => {
  if (!slug) return null
  if (cityResolveCache.has(slug)) {
    return cityResolveCache.get(slug) || null
  }

  const parts = slug.split("-")
  const state = parts.pop()?.toUpperCase()
  const citySlugWithoutState = parts.join("-")
  if (!state || state.length !== 2 || !BRAZIL_UFS.has(state) || !citySlugWithoutState) {
    cityResolveCache.set(slug, null)
    return null
  }

  let result: { city: string; state: string } | null = null
  try {
    result = await resolveCityAndStateFromSlugCached(slug)
  } catch (err) {
    console.error("[resolveCityAndStateFromSlug] cache lookup failed:", err)
  }

  if (!result) {
    const fallbackCityName = citySlugWithoutState.split('-').join(' ').replace(/\b\w/g, l => l.toUpperCase())
    result = { city: fallbackCityName, state }
  }

  cityResolveCache.set(slug, result)
  return result
})

/**
 * Fetches products and vitrines (stores) located in the specified city and state.
 */
export async function getHomeDataByCity(city: string, state: string, stateOnly?: boolean) {
  const supabase = getAdminClient()

  // 1. Fetch all active stores in the state
  const storesRes = await supabase
    .from("stores")
    .select(`
      id, partner_id, name, description, logo_url, banner_url,
      rating, created_at,
      addresses!store_id!inner(city, state, latitude, longitude)
    `)
    .eq("is_active", true)
    .ilike("addresses.state", state)

  if (storesRes.error) {
    console.error("[getHomeDataByCity] Error fetching stores:", storesRes.error)
  }

  const rawStores = storesRes.data || []

  const targetCitySlug = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  const filteredStores = stateOnly
    ? rawStores
    : rawStores.filter((item: any) => {
      const addr = item.addresses?.[0] || item.addresses
      if (!addr || !addr.city) return false
      const itemCitySlug = addr.city
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
      return itemCitySlug === targetCitySlug
    })

  const partnerIds = [...new Set(filteredStores.map((s: any) => s.partner_id))]

  // 2. Fetch products only for the matching partners in this city
  let rawProducts: any[] = []
  if (partnerIds.length > 0) {
    const productsRes = await supabase
      .from("products")
      .select(`
        id, name, description, price, promotional_price, stock_available, stock_quantity, images, video_thumbnail, rating,
        marketplace_score, sales_last_30_days, favorites_count, views_last_30_days,
        category_id, category:product_categories!category_id(name), created_at,
        partners!inner(id, is_showcase_active),
        stores!inner(id, name, description, logo_url, banner_url, phone, opening_hours, addresses!store_id!left(city, state)),
        product_variants(variant_options, price_adjustment, is_active)
      `)
      .eq("status", "ativo")
      .eq("show_in_marketplace", true)
      .in("partner_id", partnerIds)

    if (productsRes.error) {
      console.error("[getHomeDataByCity] Error fetching products:", productsRes.error)
    } else {
      rawProducts = productsRes.data || []
    }
  }

  // 3. Fetch recurring plans only for the matching partners in this city
  let rawPlans: any[] = []
  if (partnerIds.length > 0) {
    const plansRes = await supabase
      .from("recurring_plans")
      .select(`
        id, name, description, status, moderation_status, moderation_reason, images, show_in_marketplace, partner_id, frequency_type, frequency_interval, created_at,
        marketplace_score, signups_last_30_days, favorites_count, views_count,
        partners!inner(id, is_showcase_active),
        stores(id, name, description, logo_url, banner_url, phone, opening_hours, addresses!store_id!left(city, state)),
        recurring_plan_items(
          id, item_type, product_id, variant_id, service_id, quantity, unit_price,
          products:product_id(id, name, price, images, video_thumbnail),
          services:service_id(id, name, price, duration_minutes, images, video_thumbnail)
        )
      `)
      .eq("status", "active")
      .eq("show_in_marketplace", true)
      .or("moderation_status.eq.approved,moderation_status.is.null")
      .in("partner_id", partnerIds)

    if (plansRes.error) {
      console.error("[getHomeDataByCity] Error fetching recurring plans:", plansRes.error)
    } else {
      rawPlans = plansRes.data || []
    }
  }

  // Normalize products data
  const normalizedProducts = rawProducts.map((item: any) => {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const partner = rawPartner ? {
      ...rawPartner,
      store_name: rawStore?.name,
      store_image_url: rawStore?.logo_url,
      store_description: rawStore?.description,
      banner_url: rawStore?.banner_url,
      phone: rawStore?.phone,
      opening_hours: rawStore?.opening_hours,
      store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
      rating: rawStore?.rating ?? rawPartner?.rating ?? 0,
      vendas_totais: rawStore?.vendas_totais ?? rawPartner?.vendas_totais ?? 0,
      latitude: rawStore?.addresses?.[0]?.latitude || null,
      longitude: rawStore?.addresses?.[0]?.longitude || null,
      city: rawStore?.addresses?.[0]?.city || null,
      state: rawStore?.addresses?.[0]?.state || null
    } : null
    const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
    const basePrice = Number(item.promotional_price || item.price || 0)
    const effectivePrice = (!item.promotional_price && variantFallback.fallback_variant_price)
      ? Number(variantFallback.fallback_variant_price)
      : (basePrice > 0 ? basePrice : Number(variantFallback.fallback_variant_price || 0))
    const { product_variants, ...rest } = item
    return {
      ...rest,
      category: item.category?.name || null,
      itemType: 'produto',
      partners: partner,
      price: effectivePrice,
      ...variantFallback
    }
  })

  // Normalize plans data
  const normalizedPlans = rawPlans.map((item: any) => {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const rawStore = Array.isArray(item.stores) ? item.stores[0] : item.stores
    const partner = rawPartner ? {
      ...rawPartner,
      store_name: rawStore?.name,
      store_image_url: rawStore?.logo_url,
      store_description: rawStore?.description,
      banner_url: rawStore?.banner_url,
      phone: rawStore?.phone,
      opening_hours: rawStore?.opening_hours,
      store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
      rating: rawStore?.rating ?? rawPartner?.rating ?? 0,
      vendas_totais: rawStore?.vendas_totais ?? rawPartner?.vendas_totais ?? 0,
      latitude: rawStore?.addresses?.[0]?.latitude || null,
      longitude: rawStore?.addresses?.[0]?.longitude || null,
      city: rawStore?.addresses?.[0]?.city || null,
      state: rawStore?.addresses?.[0]?.state || null
    } : null

    let computedPrice = 0
    let firstImage: string | null = null

    if (item.recurring_plan_items && Array.isArray(item.recurring_plan_items)) {
      for (const planItem of item.recurring_plan_items) {
        const qty = Number(planItem.quantity || 1)
        let itemPrice = Number(planItem.unit_price || 0)

        if (itemPrice <= 0) {
          if (planItem.item_type === 'product' && planItem.products) {
            itemPrice = Number(planItem.products.price || 0)
          } else if (planItem.item_type === 'service' && planItem.services) {
            itemPrice = Number(planItem.services.price || 0)
          }
        }
        computedPrice += qty * itemPrice

        if (!firstImage) {
          if (planItem.item_type === 'product' && planItem.products?.images) {
            const imgs = planItem.products.images
            if (Array.isArray(imgs) && imgs.length > 0) {
              firstImage = imgs[0]
            }
          } else if (planItem.item_type === 'service' && planItem.services?.images) {
            const imgs = planItem.services.images
            if (Array.isArray(imgs) && imgs.length > 0) {
              firstImage = imgs[0]
            }
          }
        }
      }
    }

    // Prioriza a imagem do próprio plano; fallback para o primeiro item ou logo da loja
    const ownImages = (Array.isArray(item.images) ? item.images : [])
      .filter((img: any): img is string => typeof img === "string" && img.trim().length > 0)
    const fallbackImage = firstImage || rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png"
    const finalImages = ownImages.length > 0 ? ownImages : [fallbackImage]

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: computedPrice,
      images: finalImages,
      moderation_status: item.moderation_status || null,
      moderation_reason: item.moderation_reason || null,
      itemType: 'plano',
      partners: partner,
      frequency_type: item.frequency_type,
      frequency_interval: item.frequency_interval,
      created_at: item.created_at
    }
  })

  // Normalize vitrines data
  const normalizedVitrines = filteredStores.map((item: any) => {
    return {
      id: item.id,
      short_id: item.short_id || null,
      name: item.name,
      description: item.description,
      logo_url: item.logo_url,
      banner_url: item.banner_url,
      images: [item.banner_url || item.logo_url || "https://img.dudit.com.br/static/Placeholder.png"],
      rating: item.rating,
      itemType: 'loja',
      category: 'Loja Parceira',
      partners: {
        id: item.partner_id,
        short_id: item.short_id || null,
        store_name: item.name,
        store_avatar: item.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
        banner_url: item.banner_url || null,
        latitude: item.addresses?.[0]?.latitude,
        longitude: item.addresses?.[0]?.longitude,
        city: item.addresses?.[0]?.city || null,
        state: item.addresses?.[0]?.state || null
      }
    }
  })

  const trendingProducts = applySellerDiversity(sortByTrendingScore(normalizedProducts)).slice(0, 20)
  const trendingPlans = applySellerDiversity(
    sortByTrendingScore(
      normalizedPlans.map((p) => ({ ...p, signups_last_30_days: (p as any).signups_last_30_days })),
    ),
  ).slice(0, 10)

  return {
    products: trendingProducts,
    vitrines: normalizedVitrines.sort((a: any, b: any) => Number(b.rating || 0) - Number(a.rating || 0)),
    plans: trendingPlans,
  }
}
