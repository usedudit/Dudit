"use server"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

export interface AdminOrderStats {
    total: number
    pending: number
    paid: number
    delivered: number
    cancelled: number
}

export async function getAdminMarketplaceOrdersStats(): Promise<AdminOrderStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()

    const [totalRes, pendingRes, paidRes, deliveredRes, cancelledRes] = await Promise.all([
        admin.from("orders").select("id", { count: "exact", head: true }),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "pending"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "paid"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "delivered"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "cancelled"),
    ])

    return {
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        paid: paidRes.count || 0,
        delivered: deliveredRes.count || 0,
        cancelled: cancelledRes.count || 0,
    }
}

export async function getAdminMarketplaceOrders(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        status?: string
        deliveryStatus?: string
        paymentMethod?: string
        channel?: string
        search?: string
        startDate?: string
        endDate?: string
    }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 100)

    let query = admin
        .from("orders")
        .select(`
            id,
            order_number,
            customer_name,
            buyer_id,
            partner_id,
            store_id,
            situation,
            delivery_status,
            delivery_type,
            payment_method,
            payment_provider,
            payment_breakdown,
            total_amount,
            paid_amount,
            amount_paid,
            subtotal_original,
            discount_total,
            shipping_total,
            order_source,
            exchange_parent_order_id,
            exchange_return_request_id,
            notes,
            created_at,
            stores!left(id, name, person_type, logo_url, phone),
            order_items(id, product_id, product_name, product_price, quantity, subtotal, net_item_value, product_variants(id, variant_name), products(id, sku, images)),
            return_requests!order_id(id, request_type, status, resolution_type, refund_amount, store_credit_amount, source, created_at)
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%`)
    }

    if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
        if (filters.status === "Pendente" || filters.status === "pending") {
            query = query.eq("situation", "pending")
        } else if (filters.status === "Pago" || filters.status === "paid") {
            query = query.eq("situation", "paid")
        } else if (filters.status === "Cancelado" || filters.status === "cancelled") {
            query = query.eq("situation", "cancelled")
        } else if (filters.status === "Enviado" || filters.status === "sent") {
            query = query.in("delivery_status", ["sent", "in_transit", "delivered"])
        } else {
            query = query.eq("situation", filters.status)
        }
    }

    if (filters?.deliveryStatus && filters.deliveryStatus !== "all") {
        query = query.eq("delivery_status", filters.deliveryStatus)
    }

    if (filters?.paymentMethod && filters.paymentMethod !== "all") {
        query = query.eq("payment_method", filters.paymentMethod)
    }

    if (filters?.channel && filters.channel !== "all") {
        query = query.eq("order_source", filters.channel)
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

    const items = (data || []) as any[]
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

export async function getAdminMarketplaceOrderDetail(orderId: string): Promise<any | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()

    const { data: order, error } = await admin
        .from("orders")
        .select(`
            *,
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id),
            order_items(id, product_id, product_name, product_price, quantity, subtotal, net_item_value, product_variants(id, variant_name), products(id, sku, images)),
            return_requests!order_id(
                id, request_type, status, resolution_type, refund_amount, store_credit_amount, source, created_at,
                return_items(id, product_name_snapshot, quantity, net_item_value_snapshot, reason)
            )
        `)
        .eq("id", orderId)
        .maybeSingle()

    if (error || !order) return null

    // Get buyer profile if available
    let buyerProfile = null
    if (order.buyer_id) {
        const { data: profile } = await admin
            .from("user_profiles")
            .select("user_id, full_name, avatar_url, phone, cpf, birth_date")
            .eq("user_id", order.buyer_id)
            .maybeSingle()
        
        // Get buyer email from auth
        try {
            const { data: authUser } = await admin.auth.admin.getUserById(order.buyer_id)
            buyerProfile = {
                ...(profile || {}),
                email: authUser?.user?.email || null,
            }
        } catch {
            buyerProfile = profile
        }
    }

    // Get audit timeline events for this order
    const { data: auditEvents } = await admin
        .from("admin_audit_logs")
        .select("*")
        .eq("target_id", orderId)
        .order("created_at", { ascending: false })
        .limit(20)

    return {
        ...order,
        buyer_profile: buyerProfile,
        audit_events: auditEvents || [],
    }
}

export interface AdminReturnStats {
    total: number
    pending: number
    approved: number
    rejected: number
    completed: number
}

export async function getAdminReturnRequestsStats(): Promise<AdminReturnStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()

    const [totalRes, pendingRes, approvedRes, rejectedRes, completedRes] = await Promise.all([
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["pending", "under_review", "requested"]),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["approved", "authorized", "item_shipped", "received"]),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "rejected"),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["completed", "refunded", "closed"]),
    ])

    return {
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
        completed: completedRes.count || 0,
    }
}

export async function getAdminReturnRequests(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        status?: string
        type?: string
        source?: string
        search?: string
        startDate?: string
        endDate?: string
    }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 100)

    let query = admin
        .from("return_requests")
        .select(`
            id,
            request_type,
            status,
            desired_resolution,
            approved_resolution,
            resolution_type,
            refund_amount,
            store_credit_amount,
            exchange_shortfall_amount,
            exchange_surplus_amount,
            source,
            customer_reason,
            customer_details,
            customer_name_snapshot,
            order_number_snapshot,
            eligibility_status,
            sla_status,
            sla_due_at,
            reported_to_dudit_at,
            created_at,
            updated_at,
            partner_id,
            order_id,
            customer_id,
            exchange_order_id,
            stores!left(id, name, person_type, logo_url, risk_score),
            orders!order_id(id, order_number, situation, delivery_status, total_amount, amount_paid, payment_method, payment_provider, store_id),
            return_items!return_items_return_request_id_fkey(id, product_name_snapshot, quantity, net_item_value_snapshot, reason, condition),
            return_evidence(id, file_url, file_type, file_name, created_at)
        `)
        .is("deleted_at", null)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`customer_name_snapshot.ilike.%${s}%,order_number_snapshot.ilike.%${s}%`)
    }

    if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
        if (filters.status === "pending" || filters.status === "Pendentes") {
            query = query.in("status", ["pending", "under_review", "requested"])
        } else if (filters.status === "approved" || filters.status === "Aprovados") {
            query = query.in("status", ["approved", "authorized", "item_shipped", "received"])
        } else if (filters.status === "rejected" || filters.status === "Recusados") {
            query = query.eq("status", "rejected")
        } else if (filters.status === "completed" || filters.status === "Concluídos") {
            query = query.in("status", ["completed", "refunded", "closed"])
        } else {
            query = query.eq("status", filters.status)
        }
    }
    if (filters?.type && filters.type !== "all") {
        query = query.eq("request_type", filters.type)
    }
    if (filters?.source && filters.source !== "all") {
        query = query.eq("source", filters.source)
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

    const items = (data || []) as any[]
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}
