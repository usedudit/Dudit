"use server"

/**
 * Report / Denúncia server actions.
 *
 * USER-FACING: createReport() - any authenticated user can report
 * ADMIN-FACING: getReports(), resolveReport(), dismissReport()
 *
 * Anti-spam: unique constraint (reporter_user_id, target_type, target_id)
 * Auto-pending: handled by DB trigger (>= 3 distinct reporters, accounts > 7 days)
 * Risk score: +5 on admin-validated report
 */

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { CursorPaginatedResult } from "@/lib/admin/types"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Report {
    id: string
    reporter_user_id: string
    reporter_name: string
    target_type: "product" | "partner" | "review" | "service"
    target_id: string
    target_name: string
    reason: string
    description: string | null
    status: "pending" | "validated" | "dismissed"
    resolved_by: string | null
    resolved_at: string | null
    created_at: string
}

// ─── Create Report (user-facing) ────────────────────────────────────────────

export async function createReport(data: {
    targetType: "product" | "partner" | "review" | "service"
    targetId: string
    reason: string
    description?: string
}): Promise<{ success: boolean; error?: string }> {
    await requireRateLimit(RateLimitCategory.REPORT_CREATE)
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    if (!data.reason || data.reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    if (!data.targetId || !data.targetType) {
        return { success: false, error: "Dados inválidos" }
    }

    // Verify target exists
    let tableName = ""
    switch (data.targetType) {
        case "product": tableName = "products"; break
        case "service": tableName = "products"; break // services use products table
        case "partner": tableName = "partners"; break
        case "review": tableName = "reviews"; break
        default: return { success: false, error: "Tipo de alvo inválido" }
    }

    const { data: target, error: targetError } = await supabase
        .from(tableName)
        .select("id")
        .eq("id", data.targetId)
        .single()

    if (targetError || !target) {
        return { success: false, error: "Item não encontrado" }
    }

    // Insert report (unique constraint prevents duplicates)
    const { error: insertError } = await supabase
        .from("reports")
        .insert({
            reporter_user_id: user.id,
            target_type: data.targetType,
            target_id: data.targetId,
            reason: data.reason.trim(),
            description: data.description?.trim() || null,
        })

    if (insertError) {
        if (insertError.code === "23505") {
            return { success: false, error: "Você já reportou este item" }
        }
        return { success: false, error: insertError.message }
    }

    return { success: true }
}

// ─── Get Reports (admin) ────────────────────────────────────────────────────

export async function getReports(
    cursor?: string | null,
    limit: number = 20,
    statusFilter?: string
): Promise<CursorPaginatedResult<Report>> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()
    const pageSize = Math.min(limit, 50)

    let query = supabase
        .from("reports")
        .select(`
            id, reporter_user_id, target_type, target_id, reason, description, status, resolved_by, resolved_at, created_at,
            reporter:user_profiles!reports_reporter_user_id_fkey(full_name)
        `)

    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter)
    } else {
        query = query.eq("status", "pending")
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: reports, error } = await query

    if (error) {
        console.error("[ADMIN_REPORTS] Failed to fetch reports:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    const hasMore = (reports?.length || 0) > pageSize
    const items = (reports || []).slice(0, pageSize)

    // Fetch target names (products / partners / reviews) in batch
    const targetNames = new Map<string, string>()
    const productIds = items.filter((r: any) => r.target_type === "product" || r.target_type === "service").map((r: any) => r.target_id)
    const partnerIds = items.filter((r: any) => r.target_type === "partner").map((r: any) => r.target_id)

    if (productIds.length > 0) {
        const { data: products } = await supabase
            .from("products")
            .select("id, name")
            .in("id", productIds)
            ; (products || []).forEach((p: any) => targetNames.set(p.id, p.name))
    }
    if (partnerIds.length > 0) {
        const { data: partners } = await supabase
            .from("partners")
            .select("id, store_name")
            .in("id", partnerIds)
            ; (partners || []).forEach((p: any) => targetNames.set(p.id, p.store_name))
    }

    const mapped: Report[] = items.map((r: any) => {
        const reporterName = Array.isArray(r.reporter)
            ? r.reporter[0]?.full_name
            : r.reporter?.full_name

        return {
            id: r.id,
            reporter_user_id: r.reporter_user_id,
            reporter_name: reporterName || "Desconhecido",
            target_type: r.target_type,
            target_id: r.target_id,
            target_name: targetNames.get(r.target_id) || r.target_id,
            reason: r.reason,
            description: r.description,
            status: r.status,
            resolved_by: r.resolved_by,
            resolved_at: r.resolved_at,
            created_at: r.created_at,
        }
    })

    return {
        data: mapped,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Resolve Report (admin validates - risk_score +5) ───────────────────────

export async function resolveReport(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()

    // Anti-IDOR
    const { data: report, error: fetchError } = await supabase
        .from("reports")
        .select("id, target_type, target_id, status")
        .eq("id", reportId)
        .single()

    if (fetchError || !report) {
        return { success: false, error: "Denúncia não encontrada" }
    }

    if (report.status !== "pending") {
        return { success: false, error: "Denúncia já foi processada" }
    }

    // Update report status
    const { error: updateError } = await supabase
        .from("reports")
        .update({
            status: "validated",
            resolved_by: admin.userId,
            resolved_at: new Date().toISOString(),
        })
        .eq("id", reportId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    // Increment risk_score +5 on the partner owning the reported product/service
    if (report.target_type === "product" || report.target_type === "service") {
        const { data: product } = await supabase
            .from("products")
            .select("partner_id")
            .eq("id", report.target_id)
            .single()

        if (product?.partner_id) {
            try {
                const adminClient = getAdminClient()
                const { data } = await adminClient
                    .from("partners")
                    .select("risk_score")
                    .eq("id", product.partner_id)
                    .single()
                const current = data?.risk_score || 0
                await adminClient
                    .from("partners")
                    .update({ risk_score: Math.min(current + 5, 100) })
                    .eq("id", product.partner_id)
            } catch (e) {
                console.error("[RISK_SCORE] Failed to increment:", e)
            }
        }
    } else if (report.target_type === "partner") {
        try {
            const adminClient = getAdminClient()
            const { data } = await adminClient
                .from("partners")
                .select("risk_score")
                .eq("id", report.target_id)
                .single()
            const current = data?.risk_score || 0
            await adminClient
                .from("partners")
                .update({ risk_score: Math.min(current + 5, 100) })
                .eq("id", report.target_id)
        } catch (e) {
            console.error("[RISK_SCORE] Failed to increment:", e)
        }
    }

    // Audit log
    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_APPROVE, // using approve as "report validated"
        targetType: report.target_type as any,
        targetId: report.target_id,
        metadata: { reportId, action: "report_validated", reason: reason.trim(), riskScoreAdded: 5 },
    })

    return { success: true }
}

// ─── Dismiss Report (admin rejects report) ──────────────────────────────────

export async function dismissReport(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()

    // Anti-IDOR
    const { data: report, error: fetchError } = await supabase
        .from("reports")
        .select("id, target_type, target_id, status")
        .eq("id", reportId)
        .single()

    if (fetchError || !report) {
        return { success: false, error: "Denúncia não encontrada" }
    }

    if (report.status !== "pending") {
        return { success: false, error: "Denúncia já foi processada" }
    }

    const { error: updateError } = await supabase
        .from("reports")
        .update({
            status: "dismissed",
            resolved_by: admin.userId,
            resolved_at: new Date().toISOString(),
        })
        .eq("id", reportId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_REJECT, // using reject as "report dismissed"
        targetType: report.target_type as any,
        targetId: report.target_id,
        metadata: { reportId, action: "report_dismissed", reason: reason.trim() },
    })

    return { success: true }
}
