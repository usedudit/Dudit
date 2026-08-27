"use server"

// Removed createSupabaseAdmin
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache, revalidatePath, revalidateTag } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { cache } from "react"
import { revalidatePartnerProfile } from "@/lib/utils/revalidation"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeInput, validateBrazilMobile } from "@/lib/input-validator"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { decryptCPF } from "@/lib/crypto"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { enrichAddressData } from "@/lib/services/location.service"
import { syncPartnerItemsToExploreRedis, syncToExploreRedis } from "@/lib/redis-sync"
import { getRandomDefaultBanner } from "@/lib/utils/banner"

// --- CLIENTES ---

import { getAdminClient } from "@/lib/supabase/admin"

// ==========================================
// DIRECT FETCH FUNCTIONS (NO CACHE)
// Used by force-dynamic pages for strict consistency
// ==========================================

async function _getPartnerProfile(partnerId: string) {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("partners")
    .select(`
      *,
      payment_methods(*)
    `)
    .eq("id", partnerId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error(`[Partner] Profile fetch error for ${partnerId}:`, error.message)
    return null
  }

  if (!data) return null

  const { data: store } = await supabase
    .from("stores")
    .select("*, addresses(*)")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (store) {
    data.store = store
    data.short_id = store.short_id || data.short_id
    data.slug = store.slug || data.slug
    data.store_name = store.name
    data.store_description = store.description
    data.store_image_url = store.logo_url
    data.banner_url = store.banner_url
    data.opening_hours = store.opening_hours
    data.phone = store.phone
    data.addresses = store.addresses || []
  }

  if (typeof data.business_info === "string") {
    try {
      data.business_info = JSON.parse(data.business_info)
    } catch (e) {
      data.business_info = normalizeBusinessInfo(null)
    }
  }

  // CPF now lives on stores (fiscal fields per-store)
  const storeCpf = store?.cpf || data?.cpf
  if (storeCpf) {
    try {
      data.cpf = await decryptCPF(storeCpf)
    } catch (e) {
      console.error("[Partner] CPF decryption error:", e)
    }
  }

  if (!data.banner_url && store) {
    const storeName = store.name || "Vendedor"
    const bannerUrl = await getDefaultPartnerBannerUrl(storeName, store.logo_url)
    const { error: bannerError } = await supabase
      .from("stores")
      .update({ banner_url: bannerUrl })
      .eq("id", store.id)

    if (!bannerError) {
      data.banner_url = bannerUrl
      await syncToExploreRedis({ id: partnerId, type: "loja", data: {}, silent: true })
    }
  }

  return data
}

async function getDefaultPartnerBannerUrl(storeName: string, storeImageUrl?: string | null) {
  if (storeImageUrl) return getRandomDefaultBanner()
  const { getAvatarColor, getBannerUrlByColor } = await import("@/lib/utils/avatar")
  return getBannerUrlByColor(getAvatarColor(storeName))
}

import { getCurrentUser } from "@/lib/auth/server-user"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"

// ... (existing code)

