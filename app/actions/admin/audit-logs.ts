"use server"

/**
 * Admin audit log query actions.
 * Read-only - no mutations. Uses service-role for reading
 * (admin_audit_logs has no RLS for authenticated users).
 */

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AuditLogRow, CursorPaginatedResult, AdminDashboardStats } from "@/lib/admin/types"

// SECURITY FIX (MED-01): Sanitize wildcard chars in ILIKE queries
function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

// ─── Shared Enrichment Logic ──────────────────────────────────────────────────

async function enrichAuditLogs(admin: any, items: AuditLogRow[]) {
    if (!items.length) return items;

    // 1. Batch fetch admin names
    const adminIds = [...new Set(items.map(l => l.admin_user_id))]
    if (adminIds.length > 0) {
        const { data: admins } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", adminIds)
        
        const adminMap = new Map<string, any>(admins?.map((a: any) => [a.user_id, a]) || [])
        items.forEach((item: AuditLogRow) => {
            const profile = adminMap.get(item.admin_user_id)
            if (profile) {
                item.admin_name = profile.full_name
            }
        })
    }

    // 2. Batch fetch target names
    const productIds = items.filter(i => i.target_type === 'product' && i.target_id).map(i => i.target_id)
    const partnerIds = items.filter(i => i.target_type === 'partner' && i.target_id).map(i => i.target_id)
    const userIds = items.filter(i => i.target_type === 'user' && i.target_id).map(i => i.target_id)
    
    // In some cases target_type is 'review' but we don't have a simple name for it, we might just skip or handle later.

    if (productIds.length > 0) {
        const { data: prods } = await admin.from("products").select("id, name").in("id", productIds)
        const map = new Map<string, string>(prods?.map((p: any) => [p.id, p.name]) || [])
        items.forEach(i => { if (i.target_type === 'product' && i.target_id) i.target_name = map.get(i.target_id) })
    }
    
    if (partnerIds.length > 0) {
        const { data: parts } = await admin.from("partners").select("id, business_type").in("id", partnerIds)
        const map = new Map<string, string>(parts?.map((p: any) => [p.id, p.business_type]) || [])
        items.forEach(i => { if (i.target_type === 'partner' && i.target_id) i.target_name = map.get(i.target_id) })
    }

    if (userIds.length > 0) {
        const { data: users } = await admin.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
        const map = new Map<string, string>(users?.map((u: any) => [u.user_id, u.full_name]) || [])
        items.forEach(i => { if (i.target_type === 'user' && i.target_id) i.target_name = map.get(i.target_id) })
    }

    return items;
}

// ─── Get Audit Logs ─────────────────────────────────────────────────────────

export async function getAuditLogs(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        actionType?: string
        targetType?: string
        search?: string
    }
): Promise<CursorPaginatedResult<AuditLogRow>> {
    await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()
    const pageSize = limit // Removed Math.min(limit, 50) to allow large batch fetches for ERP pattern

    let query = admin
        .from("admin_audit_logs")
        .select("*")

    if (filters?.actionType && filters.actionType !== "all") {
        query = query.eq("action_type", filters.actionType)
    }

    if (filters?.targetType && filters.targetType !== "all") {
        query = query.eq("target_type", filters.targetType)
    }

    if (filters?.search && filters.search.trim().length > 0) {
        const sanitized = sanitizeIlike(filters.search.trim())
        query = query.or(`admin_email.ilike.%${sanitized}%,target_id.ilike.%${sanitized}%`)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: logs, error } = await query

    if (error) {
        console.error("[ADMIN_AUDIT] Failed to fetch logs:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    const auditLogs = (logs || []) as AuditLogRow[]
    const hasMore = auditLogs.length > pageSize
    const items = auditLogs.slice(0, pageSize)
    
    await enrichAuditLogs(admin, items)

    return {
        data: items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Get Target Audit History ───────────────────────────────────────────────

export async function getTargetAuditHistory(targetId: string): Promise<AuditLogRow[]> {
    await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()
    
    const { data: logs, error } = await admin
        .from("admin_audit_logs")
        .select("*")
        .eq("target_id", targetId)
        .order("created_at", { ascending: false })
        .limit(100)

    if (error) {
        console.error("[ADMIN_AUDIT] Failed to fetch history:", error.message)
        return []
    }

    const items = (logs || []) as AuditLogRow[]
    await enrichAuditLogs(admin, items)
    return items
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
    await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()

    // Parallel fetch for dashboard
    const [moderationCount, bannedCount, mpCount, recentLogs] = await Promise.all([
        // Pending moderation
        admin
            .from("products")
            .select("id", { count: "exact", head: true })
            .in("moderation_status", ["pending", "flagged", "in_review"])
            .is("deleted_at", null),

        // Banned users
        admin
            .from("user_profiles")
            .select("user_id", { count: "exact", head: true })
            .not("banned_at", "is", null),

        // Active MP connections
        admin
            .from("partners")
            .select("id", { count: "exact", head: true })
            .not("mp_user_id", "is", null),

        // Recent audit logs
        admin
            .from("admin_audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(10),
    ])

    const items = (recentLogs.data || []) as AuditLogRow[]
    await enrichAuditLogs(admin, items)

    return {
        pendingModeration: moderationCount.count || 0,
        bannedUsers: bannedCount.count || 0,
        activeSubscriptions: mpCount.count || 0,
        recentAuditLogs: items,
    }
}
