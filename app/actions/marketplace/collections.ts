"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { moderateProductContent } from "@/lib/moderation/product-moderation"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"
import { AVATAR_COLORS, getBannerUrlByColor } from "@/lib/utils/avatar"
import { isUuid } from "@/lib/utils/short-id"

// ─── Types ──────────────────────────────────────────────────────────────────

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string }

export async function createCollection(name: string, description?: string): Promise<ActionResult<{ id: string; short_id?: string }>> {
  try {
    await requireRateLimit(RateLimitCategory.COLLECTION_CREATE)
    const user = await requireUser()

    if (!name || name.trim().length < 2) {
      return { success: false, error: "Nome deve ter pelo menos 2 caracteres" }
    }
    if (name.length > 50) {
      return { success: false, error: "Nome deve ter no máximo 50 caracteres" }
    }
    if (description && description.length > 500) {
      return { success: false, error: "Descrição deve ter no máximo 500 caracteres" }
    }

    const moderation = await moderateProductContent({ name, description })
    if (!moderation.valid) {
      return { success: false, error: moderation.error || "Conteúdo não aprovado" }
    }

    // Pick random color and matching banner (like stores/partners)
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    const bannerUrl = getBannerUrlByColor(randomColor)

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("collections")
      .insert({ name: name.trim(), description: description?.trim() || null, author_id: user.id, cover_url: bannerUrl, banner_color: randomColor })
      .select("id, short_id")
      .single()

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.colecoes)
    return { success: true, data: { id: data.id, short_id: data.short_id } }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao criar coleção" }
  }
}


export async function updateCollection(id: string, name: string, description?: string): Promise<ActionResult> {
  try {
    const user = await requireUser()

    if (!name || name.trim().length < 2) {
      return { success: false, error: "Nome deve ter pelo menos 2 caracteres" }
    }
    if (name.length > 50) {
      return { success: false, error: "Nome deve ter no máximo 50 caracteres" }
    }
    if (description && description.length > 500) {
      return { success: false, error: "Descrição deve ter no máximo 500 caracteres" }
    }

    const moderation = await moderateProductContent({ name, description })
    if (!moderation.valid) {
      return { success: false, error: moderation.error || "Conteúdo não aprovado" }
    }

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase
      .from("collections")
      .update({ name: name.trim(), description: description?.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("author_id", user.id)

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.colecoes)
    await safeRevalidateTag(TAGS.colecao(id))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar coleção" }
  }
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("id", id)
      .eq("author_id", user.id)

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.colecoes)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao excluir coleção" }
  }
}

export async function addItemToCollection(
  collectionId: string,
  itemType: "product" | "service",
  itemId: string
): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: collection } = await supabase
      .from("collections")
      .select("author_id, items_count")
      .eq("id", collectionId)
      .single()

    if (!collection) return { success: false, error: "Coleção não encontrada" }
    if (collection.author_id !== user.id) return { success: false, error: "Acesso negado" }

    const { error } = await supabase
      .from("collection_items")
      .insert({ collection_id: collectionId, item_type: itemType, item_id: itemId, sort_order: collection.items_count })

    if (error) {
      if (error.code === "23505") return { success: false, error: "Item já está na coleção" }
      return { success: false, error: error.message }
    }

    await safeRevalidateTag(TAGS.colecoes)
    await safeRevalidateTag(TAGS.colecao(collectionId))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao adicionar item" }
  }
}

export async function removeItemFromCollection(collectionId: string, itemId: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: collection } = await supabase
      .from("collections")
      .select("author_id")
      .eq("id", collectionId)
      .single()

    if (!collection) return { success: false, error: "Coleção não encontrada" }
    if (collection.author_id !== user.id) return { success: false, error: "Acesso negado" }

    const { error } = await supabase
      .from("collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .eq("item_id", itemId)

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.colecao(collectionId))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao remover item" }
  }
}

