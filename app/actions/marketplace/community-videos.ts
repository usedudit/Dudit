"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { moderateProductContent } from "@/lib/moderation/product-moderation"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getR2PublicUrl } from "@/lib/r2/r2-server-config"
import { resolveCityAndStateFromSlug } from "./products"

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string }

export interface CommunityVideoItem {
  id: string
  partner_id: string
  store_id?: string | null
  title: string | null
  description: string | null
  video_url: string
  video_thumbnail: string
  duration: number
  linked_item_type: "product" | "service" | "collection" | null
  linked_item_id: string | null
  moderation_status: string
  views_count: number
  clicks_count: number
  orders_origin_count: number
  published_at: string | null
  created_at: string
  linked_collection_short_id?: string | null
   partner?: { name: string; store_name: string; store_image_url: string | null; short_id?: string | null; id?: string | null; slug?: string | null; city?: string | null; state?: string | null }
}

export async function getCommunityVideos(citySlug?: string, cursor?: string, limit = 20): Promise<{
  items: CommunityVideoItem[]
  nextCursor: string | null
  hasMore: boolean
}> {
  const supabase = await getSupabaseServerClient()
  const admin = getAdminClient()

  // If a city slug is provided, find partner_ids for stores in that city first
  let cityPartnerIds: string[] | undefined
  if (citySlug && citySlug !== "brasil" && !citySlug.startsWith("estado-")) {
    const resolved = await resolveCityAndStateFromSlug(citySlug)
    if (resolved) {
      const { data: cityStores } = await admin
        .from("stores")
        .select("partner_id, addresses!store_id!inner(city, state)")
        .eq("is_active", true)
        .eq("addresses.city", resolved.city)
        .eq("addresses.state", resolved.state)

      const ids = (cityStores || []).map((s: any) => s.partner_id).filter(Boolean)
      // If no stores found in this city, return empty immediately
      if (ids.length === 0) {
        return { items: [], nextCursor: null, hasMore: false }
      }
      cityPartnerIds = ids
    }
  } else if (citySlug && citySlug.startsWith("estado-")) {
    const uf = citySlug.replace("estado-", "").toUpperCase()
    const { data: stateStores } = await admin
      .from("stores")
      .select("partner_id, addresses!store_id!inner(state)")
      .eq("is_active", true)
      .eq("addresses.state", uf)

    const ids = (stateStores || []).map((s: any) => s.partner_id).filter(Boolean)
    if (ids.length === 0) {
      return { items: [], nextCursor: null, hasMore: false }
    }
    cityPartnerIds = ids
  }

  let query = supabase
    .from("community_videos")
    .select("*")
    .eq("moderation_status", "approved")
    .order("published_at", { ascending: false })
    .limit(limit + 1)

  // Filter by city partners if available
  if (cityPartnerIds && cityPartnerIds.length > 0) {
    query = query.in("partner_id", cityPartnerIds)
  }

  if (cursor) {
    query = query.lt("published_at", cursor)
  }

  const { data } = await query
  const hasMore = data ? data.length > limit : false
  const items = data ? data.slice(0, limit) as CommunityVideoItem[] : []
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].published_at : null

  // Fetch store data separately to avoid PostgREST schema cache issues
  if (items.length > 0) {
    const partnerIds = [...new Set(items.map((i) => i.partner_id).filter(Boolean))]
    const storeIds = [...new Set(items.map((i) => i.store_id).filter(Boolean))]

    if (partnerIds.length > 0 || storeIds.length > 0) {
      let storeQuery = admin
        .from("stores")
        .select("id, short_id, slug, name, logo_url, partner_id, addresses!store_id!left(city, state)")
        .eq("is_active", true)

      // Build filter conditions separately for each ID type
      const conditions: string[] = []
      if (storeIds.length > 0) {
        conditions.push(`id.in.(${storeIds.join(",")})`)
      }
      if (partnerIds.length > 0) {
        conditions.push(`partner_id.in.(${partnerIds.join(",")})`)
      }

      if (conditions.length === 1) {
        // Single condition - use eq/in directly
        if (storeIds.length > 0 && partnerIds.length === 0) {
          storeQuery = storeQuery.in("id", storeIds)
        } else if (partnerIds.length > 0 && storeIds.length === 0) {
          storeQuery = storeQuery.in("partner_id", partnerIds)
        }
      } else if (conditions.length > 1) {
        // Multiple conditions - use or
        storeQuery = storeQuery.or(conditions.join(","))
      }

      const { data: stores, error: storeError } = await storeQuery

      if (storeError) {
        console.error("[getCommunityVideos] Store query error:", storeError)
      }

      type StoreRow = { id: string; name: string | null; logo_url: string | null; partner_id: string; short_id: string | null; slug: string | null; addresses?: { city: string | null; state: string | null }[] | null }
      const storeByPartnerMap = new Map<string, StoreRow>()
      const storeByIdMap = new Map<string, StoreRow>()

      for (const s of (stores || [])) {
        if (s.id) storeByIdMap.set(s.id, s as StoreRow)
        if (s.partner_id && !storeByPartnerMap.has(s.partner_id)) storeByPartnerMap.set(s.partner_id, s as StoreRow)
      }

      for (const item of items) {
        const s = (item.store_id ? storeByIdMap.get(item.store_id) : null) || storeByPartnerMap.get(item.partner_id)
        const storeName = s?.name || "Loja parceira"
        item.partner = {
            name: storeName,
            store_name: storeName,
            store_image_url: s?.logo_url || null,
            short_id: s?.short_id || null,
            id: s?.id || null,
            slug: s?.slug || null,
            city: s?.addresses?.[0]?.city || null,
            state: s?.addresses?.[0]?.state || null,
        }
      }
    }
  }

  return { items, nextCursor, hasMore }
}

