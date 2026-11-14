"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { revalidatePath } from "next/cache"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export interface AdminServiceOrderStats {
    total: number
    aberta: number
    aguardando_aprovacao: number
    em_andamento: number
    concluida: number
    cancelada: number
}

export async function getAdminServiceOrdersStats(): Promise<AdminServiceOrderStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const [totalRes, abertaRes, aguardandoRes, andamentoRes, concluidaRes, canceladaRes] = await Promise.all([
        admin.from("service_orders").select("id", { count: "exact", head: true }),
        admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "aguardando_aprovacao"),
        admin.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["em_andamento", "aguardando_peca"]),
        admin.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["concluida", "entregue"]),
        admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "cancelada"),
    ])

    return {
        total: totalRes.count || 0,
        aberta: abertaRes.count || 0,
        aguardando_aprovacao: aguardandoRes.count || 0,
        em_andamento: andamentoRes.count || 0,
        concluida: concluidaRes.count || 0,
        cancelada: canceladaRes.count || 0,
    }
}

export async function getAdminServiceOrders(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        status?: string
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
        .from("service_orders")
        .select(`
            id,
            partner_id,
            store_id,
            order_number,
            customer_id,
            customer_snapshot,
            status,
            title,
            description,
            diagnosis,
            internal_notes,
            expected_completion_date,
            completed_at,
            public_token,
            total_service_amount,
            total_product_amount,
            total_amount,
            created_at,
            updated_at,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`order_number.ilike.%${s}%,title.ilike.%${s}%`)
    }

    if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
        query = query.eq("status", filters.status)
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

    const items = ((data || []) as any[]).map((row: any) => ({
        ...row,
        customer_name: row.customer_snapshot?.name || "Cliente não informado",
        customer_phone: row.customer_snapshot?.phone || null,
        customer_email: row.customer_snapshot?.email || null,
        total_amount: Number(row.total_amount || 0),
        store_name: row.stores?.name || "Loja Parceira",
        partner_name: row.stores?.name || "Loja Parceira",
    }))
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

export async function getAdminServiceOrderDetail(orderId: string): Promise<any | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const { data: order, error } = await admin
        .from("service_orders")
        .select(`
            *,
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id, partners!left(id))
        `)
        .eq("id", orderId)
        .maybeSingle()

    if (error || !order) return null

    // Get services, products and attachments
    const [servicesRes, productsRes, attachmentsRes, auditRes] = await Promise.all([
        admin.from("service_order_services").select("*, services(name, price)").eq("service_order_id", orderId).order("sort_order"),
        admin.from("service_order_products").select("*, products(name, price)").eq("service_order_id", orderId).order("sort_order"),
        admin.from("service_order_attachments").select("*").eq("service_order_id", orderId).order("created_at", { ascending: false }),
        admin.from("admin_audit_logs").select("*").eq("target_id", orderId).order("created_at", { ascending: false }).limit(20),
    ])

    return {
        ...order,
        services: servicesRes.data || [],
        products: productsRes.data || [],
        attachments: attachmentsRes.data || [],
        audit_events: auditRes.data || [],
    }
}

export async function updateAdminServiceOrder(
    orderId: string,
    updates: {
        status?: string
        title?: string
        description?: string
        diagnosis?: string
        internal_notes?: string
        expected_completion_date?: string | null
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("service_orders")
        .select("id, partner_id, store_id, order_number, status, title")
        .eq("id", orderId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Ordem de serviço não encontrada." }
    }

    const payloadToUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
    }

    if (updates.status !== undefined) payloadToUpdate.status = updates.status
    if (updates.title !== undefined) payloadToUpdate.title = sanitizeInput(updates.title)
    if (updates.description !== undefined) payloadToUpdate.description = sanitizeNotes(updates.description)
    if (updates.diagnosis !== undefined) payloadToUpdate.diagnosis = sanitizeNotes(updates.diagnosis)
    if (updates.internal_notes !== undefined) payloadToUpdate.internal_notes = sanitizeNotes(updates.internal_notes)
    if (updates.expected_completion_date !== undefined) payloadToUpdate.expected_completion_date = updates.expected_completion_date

    const { error: updateErr } = await admin
        .from("service_orders")
        .update(payloadToUpdate)
        .eq("id", orderId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Apply Admin Action Context (Notification to seller + Audit Log + Risk Score)
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.SERVICE_ORDER_UPDATE,
        targetType: "service_order",
        targetId: orderId,
        metadata: {
            previousStatus: current.status,
            newStatus: updates.status || current.status,
            changedFields: actionContext?.changedFields || Object.keys(updates),
            reason: actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "service_order",
        targetId: orderId,
        actionTitle: `Ordem de Serviço #${current.order_number} atualizada pela administração`,
        entityLabel: "Ordem de Serviço",
        entityName: current.title || `#${current.order_number}`,
        sellerUrl: `/erp/ordens-de-servico?view=${orderId}`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/ordens-de-servico")
    return { success: true }
}

