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

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string }

export interface CommunityVideoItem {
  id: string
  partner_id: string
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
  partner?: { name: string; store_image_url: string | null }
}

export async function getCommunityVideos(cursor?: string, limit = 20): Promise<{
  items: CommunityVideoItem[]
  nextCursor: string | null
  hasMore: boolean
}> {
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("community_videos")
    .select("*")
    .eq("moderation_status", "approved")
    .order("published_at", { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt("published_at", cursor)
  }

  const { data } = await query
  const hasMore = data ? data.length > limit : false
  const items = data ? data.slice(0, limit) as CommunityVideoItem[] : []
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].published_at : null

  // Fetch partner data separately to avoid PostgREST schema cache issues
  if (items.length > 0) {
    const partnerIds = [...new Set(items.map((i) => i.partner_id).filter(Boolean))]
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from("stores")
        .select("id, name, store_image_url, partner_id")
        .in("partner_id", partnerIds)

      type PartnerRow = { id: string; name: string | null; store_image_url: string | null; partner_id: string }
      const partnerMap = new Map<string, PartnerRow>((partners || []).map((p: PartnerRow) => [p.partner_id, p]))
      for (const item of items) {
        const p = partnerMap.get(item.partner_id)
        if (p) {
          item.partner = { name: p.name ?? "", store_image_url: p.store_image_url }
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

  return { items, nextCursor, hasMore }
}

export async function createCommunityVideo(data: {
  title?: string
  description?: string
  videoUrl: string
  videoThumbnail: string
  duration: number
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
        title: data.title?.trim() || null,
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
    if (data.title !== undefined) updateData.title = data.title.trim() || null
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
