"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { moderateProductContent } from "@/lib/moderation/product-moderation"

// ─── Types ──────────────────────────────────────────────────────────────────

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string }

export async function createCollection(name: string, description?: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRateLimit(RateLimitCategory.COLLECTION_CREATE)
    const user = await requireUser()

    if (!name || name.trim().length < 2) {
      return { success: false, error: "Nome deve ter pelo menos 2 caracteres" }
    }
    if (name.length > 100) {
      return { success: false, error: "Nome deve ter no máximo 100 caracteres" }
    }
    if (description && description.length > 500) {
      return { success: false, error: "Descrição deve ter no máximo 500 caracteres" }
    }

    const moderation = await moderateProductContent({ name, description })
    if (!moderation.valid) {
      return { success: false, error: moderation.error || "Conteúdo não aprovado" }
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("collections")
      .insert({ name: name.trim(), description: description?.trim() || null, author_id: user.id })
      .select("id")
      .single()

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.colecoes)
    return { success: true, data: { id: data.id } }
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
    if (name.length > 100) {
      return { success: false, error: "Nome deve ter no máximo 100 caracteres" }
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

  const { data: collection, error } = await supabase
    .from("collections")
    .select(`
      *,
      author:author_id(id, full_name, avatar_url),
      items:collection_items(
        id,
        item_type,
        item_id,
        sort_order
      )
    `)
    .eq("id", id)
    .single()

  if (error) {
    console.error("getCollection error:", error)
    return null
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
    .select(`
      *,
      author:author_id(id, full_name, avatar_url)
    `)
    .order("views_count", { ascending: false })
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

export async function getCollectionItems(collectionId: string) {
  const supabase = await getSupabaseServerClient()

  const { data: links } = await supabase
    .from("collection_items")
    .select("id, item_type, item_id, sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })

  if (!links || links.length === 0) return { items: [], links: [] }

  const productIds = links.filter((l: any) => l.item_type === "product").map((l: any) => l.item_id)
  const serviceIds = links.filter((l: any) => l.item_type === "service").map((l: any) => l.item_id)

  const [productsData, servicesData] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("products")
          .select("id, name, price, promotional_price, images, rating, condition, created_at, partners!inner(store_name, store_avatar)")
          .in("id", productIds)
          .eq("is_active", true)
          .then((r: any) => r.data || [])
      : Promise.resolve([]),
    serviceIds.length > 0
      ? supabase
          .from("services")
          .select("id, name, price, images, rating, created_at, partners!inner(store_name, store_avatar)")
          .in("id", serviceIds)
          .eq("is_active", true)
          .then((r: any) => r.data || [])
      : Promise.resolve([]),
  ])

  const productMap = new Map(productsData.map((p: any) => [p.id, { ...p, _type: "product" as const }]))
  const serviceMap = new Map(servicesData.map((s: any) => [s.id, { ...s, _type: "service" as const }]))

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
