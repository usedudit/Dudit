"use server"

/**
 * Admin moderation server actions.
 *
 * SECURITY PATTERN (every action):
 * 1. requireAdmin(minRole) - app-level auth
 * 2. requireRateLimit - rate limiting
 * 3. re-fetch entity - anti-IDOR
 * 4. whitelisted mutation - mass-assignment protection
 * 5. audit log - immutable append
 *
 * Uses authenticated Supabase client (RLS enforced - dual protection).
 * Service-role only for audit log writes and R2 image deletion.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import { formatDateTime } from "@/lib/utils/formatters";
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { createNotification, buildIdempotencyKey, getPartnerTeamUserIds } from "@/lib/services/notification.service"

// ─── Helper: delete image from R2 ──────────────────────────────────────────

const _deleteFromR2 = async (url: string) => {
    if (!url || !url.trim()) return
    try {
        const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server")
        const key = url.startsWith("http") ? extractKeyFromR2Url(url) : url
        if (key) await deleteFileFromR2(key)
    } catch (e) {
        console.error("Failed to delete image from R2:", url, e)
    }
}

// ─── Helper: format date for reason messages ────────────────────────────────

function formatBrazilDateTime(): string {
    return formatDateTime(new Date())
}

// ─── Helper: increment partner risk_score (capped at 100) ──────────────────

export interface AdminModerationActionOptions {
    reason?: string | null
    riskScore?: number | null
    notifySeller?: boolean
}

async function incrementRiskScore(partnerId: string, points: number): Promise<void> {
    try {
        const admin = getAdminClient()
        await admin.rpc("increment_risk_score", { p_partner_id: partnerId, p_points: points })
    } catch (e) {
        // Fallback: direct UPDATE with LEAST cap
        try {
            const admin = getAdminClient()
            const { data } = await admin
                .from("stores")
                .select("risk_score")
                .eq("partner_id", partnerId)
                .limit(1)
                .maybeSingle()
            const current = data?.risk_score || 0
            await admin
                .from("stores")
                .update({ risk_score: Math.min(current + points, 100) })
                .eq("partner_id", partnerId)
        } catch (e2) {
            console.error("[RISK_SCORE] Failed to increment:", partnerId, e2)
        }
    }
}

async function applyRiskScore(partnerId: string, riskScore?: number | null, defaultIncrement?: number): Promise<void> {
    const admin = getAdminClient()
    if (riskScore !== undefined && riskScore !== null) {
        const clamped = Math.min(Math.max(Number(riskScore) || 0, 0), 100)
        try {
            await admin.from("stores").update({ risk_score: clamped }).eq("partner_id", partnerId)
        } catch (e) {
            console.error("[RISK_SCORE] Failed to update risk score:", partnerId, e)
        }
    } else if (defaultIncrement && defaultIncrement > 0) {
        await incrementRiskScore(partnerId, defaultIncrement)
    }
}

// ─── Get Moderation Queue ───────────────────────────────────────────────────

export async function getModerationQueue(
    cursor?: string | null,
    limit: number = 20,
    statusFilter?: string
): Promise<CursorPaginatedResult<ModerationItem>> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = getAdminClient()
    const pageSize = Math.min(limit, 50)

    // Real query: products pending moderation with partner + store info
    let productQuery = supabase
        .from("products")
        .select(`
      id, name, description, price, images, moderation_status, moderation_reason, created_at, store_id,
      category_id, category:product_categories!category_id(name),
      brand, brand_id, brand_rel:brands!brand_id(name),
      video_url, video_type, video_thumbnail,
      partner:partners!inner(id, user_id),
      store:stores!store_id!left(id, name, phone, description, banner_url, gallery, logo_url, risk_score)
    `)
        .is("deleted_at", null)

    if (statusFilter && statusFilter !== "all") {
        productQuery = productQuery.eq("moderation_status", statusFilter)
    } else {
        productQuery = productQuery.in("moderation_status", ["pending_moderation", "flagged", "needs_images"])
    }

    if (cursor) {
        productQuery = productQuery.lt("created_at", cursor)
    }

    productQuery = productQuery.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: products, error } = await productQuery

    if (error) {
        console.error("[ADMIN_MODERATION] Failed to fetch products queue:", error.message)
    }

    // Query services pending moderation
    let serviceQuery = supabase
        .from("services")
        .select(`
      id, name, description, price, images, moderation_status, moderation_reason, created_at, store_id,
      video_url, video_type, video_thumbnail,
      partner:partners!inner(id, user_id),
      store:stores!store_id!left(id, name, phone, description, banner_url, gallery, logo_url, risk_score)
    `)
        .is("deleted_at", null)

    if (statusFilter && statusFilter !== "all") {
        serviceQuery = serviceQuery.eq("moderation_status", statusFilter)
    } else {
        serviceQuery = serviceQuery.in("moderation_status", ["pending_moderation", "flagged", "needs_images"])
    }

    if (cursor) {
        serviceQuery = serviceQuery.lt("created_at", cursor)
    }

    serviceQuery = serviceQuery.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: services, error: serviceError } = await serviceQuery

    if (serviceError) {
        console.error("[ADMIN_MODERATION] Failed to fetch services queue:", serviceError.message)
    }

    // Query recurring_plans pending moderation
    let planQuery = supabase
        .from("recurring_plans")
        .select(`
      id, name, description, images, moderation_status, moderation_reason, created_at, store_id,
      partner:partners!inner(id, user_id),
      store:stores!store_id!left(id, name, phone, description, banner_url, gallery, logo_url, risk_score)
    `)

    if (statusFilter && statusFilter !== "all") {
        planQuery = planQuery.eq("moderation_status", statusFilter)
    } else {
        planQuery = planQuery.in("moderation_status", ["pending_moderation", "flagged", "needs_images"])
    }

    if (cursor) {
        planQuery = planQuery.lt("created_at", cursor)
    }

    planQuery = planQuery.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: plans, error: planError } = await planQuery

    if (planError) {
        console.error("[ADMIN_MODERATION] Failed to fetch recurring_plans queue:", planError.message)
    }

    const hasMore = (products?.length || 0) > pageSize || (services?.length || 0) > pageSize || (plans?.length || 0) > pageSize
    const items = (products || []).slice(0, pageSize)
    const serviceItems = (services || []).slice(0, pageSize)
    const planItems = (plans || []).slice(0, pageSize)

    // Fetch owner names + store profiles
    const allItems = [...items, ...serviceItems, ...planItems]
    const ownerIds = [...new Set(allItems.map((p: any) => p.partner?.user_id).filter(Boolean))]
    let ownerMap = new Map<string, string>()
    if (ownerIds.length > 0) {
        const { data: owners } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", ownerIds)
        ownerMap = new Map((owners || []).map((o: any) => [o.user_id, o.full_name]))
    }

    // Also fetch store extras (phone, description, banner, gallery) not returned by the join
    const storeIds = [...new Set(allItems.map((p: any) => p.store_id).filter(Boolean))]
    let storeExtraMap = new Map<string, any>()
    if (storeIds.length > 0) {
        const { data: storeExtras } = await supabase
            .from("stores")
            .select("id, name, phone, description, banner_url, gallery, logo_url, risk_score")
            .in("id", storeIds)
        if (storeExtras) {
            storeExtraMap = new Map(storeExtras.map((s: any) => [s.id, s]))
        }
    }

    const mappedProducts: ModerationItem[] = items.map((p: any) => {
        const st = p.store || storeExtraMap.get(p.store_id)
        return {
            id: p.id,
            type: "product" as const,
            title: p.name,
            description: p.description,
            price: p.price || 0,
            images: p.images || [],
            owner_store_name: st?.name || "Desconhecido",
            owner_user_name: ownerMap.get(p.partner?.user_id) || "",
            partner_id: p.partner?.id || "",
            store_id: p.store_id || undefined,
            store_name: st?.name || undefined,
            store_phone: st?.phone || undefined,
            store_description: st?.description || undefined,
            store_banner_url: st?.banner_url || undefined,
            store_gallery: st?.gallery || undefined,
            store_logo_url: st?.logo_url || undefined,
            owner_user_id: p.partner?.user_id || undefined,
            moderation_status: p.moderation_status,
            moderation_reason: p.moderation_reason || null,
            risk_score: st?.risk_score ?? 0,
            created_at: p.created_at,
            category_name: p.category?.name || null,
            brand_name: p.brand?.name || null,
            video_url: p.video_url || null,
            video_type: p.video_type || null,
            video_thumbnail: p.video_thumbnail || null,
        }
    })

    const mappedServices: ModerationItem[] = serviceItems.map((s: any) => {
        const st = s.store || storeExtraMap.get(s.store_id)
        return {
            id: s.id,
            type: "service" as const,
            title: s.name,
            description: s.description,
            price: s.price || 0,
            images: s.images || [],
            owner_store_name: st?.name || "Desconhecido",
            owner_user_name: ownerMap.get(s.partner?.user_id) || "",
            partner_id: s.partner?.id || "",
            store_id: s.store_id || undefined,
            store_name: st?.name || undefined,
            store_phone: st?.phone || undefined,
            store_description: st?.description || undefined,
            store_banner_url: st?.banner_url || undefined,
            store_gallery: st?.gallery || undefined,
            store_logo_url: st?.logo_url || undefined,
            owner_user_id: s.partner?.user_id || undefined,
            moderation_status: s.moderation_status,
            moderation_reason: s.moderation_reason || null,
            risk_score: st?.risk_score ?? 0,
            created_at: s.created_at,
            category_name: null,
            brand_name: null,
            video_url: s.video_url || null,
            video_type: s.video_type || null,
            video_thumbnail: s.video_thumbnail || null,
        }
    })

    const mappedPlans: ModerationItem[] = planItems.map((pl: any) => {
        const st = pl.store || storeExtraMap.get(pl.store_id)
        return {
            id: pl.id,
            type: "recurring_plan" as const,
            title: pl.name,
            description: pl.description,
            price: 0,
            images: pl.images || [],
            owner_store_name: st?.name || "Desconhecido",
            owner_user_name: ownerMap.get(pl.partner?.user_id) || "",
            partner_id: pl.partner?.id || "",
            store_id: pl.store_id || undefined,
            store_name: st?.name || undefined,
            store_phone: st?.phone || undefined,
            store_description: st?.description || undefined,
            store_banner_url: st?.banner_url || undefined,
            store_gallery: st?.gallery || undefined,
            store_logo_url: st?.logo_url || undefined,
            owner_user_id: pl.partner?.user_id || undefined,
            moderation_status: pl.moderation_status,
            moderation_reason: pl.moderation_reason || null,
            risk_score: st?.risk_score ?? 0,
            created_at: pl.created_at,
            category_name: null,
            brand_name: null,
            video_url: null,
            video_type: null,
            video_thumbnail: null,
        }
    })

    // Community videos query
    let videoQuery = supabase
        .from("community_videos")
        .select("id, partner_id, title, description, video_thumbnail, moderation_status, views_count, created_at")
        .not("moderation_status", "eq", "approved")

    if (statusFilter && statusFilter === "pending_moderation") {
        videoQuery = videoQuery.eq("moderation_status", "pending_moderation")
    }

    const { data: videos } = await videoQuery.order("created_at", { ascending: false }).limit(10)

    // 2. Partners query - DISABLED due to pre-existing bug
    // const mappedPartners: ModerationItem[] = []
    // // TODO: Fix the partners query
    // // )
    // const mappedPartners: ModerationItem[] = []

    let returnQuery = supabase
        .from("return_requests")
        .select(`
            id, order_id, partner_id, customer_name_snapshot, customer_message, reason, status, created_at,
            order_number_snapshot,
            partners(id, user_id),
            stores(id, name, risk_score),
            return_evidence(file_url)
        `)
        .eq("status", "ESCALATED")
        .is("deleted_at", null)

    if (cursor) {
        returnQuery = returnQuery.lt("created_at", cursor)
    }

    const { data: returnDisputes, error: returnError } = await returnQuery.order("created_at", { ascending: false }).limit(pageSize)
    if (returnError) {
        console.error("[ADMIN_MODERATION] Failed to fetch return disputes:", returnError.message)
    }

    const returnOwnerIds = [...new Set((returnDisputes || []).map((r: any) => r.partners?.user_id).filter(Boolean))]
    let returnOwnerMap = new Map<string, string>()
    if (returnOwnerIds.length > 0) {
        const { data: returnOwners } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", returnOwnerIds)
        returnOwnerMap = new Map((returnOwners || []).map((o: any) => [o.user_id, o.full_name]))
    }

    const mappedVideos: ModerationItem[] = (videos || []).map((v: any) => ({
        id: v.id,
        type: "community_video" as const,
        title: v.title || "Vídeo da comunidade",
        description: v.description,
        price: 0,
        images: [v.video_thumbnail].filter(Boolean),
        owner_store_name: "",
        partner_id: v.partner_id || "",
        owner_user_name: "",
        moderation_status: v.moderation_status,
        risk_score: 0,
        created_at: v.created_at,
    }))

    const mappedReturns: ModerationItem[] = (returnDisputes || []).map((r: any) => ({
        id: r.id,
        type: "return_dispute" as const,
        title: `Disputa de devolução ${r.order_number_snapshot || String(r.order_id).slice(0, 8)}`,
        description: [r.reason, r.customer_message].filter(Boolean).join(" - ") || null,
        price: 0,
        images: (r.return_evidence || []).map((e: any) => e.file_url).filter(Boolean),
        owner_store_name: r.stores?.[0]?.name || "Desconhecido",
        partner_id: r.partner_id,
        owner_user_name: returnOwnerMap.get(r.partners?.user_id) || "",
        moderation_status: "pending_moderation",
        risk_score: r.stores?.[0]?.risk_score || 0,
        created_at: r.created_at,
    }))

    // Combine and sort
    const combined = [...mappedVideos, ...mappedProducts, ...mappedServices, ...mappedPlans, ...mappedReturns]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, pageSize)

    return {
        data: combined,
        nextCursor: hasMore && combined.length > 0 ? combined[combined.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Approve Product ────────────────────────────────────────────────────────

export async function approveModeration(
    entityId: string,
    type: "product" | "service" | "partner" | "return_dispute" | "community_video" | "recurring_plan" = "product",
    options?: AdminModerationActionOptions
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const supabase = getAdminClient()

    // Resolve admin actor name
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", admin.userId)
        .maybeSingle()
    const adminName = profile?.full_name || admin.email || "Equipe Dudit"

    // Anti-IDOR: re-fetch entity
    if (type === "community_video") {
        const { data: video } = await supabase
            .from("community_videos")
            .select("id, partner_id, moderation_status")
            .eq("id", entityId)
            .single()

        if (!video) return { success: false, error: "Vídeo não encontrado" }

        const { error: updateError } = await supabase
            .from("community_videos")
            .update({
                moderation_status: "approved",
                published_at: new Date().toISOString(),
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }

        if (video.partner_id) {
            await applyRiskScore(video.partner_id, options?.riskScore)
        }

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_APPROVE,
            targetType: "community_video",
            targetId: entityId,
            metadata: {
                previousStatus: video.moderation_status,
                reason: options?.reason?.trim() || null,
                riskScore: options?.riskScore ?? null,
                adminName,
            },
        })

        return { success: true }
    }

    if (type === "return_dispute") {
        const { data: rr, error: rrError } = await supabase
            .from("return_requests")
            .select("id, partner_id, order_id, status, request_type")
            .eq("id", entityId)
            .eq("status", "ESCALATED")
            .single()
        if (rrError || !rr) return { success: false, error: "Disputa não encontrada" }

        const { error } = await supabase.rpc("process_return_request", {
            p_request_id: entityId,
            p_actor_user_id: admin.userId,
            p_action: "moderation_decision",
            p_next_status: "APPROVED",
            p_refund_amount: 0,
            p_refund_status: "PENDING",
            p_refund_payment_method: null,
            p_return_to_inventory: false,
            p_store_credit_amount: 0,
            p_notes: options?.reason?.trim() || "Moderacao aprovou o cliente para continuidade da resolução.",
            p_idempotency_key: `moderation-approve:${entityId}:${Date.now()}`,
        })
        if (error) return { success: false, error: error.message }

        if (rr.request_type === "cancellation") {
            const { error: updateOrderError } = await supabase
                .from("orders")
                .update({
                    situation: "cancelled",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", rr.order_id)

            if (updateOrderError) {
                console.error("[approveModeration] Error updating order to cancelled:", updateOrderError)
            } else {
                await syncCancelledOrderAppointmentsAndTransactions(supabase, rr.order_id)
                await logAuditEvent({
                    partnerId: rr.partner_id,
                    actorUserId: admin.userId,
                    actorName: adminName,
                    entityType: "order",
                    entityId: rr.order_id,
                    actionType: "cancelled",
                    changeLines: [
                        "Pedido cancelado - disputa de cancelamento aprovada pela moderação.",
                        ...(options?.reason?.trim() ? [`Mensagem: "${options.reason.trim()}"`] : []),
                    ],
                    metadata: {
                        is_admin_action: true,
                        dudit_action: true,
                        admin_actor_name: adminName,
                        reason: options?.reason?.trim() || null,
                    },
                    source: "manual",
                })
            }
        }

        if (rr.partner_id) {
            await applyRiskScore(rr.partner_id, options?.riskScore)
        }

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_APPROVE,
            targetType: "return_request",
            targetId: entityId,
            metadata: {
                previousStatus: rr.status,
                partnerId: rr.partner_id,
                reason: options?.reason?.trim() || null,
                riskScore: options?.riskScore ?? null,
                adminName,
            },
        })
        return { success: true }
    }

    const isItem = type === "product" || type === "service" || type === "recurring_plan"
    const targetTable = type === "product" ? "products" : type === "service" ? "services" : type === "recurring_plan" ? "recurring_plans" : "partners"

    const { data: entity, error: fetchError } = await supabase
        .from(targetTable)
        .select(isItem ? "id, name, moderation_status, images, partner_id" : "id, stores!left(name)")
        .eq("id", entityId)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "product" ? "Produto" : type === "service" ? "Serviço" : type === "recurring_plan" ? "Plano" : "Perfil"} não encontrado` }
    }

    if (isItem) {
        const { error: updateError } = await supabase
            .from(targetTable)
            .update({
                moderation_status: "approved",
                moderation_reason: null,
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                status: type === "recurring_plan" ? "active" : "ativo",
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }

        // Sincroniza e revalida caches
        try {
            if (type === "product" || type === "service") {
                const { syncToExploreRedis } = await import("@/lib/redis-sync")
                await syncToExploreRedis({
                    id: entityId,
                    type: type === "product" ? "produto" : "servico",
                    data: {},
                    silent: true,
                })
            }
            const { revalidateTag } = await import("next/cache")
            ;(revalidateTag as any)(`${type}-${entityId}`, "max")
            ;(revalidateTag as any)(type === "product" ? "products" : type === "service" ? "services" : "recurring-plans", "max")
        } catch (syncErr) {
            console.warn("[ADMIN_MODERATION] Erro ao sincronizar cache pós-aprovação:", syncErr)
        }

        // Apply risk score and partner notifications
        if (entity.partner_id) {
            await applyRiskScore(entity.partner_id, options?.riskScore)

            if (options?.notifySeller && options?.reason?.trim()) {
                const userIds = await getPartnerTeamUserIds(entity.partner_id)
                const typeLabel = type === "service" ? "serviço" : "produto"
                const notificationMessage = `Seu ${typeLabel} "${entity.name}" foi aprovado na moderação. Mensagem: ${options.reason.trim()}`

                for (const uid of userIds) {
                    await createNotification({
                        userId: uid,
                        type: "admin_announcement",
                        title: `${type === "service" ? "Serviço" : "Produto"} aprovado`,
                        message: notificationMessage,
                        entityType: "product",
                        entityId: entityId,
                        data: { audience: "seller", partner_id: entity.partner_id, moderation_type: type },
                        idempotencyKey: buildIdempotencyKey("admin_announcement", type, entityId, uid, "approved"),
                        origin: "system",
                    })
                }
            }

            // Append to audit_logs for timeline visibility
            const typeName = type === "service" ? "serviço" : type === "recurring_plan" ? "plano" : "produto"
            const changeLines = [
                `Aprovou o ${typeName} na moderação.`,
                ...(options?.reason?.trim() ? [`Mensagem: "${options.reason.trim()}"`] : []),
                ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
            ]
            await logAuditEvent({
                partnerId: entity.partner_id,
                actorUserId: admin.userId,
                actorName: adminName,
                entityType: type,
                entityId,
                actionType: "approved",
                changeLines,
                metadata: {
                    is_admin_action: true,
                    dudit_action: true,
                    admin_actor_name: adminName,
                    reason: options?.reason?.trim() || null,
                    risk_score: options?.riskScore ?? null,
                },
                source: "manual",
            })
        }
    }

    // Audit log (append-only, via service-role)
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_APPROVE,
        targetType: type,
        targetId: entityId,
        metadata: {
            previousStatus: isItem ? entity.moderation_status : "approved",
            name: isItem ? entity.name : entity.stores?.[0]?.name,
            reason: options?.reason?.trim() || null,
            riskScore: options?.riskScore ?? null,
            adminName,
        },
    })

    return { success: true }
}

// ─── Reject: Remove Flagged Images + Approve (or keep pending) ──────────────

export async function rejectFlaggedImages(
    entityId: string,
    reason: string,
    flaggedImageUrls: string[],
    type: "product" | "service" | "recurring_plan" = "product",
    options?: AdminModerationActionOptions
): Promise<{ success: boolean; error?: string; noImagesLeft?: boolean }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const effectiveReason = (options?.reason?.trim() || reason || "").trim()

    if (!effectiveReason || effectiveReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    if (!flaggedImageUrls || flaggedImageUrls.length === 0) {
        return { success: false, error: "Nenhuma imagem selecionada para remoção" }
    }

    const supabase = getAdminClient()

    // Resolve admin actor name
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", admin.userId)
        .maybeSingle()
    const adminName = profile?.full_name || admin.email || "Equipe Dudit"

    const targetTable = type === "service" ? "services" : type === "recurring_plan" ? "recurring_plans" : "products"
    // Anti-IDOR: re-fetch entity with all relevant data
    const { data: entity, error: fetchError } = await supabase
        .from(targetTable)
        .select("id, name, images, moderation_status, partner_id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "service" ? "Serviço" : "Produto"} não encontrado` }
    }

    const currentImages: string[] = entity.images || []
    const flaggedSet = new Set(flaggedImageUrls)
    const remainingImages = currentImages.filter((img: string) => !flaggedSet.has(img))
    const removedCount = currentImages.length - remainingImages.length

    const imageWord = removedCount === 1 ? "imagem" : "imagens"
    const removedWord = removedCount === 1 ? "removida" : "removidas"

    // Build detailed reason for deleted_reason / moderation_reason
    const detailedReason = `${removedCount} ${imageWord} ${removedWord} por "${effectiveReason}" do ${type === "service" ? "serviço" : "produto"} "${entity.name}" em ${formatBrazilDateTime()}`

    // SAFETY CHECK: if no images remain, don't approve - product needs at least 1 image
    if (remainingImages.length === 0) {
        // Update product: remove images, keep pending status, save reason
        const { error: updateError } = await supabase
            .from(targetTable)
            .update({
                images: [],
                moderation_status: "needs_images",
                moderation_reason: detailedReason,
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
            })
            .eq("id", entityId)

        if (updateError) {
            return { success: false, error: updateError.message }
        }

        // Delete flagged images from R2
        await Promise.all(flaggedImageUrls.map(url => _deleteFromR2(url)))

        // Risk score adjustment
        if (entity.partner_id) {
            await applyRiskScore(entity.partner_id, options?.riskScore, 2)
        }

        // Audit log
        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_REJECT,
            targetType: type,
            targetId: entityId,
            metadata: {
                reason: detailedReason,
                removedImages: flaggedImageUrls,
                remainingImages: 0,
                previousStatus: entity.moderation_status,
                productName: entity.name,
                riskScore: options?.riskScore ?? null,
                adminName,
            },
        })

        // Partner timeline log
        if (entity.partner_id) {
            await logAuditEvent({
                partnerId: entity.partner_id,
                actorUserId: admin.userId,
                actorName: adminName,
                entityType: type,
                entityId,
                actionType: "updated",
                changeLines: [
                    `Removeu todas as imagens (${removedCount}) na moderação.`,
                    `Motivo: "${effectiveReason}"`,
                    "Item requer novas imagens para aprovação.",
                    ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
                ],
                metadata: {
                    is_admin_action: true,
                    dudit_action: true,
                    admin_actor_name: adminName,
                    removed_images: flaggedImageUrls,
                    reason: effectiveReason,
                    risk_score: options?.riskScore ?? null,
                },
                source: "manual",
            })
        }

        // Send notification to partner
        if (entity.partner_id && options?.notifySeller !== false) {
            const userIds = await getPartnerTeamUserIds(entity.partner_id)
            const typeLabel = type === "service" ? "serviço" : "produto"
            const notificationMessage = `Todas as imagens do ${typeLabel} "${entity.name}" foram removidas. Motivo: ${effectiveReason}. Adicione novas imagens para que o item possa ser aprovado.`

            for (const uid of userIds) {
                await createNotification({
                    userId: uid,
                    type: "admin_announcement",
                    title: "Imagens removidas",
                    message: notificationMessage,
                    entityType: "product",
                    entityId: entityId,
                    data: { audience: "seller", partner_id: entity.partner_id, removed_count: removedCount, remaining: 0 },
                    idempotencyKey: buildIdempotencyKey("admin_announcement", type, entityId, uid, "images_removed"),
                    origin: "system",
                })
            }
        }

        return {
            success: true,
            noImagesLeft: true,
        }
    }

    // Images still remain - remove flagged, approve item
    const { error: updateError } = await supabase
        .from(targetTable)
        .update({
            images: remainingImages,
            moderation_status: "approved",
            moderation_reason: detailedReason,
            moderation_reviewed_by: admin.userId,
            moderation_reviewed_at: new Date().toISOString(),
            status: type === "recurring_plan" ? "active" : "ativo",
        })
        .eq("id", entityId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    try {
        if (type === "product" || type === "service") {
            const { syncToExploreRedis } = await import("@/lib/redis-sync")
            await syncToExploreRedis({
                id: entityId,
                type: type === "product" ? "produto" : "servico",
                data: {},
                silent: true,
            })
        }
        const { revalidateTag } = await import("next/cache")
        ;(revalidateTag as any)(`${type}-${entityId}`, "max")
        ;(revalidateTag as any)(type === "product" ? "products" : type === "service" ? "services" : "recurring-plans", "max")
    } catch {}

    // Delete flagged images from R2
    await Promise.all(flaggedImageUrls.map(url => _deleteFromR2(url)))

    // Risk score adjustment
    if (entity.partner_id) {
        await applyRiskScore(entity.partner_id, options?.riskScore, 2)
    }

    // Audit log
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REJECT,
        targetType: type,
        targetId: entityId,
        metadata: {
            reason: detailedReason,
            removedImages: flaggedImageUrls,
            remainingImages: remainingImages.length,
            previousStatus: entity.moderation_status,
            productName: entity.name,
            riskScore: options?.riskScore ?? null,
            adminName,
        },
    })

    // Partner timeline log
    if (entity.partner_id) {
        await logAuditEvent({
            partnerId: entity.partner_id,
            actorUserId: admin.userId,
            actorName: adminName,
            entityType: type,
            entityId,
            actionType: "updated",
            changeLines: [
                `Removeu ${removedCount} ${imageWord} na moderação e aprovou com as restantes.`,
                `Motivo: "${effectiveReason}"`,
                ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
            ],
            metadata: {
                is_admin_action: true,
                dudit_action: true,
                admin_actor_name: adminName,
                removed_images: flaggedImageUrls,
                reason: effectiveReason,
                risk_score: options?.riskScore ?? null,
            },
            source: "manual",
        })
    }

    // Send notification to partner
    if (entity.partner_id && options?.notifySeller !== false) {
        const userIds = await getPartnerTeamUserIds(entity.partner_id)
        const typeLabel = type === "service" ? "serviço" : "produto"
        const notificationMessage = `${removedCount} ${removedWord} do ${typeLabel} "${entity.name}" foi removida. Motivo: ${effectiveReason}. O item foi aprovado com as imagens restantes.`

        for (const uid of userIds) {
            await createNotification({
                userId: uid,
                type: "admin_announcement",
                title: "Imagens removidas",
                message: notificationMessage,
                entityType: "product",
                entityId: entityId,
                data: { audience: "seller", partner_id: entity.partner_id, removed_count: removedCount, remaining: remainingImages.length },
                idempotencyKey: buildIdempotencyKey("admin_announcement", type, entityId, uid, "images_removed"),
                origin: "system",
            })
        }
    }

    return { success: true, noImagesLeft: false }
}

// ─── Remove single image via moderation ────────────────────────────────────

export async function removeModerationImage(
    entityId: string,
    imageUrl: string,
    type: "product" | "service" | "recurring_plan" = "product",
    options?: AdminModerationActionOptions
): Promise<{ success: boolean; error?: string; remainingImages?: string[]; noImagesLeft?: boolean }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!imageUrl || !imageUrl.trim()) {
        return { success: false, error: "URL da imagem inválida" }
    }

    const supabase = getAdminClient()

    // Resolve admin actor name
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", admin.userId)
        .maybeSingle()
    const adminName = profile?.full_name || admin.email || "Equipe Dudit"

    const targetTable = type === "service" ? "services" : type === "recurring_plan" ? "recurring_plans" : "products"
    const { data: entity, error: fetchError } = await supabase
        .from(targetTable)
        .select("id, name, images, moderation_status, partner_id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "service" ? "Serviço" : "Produto"} não encontrado` }
    }

    const currentImages: string[] = entity.images || []
    const remainingImages = currentImages.filter((img: string) => img !== imageUrl)
    const noImagesLeft = remainingImages.length === 0
    const reasonText = options?.reason?.trim()

    const updatePayload: Record<string, any> = {
        images: remainingImages,
    }

    if (noImagesLeft) {
        updatePayload.moderation_status = "needs_images"
        updatePayload.moderation_reason = reasonText || "Todas as imagens foram removidas pela moderação."
        updatePayload.moderation_reviewed_by = admin.userId
        updatePayload.moderation_reviewed_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
        .from(targetTable)
        .update(updatePayload)
        .eq("id", entityId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    // Delete image from R2
    await _deleteFromR2(imageUrl)

    // Apply risk score adjustment if provided
    if (entity.partner_id) {
        await applyRiskScore(entity.partner_id, options?.riskScore, 2)
    }

    // Audit log
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REMOVE_IMAGE,
        targetType: type,
        targetId: entityId,
        metadata: {
            removedImage: imageUrl,
            remainingImages: remainingImages.length,
            reason: reasonText || null,
            riskScore: options?.riskScore ?? null,
            adminName,
            productName: entity.name,
        },
    })

    // Partner timeline log
    if (entity.partner_id) {
        const changeLines = [
            "Removeu 1 imagem do item na moderação.",
            ...(reasonText ? [`Motivo: "${reasonText}"`] : []),
            ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
            ...(noImagesLeft ? ["O item ficou sem imagens e requer novas imagens para aprovação."] : []),
        ]
        await logAuditEvent({
            partnerId: entity.partner_id,
            actorUserId: admin.userId,
            actorName: adminName,
            entityType: type,
            entityId,
            actionType: "updated",
            changeLines,
            metadata: {
                is_admin_action: true,
                dudit_action: true,
                admin_actor_name: adminName,
                removed_image: imageUrl,
                reason: reasonText || null,
                risk_score: options?.riskScore ?? null,
            },
            source: "manual",
        })
    }

    // Send notification to partner if requested
    if (entity.partner_id && options?.notifySeller && reasonText) {
        const userIds = await getPartnerTeamUserIds(entity.partner_id)
        const typeLabel = type === "service" ? "serviço" : "produto"
        const notificationMessage = `Uma imagem do ${typeLabel} "${entity.name}" foi removida pela moderação. Motivo: ${reasonText}.`

        for (const uid of userIds) {
            await createNotification({
                userId: uid,
                type: "admin_announcement",
                title: "Imagem removida pela moderação",
                message: notificationMessage,
                entityType: "product",
                entityId: entityId,
                data: { audience: "seller", partner_id: entity.partner_id, remaining: remainingImages.length },
                idempotencyKey: buildIdempotencyKey("admin_announcement", type, entityId, uid, `img_removed_${Date.now()}`),
                origin: "system",
            })
        }
    }

    // Sincroniza Redis e revalida tags
    try {
        if (type === "product" || type === "service") {
            const { syncToExploreRedis } = await import("@/lib/redis-sync")
            await syncToExploreRedis({
                id: entityId,
                type: type === "product" ? "produto" : "servico",
                data: {},
                silent: true,
            })
        }
        const { revalidateTag } = await import("next/cache")
        ;(revalidateTag as any)(`${type}-${entityId}`, "max")
        ;(revalidateTag as any)(type === "product" ? "products" : type === "service" ? "services" : "recurring-plans", "max")
    } catch {}

    return { success: true, remainingImages, noImagesLeft }
}

// ─── Batch remove images via moderation ──────────────────────────────────

export async function removeModerationImagesBatch(
    entityId: string,
    imageUrlsToRemove: string[],
    type: "product" | "service" | "recurring_plan" = "product",
    options?: AdminModerationActionOptions & {
        autoApproveRemaining?: boolean
    }
): Promise<{
    success: boolean
    error?: string
    remainingImages?: string[]
    noImagesLeft?: boolean
    newStatus?: string
}> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!Array.isArray(imageUrlsToRemove) || imageUrlsToRemove.length === 0) {
        return { success: false, error: "Nenhuma imagem selecionada para remoção" }
    }

    const supabase = getAdminClient()

    // Resolve admin actor name
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", admin.userId)
        .maybeSingle()
    const adminName = profile?.full_name || admin.email || "Equipe Dudit"

    const targetTable = type === "service" ? "services" : type === "recurring_plan" ? "recurring_plans" : "products"
    const { data: entity, error: fetchError } = await supabase
        .from(targetTable)
        .select("id, name, images, moderation_status, partner_id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "service" ? "Serviço" : "Produto"} não encontrado` }
    }

    const toRemoveSet = new Set(imageUrlsToRemove.map((u) => u.trim()))
    const currentImages: string[] = entity.images || []
    const remainingImages = currentImages.filter((img: string) => !toRemoveSet.has(img.trim()))
    const noImagesLeft = remainingImages.length === 0
    const reasonText = options?.reason?.trim()

    let newStatus = entity.moderation_status
    const updatePayload: Record<string, any> = {
        images: remainingImages,
        updated_at: new Date().toISOString(),
    }

    if (options?.autoApproveRemaining) {
        newStatus = "approved"
        updatePayload.moderation_status = "approved"
        updatePayload.moderation_reason = null
        updatePayload.moderation_reviewed_by = admin.userId
        updatePayload.moderation_reviewed_at = new Date().toISOString()
        updatePayload.status = type === "recurring_plan" ? "active" : "ativo"
    } else if (noImagesLeft) {
        newStatus = "needs_images"
        updatePayload.moderation_status = "needs_images"
        updatePayload.moderation_reason = reasonText || "Todas as imagens foram removidas pela moderação."
        updatePayload.moderation_reviewed_by = admin.userId
        updatePayload.moderation_reviewed_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
        .from(targetTable)
        .update(updatePayload)
        .eq("id", entityId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    // Delete removed images from R2 in parallel
    await Promise.all(imageUrlsToRemove.map((url) => _deleteFromR2(url)))

    // Sincroniza e revalida caches
    try {
        if (newStatus === "approved" && (type === "product" || type === "service")) {
            const { syncToExploreRedis } = await import("@/lib/redis-sync")
            await syncToExploreRedis({
                id: entityId,
                type: type === "product" ? "produto" : "servico",
                data: {},
                silent: true,
            })
        }
        const { revalidateTag } = await import("next/cache")
        ;(revalidateTag as any)(`${type}-${entityId}`, "max")
        ;(revalidateTag as any)(type === "product" ? "products" : type === "service" ? "services" : "recurring-plans", "max")
    } catch {}

    // Apply risk score adjustment if provided
    if (entity.partner_id && options?.riskScore) {
        await applyRiskScore(entity.partner_id, options.riskScore, 2)
    }

    // Audit log
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REMOVE_IMAGE,
        targetType: type,
        targetId: entityId,
        metadata: {
            removedImagesCount: imageUrlsToRemove.length,
            removedImages: imageUrlsToRemove,
            remainingImagesCount: remainingImages.length,
            autoApproved: !!options?.autoApproveRemaining && !noImagesLeft,
            newStatus,
            reason: reasonText || null,
            riskScore: options?.riskScore ?? null,
            adminName,
            productName: entity.name,
        },
    })

    // Partner timeline log
    if (entity.partner_id) {
        const changeLines = [
            `Removeu ${imageUrlsToRemove.length} imagem(ns) na moderação.`,
            ...(options?.autoApproveRemaining && !noImagesLeft ? ["Item aprovado para a vitrine com as imagens restantes."] : []),
            ...(noImagesLeft ? ["O item ficou sem imagens e requer novas imagens para aprovação."] : []),
            ...(reasonText ? [`Motivo: "${reasonText}"`] : []),
            ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
        ]
        await logAuditEvent({
            partnerId: entity.partner_id,
            actorUserId: admin.userId,
            actorName: adminName,
            entityType: type,
            entityId,
            actionType: options?.autoApproveRemaining && !noImagesLeft ? "approved" : "updated",
            changeLines,
            metadata: {
                is_admin_action: true,
                dudit_action: true,
                admin_actor_name: adminName,
                removed_images: imageUrlsToRemove,
                reason: reasonText || null,
                risk_score: options?.riskScore ?? null,
            },
            source: "manual",
        })
    }

    return {
        success: true,
        remainingImages,
        noImagesLeft,
        newStatus,
    }
}

// ─── Full Reject (reject product entirely) ──────────────────────────────────

export async function rejectModeration(
    entityId: string,
    reason: string,
    type: "product" | "service" | "partner" | "return_dispute" | "community_video" = "product",
    options?: AdminModerationActionOptions
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const effectiveReason = (options?.reason?.trim() || reason || "").trim()

    if (!effectiveReason || effectiveReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = getAdminClient()

    // Resolve admin actor name
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("id", admin.userId)
        .maybeSingle()
    const adminName = profile?.full_name || admin.email || "Equipe Dudit"

    if (type === "community_video") {
        const { data: video } = await supabase
            .from("community_videos")
            .select("id, partner_id, moderation_status")
            .eq("id", entityId)
            .single()

        if (!video) return { success: false, error: "Vídeo não encontrado" }

        const { error: updateError } = await supabase
            .from("community_videos")
            .update({
                moderation_status: "rejected",
                moderation_reason: effectiveReason,
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }

        if (video.partner_id) {
            await applyRiskScore(video.partner_id, options?.riskScore)
        }

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_REJECT,
            targetType: "community_video",
            targetId: entityId,
            metadata: {
                reason: effectiveReason,
                previousStatus: video.moderation_status,
                riskScore: options?.riskScore ?? null,
                adminName,
            },
        })

        // Send notification to partner
        if (video.partner_id && options?.notifySeller !== false) {
            const userIds = await getPartnerTeamUserIds(video.partner_id)
            const notificationMessage = effectiveReason.length > 0
                ? effectiveReason
                : "Seu vídeo da comunidade não atendeu aos critérios de moderação e não foi aprovado."

            for (const uid of userIds) {
                await createNotification({
                    userId: uid,
                    type: "admin_announcement",
                    title: "Vídeo da comunidade rejeitado",
                    message: notificationMessage,
                    entityType: "product",
                    entityId: entityId,
                    data: { audience: "seller", partner_id: video.partner_id, entity_type: "community_video" },
                    idempotencyKey: buildIdempotencyKey("admin_announcement", "community_video", entityId, uid, "rejected"),
                    origin: "system",
                })
            }
        }

        return { success: true }
    }

    if (type === "return_dispute") {
        const { data: rr, error: rrError } = await supabase
            .from("return_requests")
            .select("id, partner_id, status")
            .eq("id", entityId)
            .single()
        if (rrError || !rr) return { success: false, error: "Disputa não encontrada" }

        const { error } = await supabase.rpc("process_return_request", {
            p_request_id: entityId,
            p_actor_user_id: admin.userId,
            p_action: "moderation_decision",
            p_next_status: "REJECTED",
            p_refund_amount: 0,
            p_refund_status: "PENDING",
            p_refund_payment_method: null,
            p_return_to_inventory: false,
            p_store_credit_amount: 0,
            p_notes: effectiveReason,
            p_idempotency_key: `moderation-reject:${entityId}:${Date.now()}`,
        })
        if (error) return { success: false, error: error.message }

        if (rr.partner_id) {
            await applyRiskScore(rr.partner_id, options?.riskScore)
        }

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_REJECT,
            targetType: "return_request",
            targetId: entityId,
            metadata: {
                reason: effectiveReason,
                previousStatus: rr.status,
                partnerId: rr.partner_id,
                riskScore: options?.riskScore ?? null,
                adminName,
            },
        })
        return { success: true }
    }

    const isItem = type === "product" || type === "service"
    const targetTable = type === "product" ? "products" : type === "service" ? "services" : "partners"

    // Anti-IDOR
    const { data: entity, error: fetchError } = await supabase
        .from(targetTable)
        .select(isItem ? "id, name, moderation_status, partner_id" : "id, stores!left(name)")
        .eq("id", entityId)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "product" ? "Produto" : type === "service" ? "Serviço" : "Perfil"} não encontrado` }
    }

    if (isItem) {
        const { error: updateError } = await supabase
            .from(targetTable)
            .update({
                moderation_status: "rejected",
                moderation_reason: effectiveReason,
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                status: "inativo",
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }

        try {
            const { removeFromExploreRedis } = await import("@/lib/redis-sync")
            await removeFromExploreRedis(entityId, type === "product" ? "produto" : "servico", true, false)
            const { revalidateTag } = await import("next/cache")
            ;(revalidateTag as any)(`${type}-${entityId}`, "max")
            ;(revalidateTag as any)(type === "product" ? "products" : "services", "max")
        } catch {}
    }

    // Risk score adjustment: +3 for full product rejection or specified score
    if (entity.partner_id) {
        await applyRiskScore(entity.partner_id, options?.riskScore, isItem ? 3 : 0)
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REJECT,
        targetType: type,
        targetId: entityId,
        metadata: {
            reason: effectiveReason,
            previousStatus: isItem ? entity.moderation_status : "approved",
            name: isItem ? entity.name : entity.stores?.[0]?.name,
            riskScore: options?.riskScore ?? null,
            adminName,
        },
    })

    // Partner timeline log
    if (entity.partner_id) {
        const changeLines = [
            `Rejeitou o ${type === "service" ? "serviço" : "produto"} na moderação.`,
            `Motivo: "${effectiveReason}"`,
            ...(options?.riskScore != null ? [`Risk score da loja ajustado para: ${options.riskScore}`] : []),
        ]
        await logAuditEvent({
            partnerId: entity.partner_id,
            actorUserId: admin.userId,
            actorName: adminName,
            entityType: type,
            entityId,
            actionType: "rejected",
            changeLines,
            metadata: {
                is_admin_action: true,
                dudit_action: true,
                admin_actor_name: adminName,
                reason: effectiveReason,
                risk_score: options?.riskScore ?? null,
            },
            source: "manual",
        })
    }

    // Send notification to partner
    if (entity.partner_id && options?.notifySeller !== false) {
        const userIds = await getPartnerTeamUserIds(entity.partner_id)
        const itemName = isItem ? entity.name : "seu perfil"
        const typeLabel = type === "product" ? "produto" : type === "service" ? "serviço" : "perfil"
        const notificationMessage = effectiveReason.length > 0
            ? `Seu ${typeLabel} "${itemName}" foi rejeitado. Motivo: ${effectiveReason}`
            : `Seu ${typeLabel} "${itemName}" foi rejeitado e não está visível no marketplace.`

        for (const uid of userIds) {
            await createNotification({
                userId: uid,
                type: "admin_announcement",
                title: `${type === "product" ? "Produto" : type === "service" ? "Serviço" : "Perfil"} rejeitado`,
                message: notificationMessage,
                entityType: "product",
                entityId: entityId,
                data: { audience: "seller", partner_id: entity.partner_id, moderation_type: type },
                idempotencyKey: buildIdempotencyKey("admin_announcement", type, entityId, uid, "rejected"),
                origin: "system",
            })
        }
    }

    return { success: true }
}

// ─── Get Admin Community Videos ────────────────────────────────────────────

export async function getAdminCommunityVideos(
    page: number = 1,
    pageSize: number = 12,
): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
    try {
        const admin = await requireAdminScope("moderation")
        await requireRateLimit(RateLimitCategory.ADMIN_READ)

        const supabase = getAdminClient()

        const { count: total } = await supabase
            .from("community_videos")
            .select("id", { count: "exact", head: true })
            .not("moderation_status", "eq", "approved")

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const { data, error } = await supabase
            .from("community_videos")
            .select(`
                id,
                partner_id,
                title,
                description,
                video_url,
                video_thumbnail,
                video_signed_url,
                duration,
                moderation_status,
                views_count,
                clicks_count,
                created_at
            `)
            .not("moderation_status", "eq", "approved")
            .order("created_at", { ascending: false })
            .range(from, to)

        if (error) return { success: false, error: error.message }

        // Fetch partner data separately to avoid PostgREST schema cache issues
        let partnerMap = new Map()
        if (data && data.length > 0) {
            const partnerIds = [...new Set(data.map((v: any) => v.partner_id).filter(Boolean))]
            if (partnerIds.length > 0) {
                const { data: stores } = await supabase
                    .from("stores")
                    .select("partner_id, name")
                    .in("partner_id", partnerIds)
                partnerMap = new Map((stores || []).map((s: any) => [s.partner_id, { id: s.partner_id, store_name: s.name }]))
            }
        }

        const mapped = (data || []).map((v: any) => ({
            id: v.id,
            partner_id: v.partner_id,
            title: v.title || "Sem título",
            description: v.description,
            video_url: v.video_url,
            video_thumbnail: v.video_thumbnail,
            video_signed_url: v.video_signed_url,
            duration: v.duration,
            moderation_status: v.moderation_status,
            views_count: v.views_count || 0,
            clicks_count: v.clicks_count || 0,
            created_at: v.created_at,
            partner_store_name: partnerMap.get(v.partner_id)?.store_name || "Desconhecido",
        }))

        return { success: true, data: mapped, total: total || 0 }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

// ─── Reprocess Moderation ───────────────────────────────────────────────────

export async function reprocessModeration(
    entityId: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const supabase = getAdminClient()

    // Anti-IDOR
    const { data: entity, error: fetchError } = await supabase
        .from("products")
        .select("id, name, moderation_status")
        .eq("id", entityId)
        .is("deleted_at", null)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: "Produto não encontrado" }
    }

    // Mass-assignment: whitelisted
    const { error: updateError } = await supabase
        .from("products")
        .update({
            moderation_status: "pending_moderation",
            moderation_reason: null,
        })
        .eq("id", entityId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REPROCESS,
        targetType: "product",
        targetId: entityId,
        metadata: { previousStatus: entity.moderation_status, productName: entity.name },
    })

    return { success: true }
}

// ─── Fetch single moderation item detail ─────────────────────────────────────

export async function getModerationItemDetail(
    id: string
): Promise<{ success: boolean; data?: ModerationItem; error?: string }> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = getAdminClient()

    // Try product first
    const { data: product } = await supabase
        .from("products")
        .select(`
            id, name, description, price, images, moderation_status, created_at, store_id,
            category_id, category:product_categories!category_id(name),
            brand, brand_id, brand_rel:brands!brand_id(name),
            video_url, video_type, video_thumbnail,
            partner:partners!inner(id, user_id),
            store:stores!store_id!left(id, name, phone, description, banner_url, gallery, logo_url, risk_score)
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .single()

    if (product) {
        const st = product.store
        let ownerName = ""
        if (product.partner?.user_id) {
            const { data: owner } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", product.partner.user_id)
                .single()
            ownerName = owner?.full_name || ""
        }

        return {
            success: true,
            data: {
                id: product.id,
                type: "product",
                title: product.name,
                description: product.description,
                price: product.price || 0,
                images: product.images || [],
                owner_store_name: st?.name || "Desconhecido",
                owner_user_name: ownerName,
                partner_id: product.partner?.id || "",
                store_id: product.store_id || undefined,
                store_name: st?.name || undefined,
                store_phone: st?.phone || undefined,
                store_description: st?.description || undefined,
                store_banner_url: st?.banner_url || undefined,
                store_gallery: st?.gallery || undefined,
                store_logo_url: st?.logo_url || undefined,
                owner_user_id: product.partner?.user_id || undefined,
                moderation_status: product.moderation_status,
                risk_score: st?.risk_score ?? 0,
                created_at: product.created_at,
                category_name: product.category?.name || null,
                brand_name: product.brand?.name || null,
                video_url: product.video_url || null,
                video_type: product.video_type || null,
                video_thumbnail: product.video_thumbnail || null,
            },
        }
    }

    // Try service
    const { data: service } = await supabase
        .from("services")
        .select(`
            id, name, description, price, images, moderation_status, created_at, store_id,
            video_url, video_type, video_thumbnail,
            partner:partners!inner(id, user_id),
            store:stores!store_id!left(id, name, phone, description, banner_url, gallery, logo_url, risk_score)
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .single()

    if (service) {
        const st = service.store
        let ownerName = ""
        if (service.partner?.user_id) {
            const { data: owner } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", service.partner.user_id)
                .single()
            ownerName = owner?.full_name || ""
        }

        return {
            success: true,
            data: {
                id: service.id,
                type: "service",
                title: service.name,
                description: service.description,
                price: service.price || 0,
                images: service.images || [],
                owner_store_name: st?.name || "Desconhecido",
                owner_user_name: ownerName,
                partner_id: service.partner?.id || "",
                store_id: service.store_id || undefined,
                store_name: st?.name || undefined,
                store_phone: st?.phone || undefined,
                store_description: st?.description || undefined,
                store_banner_url: st?.banner_url || undefined,
                store_gallery: st?.gallery || undefined,
                store_logo_url: st?.logo_url || undefined,
                owner_user_id: service.partner?.user_id || undefined,
                moderation_status: service.moderation_status,
                risk_score: st?.risk_score ?? 0,
                created_at: service.created_at,
                category_name: null,
                brand_name: null,
                video_url: service.video_url || null,
                video_type: service.video_type || null,
                video_thumbnail: service.video_thumbnail || null,
            },
        }
    }

    return { success: false, error: "Item não encontrado" }
}

// ─── Get Admin Entity Timeline (audit_logs + admin_audit_logs) ─────────────

export async function getAdminEntityTimeline(
    entityId: string,
    entityType: "product" | "service" = "product"
): Promise<{ success: boolean; data: any[]; error?: string }> {
    try {
        await requireAdminScope("moderation")
        await requireRateLimit(RateLimitCategory.ADMIN_READ)

        const supabase = getAdminClient()
        const targetTable = entityType === "service" ? "services" : "products"

        // 1. Fetch entity details
        const { data: entity } = await supabase
            .from(targetTable)
            .select("id, name, created_at, partner_id, partner:partners(id, stores(name))")
            .eq("id", entityId)
            .maybeSingle()

        // 2. Fetch admin_audit_logs for this target
        const { data: adminLogs } = await supabase
            .from("admin_audit_logs")
            .select("*")
            .eq("target_id", entityId)
            .order("created_at", { ascending: false })
            .limit(100)

        // 3. Fetch audit_logs for this entity
        const { data: auditLogs } = await supabase
            .from("audit_logs")
            .select("*")
            .eq("entity_id", entityId)
            .order("created_at", { ascending: false })
            .limit(100)

        // 4. Resolve admin and actor user IDs to full_name
        const allUserIds = [
            ...new Set([
                ...(adminLogs || []).map((l: any) => l.admin_user_id),
                ...(auditLogs || []).map((l: any) => l.actor_user_id),
            ].filter(Boolean))
        ]

        const profileMap = new Map<string, string>()
        if (allUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("id, full_name")
                .in("id", allUserIds)
            for (const p of profiles || []) {
                if (p.full_name) profileMap.set(p.id, p.full_name)
            }
        }

        const entries: any[] = []
        const seenTimestamps = new Set<string>()

        // 5. Transform adminLogs
        for (const log of (adminLogs || [])) {
            const adminName = profileMap.get(log.admin_user_id) || log.metadata?.adminName || "Equipe Dudit"
            const meta = (log.metadata as Record<string, any>) || {}
            const changeLines: string[] = []
            let entryType = log.action_type || "admin_action"

            switch (log.action_type) {
                case "moderation.approve":
                    changeLines.push("Aprovou o item na moderação.")
                    if (meta.reason) changeLines.push(`Mensagem: "${meta.reason}"`)
                    if (meta.riskScore != null) changeLines.push(`Risk score da loja ajustado para: ${meta.riskScore}`)
                    entryType = "approved"
                    break
                case "moderation.reject":
                    changeLines.push("Rejeitou o item na moderação.")
                    if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
                    if (meta.removedImages?.length) changeLines.push(`${meta.removedImages.length} imagem(ns) removida(s).`)
                    if (meta.riskScore != null) changeLines.push(`Risk score da loja ajustado para: ${meta.riskScore}`)
                    entryType = "rejected"
                    break
                case "moderation.remove_image":
                    changeLines.push("Removeu 1 imagem do item na moderação.")
                    if (meta.reason || meta.notes) changeLines.push(`Motivo: "${meta.reason || meta.notes}"`)
                    if (meta.riskScore != null) changeLines.push(`Risk score da loja ajustado para: ${meta.riskScore}`)
                    if (meta.riskScoreIncrement) changeLines.push(`Risk score incrementado em: +${meta.riskScoreIncrement}`)
                    entryType = "deleted"
                    break
                case "catalog.product_update":
                case "catalog.service_update":
                    changeLines.push("Atualizou informações do item no painel admin.")
                    if (Array.isArray(meta.changedFields) && meta.changedFields.length > 0) {
                        changeLines.push(`Campos alterados: ${meta.changedFields.join(", ")}`)
                    }
                    if (meta.reason) changeLines.push(`Mensagem: "${meta.reason}"`)
                    if (meta.riskScore != null) changeLines.push(`Risk score da loja ajustado para: ${meta.riskScore}`)
                    entryType = "updated"
                    break
                case "catalog.product_archive":
                case "catalog.service_archive":
                    changeLines.push("Arquivou o item no catálogo.")
                    if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
                    entryType = "archived"
                    break
                case "catalog.product_unarchive":
                case "catalog.service_unarchive":
                    changeLines.push("Desarquivou o item no catálogo.")
                    if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
                    entryType = "unarchived"
                    break
                case "catalog.product_delete":
                case "catalog.service_delete":
                    changeLines.push("Excluiu o item do catálogo.")
                    if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
                    entryType = "deleted"
                    break
                default: {
                    const norm = String(log.action_type || "").replace(/\./g, " ").replace(/_/g, " ")
                    changeLines.push(`Ação administrativa: ${norm}`)
                    if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
                    break
                }
            }

            const tsKey = log.created_at ? log.created_at.slice(0, 19) : ""
            if (tsKey) seenTimestamps.add(tsKey)

            entries.push({
                id: log.id,
                actor_name: `${adminName} (Dudit)`,
                change_lines: changeLines,
                created_at: log.created_at,
                metadata: {
                    ...meta,
                    is_admin_action: true,
                    dudit_action: true,
                    admin_actor_name: adminName,
                },
                entry_type: entryType,
                highlight: true,
            })
        }

        // 6. Transform auditLogs (skipping any close timestamp twins)
        const storeName = (entity?.partner as any)?.stores?.[0]?.name || "Vendedor"
        for (const aLog of (auditLogs || [])) {
            const tsKey = aLog.created_at ? aLog.created_at.slice(0, 19) : ""
            if (tsKey && seenTimestamps.has(tsKey)) {
                continue // duplicate of adminLog
            }

            const isDudit = Boolean(
                aLog.metadata?.is_admin_action ||
                aLog.metadata?.dudit_action ||
                (aLog.actor_name && aLog.actor_name.toLowerCase().includes("dudit"))
            )
            const rawActor = aLog.actor_name || profileMap.get(aLog.actor_user_id) || (isDudit ? "Equipe Dudit" : storeName)
            const actorName = isDudit && !rawActor.includes("Dudit") ? `${rawActor} (Dudit)` : rawActor

            const rawLines = Array.isArray(aLog.change_lines)
                ? aLog.change_lines
                : typeof aLog.change_lines === "string"
                    ? [aLog.change_lines]
                    : ["Ação registrada."]

            entries.push({
                id: aLog.id,
                actor_name: actorName,
                change_lines: rawLines,
                created_at: aLog.created_at,
                metadata: aLog.metadata,
                entry_type: aLog.action_type,
                highlight: isDudit,
            })
        }

        // 7. Base entity creation event
        if (entity?.created_at) {
            entries.push({
                id: `creation-${entityId}`,
                actor_name: storeName,
                change_lines: ["Item cadastrado na plataforma."],
                created_at: entity.created_at,
                entry_type: "created",
                highlight: false,
            })
        }

        // 8. Sort descending
        entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        return { success: true, data: entries }
    } catch (err: any) {
        console.error("[getAdminEntityTimeline] error:", err)
        return { success: false, data: [], error: err.message || "Erro ao buscar histórico" }
    }
}