async function _getPartnerProducts(partnerId: string, storeId?: string) {
  const supabase = getAdminClient()
  const user = await getCurrentUser()

  // Get partner owner info to check ownership
  const { data: partner } = await supabase.from("partners").select("user_id").eq("id", partnerId).single()
  const isOwner = user && partner?.user_id === user.id

  let query = supabase
    .from("products")
    .select(`
      *,
      category:product_categories!category_id(name),
      subcategory:product_categories!subcategory_id(name),
      brand_rel:brands!brand_id(name),
      location_rel:storage_locations!location_id(name),
      product_variants(variant_options, price_adjustment, is_active)
    `)
    .eq("partner_id", partnerId)

  if (storeId) query = query.eq("store_id", storeId)

  // If NOT owner, apply visibility filters
  if (!isOwner) {
    query = query
      .eq("status", "ativo")
      .eq("moderation_status", "approved")
      .eq("show_in_marketplace", true)
  }

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  let resultData = data || []
  if (!isOwner && resultData.length > 0) {
    const visibleIds = await filterMarketplaceVisibleProducts(resultData.map((p: any) => p.id))
    resultData = resultData.filter((p: any) => visibleIds.has(p.id))
  }
  const safeData = resultData.map((item: any) => {
    const variants = item.product_variants
    let fallback_variant_image: string | null = null
    let fallback_variant_price: number | null = null

    if (variants && variants.length > 0) {
      const activeVariants = variants.filter((v: any) => v.is_active !== false)
      const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
      fallback_variant_image = withImage?.variant_options?.image || null
      const prices = (activeVariants.length > 0 ? activeVariants : variants)
        .map((v: any) => Number(v.price_adjustment || 0))
        .filter((p: number) => p > 0)
      fallback_variant_price = prices.length > 0 ? Math.min(...prices) : null
    }

    const basePrice = Number(item.promotional_price || item.price || 0)
    const price = (!item.promotional_price && fallback_variant_price)
      ? Number(fallback_variant_price)
      : (basePrice > 0 ? basePrice : Number(fallback_variant_price || 0))
    const originalPrice = item.promotional_price
      ? (Number(item.price) > 0 ? Number(item.price) : (fallback_variant_price ? Number(fallback_variant_price) : undefined))
      : undefined

    const { product_variants, ...rest } = item
    return {
      ...rest,
      category: item.category?.name || null,
      subcategory: item.subcategory?.name || null,
      brand: item.brand_rel?.name || item.brand || null,
      location: item.location_rel?.name || item.location || null,
      price,
      originalPrice,
      fallback_variant_image,
      fallback_variant_price
    }
  })

  return safeData
}

async function _getPartnerServices(partnerId: string, storeId?: string) {
  const supabase = getAdminClient()
  const user = await getCurrentUser()

  const { data: partner } = await supabase.from("partners").select("user_id").eq("id", partnerId).single()
  const isOwner = user && partner?.user_id === user.id

  let query = supabase
    .from("services")
    .select("*")
    .eq("partner_id", partnerId)

  if (storeId) query = query.eq("store_id", storeId)

  if (!isOwner) {
    query = query.eq("status", "ativo").eq("show_in_marketplace", true)
  } else {
    query = query.eq("status", "ativo")
  }

  const { data } = await query.order("created_at", { ascending: false })
  let services = data || []
  if (!isOwner && services.length > 0) {
    const visibleIds = await filterMarketplaceVisibleServices(services.map((s: any) => s.id))
    services = services.filter((s: any) => visibleIds.has(s.id))
  }
  return services
}