export async function reorderCollectionItems(collectionId: string, orderedIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: collection } = await supabase
      .from("collections")
      .select("author_id")
      .eq("id", collectionId)
      .single()

    if (!collection) return { success: false, error: "Coleção não encontrada" }
    if (collection.author_id !== user.id) return { success: false, error: "Acesso negado" }

    const updates = orderedIds.map((id, index) => ({
      id,
      collection_id: collectionId,
      sort_order: index,
    }))

    for (const item of updates) {
      const { error } = await supabase
        .from("collection_items")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id)
        .eq("collection_id", collectionId)
      if (error) return { success: false, error: error.message }
    }

    await safeRevalidateTag(TAGS.colecao(collectionId))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao reordenar itens" }
  }
}

export async function getItemCollectionIds(userId: string, itemType: string, itemId: string): Promise<string[]> {
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from("collection_items")
    .select("collection_id, collections!inner(author_id)")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .eq("collections.author_id", userId)

  if (!data) return []
  return data.map((ci: any) => ci.collection_id)
}

export async function getCollection(id: string) {
  const supabase = getAdminClient()

  let query = supabase
    .from("collections")
    .select(`
      *,
      items:collection_items(
        id,
        item_type,
        item_id,
        sort_order
      )
    `)

  if (isUuid(id)) {
    query = query.eq("id", id)
  } else {
    query = query.eq("short_id", id)
  }

  const { data: collection, error } = await query.maybeSingle()


  if (error) {
    console.error("getCollection error:", error)
    return null
  }

  if (collection?.author_id) {
    const { data: author } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .eq("user_id", collection.author_id)
      .maybeSingle()

    collection.author = author
      ? { id: author.user_id, full_name: author.full_name, avatar_url: null }
      : null
  }

  return collection
}

export async function getUserCollections(userId: string, cursor?: string, limit = 20) {
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("collections")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt("created_at", cursor)
  }

  const { data } = await query
  const hasMore = data ? data.length > limit : false
  const items = data ? data.slice(0, limit) : []
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null

  return { items, nextCursor, hasMore }
}

export async function getCommunityCollections(cursor?: string, limit = 20) {
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("collections")
    .select("*")
    .order("views_count", { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt("created_at", cursor)
  }

  const { data } = await query
  const hasMore = data ? data.length > limit : false
  const items = data ? data.slice(0, limit) : []
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null

  if (items.length > 0) {
    const authorIds = [...new Set(items.map((c: any) => c.author_id).filter(Boolean))]
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds)

      const authorMap = new Map((authors || []).map((a: any) => [a.user_id, a]))
      for (const item of items) {
        const profile: any = authorMap.get(item.author_id)
        item.author = profile
          ? { id: profile.user_id, full_name: profile.full_name, avatar_url: null }
          : null
      }
    }
  }

  return { items, nextCursor, hasMore }
}

