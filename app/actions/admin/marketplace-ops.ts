"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { normalizeAdminReturnRow } from "@/lib/returns/normalize-admin-return"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

export interface AdminOrderStats {
    total: number
    pending: number
    paid: number
    shipped: number
    delivered: number
    cancelled: number
}

export async function getAdminMarketplaceOrdersStats(): Promise<AdminOrderStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const [totalRes, pendingRes, paidRes, shippedRes, deliveredRes, cancelledRes] = await Promise.all([
        admin.from("orders").select("id", { count: "exact", head: true }),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "pending"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "paid"),
        admin.from("orders").select("id", { count: "exact", head: true }).in("delivery_status", ["sent", "in_transit"]),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("delivery_status", "delivered"),
        admin.from("orders").select("id", { count: "exact", head: true }).eq("situation", "cancelled"),
    ])

    return {
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        paid: paidRes.count || 0,
        shipped: shippedRes.count || 0,
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
    await requireAdminScope("moderation")

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
            order_source,
            created_at,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id)),
            order_items(id, product_name, quantity, service_id, line_type),
            order_shipments(id, status, kind, carrier, provider_slug, service_code, service_name, price, tracking_number, tracking_url, label_url, external_label_id, created_at, updated_at, paid_at, delivered_at, cancelled_at),
            delivery_breakdown,
            return_requests!order_id(id, status, desired_resolution, approved_resolution, refund_amount)
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
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const { data: order, error } = await admin
        .from("orders")
        .select(`
            *,
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id, partners!left(id)),
            order_items(*, products(id, name, sku, images, unit, price), product_variants(id, variant_name, sku), services(id, name, images, price)),
            return_requests!order_id(
                id, request_type, status, resolution_type, refund_amount, store_credit_amount, source, created_at,
                return_items!return_items_return_request_id_fkey(id, product_name_snapshot, quantity, net_item_value_snapshot, reason)
            )
        `)
        .eq("id", orderId)
        .maybeSingle()

    if (error || !order) return null

    // Get buyer profile if available
    let buyerProfile = null
    if (order.buyer_id) {
        // Get profile from user_profiles (marketplace profile)
        const { data: profile } = await admin
            .from("user_profiles")
            .select("user_id, full_name, avatar_url, phone, risk_score")
            .eq("user_id", order.buyer_id)
            .maybeSingle()

        // Get CPF from customers table (ERP customer data)
        let cpf = null
        if (order.buyer_id) {
            const { data: customer } = await admin
                .from("customers")
                .select("cpf")
                .eq("user_id", order.buyer_id)
                .maybeSingle()
            if (customer?.cpf) {
                try {
                    cpf = await (await import("@/lib/crypto")).decryptCpfIfEncrypted(customer.cpf)
                } catch {
                    cpf = null
                }
            }
        }

        // Get buyer email from auth
        try {
            const { data: authUser } = await admin.auth.admin.getUserById(order.buyer_id)
            buyerProfile = {
                ...(profile || {}),
                cpf,
                email: authUser?.user?.email || null,
            }
        } catch {
            buyerProfile = { ...(profile || {}), cpf }
        }
    }

    // Query delivery assignments (Dudit platform drivers)
    let deliveryDriver: any = null
    let deliveryAssignments: any[] = []
    try {
        const { data: assignments } = await admin
            .from("delivery_assignments")
            .select(`
                id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at, completed_at, failed_at, cancelled_at, delivery_fee, driver_id,
                delivery_drivers!driver_id(user_id, city, neighborhood, vehicle_type, is_active)
            `)
            .eq("order_id", orderId)
            .order("assigned_at", { ascending: false })

        deliveryAssignments = assignments || []

        if (assignments && assignments.length > 0) {
            const latest = assignments[0]
            const driverUserId = latest.driver_id
            const { data: driverProf } = await admin
                .from("user_profiles")
                .select("user_id, full_name, avatar_url, phone")
                .eq("user_id", driverUserId)
                .maybeSingle()

            let driverEmail = null
            try {
                const { data: authD } = await admin.auth.admin.getUserById(driverUserId)
                driverEmail = authD?.user?.email || null
            } catch {}

            deliveryDriver = {
                type: "dudit_platform", // Entregador Dudit (convidado manualmente)
                driver_id: driverUserId,
                full_name: driverProf?.full_name || "Entregador Dudit",
                avatar_url: driverProf?.avatar_url || null,
                phone: driverProf?.phone || null,
                email: driverEmail,
                city: (latest.delivery_drivers as any)?.city || null,
                neighborhood: (latest.delivery_drivers as any)?.neighborhood || null,
                vehicle_type: (latest.delivery_drivers as any)?.vehicle_type || null,
                assignment_status: latest.status,
                assigned_at: latest.assigned_at,
                delivery_fee: latest.delivery_fee,
            }
        }
    } catch (e) {
        console.error("Error fetching delivery assignments for admin order detail:", e)
    }

    // If no platform driver, check if there's a store delivery driver (via deliveries table)
    if (!deliveryDriver && order.partner_id) {
        try {
            // First find the delivery_id from delivery_orders for this order
            const { data: deliveryOrder } = await admin
                .from("delivery_orders")
                .select("delivery_id")
                .eq("order_id", orderId)
                .maybeSingle()

            if (deliveryOrder?.delivery_id) {
                const { data: storeDelivery } = await admin
                    .from("deliveries")
                    .select("id, status, started_at, delivered_at, notes, delivery_person_id")
                    .eq("id", deliveryOrder.delivery_id)
                    .maybeSingle()

                if (storeDelivery) {
                    let courierName = null
                    let courierPhone = null
                    let courierAvatar = null

                    if (storeDelivery.delivery_person_id) {
                        const { data: partnerUser } = await admin
                            .from("partner_users")
                            .select("user_id")
                            .eq("id", storeDelivery.delivery_person_id)
                            .maybeSingle()

                        if (partnerUser?.user_id) {
                            const { data: partnerUserProf } = await admin
                                .from("user_profiles")
                                .select("full_name, phone, avatar_url")
                                .eq("user_id", partnerUser.user_id)
                                .maybeSingle()
                            if (partnerUserProf) {
                                courierName = partnerUserProf.full_name
                                courierPhone = partnerUserProf.phone
                                courierAvatar = partnerUserProf.avatar_url
                            }
                        }
                    }

                    deliveryDriver = {
                        type: "store_internal", // Entregador da Loja
                        driver_id: storeDelivery.delivery_person_id || null,
                        full_name: courierName || "Entregador da Loja",
                        avatar_url: courierAvatar,
                        phone: courierPhone,
                        delivery_status: storeDelivery.status,
                        started_at: storeDelivery.started_at,
                        notes: storeDelivery.notes,
                    }
                }
            }
        } catch (e) {
            console.error("Error fetching store deliveries for admin order detail:", e)
        }
    }

    // Get admin audit timeline events (from admin_audit_logs)
    const { data: adminAuditEvents } = await admin
        .from("admin_audit_logs")
        .select("*")
        .eq("target_id", orderId)
        .order("created_at", { ascending: false })
        .limit(20)

    // Get regular audit events (from audit_logs) for Dudit team actions with green highlight
    const { data: regularAuditEvents } = await admin
        .from("audit_logs")
        .select("*")
        .eq("entity_type", "order")
        .eq("entity_id", orderId)
        .order("created_at", { ascending: true })
        .limit(50)

    // Merge and normalize events
    const mergedEvents = [
        ...(regularAuditEvents || []).map((e: any) => ({
            ...e,
            source_table: "audit_logs",
            action_type: e.action_type || e.action || "updated",
            created_at: e.created_at,
            admin_name: e.metadata?.admin_actor_name || e.actor_name,
        })),
        ...(adminAuditEvents || []).map((e: any) => ({
            ...e,
            source_table: "admin_audit_logs",
            action_type: e.action_type,
            created_at: e.created_at,
            admin_name: e.admin_name || e.metadata?.admin_name,
        })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    return {
        ...order,
        buyer_profile: buyerProfile,
        delivery_driver: deliveryDriver,
        delivery_assignments: deliveryAssignments,
        audit_events: mergedEvents,
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
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const [totalRes, pendingRes, approvedRes, rejectedRes, completedRes] = await Promise.all([
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["PENDING_REVIEW"]),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["APPROVED", "WAITING_ITEM_RETURN", "PROCESSING"]),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "REJECTED"),
        admin.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", ["RESOLVED", "EXPIRED"]),
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
    await requireAdminScope("moderation")

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
            customer_email_snapshot,
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
            stores!left(id, name, person_type, logo_url, risk_score, phone, cnpj, partners!left(id)),
            orders!order_id(id, order_number, customer_name, situation, delivery_status, delivery_address, total_amount, amount_paid, paid_amount, payment_method, payment_provider, store_id),
            return_items!return_items_return_request_id_fkey(id, order_item_id, product_id, variant_id, product_name_snapshot, quantity, ordered_quantity, unit_price_snapshot, net_item_value_snapshot, reason, condition),
            return_evidence(id, file_url, file_type, file_name, created_at)
        `)
        .is("deleted_at", null)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`customer_name_snapshot.ilike.%${s}%,order_number_snapshot.ilike.%${s}%`)
    }

    if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
        const rawStatus = filters.status.toUpperCase()
        if (filters.status === "pending" || filters.status === "Pendentes") {
            query = query.in("status", ["PENDING_REVIEW"])
        } else if (filters.status === "approved" || filters.status === "Aprovados") {
            query = query.in("status", ["APPROVED", "WAITING_ITEM_RETURN", "PROCESSING"])
        } else if (filters.status === "rejected" || filters.status === "Recusados") {
            query = query.eq("status", "REJECTED")
        } else if (filters.status === "completed" || filters.status === "Concluídos") {
            query = query.in("status", ["RESOLVED", "EXPIRED"])
        } else {
            query = query.eq("status", rawStatus)
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

    const items = ((data || []) as any[]).map((row) => normalizeAdminReturnRow(row))
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}