async function _getPartnerReviews(partnerId: string) {
  const supabase = getAdminClient()
  const { data: reviewsData, error } = await supabase
    .from("reviews")
    .select(`
      *,
      products:product_id (name),
      services:service_id (name)
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })

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
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    products: r.products || null,
    services: r.services || null,
    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null }
  }))
}

async function _getPartnerStats(partnerId: string) {
  const supabase = getAdminClient()
  const [store, reviews] = await Promise.all([
    supabase.from("stores").select("vendas_totais, marketplace_reputation, vendas_produtos, vendas_servicos, vendas_assinaturas").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("reviews").select("*", { count: "exact", head: true }).or(`partner_id.eq.${partnerId},store_id.in.(select id from stores where partner_id = '${partnerId}')`)
  ])

  return {
    salesCount: store.data?.vendas_totais || 0,
    reviewsCount: reviews.count || 0,
    marketplaceReputation: store.data?.marketplace_reputation || 0,
    productSales: store.data?.vendas_produtos || 0,
    serviceSales: store.data?.vendas_servicos || 0,
    subscriptionSales: store.data?.vendas_assinaturas || 0,
  }
}

async function _getPartnerPublicCoupons(partnerId: string) {
  const supabase = getAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("coupons")
    .select(`
      id,
      code,
      discount_type,
      discount_value,
      apply_scope,
      min_cart_value,
      max_discount_value,
      usage_limit,
      usage_per_customer,
      first_purchase_only,
      starts_at,
      ends_at,
      customer_scope,
      is_automatic,
      is_active
    `)
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .limit(12)

  if (error) {
    console.error(`[Partner] Coupons fetch error for ${partnerId}:`, error.message)
    return []
  }

  return data || []
}

// React cache() wrappers - deduplicate within SSR request
export const getPartnerProfile = cache(_getPartnerProfile)
export const getPartnerProducts = cache(_getPartnerProducts)
export const getPartnerServices = cache(_getPartnerServices)
export const getPartnerReviews = cache(_getPartnerReviews)
export const getPartnerStats = cache(_getPartnerStats)
export const getPartnerPublicCoupons = cache(_getPartnerPublicCoupons)

// ==========================================
// CACHED FUNCTIONS (kept for other pages)
// ==========================================

export const getCachedPartnerProfile = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data, error } = await supabase
        .from("partners")
        .select(`
          *,
          payment_methods(*)
        `)
        .eq("id", partnerId)
        .eq("is_active", true)
        .single()

      if (error || !data) return null

      const { data: store } = await supabase
        .from("stores")
        .select("*, addresses(*)")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (store) {
        data.store = store
        data.store_name = store.name
        data.store_description = store.description
        data.store_image_url = store.logo_url
        data.banner_url = store.banner_url
        data.opening_hours = store.opening_hours
        data.phone = store.phone
        data.addresses = store.addresses || []
      }

      if (data && typeof data.business_info === "string") {
        try {
          data.business_info = JSON.parse(data.business_info)
        } catch (e) {
          data.business_info = normalizeBusinessInfo(null)
        }
      }
      if (data && data.cpf) {
        try {
          data.cpf = await decryptCPF(data.cpf)
        } catch (e) {
          console.error("[Partner] CPF decryption error:", e)
        }
      }
      return data
    },
    [`partner-profile-${partnerId}-v2`],
    { tags: ["partner-profile", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerProducts = async (partnerId: string, storeId?: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      let q = supabase
        .from("products")
        .select(`
          *,
          category:product_categories!category_id(name),
          subcategory:product_categories!subcategory_id(name),
          brand_rel:brands!brand_id(name),
          location_rel:storage_locations!location_id(name),
          product_variants(variant_options, price_adjustment, is_active)
        `)
        .eq("partner_id", partnerId)
        .eq("status", "ativo")
      if (storeId) q = q.eq("store_id", storeId)
      const { data: rawData } = await q.order("created_at", { ascending: false }).limit(100)

      let resultData = rawData || []
      if (resultData.length > 0) {
        const visibleIds = await filterMarketplaceVisibleProducts(resultData.map((p: any) => p.id))
        resultData = resultData.filter((p: any) => visibleIds.has(p.id))
      }

      // Extrai fallback de variante e remove product_variants do payload
      const safeData = resultData.map((item: any) => {
        const variants = item.product_variants
        let fallback_variant_image: string | null = null
        let fallback_variant_price: number | null = null

        if (variants && variants.length > 0) {
          const activeVariants = variants.filter((v: any) => v.is_active !== false)
          const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
          fallback_variant_image = withImage?.variant_options?.image || null
          const prices = (activeVariants.length > 0 ? activeVariants : variants)
            .map((v: any) => Number(v.price_adjustment || 0))
            .filter((p: number) => p > 0)
          fallback_variant_price = prices.length > 0 ? Math.min(...prices) : null
        }

        const basePrice = Number(item.promotional_price || item.price || 0)
        const price = (!item.promotional_price && fallback_variant_price)
          ? Number(fallback_variant_price)
          : (basePrice > 0 ? basePrice : Number(fallback_variant_price || 0))
        const originalPrice = item.promotional_price
          ? (Number(item.price) > 0 ? Number(item.price) : (fallback_variant_price ? Number(fallback_variant_price) : undefined))
          : undefined

        const { product_variants, ...rest } = item
        return {
          ...rest,
          category: item.category?.name || null,
          subcategory: item.subcategory?.name || null,
          brand: item.brand_rel?.name || item.brand || null,
          location: item.location_rel?.name || item.location || null,
          price,
          originalPrice,
          fallback_variant_image,
          fallback_variant_price
        }
      })

      return safeData
    },
    storeId ? [`partner-products-${partnerId}-${storeId}`] : [`partner-products-${partnerId}-v2`],
    { tags: storeId ? ["partner-products", `partner-${partnerId}`, `store-${storeId}`] : ["partner-products", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerServices = async (partnerId: string, storeId?: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      let q = supabase
        .from("services")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("status", "ativo")
      if (storeId) q = q.eq("store_id", storeId)
      const { data: rawData } = await q.order("created_at", { ascending: false })

      let services = rawData || []
      if (services.length > 0) {
        const visibleIds = await filterMarketplaceVisibleServices(services.map((s: any) => s.id))
        services = services.filter((s: any) => visibleIds.has(s.id))
      }
      return services
    },
    storeId ? [`partner-services-${partnerId}-${storeId}`] : [`partner-services-${partnerId}`],
    { tags: storeId ? ["partner-services", `partner-${partnerId}`, `store-${storeId}`] : ["partner-services", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerStats = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const [store, reviews] = await Promise.all([
        supabase.from("stores").select("vendas_totais, marketplace_reputation, vendas_produtos, vendas_servicos, vendas_assinaturas").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("reviews").select("*", { count: "exact", head: true }).or(`partner_id.eq.${partnerId},store_id.in.(select id from stores where partner_id = '${partnerId}')`)
      ])

      return {
        salesCount: store.data?.vendas_totais || 0,
        reviewsCount: reviews.count || 0,
        marketplaceReputation: store.data?.marketplace_reputation || 0,
        productSales: store.data?.vendas_produtos || 0,
        serviceSales: store.data?.vendas_servicos || 0,
        subscriptionSales: store.data?.vendas_assinaturas || 0,
      }
    },
    [`partner-stats-${partnerId}`],
    { tags: ["partner-stats", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerReviews = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data: reviewsData, error } = await supabase
        .from("reviews")
        .select(`
          *,
          products:product_id (name),
          services:service_id (name)
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })

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
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        products: r.products || null,
        services: r.services || null,
        profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null }
      }))
    },
    [`partner-reviews-list-${partnerId}`],
    { tags: ["partner-reviews", `partner-${partnerId}`] }
  )
  return fn()
}