export async function getCollectionItems(collectionId: string, storeId?: string) {
  const supabase = await getSupabaseServerClient()

  const { data: links } = await supabase
    .from("collection_items")
    .select("id, item_type, item_id, sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })

  if (!links || links.length === 0) return { items: [], links: [] }

  const productIds = links.filter((l: any) => l.item_type === "product").map((l: any) => l.item_id)
  const serviceIds = links.filter((l: any) => l.item_type === "service").map((l: any) => l.item_id)

  const [productsRes, servicesRes] = await Promise.all([
    productIds.length > 0
      ? (() => {
          let q = supabase
            .rpc("get_marketplace_products_public", {
              p_product_ids: productIds,
              p_store_id: storeId || null,
            })
          return q
        })()
      : Promise.resolve({ data: [] }),
    serviceIds.length > 0
      ? (() => {
          let q = supabase
            .from("services")
            .select(`
              id, name, price, images, rating, created_at, billing_unit, price_type,
              partners(id),
              stores!inner(id, name, slug, logo_url, banner_url, addresses!store_id!left(city, state)),
              show_price_in_store
            `)
            .in("id", serviceIds)
            .eq("is_active", true)
          if (storeId) q = q.eq("store_id", storeId)
          return q
        })()
      : Promise.resolve({ data: [] }),
  ])

  let productsData = (productsRes.data || []) as any[]
  let servicesData = (servicesRes.data || []) as any[]

  if (productsData.length > 0) {
    const visibleProductIds = await filterMarketplaceVisibleProducts(productsData.map((p: any) => p.id))
    productsData = productsData.filter((p: any) => visibleProductIds.has(p.id))
  }
  if (servicesData.length > 0) {
    const visibleServiceIds = await filterMarketplaceVisibleServices(servicesData.map((s: any) => s.id))
    servicesData = servicesData.filter((s: any) => visibleServiceIds.has(s.id))
  }

  // Normalize products for ItemCard compatibility
  const productMap = new Map<string, any>()
  for (const p of productsData) {
    const rawPartner = p.partner_id ? { id: p.partner_id } : null
    const rawStore = p.store_id
      ? {
          id: p.store_id,
          name: p.store_name,
          slug: p.store_slug,
          logo_url: p.store_logo_url,
          banner_url: p.store_banner_url,
          addresses: [{ city: p.store_city, state: p.store_state }],
        }
      : null
    const storeName = rawStore?.name || "Vendedor"
    const storeImage = rawStore?.logo_url || null
    const storeCity = rawStore?.addresses?.[0]?.city || null
    const storeState = rawStore?.addresses?.[0]?.state || null
    const partner = rawPartner
      ? {
          ...rawPartner,
          store_name: storeName,
          store_image_url: storeImage,
          store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
          city: storeCity,
          state: storeState,
        }
      : null

    const variants = p.variants || p.product_variants || []
    const activeVariants = variants.filter((v: any) => v.is_active !== false)
    const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
    const fallbackImage = withImage?.variant_options?.image || null
    const prices = (activeVariants.length > 0 ? activeVariants : variants)
      .map((v: any) => Number(v.price_adjustment || 0))
      .filter((pr: number) => pr > 0)
    const fallbackPrice = prices.length > 0 ? Math.min(...prices) : null

    const { variants: _variants, product_variants: _pv, ...rest } = p
    const basePrice = Number(p.promotional_price || p.price || 0)
    const price = (!p.promotional_price && fallbackPrice)
      ? Number(fallbackPrice)
      : (basePrice > 0 ? basePrice : Number(fallbackPrice || 0))
    const originalPrice = p.promotional_price
      ? (Number(p.price) > 0 ? Number(p.price) : (fallbackPrice ? Number(fallbackPrice) : undefined))
      : undefined

    productMap.set(p.id, {
      ...rest,
      category: p.category_name || null,
      itemType: "produto",
      partners: partner,
      fallback_variant_price: fallbackPrice,
      fallback_variant_image: fallbackImage,
      originalPrice,
      price,
    })
  }

  // Normalize services for ItemCard compatibility
  const serviceMap = new Map<string, any>()
  for (const s of servicesData) {
    const rawPartner = Array.isArray(s.partners) ? s.partners[0] : s.partners
    const rawStore = Array.isArray(s.stores) ? s.stores[0] : s.stores
    const storeName = rawStore?.name || "Vendedor"
    const storeImage = rawStore?.logo_url || null
    const storeCity = rawStore?.addresses?.[0]?.city || null
    const storeState = rawStore?.addresses?.[0]?.state || null
    const partner = rawPartner
      ? {
          ...rawPartner,
          store_name: storeName,
          store_image_url: storeImage,
          store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
          city: storeCity,
          state: storeState,
        }
      : null

    serviceMap.set(s.id, {
      ...s,
      itemType: "servico",
      partners: partner,
      price: Number(s.price),
    })
  }

  const items = links
    .map((link: any) => {
      if (link.item_type === "product") return productMap.get(link.item_id) || null
      if (link.item_type === "service") return serviceMap.get(link.item_id) || null
      return null
    })
    .filter(Boolean)

  return { items, links }
}

export async function recordCollectionView(id: string): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient()
    await supabase.rpc("increment_collection_views", { p_collection_id: id })
  } catch {
    // fire-and-forget: view counting never blocks
  }
}
