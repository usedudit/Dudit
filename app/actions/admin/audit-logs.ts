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
    const pageSize = Math.min(limit, 50)

    let query = admin
        .from("admin_audit_logs")
        .select("*")

    if (filters?.actionType && filters.actionType !== "all") {
        query = query.eq("action_type", filters.actionType)
    }

    if (filters?.targetType && filters.targetType !== "all") {
        query = query.eq("target_type", filters.targetType)
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

    return {
        data: items,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
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

    return {
        pendingModeration: moderationCount.count || 0,
        bannedUsers: bannedCount.count || 0,
        activeSubscriptions: mpCount.count || 0,
        recentAuditLogs: (recentLogs.data || []) as AuditLogRow[],
    }
}