export async function getPartnerCommunityVideos(partnerId: string, cursor?: string, limit = 20): Promise<{
  items: CommunityVideoItem[]
  nextCursor: string | null
  hasMore: boolean
}> {
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("community_videos")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt("created_at", cursor)
  }

  const { data } = await query
  const hasMore = data ? data.length > limit : false
  const items = data ? data.slice(0, limit) as CommunityVideoItem[] : []
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null

  if (items.length > 0) {
    const collectionItems = items.filter(i => i.linked_item_type === "collection" && i.linked_item_id)
    if (collectionItems.length > 0) {
      const { data: collections } = await supabase
        .from("collections")
        .select("id, short_id")
        .in("id", collectionItems.map(i => i.linked_item_id!))

      const colMap = new Map((collections || []).map(c => [c.id, c.short_id]))
      for (const item of collectionItems) {
        item.linked_collection_short_id = colMap.get(item.linked_item_id!) || null
      }
    }
  }

  return { items, nextCursor, hasMore }
}

export async function createCommunityVideo(data: {
  title?: string
  description?: string
  videoUrl: string
  videoThumbnail: string
  duration: number
  storeId?: string | null
  linkedItemType?: "product" | "service" | "collection" | null
  linkedItemId?: string | null
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRateLimit(RateLimitCategory.COMMUNITY_VIDEO_UPLOAD)
    const user = await requireUser()

    const supabase = await getSupabaseServerClient()
    const { data: partner } = await supabase
      .from("partners")
      .select("id, user_id")
      .eq("user_id", user.id)
      .single()

    if (!partner) return { success: false, error: "Partner não encontrado" }

    const plan = await getPartnerPlan(partner.id)
    const planSlug = plan.slug

    if (!hasMinimumPlan(planSlug, "crescer")) {
      return { success: false, error: "Vídeos da comunidade não disponíveis no seu plano. Faça upgrade para Crescer ou Escalar." }
    }

    const admin = getAdminClient()
    const { data: monthlyCount } = await admin.rpc("get_partner_video_monthly_count", { p_partner_id: partner.id })
    const { data: weeklyCount } = await admin.rpc("get_partner_video_weekly_count", { p_partner_id: partner.id })

    if (planSlug === "crescer" && monthlyCount >= 1) {
      return { success: false, error: "Limite do plano Crescer: 1 vídeo por mês. Faça upgrade para Escalar para publicar mais." }
    }
    if (planSlug === "escalar" && weeklyCount >= 1) {
      return { success: false, error: "Limite do plano Escalar: 1 vídeo por semana." }
    }

    const textsToModerate: string[] = []
    if (data.title?.trim()) textsToModerate.push(data.title.trim())
    if (data.description?.trim()) textsToModerate.push(data.description.trim())

    if (textsToModerate.length > 0) {
      const moderation = await moderateProductContent({
        name: data.title,
        description: data.description,
      })
      if (!moderation.valid) {
        return { success: false, error: moderation.error || "Conteúdo não aprovado pela moderação" }
      }
    }

    const { data: video, error } = await supabase
      .from("community_videos")
      .insert({
        partner_id: partner.id,
        store_id: data.storeId || null,
        title: data.title?.trim().substring(0, 150) || null,
        description: data.description?.trim() || null,
        video_url: data.videoUrl,
        video_thumbnail: data.videoThumbnail,
        duration: data.duration,
        linked_item_type: data.linkedItemType || null,
        linked_item_id: data.linkedItemId || null,
        moderation_status: "pending_moderation",
      })
      .select("id")
      .single()

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.communityVideos)
    return { success: true, data: { id: video.id } }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao criar vídeo" }
  }
}

export async function updateCommunityVideo(
  id: string,
  data: { title?: string; description?: string }
): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!partner) return { success: false, error: "Partner não encontrado" }

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (data.title !== undefined) updateData.title = data.title.trim().substring(0, 150) || null
    if (data.description !== undefined) updateData.description = data.description.trim() || null

    const { error } = await supabase
      .from("community_videos")
      .update(updateData)
      .eq("id", id)
      .eq("partner_id", partner.id)

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.communityVideo(id))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar vídeo" }
  }
}

export async function deleteCommunityVideo(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!partner) return { success: false, error: "Partner não encontrado" }

    const { error } = await supabase
      .from("community_videos")
      .delete()
      .eq("id", id)
      .eq("partner_id", partner.id)

    if (error) return { success: false, error: error.message }

    await safeRevalidateTag(TAGS.communityVideos)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao excluir vídeo" }
  }
}

export async function deleteCommunityVideosInBatch(ids: string[]): Promise<ActionResult> {
    try {
        const user = await requireUser()
        const supabase = await getSupabaseServerClient()

        const { data: partner } = await supabase
            .from("partners")
            .select("id")
            .eq("user_id", user.id)
            .single()

        if (!partner) return { success: false, error: "Partner não encontrado" }

        const { error } = await supabase
            .from("community_videos")
            .delete()
            .eq("partner_id", partner.id)
            .in("id", ids)

        if (error) return { success: false, error: error.message }

        await safeRevalidateTag(TAGS.communityVideos)
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao excluir vídeos" }
    }
}

export async function recordVideoView(id: string): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient()
    await supabase.rpc("increment_community_video_views", { p_video_id: id })
  } catch {
    // fire-and-forget
  }
}

export async function recordVideoClick(id: string): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient()
    await supabase.rpc("increment_community_video_clicks", { p_video_id: id })
  } catch {
    // fire-and-forget
  }
}