// ==========================================
// ESCRITA (SERVER ACTIONS)
// ==========================================

export async function updatePartnerAction(partnerId: string, data: any) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // SECURITY: Verify ownership - only partner owner can update
  const currentUser = await requireUser()
  if (!currentUser) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  // Verify this partner belongs to the current user
  const { data: partnerCheck } = await supabase
    .from("partners")
    .select("user_id, business_info")
    .eq("id", partnerId)
    .single()

  if (!partnerCheck || partnerCheck.user_id !== currentUser.id) {
    return { error: "Não autorizado" }
  }

  const updateData: any = {}
  const storeUpdateData: any = {}
  const sanitizedPhone = typeof data.phone === "string" ? sanitizeInput(data.phone, 20) : undefined

  // Store table fields
  if (data.storeName) storeUpdateData.name = data.storeName
  if (data.storeDescription !== undefined) storeUpdateData.description = data.storeDescription
  if (data.storeImageUrl !== undefined) {
    if (data.storeImageUrl && data.storeImageUrl.startsWith("data:")) {
      return { error: "Formato de imagem inválido (base64 não permitido)" }
    }
    storeUpdateData.logo_url = data.storeImageUrl
  }
  if (data.openingHours !== undefined) storeUpdateData.opening_hours = normalizeOpeningHours(data.openingHours)
  if (sanitizedPhone !== undefined) {
    if (sanitizedPhone) {
      let phoneToValidate = sanitizedPhone
      const digits = sanitizedPhone.replace(/\D/g, "")
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
        phoneToValidate = digits.slice(2)
      }

      if (!validateBrazilMobile(phoneToValidate)) {
        return { error: "Número de telefone inválido" }
      }
      storeUpdateData.phone = normalizePhoneToE164(sanitizedPhone)
    } else {
      storeUpdateData.phone = null
    }
  }
  if (data.bannerUrl !== undefined) {
    if (data.bannerUrl && data.bannerUrl.startsWith("data:")) {
      return { error: "Formato de banner inválido (base64 não permitido)" }
    }
    storeUpdateData.banner_url = data.bannerUrl || getRandomDefaultBanner()
  }
  if (data.isShowcaseActive !== undefined) storeUpdateData.is_showcase_active = data.isShowcaseActive

  // Partner table fields
  if (data.businessInfo !== undefined) {
    const existingInfo = normalizeBusinessInfo(partnerCheck?.business_info)
    const newInfo = normalizeBusinessInfo(data.businessInfo)
    updateData.business_info = {
      ...newInfo,
      activeResources: existingInfo.activeResources,
      mode: existingInfo.mode // Never trust the frontend for mode changes on update
    }
  }

  if (data.categoryId !== undefined) updateData.category_id = data.categoryId
  if (data.subcategoryId !== undefined) updateData.subcategory_id = data.subcategoryId

  if (data.gallery !== undefined) {
    if (!Array.isArray(data.gallery)) {
      return { error: "Formato de galeria inválido" }
    }
    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const plan = await getPartnerPlan(partnerId)
    const limit = plan.slug === "free" ? 1 : plan.slug === "crescer" ? 5 : plan.slug === "escalar" ? 10 : 10
    if (data.gallery.length > limit) {
      return { error: `Seu plano atual permite apenas até ${limit} imagem(ns) na galeria.` }
    }
    storeUpdateData.gallery = data.gallery
  }

  if (Object.keys(storeUpdateData).length > 0) {
    storeUpdateData.updated_at = new Date().toISOString()
    const admin = getAdminClient()
    const { data: hqStore } = await admin
      .from("stores")
      .select("id")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hqStore?.id) {
      await admin.from("stores").update(storeUpdateData).eq("id", hqStore.id)
    }
  }

  if (data.orderFlow !== undefined) {
    updateData.order_flow = data.orderFlow
  }

  // Atualiza dados do parceiro (SE houver algo para atualizar)
  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("partners")
      .update(updateData)
      .eq("id", partnerId)

    if (error) {
      console.error("Erro no update de partner:", error)
      return { error: "Erro ao atualizar dados: " + error.message }
    }
  }

  await revalidatePartnerProfile(partnerId)
  await syncToExploreRedis({ id: partnerId, type: "loja", data: {}, silent: true })
  await syncPartnerItemsToExploreRedis(partnerId)
  revalidatePath("/erp/configuracoes")

  return { success: true }
}

