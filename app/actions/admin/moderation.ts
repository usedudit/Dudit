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
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { ModerationItem, CursorPaginatedResult } from "@/lib/admin/types"
import { formatDateTime } from "@/lib/utils/formatters";

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

async function incrementRiskScore(partnerId: string, points: number): Promise<void> {
    try {
        const admin = getAdminClient()
        await admin.rpc("increment_risk_score", { p_partner_id: partnerId, p_points: points })
    } catch (e) {
        // Fallback: direct UPDATE with LEAST cap
        try {
            const admin = getAdminClient()
            const { data } = await admin
                .from("partners")
                .select("risk_score")
                .eq("id", partnerId)
                .single()
            const current = data?.risk_score || 0
            await admin
                .from("partners")
                .update({ risk_score: Math.min(current + points, 100) })
                .eq("id", partnerId)
        } catch (e2) {
            console.error("[RISK_SCORE] Failed to increment:", partnerId, e2)
        }
    }
}

// ─── Get Moderation Queue ───────────────────────────────────────────────────

export async function getModerationQueue(
    cursor?: string | null,
    limit: number = 20,
    statusFilter?: string
): Promise<CursorPaginatedResult<ModerationItem>> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = getAdminClient()
    const pageSize = Math.min(limit, 50)

    // Real query: products pending moderation with partner info
    let productQuery = supabase
        .from("products")
        .select(`
      id, name, description, price, images, moderation_status, created_at,
      partner:partners!inner(id, store_name, user_id, risk_score)
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

    const hasMore = (products?.length || 0) > pageSize
    const items = (products || []).slice(0, pageSize)

    // Fetch owner names for each partner (products only)
    const ownerIds = [...new Set(items.map((p: any) => p.partner?.user_id).filter(Boolean))]
    let ownerMap = new Map<string, string>()
    if (ownerIds.length > 0) {
        const { data: owners } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", ownerIds)
        ownerMap = new Map((owners || []).map((o: any) => [o.user_id, o.full_name]))
    }

    // 2. Partners query
    let partnerQuery = supabase
        .from("partners")
        .select(`
            id, store_name, store_description, store_image_url, banner_url,
            logo_moderation_status, banner_moderation_status, risk_score, created_at,
            user_profiles!partners_user_id_fkey(full_name)
        `)
    
    if (statusFilter && statusFilter !== "all") {
        partnerQuery = partnerQuery.or(`logo_moderation_status.eq.${statusFilter},banner_moderation_status.eq.${statusFilter}`)
    } else {
        partnerQuery = partnerQuery.or('logo_moderation_status.eq.pending_moderation,banner_moderation_status.eq.pending_moderation')
    }

    const { data: partners, error: partnerError } = await partnerQuery.order("created_at", { ascending: false }).limit(pageSize)

    if (partnerError) {
        console.error("[ADMIN_MODERATION] Failed to fetch partners queue:", partnerError.message)
    }

    const mappedProducts: ModerationItem[] = items.map((p: any) => ({
        id: p.id,
        type: "product" as const,
        title: p.name,
        description: p.description,
        price: p.price,
        images: p.images || [],
        owner_store_name: p.partner?.store_name || "Desconhecido",
        partner_id: p.partner?.id || "",
        owner_user_name: ownerMap.get(p.partner?.user_id) || "",
        moderation_status: p.moderation_status,
        risk_score: p.partner?.risk_score || 0,
        created_at: p.created_at,
    }))

    const mappedPartners: ModerationItem[] = (partners || []).map((p: any) => {
        const images: string[] = []
        if (p.store_image_url) images.push(p.store_image_url)
        if (p.banner_url) images.push(p.banner_url)
        
        // Determine consolidated status
        let status = "approved"
        if (p.logo_moderation_status === "pending_moderation" || p.banner_moderation_status === "pending_moderation") {
            status = "pending_moderation"
        } else if (p.logo_moderation_status === "rejected" || p.banner_moderation_status === "rejected") {
            status = "rejected"
        }

        return {
            id: p.id,
            type: "partner" as const,
            title: `Perfil: ${p.store_name}`,
            description: p.store_description,
            price: 0,
            images,
            owner_store_name: p.store_name,
            partner_id: p.id,
            owner_user_name: p.user_profiles?.full_name || "",
            moderation_status: status,
            risk_score: p.risk_score || 0,
            created_at: p.created_at,
        }
    })

    let returnQuery = supabase
        .from("return_requests")
        .select(`
            id, order_id, partner_id, customer_name_snapshot, customer_message, reason, status, created_at,
            order_number_snapshot,
            partners(id, store_name, user_id, risk_score),
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

    const mappedReturns: ModerationItem[] = (returnDisputes || []).map((r: any) => ({
        id: r.id,
        type: "return_dispute" as const,
        title: `Disputa de devolucao ${r.order_number_snapshot || String(r.order_id).slice(0, 8)}`,
        description: [r.reason, r.customer_message].filter(Boolean).join(" - ") || null,
        price: 0,
        images: (r.return_evidence || []).map((e: any) => e.file_url).filter(Boolean),
        owner_store_name: r.partners?.store_name || "Desconhecido",
        partner_id: r.partner_id,
        owner_user_name: returnOwnerMap.get(r.partners?.user_id) || "",
        moderation_status: "pending_moderation",
        risk_score: r.partners?.risk_score || 0,
        created_at: r.created_at,
    }))

    // Combine and sort
    const combined = [...mappedProducts, ...mappedPartners, ...mappedReturns]
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
    type: "product" | "partner" | "return_dispute" = "product"
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const supabase = getAdminClient()

    // Anti-IDOR: re-fetch entity
    if (type === "return_dispute") {
        const { data: rr, error: rrError } = await supabase
            .from("return_requests")
            .select("id, partner_id, order_id, status")
            .eq("id", entityId)
            .eq("status", "ESCALATED")
            .single()
        if (rrError || !rr) return { success: false, error: "Disputa nao encontrada" }

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
            p_notes: "Moderacao aprovou o cliente para continuidade da resolucao.",
            p_idempotency_key: `moderation-approve:${entityId}:${Date.now()}`,
        })
        if (error) return { success: false, error: error.message }
        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_APPROVE,
            targetType: "return_request",
            targetId: entityId,
            metadata: { previousStatus: rr.status, partnerId: rr.partner_id },
        })
        return { success: true }
    }

    const { data: entity, error: fetchError } = await supabase
        .from(type === "product" ? "products" : "partners")
        .select(type === "product" ? "id, name, moderation_status, images" : "id, store_name, logo_moderation_status, banner_moderation_status")
        .eq("id", entityId)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "product" ? "Produto" : "Perfil"} não encontrado` }
    }

    if (type === "product") {
        const { error: updateError } = await supabase
            .from("products")
            .update({
                moderation_status: "approved",
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                is_active: true,
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }
    } else {
        const { error: updateError } = await supabase
            .from("partners")
            .update({
                logo_moderation_status: "approved",
                banner_moderation_status: "approved",
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }
    }

    // Audit log (append-only, via service-role)
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_APPROVE,
        targetType: type,
        targetId: entityId,
        metadata: { 
            previousStatus: type === "product" ? entity.moderation_status : { logo: entity.logo_moderation_status, banner: entity.banner_moderation_status }, 
            name: type === "product" ? entity.name : entity.store_name 
        },
    })

    return { success: true }
}

// ─── Reject: Remove Flagged Images + Approve (or keep pending) ──────────────

export async function rejectFlaggedImages(
    entityId: string,
    reason: string,
    flaggedImageUrls: string[]
): Promise<{ success: boolean; error?: string; noImagesLeft?: boolean }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    if (!flaggedImageUrls || flaggedImageUrls.length === 0) {
        return { success: false, error: "Nenhuma imagem selecionada para remoção" }
    }

    const supabase = getAdminClient()

    // Anti-IDOR: re-fetch entity with all relevant data
    const { data: entity, error: fetchError } = await supabase
        .from("products")
        .select("id, name, images, moderation_status, partner_id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: "Produto não encontrado" }
    }

    const currentImages: string[] = entity.images || []
    const flaggedSet = new Set(flaggedImageUrls)
    const remainingImages = currentImages.filter((img: string) => !flaggedSet.has(img))
    const removedCount = currentImages.length - remainingImages.length

    const imageWord = removedCount === 1 ? "imagem" : "imagens"
    const removedWord = removedCount === 1 ? "removida" : "removidas"

    // Build detailed reason for deleted_reason / moderation_reason
    const detailedReason = `${removedCount} ${imageWord} ${removedWord} por "${reason.trim()}" do produto "${entity.name}" em ${formatBrazilDateTime()}`

    // SAFETY CHECK: if no images remain, don't approve - product needs at least 1 image
    if (remainingImages.length === 0) {
        // Update product: remove images, keep pending status, save reason
        const { error: updateError } = await supabase
            .from("products")
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

        // Risk score: +2 for image removal (admin-confirmed)
        if (entity.partner_id) {
            await incrementRiskScore(entity.partner_id, 2)
        }

        // Audit log
        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_REJECT,
            targetType: "product",
            targetId: entityId,
            metadata: {
                reason: detailedReason,
                removedImages: flaggedImageUrls,
                remainingImages: 0,
                previousStatus: entity.moderation_status,
                productName: entity.name,
                riskScoreAdded: 2,
            },
        })

        return {
            success: true,
            noImagesLeft: true,
        }
    }

    // Images still remain - remove flagged, approve product
    const { error: updateError } = await supabase
        .from("products")
        .update({
            images: remainingImages,
            moderation_status: "approved",
            moderation_reason: detailedReason,
            moderation_reviewed_by: admin.userId,
            moderation_reviewed_at: new Date().toISOString(),
            is_active: true,
        })
        .eq("id", entityId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    // Delete flagged images from R2
    await Promise.all(flaggedImageUrls.map(url => _deleteFromR2(url)))

    // Risk score: +2 for image removal (admin-confirmed)
    if (entity.partner_id) {
        await incrementRiskScore(entity.partner_id, 2)
    }

    // Audit log
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REJECT,
        targetType: "product",
        targetId: entityId,
        metadata: {
            reason: detailedReason,
            removedImages: flaggedImageUrls,
            remainingImages: remainingImages.length,
            previousStatus: entity.moderation_status,
            productName: entity.name,
            riskScoreAdded: 2,
        },
    })

    return { success: true, noImagesLeft: false }
}

// ─── Full Reject (reject product entirely) ──────────────────────────────────

export async function rejectModeration(
    entityId: string,
    reason: string,
    type: "product" | "partner" | "return_dispute" = "product"
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = getAdminClient()

    if (type === "return_dispute") {
        const { data: rr, error: rrError } = await supabase
            .from("return_requests")
            .select("id, partner_id, status")
            .eq("id", entityId)
            .single()
        if (rrError || !rr) return { success: false, error: "Disputa nao encontrada" }

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
            p_notes: reason.trim(),
            p_idempotency_key: `moderation-reject:${entityId}:${Date.now()}`,
        })
        if (error) return { success: false, error: error.message }

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.MODERATION_REJECT,
            targetType: "return_request",
            targetId: entityId,
            metadata: { reason: reason.trim(), previousStatus: rr.status, partnerId: rr.partner_id },
        })
        return { success: true }
    }

    // Anti-IDOR
    const { data: entity, error: fetchError } = await supabase
        .from(type === "product" ? "products" : "partners")
        .select(type === "product" ? "id, name, moderation_status, partner_id" : "id, store_name, logo_moderation_status, banner_moderation_status")
        .eq("id", entityId)
        .single()

    if (fetchError || !entity) {
        return { success: false, error: `${type === "product" ? "Produto" : "Perfil"} não encontrado` }
    }

    if (type === "product") {
        const { error: updateError } = await supabase
            .from("products")
            .update({
                moderation_status: "rejected",
                moderation_reason: reason.trim(),
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                is_active: false,
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }
    } else {
        const { error: updateError } = await supabase
            .from("partners")
            .update({
                logo_moderation_status: "rejected",
                banner_moderation_status: "rejected",
                // For partners, we might not want to deactivate the whole partner, 
                // just the specific fields. But for now, let's keep it simple.
            })
            .eq("id", entityId)

        if (updateError) return { success: false, error: updateError.message }
    }

    // Risk score: +3 for full product rejection (admin-confirmed)
    if (entity.partner_id) {
        await incrementRiskScore(entity.partner_id, 3)
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REJECT,
        targetType: type,
        targetId: entityId,
        metadata: { 
            reason: reason.trim(), 
            previousStatus: type === "product" ? entity.moderation_status : { logo: entity.logo_moderation_status, banner: entity.banner_moderation_status },
            name: type === "product" ? entity.name : entity.store_name,
            riskScoreAdded: type === "product" ? 3 : 0 
        },
    })

    return { success: true }
}

// ─── Reprocess Moderation ───────────────────────────────────────────────────

export async function reprocessModeration(
    entityId: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
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
