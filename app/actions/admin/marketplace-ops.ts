"use server"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

export async function getAdminMarketplaceOrders(
    cursor?: string | null,
    limit: number = 20,
    filters?: { status?: string; search?: string }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 50)

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
            payment_method,
            payment_provider,
            total_amount,
            paid_amount,
            amount_paid,
            subtotal_original,
            discount_total,
            shipping_total,
            order_source,
            exchange_parent_order_id,
            exchange_return_request_id,
            created_at,
            partners(id, store_name, business_type),
            stores!left(id, name),
            order_items(id, product_id, product_name, product_price, quantity, subtotal, net_item_value),
            return_requests!order_id(id, request_type, status, resolution_type, refund_amount, store_credit_amount, source, created_at)
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.ilike("order_number", `%${s}%`)
    }

    if (filters?.status && filters.status !== "all") {
        query = query.eq("situation", filters.status)
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

export async function getAdminReturnRequests(
    cursor?: string | null,
    limit: number = 20,
    filters?: { status?: string; type?: string; source?: string; search?: string }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 50)

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
            partners(id, store_name, business_type),
            orders!order_id(id, order_number, situation, delivery_status, total_amount, amount_paid, payment_method, payment_provider, store_id),
            return_items!return_items_return_request_id_fkey(id, product_name_snapshot, quantity, net_item_value_snapshot, reason, condition),
            return_evidence(id, file_url, file_type, created_at),
            return_events(id, event_type, from_status, to_status, message, metadata, created_at)
        `)
        .is("deleted_at", null)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`customer_name_snapshot.ilike.%${s}%,order_number_snapshot.ilike.%${s}%`)
    }

    if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status)
    }
    if (filters?.type) {
        query = query.eq("request_type", filters.type)
    }
    if (filters?.source) {
        query = query.eq("source", filters.source)
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
