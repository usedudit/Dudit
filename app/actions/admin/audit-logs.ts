"use server"

/**
 * Admin audit log query actions.
 * Read-only - no mutations. Uses service-role for reading
 * (admin_audit_logs has no RLS for authenticated users).
 */

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { MERCADOPAGO_PROVIDER } from "@/lib/services/payments/mercadopago-integration"
import type { AuditLogRow, CursorPaginatedResult, AdminDashboardStats } from "@/lib/admin/types"

// SECURITY FIX (MED-01): Sanitize wildcard chars in ILIKE queries
function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

export interface AuditLogStats {
    total: number
    user: number
    partner: number
    product: number
    system: number
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
    await requireAdminScope("audit_access")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()

    const [totalRes, userRes, partnerRes, prodRes, sysRes] = await Promise.all([
        admin.from("admin_audit_logs").select("id", { count: "exact", head: true }),
        admin.from("admin_audit_logs").select("id", { count: "exact", head: true }).eq("target_type", "user"),
        admin.from("admin_audit_logs").select("id", { count: "exact", head: true }).eq("target_type", "partner"),
        admin.from("admin_audit_logs").select("id", { count: "exact", head: true }).eq("target_type", "product"),
        admin.from("admin_audit_logs").select("id", { count: "exact", head: true }).eq("target_type", "system"),
    ])

    return {
        total: totalRes.count || 0,
        user: userRes.count || 0,
        partner: partnerRes.count || 0,
        product: prodRes.count || 0,
        system: sysRes.count || 0,
    }
}

// ─── Shared Enrichment Logic ──────────────────────────────────────────────────

