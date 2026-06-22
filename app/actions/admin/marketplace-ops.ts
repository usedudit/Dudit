"use server"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"

export async function getAdminMarketplaceOrders(params?: { status?: string; limit?: number }) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const limit = Math.min(Math.max(Number(params?.limit || 50), 1), 100)

    let query = admin
        .from("orders")
        .select(`
            id,
            order_number,
            customer_name,
            buyer_id,
            partner_id,
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
            order_items(id, product_id, product_name, product_price, quantity, subtotal, net_item_value),
            return_requests!order_id(id, request_type, status, resolution_type, refund_amount, store_credit_amount, source, created_at)
        `)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (params?.status) {
        query = query.eq("situation", params.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
}

export async function getAdminReturnRequests(params?: { status?: string; type?: string; source?: string; limit?: number }) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const admin = getAdminClient()
    const limit = Math.min(Math.max(Number(params?.limit || 50), 1), 100)

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
            created_at,
            updated_at,
            partner_id,
            order_id,
            customer_id,
            exchange_order_id,
            partners(id, store_name, business_type),
            orders!order_id(id, order_number, situation, delivery_status, total_amount, amount_paid, payment_method, payment_provider),
            return_items!return_items_return_request_id_fkey(id, product_name_snapshot, quantity, net_item_value_snapshot, reason, condition),
            return_evidence(id, file_url, file_type, created_at),
            return_events(id, event_type, from_status, to_status, message, metadata, created_at)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (params?.status) {
        query = query.eq("status", params.status)
    }
    if (params?.type) {
        query = query.eq("request_type", params.type)
    }
    if (params?.source) {
        query = query.eq("source", params.source)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
}
