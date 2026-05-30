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
      category_id, category:product_categories!category_id(name),
      subcategory_id, subcategory:product_categories!subcategory_id(name),
      brand_id, brand:brands!brand_id(name),
      location_id, location:storage_locations!location_id(name),
      images, rating, partner_id, sku, 
      condition, show_in_marketplace, technical_specs, created_at,
      video_type, video_url, video_thumbnail, video_duration, video_provider_id,
      product_logistics(weight_gross, length, width, height, preparation_days),
      partners(
        id, store_name, store_description, rating, user_id, 
        store_image_url, banner_url, max_installments, interest_rate_percent,
        mp_user_id, mp_public_key, opening_hours,
        logo_moderation_status, banner_moderation_status,
        vendas_totais, created_at,
        addresses(city, state),
        payment_methods(*)
      )
    `)
    .eq("id", id)
    .single()

  if (error || !data) {
    if (error) console.error(`[Product] Fetch error for ${id}:`, error.message)
    console.warn(`[MarketplaceTrace] produto:${id} ausente na query PDP`)
    return null
  }

  if (process.env.NODE_ENV !== "production" && data.video_type && data.video_url) {
    console.info(`[MarketplaceTrace] produto:${id} PDP com vídeo type=${data.video_type} duration=${data.video_duration ?? "null"}`)
  }

  // Normalização básica (independente de usuário)
  if (data) {
    data.category = (data.category as any)?.name || null
    data.subcategory = (data.subcategory as any)?.name || null
    data.brand = (data.brand as any)?.name || null
    data.location = (data.location as any)?.name || null

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
  const { data: reviewsData, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, user_id, product_id")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return []
  }

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string; profile_image_url: string | null }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
          profile_image_url: null
        })
      })
    }
  }

  return reviewsData.map((r: any) => ({
    ...r,
    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null }
  }))
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
      const { data: reviewsData, error } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, user_id, product_id")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error || !reviewsData) {
        console.error("[Reviews] Fetch error:", error?.message)
        return []
      }

      const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
      const profilesMap = new Map<string, { full_name: string; profile_image_url: string | null }>()

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("user_profiles")
          .select("user_id, full_name")
          .in("user_id", userIds)

        if (profilesData) {
          profilesData.forEach((p: any) => {
            profilesMap.set(p.user_id, {
              full_name: p.full_name,
              profile_image_url: null
            })
          })
        }
      }

      return reviewsData.map((r: any) => ({
        ...r,
        profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null }
      }))
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
          id, name, price, promotional_price, images, video_thumbnail, rating,
          category_id, category:product_categories!category_id(name),
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
        return {
          ...rest,
          category: item.category?.name || null,
          partners: partner,
          fallback_variant_image: fallbackUrl,
          fallback_variant_price: fallbackPrice
        }
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
export const getCachedExploreProducts = async (query: string, type: MarketplaceSearchType, cidade?: string) => {
  return await searchMarketplaceDirect(query, type, {
    vitrines: type === 'vitrines' ? 40 : 4,
    produtos: 20,
    servicos: 20,
    cidade
  })
}

// Helper to extract fallback values from product variants
function extractFirstVariantFallback(variants: any[] | null | undefined, basePrice: number) {
  if (!variants || variants.length === 0) return { fallback_variant_image: null, fallback_variant_price: null }
  const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
  const first = variants.find((v: any) => v.is_active) || variants[0]
  const image = withImage?.variant_options?.image || null
  const priceAdj = first?.price_adjustment
  const price = priceAdj && priceAdj > 0 ? priceAdj : null
  return { fallback_variant_image: image, fallback_variant_price: price }
}

/**
 * Resolves a city-uf slug to capitalized/accented city name and state.
 * Queries unique addresses in the DB to match them. Fallback to formatting.
 */
export async function resolveCityAndStateFromSlug(slug: string): Promise<{ city: string; state: string } | null> {
  if (!slug) return null
  const parts = slug.split("-")
  const state = parts.pop()?.toUpperCase()
  const citySlugWithoutState = parts.join("-")
  if (!state) return null

  const supabase = getAdminClient()

  // Find a matching address row in the DB to preserve correct accents and capitalization
  const { data: addresses } = await supabase
    .from("addresses")
    .select("city, state")
    .eq("state", state)

  if (addresses && addresses.length > 0) {
    const matched = addresses.find((addr: any) => {
      if (!addr.city) return false
      const normalized = addr.city
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return normalized === citySlugWithoutState
    })

    if (matched) {
      return { city: matched.city, state: matched.state }
    }
  }

  // Fallback formatting if no address exists in the DB yet
  const fallbackCityName = citySlugWithoutState.split('-').join(' ').replace(/\b\w/g, l => l.toUpperCase())
  return { city: fallbackCityName, state }
}

/**
 * Fetches products and vitrines (partners) located in the specified city and state.
 */
export async function getHomeDataByCity(city: string, state: string) {
  const supabase = getAdminClient()

  // 1. Fetch all active partners in the state (filtering state on database)
  const partnersRes = await supabase
    .from("partners")
    .select(`
      id, store_name, store_description, store_image_url, banner_url,
      logo_moderation_status, banner_moderation_status, rating, latitude, longitude,
      created_at,
      addresses!inner(city, state)
    `)
    .eq("is_active", true)
    .ilike("addresses.state", state)

  if (partnersRes.error) {
    console.error("[getHomeDataByCity] Error fetching partners:", partnersRes.error)
  }

  const rawPartners = partnersRes.data || []

  // Normalize target city slug
  const targetCitySlug = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  // Filter partners in JS to match target city (case-insensitive and accent-insensitive)
  const filteredPartners = rawPartners.filter((item: any) => {
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

  const partnerIds = filteredPartners.map((p: any) => p.id)

  // 2. Fetch products only for the matching partners in this city
  let rawProducts: any[] = []
  if (partnerIds.length > 0) {
    const productsRes = await supabase
      .from("products")
      .select(`
        id, name, description, price, promotional_price, stock_available, stock_quantity, images, rating,
        category_id, category:product_categories!category_id(name), created_at,
        partners!inner(
          id, store_name, store_image_url, latitude, longitude,
          addresses!inner(city, state)
        ),
        product_variants(variant_options, price_adjustment, is_active)
      `)
      .eq("is_active", true)
      .eq("show_in_marketplace", true)
      .in("partner_id", partnerIds)

    if (productsRes.error) {
      console.error("[getHomeDataByCity] Error fetching products:", productsRes.error)
    } else {
      rawProducts = productsRes.data || []
    }
  }

  // Normalize products data
  const normalizedProducts = rawProducts.map((item: any) => {
    const rawPartner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const partner = rawPartner ? {
      ...rawPartner,
      store_avatar: rawPartner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
      latitude: rawPartner.latitude,
      longitude: rawPartner.longitude,
      city: rawPartner.addresses?.[0]?.city || null,
      state: rawPartner.addresses?.[0]?.state || null
    } : null
    const variantFallback = extractFirstVariantFallback(item.product_variants, Number(item.price))
    const { product_variants, ...rest } = item
    return {
      ...rest,
      category: item.category?.name || null,
      itemType: 'produto',
      partners: partner,
      ...variantFallback
    }
  })

  // Normalize partners (vitrines) data
  const normalizedVitrines = filteredPartners.map((item: any) => {
    return {
      id: item.id,
      name: item.store_name,
      description: item.store_description,
      images: [item.banner_url || item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"],
      rating: item.rating,
      itemType: 'loja',
      category: 'Loja Parceira',
      partners: {
        id: item.id,
        store_name: item.store_name,
        store_avatar: item.store_image_url || "https://img.dudit.com.br/static/Placeholder.png",
        banner_url: item.banner_url || null,
        logo_moderation_status: item.logo_moderation_status || "approved",
        banner_moderation_status: item.banner_moderation_status || "approved",
        latitude: item.latitude,
        longitude: item.longitude,
        city: item.addresses?.[0]?.city || null,
        state: item.addresses?.[0]?.state || null
      }
    }
  })

  return { products: normalizedProducts, vitrines: normalizedVitrines }
}