async function enrichAuditLogs(admin: any, items: AuditLogRow[]) {
    if (!items.length) return items

    // 1. Batch fetch admin names & emails
    const adminIds = [...new Set(items.map(l => l.admin_user_id).filter(Boolean))]
    if (adminIds.length > 0) {
        const [profilesRes, authUsers] = await Promise.all([
            admin
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", adminIds),
            Promise.allSettled(
                adminIds.map(async (uid: string) => {
                    try {
                        const { data: u } = await admin.auth.admin.getUserById(uid)
                        return { uid, email: u?.user?.email || "" }
                    } catch {
                        return { uid, email: "" }
                    }
                })
            ),
        ])

        const adminMap = new Map<string, string>(profilesRes.data?.map((a: any) => [a.user_id, a.full_name]) || [])
        const emailMap = new Map<string, string>()
        authUsers.forEach(res => {
            if (res.status === "fulfilled" && res.value.email) {
                emailMap.set(res.value.uid, res.value.email)
            }
        })

        items.forEach((item: AuditLogRow) => {
            const name = adminMap.get(item.admin_user_id)
            const email = emailMap.get(item.admin_user_id) || item.admin_email
            if (name) item.admin_name = name
            if (email) item.admin_email = email
        })
    }

    // 2. Batch fetch target names
    const productIds = items.filter(i => (i.target_type === 'product') && i.target_id).map(i => i.target_id!)
    const serviceIds = items.filter(i => (i.target_type === 'service') && i.target_id).map(i => i.target_id!)
    const partnerIds = items.filter(i => (i.target_type === 'partner' || i.target_type === 'store') && i.target_id).map(i => i.target_id!)
    const userIds = items.filter(i => (i.target_type === 'user') && i.target_id).map(i => i.target_id!)
    const orderIds = items.filter(i => (i.target_type === 'order') && i.target_id).map(i => i.target_id!)
    const soIds = items.filter(i => (i.target_type === 'service_order') && i.target_id).map(i => i.target_id!)
    const quoteIds = items.filter(i => (i.target_type === 'quote') && i.target_id).map(i => i.target_id!)
    const promoIds = items.filter(i => (i.target_type === 'promotion') && i.target_id).map(i => i.target_id!)

    const targetMap = new Map<string, string>()

    const fetches: Promise<any>[] = []

    if (productIds.length > 0) {
        fetches.push(
            admin.from("products").select("id, name").in("id", productIds).then(({ data }: any) => {
                ;(data || []).forEach((p: any) => targetMap.set(`product:${p.id}`, p.name))
            })
        )
    }

    if (serviceIds.length > 0) {
        fetches.push(
            admin.from("services").select("id, name").in("id", serviceIds).then(({ data }: any) => {
                ;(data || []).forEach((s: any) => targetMap.set(`service:${s.id}`, s.name))
            })
        )
    }

    if (partnerIds.length > 0) {
        fetches.push(
            admin.from("stores").select("id, partner_id, name").in("id", partnerIds).then(({ data }: any) => {
                ;(data || []).forEach((s: any) => {
                    targetMap.set(`partner:${s.id}`, s.name)
                    targetMap.set(`store:${s.id}`, s.name)
                    if (s.partner_id) {
                        targetMap.set(`partner:${s.partner_id}`, s.name)
                    }
                })
            })
        )
    }

    if (userIds.length > 0) {
        fetches.push(
            admin.from("user_profiles").select("user_id, full_name").in("user_id", userIds).then(({ data }: any) => {
                ;(data || []).forEach((u: any) => targetMap.set(`user:${u.user_id}`, u.full_name))
            })
        )
    }

    if (orderIds.length > 0) {
        fetches.push(
            admin.from("orders").select("id, order_number").in("id", orderIds).then(({ data }: any) => {
                ;(data || []).forEach((o: any) => targetMap.set(`order:${o.id}`, `#${o.order_number || o.id.slice(0, 8)}`))
            })
        )
    }

    if (soIds.length > 0) {
        fetches.push(
            admin.from("service_orders").select("id, os_number").in("id", soIds).then(({ data }: any) => {
                ;(data || []).forEach((s: any) => targetMap.set(`service_order:${s.id}`, `OS #${s.os_number}`))
            })
        )
    }

    if (quoteIds.length > 0) {
        fetches.push(
            admin.from("quotes").select("id, quote_number").in("id", quoteIds).then(({ data }: any) => {
                ;(data || []).forEach((q: any) => targetMap.set(`quote:${q.id}`, `Orçamento #${q.quote_number}`))
            })
        )
    }

    if (promoIds.length > 0) {
        fetches.push(
            admin.from("promotions").select("id, name, code").in("id", promoIds).then(({ data }: any) => {
                ;(data || []).forEach((p: any) => targetMap.set(`promotion:${p.id}`, p.code ? `Cupom ${p.code}` : p.name))
            })
        )
    }

    await Promise.all(fetches)

    items.forEach((item: AuditLogRow) => {
        if (item.target_id) {
            const resolved = targetMap.get(`${item.target_type}:${item.target_id}`) || targetMap.get(`partner:${item.target_id}`) || targetMap.get(`store:${item.target_id}`)
            if (resolved) {
                item.target_name = resolved
            }
        }
    })

    return items
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
    await requireAdminScope("audit_access")
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
    await requireAdminScope("audit_access")
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
    await requireAdminScope("audit_access")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()

    // Parallel fetch for dashboard
    const [moderationCount, bannedCount, mpCount, reportsCount, returnsCount, serviceOrdersCount, quotesCount, recentLogs] = await Promise.all([
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
            .from("partner_integrations")
            .select("id", { count: "exact", head: true })
            .eq("provider_slug", MERCADOPAGO_PROVIDER)
            .eq("status", "connected"),

        // Pending reports
        admin
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),

        // Pending return requests
        admin
            .from("return_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["requested", "under_review", "disputed"]),

        // Open service orders
        admin
            .from("service_orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "budget_pending", "budget_approved", "in_analysis", "waiting_parts", "in_repair"]),

        // Open quotes
        admin
            .from("quotes")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "sent", "draft"]),

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
        pendingReports: reportsCount.count || 0,
        pendingReturns: returnsCount.count || 0,
        openServiceOrders: serviceOrdersCount.count || 0,
        openQuotes: quotesCount.count || 0,
        recentAuditLogs: items,
    }
}
