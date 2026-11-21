"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { revalidatePath } from "next/cache"
import { isValidUuid, resolveStoreIdsByName, sanitizeIlike } from "@/lib/admin/search-helpers"

export interface AdminVideoStats {
    total: number
    approved: number
    pending: number
    rejected: number
}

export async function getAdminCommunityVideosStats(): Promise<AdminVideoStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const [totalRes, approvedRes, pendingRes, rejectedRes] = await Promise.all([
        admin.from("community_videos").select("id", { count: "exact", head: true }),
        admin.from("community_videos").select("id", { count: "exact", head: true }).eq("moderation_status", "approved"),
        admin.from("community_videos").select("id", { count: "exact", head: true }).eq("moderation_status", "pending"),
        admin.from("community_videos").select("id", { count: "exact", head: true }).eq("moderation_status", "rejected"),
    ])

    return {
        total: totalRes.count || 0,
        approved: approvedRes.count || 0,
        pending: pendingRes.count || 0,
        rejected: rejectedRes.count || 0,
    }
}

export async function getAdminCommunityVideos(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        status?: string
        statuses?: string[]
        search?: string
        title?: string
        storeName?: string
        startDate?: string
        endDate?: string
    }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 100)

    const storeIds = await resolveStoreIdsByName(admin, filters?.storeName)
    if (storeIds !== null && storeIds.length === 0) {
        return { data: [], nextCursor: null, prevCursor: cursor || null, hasMore: false }
    }

    let query = admin
        .from("community_videos")
        .select(`
            id,
            partner_id,
            store_id,
            title,
            description,
            video_url,
            video_thumbnail,
            duration,
            moderation_status,
            views_count,
            clicks_count,
            published_at,
            created_at,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (storeIds !== null) {
        query = query.in("store_id", storeIds)
    }

    if (filters?.title && filters.title.trim().length > 0) {
        const s = sanitizeIlike(filters.title)
        if (s) query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`)
    }

    if (filters?.search && filters.search.trim().length > 0) {
        const raw = filters.search.trim()
        const s = sanitizeIlike(raw)
        if (s) {
            const parts = [`title.ilike.%${s}%`, `description.ilike.%${s}%`]
            if (isValidUuid(raw)) parts.push(`id.eq.${raw}`)
            query = query.or(parts.join(","))
        }
    }

    if (filters?.statuses && filters.statuses.length > 0) {
        query = query.in("moderation_status", filters.statuses)
    } else if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
        query = query.eq("moderation_status", filters.status)
    }

    if (filters?.startDate) {
        query = query.gte("created_at", filters.startDate)
    }
    if (filters?.endDate) {
        query = query.lte("created_at", filters.endDate)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data, error } = await query
    if (error) throw error

    const items = ((data || []) as any[]).map((row: any) => ({
        ...row,
        thumbnail_url: row.video_thumbnail || null,
        video_thumbnail: row.video_thumbnail || null,
        likes_count: row.clicks_count || 0,
        store_name: row.stores?.name || "Loja Parceira",
        partner_name: row.stores?.name || "Loja Parceira",
    }))
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

export async function updateAdminCommunityVideo(
    videoId: string,
    updates: {
        moderation_status?: "approved" | "pending" | "rejected"
        title?: string
        description?: string
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("community_videos")
        .select("id, partner_id, store_id, title, moderation_status")
        .eq("id", videoId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Vídeo não encontrado." }
    }

    const payloadToUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
    }

    if (updates.moderation_status !== undefined) payloadToUpdate.moderation_status = updates.moderation_status
    if (updates.title !== undefined) payloadToUpdate.title = sanitizeInput(updates.title)
    if (updates.description !== undefined) payloadToUpdate.description = sanitizeNotes(updates.description)

    const { error: updateErr } = await admin
        .from("community_videos")
        .update(payloadToUpdate)
        .eq("id", videoId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Apply Admin Action Context (Notification to seller + Audit Log + Risk Score)
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.COMMUNITY_VIDEO_UPDATE,
        targetType: "community_video",
        targetId: videoId,
        metadata: {
            previousStatus: current.moderation_status,
            newStatus: updates.moderation_status || current.moderation_status,
            changedFields: actionContext?.changedFields || Object.keys(updates),
            reason: actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "community_video",
        targetId: videoId,
        actionTitle: `Vídeo "${current.title || videoId}" atualizado pela administração`,
        entityLabel: "Vídeo da Comunidade",
        entityName: current.title || videoId,
        sellerUrl: `/erp/videos`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/videos")
    return { success: true }
}