export async function registerPartner(data: any) {
  await requireRateLimit(RateLimitCategory.PARTNER_REGISTER)

  const supabaseAdmin = getAdminClient()
  let userId: string | null = null

  // 1. Usuário autenticado na sessão
  const currentUser = await getCurrentUser()
  if (currentUser?.id) {
    userId = currentUser.id
  } else if (data.signupUserId && data.email) {
    // 2. Fluxo de cadastro direto (PartnerWizard): valida ID e email correspondente em auth.users
    const { data: authUser, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(data.signupUserId)
    if (!authUserErr && authUser?.user && authUser.user.email?.toLowerCase() === data.email.trim().toLowerCase()) {
      userId = authUser.user.id
    }
  }

  if (!userId) {
    return { success: false, error: "Não autorizado ou sessão não encontrada. Faça login para continuar." }
  }

  try {
    const sanitizedPhone = typeof data.phone === "string" ? sanitizeInput(data.phone, 20) : ""

    // 1. Verifica duplicidade de usuário na tabela de partners
    const { data: existing } = await supabaseAdmin.from("partners").select("id").eq("user_id", userId).maybeSingle()
    if (existing) return { success: false, error: "Você já possui uma conta de parceiro." }

    // 2. Verifica duplicidade de nome da loja (case-insensitive na tabela stores)
    if (data.storeName) {
      const normalizedStoreName = data.storeName.trim().toLowerCase()
      const { data: duplicateName } = await supabaseAdmin
        .from("stores")
        .select("id")
        .ilike("name", normalizedStoreName)
        .maybeSingle()
      if (duplicateName) {
        return { success: false, error: "Já existe uma loja com este nome. Escolha outro nome." }
      }
    }

    if (!sanitizedPhone || !validateBrazilMobile(sanitizedPhone)) {
      return { success: false, error: "Número de telefone inválido" }
    }

    // --- GARANTIR QUE O PERFIL EXISTE ANTES DE CRIAR O PARTNER ---
    const { data: profileExists } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    if (!profileExists) {
      const { error: userProfileError } = await supabaseAdmin
        .from("user_profiles")
        .insert({
          user_id: userId,
          full_name: "",
          phone: null,
          pending_partner_registration: false,
        })

      if (userProfileError && userProfileError.code !== "23505") {
        console.warn("Erro ao criar user_profile:", userProfileError.message)
      }
    }
    // -------------------------------------------------------

    // Encrypt CPF for store (fiscal fields moved per-store)
    let cpfEncrypted = null
    if (data.cpf) {
      const cleanCPF = String(data.cpf).replace(/\D/g, "")
      if (cleanCPF) {
        const { encryptCPF } = await import("@/lib/crypto")
        cpfEncrypted = await encryptCPF(cleanCPF)
      }
    }

    if (data.storeImageUrl && data.storeImageUrl.startsWith("data:")) {
      return { success: false, error: "Formato de imagem inválido (base64 não permitido)" }
    }

    const defaultBannerUrl = await getDefaultPartnerBannerUrl(data.storeName, data.storeImageUrl)

    const insertPartnerData: any = {
      user_id: userId,
      business_info: normalizeBusinessInfo(data.businessInfo),
      is_active: true,
      category_id: data.categoryId || null,
      subcategory_id: data.subcategoryId || null
    }

    // 2. Inserir o Parceiro
    const { data: newPartner, error } = await supabaseAdmin
      .from("partners")
      .insert(insertPartnerData)
      .select("id")
      .single()

    if (error) {
      throw error
    }

    // Auto-create default headquarters store for the partner
    const { data: newStore, error: storeError } = await supabaseAdmin
      .from("stores")
      .insert({
        partner_id: newPartner.id,
        name: data.storeName,
        slug: data.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: data.storeDescription || "",
        logo_url: data.storeImageUrl || null,
        banner_url: data.bannerUrl || defaultBannerUrl,
        phone: normalizePhoneToE164(sanitizedPhone),
        opening_hours: data.businessHours || null,
        person_type: data.personType,
        cnpj: data.cnpj?.replace(/\D/g, "") || null,
        cpf: cpfEncrypted,
        is_headquarters: true,
        is_active: true,
        is_showcase_active: true,
        category_id: data.categoryId || null,
        subcategory_id: data.subcategoryId || null,
        business_info: normalizeBusinessInfo(data.businessInfo),
      })
      .select("id")
      .single()
    if (storeError) {
      console.error("[registerPartner] Failed to create default store:", storeError.message)
    }

    // 3. Inserir o Endereço na tabela ADDRESSES (Usando o ID do novo parceiro)
    const rawZip = data.zipCode || data.address?.cep || data.address?.zipCode || ""
    const rawStreet = data.street || data.address?.street || ""
    const rawCity = data.city || data.address?.city || ""
    const rawNumber = data.number || data.address?.number || "S/N"
    const rawComplement = data.complement || data.address?.complement || null
    const rawNeighborhood = data.neighborhood || data.address?.neighborhood || ""
    const rawState = data.state || data.address?.state || ""
    const rawIbge = data.municipioCodigoIbge || data.ibge || data.address?.ibge || data.address?.municipioCodigoIbge || null
    const rawLatitude = typeof data.latitude === "number" ? data.latitude : (typeof data.address?.latitude === "number" ? data.address.latitude : undefined)
    const rawLongitude = typeof data.longitude === "number" ? data.longitude : (typeof data.address?.longitude === "number" ? data.address.longitude : undefined)

    if (rawZip || rawStreet || rawCity) {
      const enrichedAddress = await enrichAddressData({
        partner_id: newPartner.id,
        store_id: newStore?.id || null,
        user_id: userId,
        zip_code: rawZip,
        street: rawStreet,
        number: rawNumber,
        complement: rawComplement,
        neighborhood: rawNeighborhood,
        city: rawCity,
        state: rawState,
        country: "BR",
        is_default: true,
        address_type: "primary",
        municipio_codigo_ibge: rawIbge,
        latitude: rawLatitude,
        longitude: rawLongitude,
      })

      const { error: addressError } = await supabaseAdmin
        .from("addresses")
        .insert(enrichedAddress)

      if (addressError) {
        console.error("[registerPartner] Error inserting address:", addressError)
      } else if (newStore?.id && enrichedAddress.latitude != null && enrichedAddress.longitude != null) {
        await supabaseAdmin
          .from("stores")
          .update({ latitude: enrichedAddress.latitude, longitude: enrichedAddress.longitude })
          .eq("id", newStore.id)
      }
    }

    // 4. Cria métodos de pagamento padrão
    await supabaseAdmin.from("payment_methods").insert([
      { partner_id: newPartner.id, name: "Dinheiro", payment_type: "dinheiro", type: "cash", is_active: true },
      { partner_id: newPartner.id, name: "Pix", payment_type: "pix", type: "pix", is_active: true },
      { partner_id: newPartner.id, name: "Cartão de Credito", payment_type: "credito", type: "credit_card", is_active: true },
      { partner_id: newPartner.id, name: "Cartao de Debito", payment_type: "debito", type: "debit_card", is_active: true },
    ])

    // 5. Categorias financeiras padrão
    const defaultCategories = [
      { name: "Vendas", category_type: "income" as const },
      { name: "Outras receitas", category_type: "income" as const },
      { name: "Moradia / Estrutura", category_type: "expense" as const },
      { name: "Alimentação", category_type: "expense" as const },
      { name: "Transporte", category_type: "expense" as const },
      { name: "Negócio", category_type: "expense" as const },
      { name: "Financeiro", category_type: "expense" as const },
      { name: "Impostos", category_type: "expense" as const },
      { name: "Outros", category_type: "expense" as const },
    ]
    const { data: insertedCategories } = await supabaseAdmin
      .from("financial_categories")
      .insert(
        defaultCategories.map((item) => ({
          partner_id: newPartner.id,
          name: item.name,
          category_type: item.category_type,
          parent_id: null,
          is_active: true,
        })),
      )
      .select("id, name")

    const byName = new Map((insertedCategories || []).map((c: any) => [c.name, c.id]))
    const vendasId = byName.get("Vendas")
    const negocioId = byName.get("Negócio")

    const defaultSubcategories: Array<{ name: string; parent_id: string; category_type: "income" | "expense" }> = []
    if (vendasId) {
      defaultSubcategories.push(
        { name: "Produtos", parent_id: vendasId as string, category_type: "income" },
        { name: "Serviços", parent_id: vendasId as string, category_type: "income" },
      )
    }
    if (negocioId) {
      defaultSubcategories.push(
        { name: "Marketing", parent_id: negocioId as string, category_type: "expense" },
        { name: "Ferramentas", parent_id: negocioId as string, category_type: "expense" },
      )
    }
    if (defaultSubcategories.length > 0) {
      await supabaseAdmin.from("financial_categories").insert(
        defaultSubcategories.map((item) => ({
          partner_id: newPartner.id,
          name: item.name,
          parent_id: item.parent_id,
          category_type: item.category_type,
          is_active: true,
        })),
      )
    }

    revalidateTag(TAGS.userAccess(userId), "max")
    revalidatePath("/erp")

    return { success: true, partnerId: newPartner.id }

  } catch (err: any) {
    console.error("Erro ao criar parceiro:", err)
    return { success: false, error: err.message || "Erro desconhecido ao criar parceiro." }
  }
}

export async function getPartnerOrderBumps(partnerId: string, limit = 5, storeId?: string) {
  const supabase = getAdminClient()
  let q = supabase
    .from("products")
    .select("id, name, price, promotional_price, images, stock_available, availability_value, availability_unit, status")
    .eq("partner_id", partnerId)
    .eq("status", "ativo")
    .eq("moderation_status", "approved")
    .eq("show_in_marketplace", true)
    .gt("stock_available", 0)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (storeId) q = q.eq("store_id", storeId)
  const { data: rawData, error } = await q

  if (error) {
    console.error("Error fetching order bumps:", error)
    return []
  }
  let data = rawData || []
  if (data.length > 0) {
    const visibleIds = await filterMarketplaceVisibleProducts(data.map((p: any) => p.id))
    data = data.filter((p: any) => visibleIds.has(p.id))
  }
  return data
}

