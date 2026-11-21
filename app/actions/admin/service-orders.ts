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

import { logAuditEvent } from "@/lib/services/timeline.service"
import { isValidUuid, resolveStoreIdsByName, sanitizeIlike } from "@/lib/admin/search-helpers"

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
        statuses?: string[]
        search?: string
        orderNumber?: string
        title?: string
        customer?: string
        storeName?: string
        startDate?: string
        endDate?: string
    }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 100)

    const storeIds = await resolveStoreIdsByName(admin, filters?.storeName)
    if (storeIds !== null && storeIds.length === 0) {
        return { data: [], nextCursor: null, prevCursor: cursor || null, hasMore: false }
    }

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
            priority,
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
            assigned_user_id,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (storeIds !== null) {
        query = query.in("store_id", storeIds)
    }

    if (filters?.orderNumber && filters.orderNumber.trim().length > 0) {
        const raw = filters.orderNumber.trim().replace(/^#/, "")
        const s = sanitizeIlike(raw)
        if (s) {
            query = isValidUuid(raw)
                ? query.or(`order_number.ilike.%${s}%,id.eq.${raw}`)
                : query.ilike("order_number", `%${s}%`)
        }
    }

    if (filters?.title && filters.title.trim().length > 0) {
        const s = sanitizeIlike(filters.title)
        if (s) query = query.ilike("title", `%${s}%`)
    }

    if (filters?.customer && filters.customer.trim().length > 0) {
        const s = sanitizeIlike(filters.customer)
        if (s) {
            query = query.or(`customer_snapshot->>name.ilike.%${s}%,customer_snapshot->>email.ilike.%${s}%`)
        }
    }

    if (filters?.search && filters.search.trim().length > 0) {
        const raw = filters.search.trim()
        const s = sanitizeIlike(raw)
        if (s) {
            const parts = [
                `order_number.ilike.%${s}%`,
                `title.ilike.%${s}%`,
                `customer_snapshot->>name.ilike.%${s}%`,
                `customer_snapshot->>email.ilike.%${s}%`,
            ]
            if (isValidUuid(raw)) parts.push(`id.eq.${raw}`)
            query = query.or(parts.join(","))
        }
    }

    if (filters?.statuses && filters.statuses.length > 0) {
        query = query.in("status", filters.statuses)
    } else if (filters?.status && filters.status !== "all" && filters.status !== "Todos") {
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

    const list = (data || []) as any[]
    const assignedIds = Array.from(
        new Set(list.map((r: any) => r.assigned_user_id).filter(Boolean)),
    ) as string[]
    let nameMap = new Map<string, string>()
    if (assignedIds.length > 0) {
        const { data: profiles } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", assignedIds)
        nameMap = new Map(
            (profiles || []).map((p: any) => [String(p.user_id), String(p.full_name || "")]),
        )
    }

    const items = list.map((row: any) => ({
        ...row,
        assigned_user_name: row.assigned_user_id ? (nameMap.get(String(row.assigned_user_id)) || null) : null,
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
    const [servicesRes, productsRes, attachmentsRes, auditRes, timelineRes] = await Promise.all([
        admin.from("service_order_services").select("*, services(name, price)").eq("service_order_id", orderId).order("sort_order"),
        admin.from("service_order_products").select("*, products(name, price)").eq("service_order_id", orderId).order("sort_order"),
        admin.from("service_order_attachments").select("*").eq("service_order_id", orderId).order("created_at", { ascending: false }),
        admin.from("admin_audit_logs").select("*").eq("target_id", orderId).order("created_at", { ascending: false }).limit(20),
        admin.from("audit_logs").select("*").eq("entity_id", orderId).order("created_at", { ascending: false }).limit(50),
    ])

    const history = (timelineRes.data || []).map((t: any) => ({
        ...t,
        actor_name: t.actor_name || (t.metadata?.dudit_action || t.metadata?.is_admin_action ? "Equipe Dudit" : "Sistema"),
    }))

    let assignedUserName = null
    if (order.assigned_user_id) {
        const { data: profile } = await admin
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", order.assigned_user_id)
            .maybeSingle()
        if (profile) assignedUserName = profile.full_name
    }

    return {
        ...order,
        assigned_user_name: assignedUserName,
        services: servicesRes.data || [],
        products: productsRes.data || [],
        attachments: attachmentsRes.data || [],
        audit_events: auditRes.data || [],
        history,
    }
}

export async function updateAdminServiceOrder(
    orderId: string,
    updates: {
        status?: string
        priority?: string
        title?: string
        description?: string
        diagnosis?: string
        internal_notes?: string
        expected_completion_date?: string | null
        customer_id?: string | null
        assigned_user_id?: string | null
        discount_value?: number
        discount_type?: string
        other_costs?: number
        specifications?: { name: string; value: string }[]
        services?: Array<{ service_id: string | null; service_name?: string; service_price?: number; quantity?: number }>
        products?: Array<{ product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity?: number }>
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("service_orders")
        .select("id, partner_id, store_id, order_number, status, title, total_service_amount, total_product_amount, total_amount")
        .eq("id", orderId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Ordem de serviço não encontrada." }
    }

    const payloadToUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
    }

    if (updates.status !== undefined) payloadToUpdate.status = updates.status
    if (updates.priority !== undefined) payloadToUpdate.priority = updates.priority
    if (updates.title !== undefined) payloadToUpdate.title = sanitizeInput(updates.title)
    if (updates.description !== undefined) payloadToUpdate.description = sanitizeNotes(updates.description)
    if (updates.diagnosis !== undefined) payloadToUpdate.diagnosis = sanitizeNotes(updates.diagnosis)
    if (updates.internal_notes !== undefined) payloadToUpdate.internal_notes = sanitizeNotes(updates.internal_notes)
    if (updates.expected_completion_date !== undefined) payloadToUpdate.expected_completion_date = updates.expected_completion_date
    if (updates.customer_id !== undefined) payloadToUpdate.customer_id = updates.customer_id
    if (updates.assigned_user_id !== undefined) payloadToUpdate.assigned_user_id = updates.assigned_user_id
    if (updates.discount_value !== undefined) payloadToUpdate.discount_value = updates.discount_value
    if (updates.discount_type !== undefined) payloadToUpdate.discount_type = updates.discount_type
    if (updates.other_costs !== undefined) payloadToUpdate.other_costs = updates.other_costs

    // Handle services and products if provided
    let totalService = Number(current.total_service_amount || 0)
    let totalProduct = Number(current.total_product_amount || 0)

    if (updates.services !== undefined) {
        await admin.from("service_order_services").delete().eq("service_order_id", orderId)
        if (updates.services.length > 0) {
            const sRows = updates.services.map((s, idx) => ({
                service_order_id: orderId,
                service_id: s.service_id || null,
                service_name: s.service_name || "Serviço",
                service_price: Number(s.service_price || 0),
                quantity: Number(s.quantity || 1),
                sort_order: idx,
            }))
            await admin.from("service_order_services").insert(sRows)
            totalService = sRows.reduce((acc, s) => acc + s.service_price * s.quantity, 0)
        } else {
            totalService = 0
        }
        payloadToUpdate.total_service_amount = totalService
    }

    if (updates.products !== undefined) {
        await admin.from("service_order_products").delete().eq("service_order_id", orderId)
        if (updates.products.length > 0) {
            const pRows = updates.products.map((p, idx) => ({
                service_order_id: orderId,
                product_id: p.product_id || null,
                variant_id: p.variant_id || null,
                product_name: p.product_name || "Produto",
                unit_price: Number(p.unit_price || 0),
                quantity: Number(p.quantity || 1),
                sort_order: idx,
            }))
            await admin.from("service_order_products").insert(pRows)
            totalProduct = pRows.reduce((acc, p) => acc + p.unit_price * p.quantity, 0)
        } else {
            totalProduct = 0
        }
        payloadToUpdate.total_product_amount = totalProduct
    }

    if (updates.services !== undefined || updates.products !== undefined) {
        payloadToUpdate.total_amount = totalService + totalProduct
    }

    if (updates.specifications !== undefined) {
        await admin.from("service_order_specifications").delete().eq("service_order_id", orderId)
        if (updates.specifications.length > 0) {
            const specRows = updates.specifications.map((s, idx) => ({
                service_order_id: orderId,
                name: s.name,
                value: s.value,
                sort_order: idx,
            }))
            await admin.from("service_order_specifications").insert(specRows)
        }
    }

    const { error: updateErr } = await admin
        .from("service_orders")
        .update(payloadToUpdate)
        .eq("id", orderId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Apply timeline log (visible in ERP with Equipe Dudit highlight)
    const changedLabels = actionContext?.changedFields && actionContext.changedFields.length > 0
        ? actionContext.changedFields
        : Object.keys(updates)

    await logAuditEvent({
        partnerId: current.partner_id,
        actorUserId: adminUser.userId,
        actorName: "Equipe Dudit",
        entityType: "service_order",
        entityId: orderId,
        actionType: "updated",
        source: "manual",
        changeLines: [
            `Alterações salvas pela Equipe Dudit.`,
            ...(changedLabels.length > 0 ? [`Campos alterados: ${changedLabels.join(", ")}`] : []),
            ...(actionContext?.reason?.trim() ? [`Motivo: "${actionContext.reason.trim()}"`] : []),
        ],
        metadata: {
            is_admin_action: true,
            dudit_action: true,
            admin_actor_name: "Equipe Dudit",
            reason: actionContext?.reason || null,
            risk_score: actionContext?.riskScore ?? null,
            changed_fields: changedLabels,
        },
    })

    // Apply Admin Action Context (Notification to seller + Admin Audit Log + Risk Score)
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.SERVICE_ORDER_UPDATE,
        targetType: "service_order",
        targetId: orderId,
        metadata: {
            previousStatus: current.status,
            newStatus: updates.status || current.status,
            changedFields: changedLabels,
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

export async function deleteAdminServiceOrder(
    orderId: string,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()
    const { data: current } = await admin
        .from("service_orders")
        .select("id, partner_id, store_id, order_number, title")
        .eq("id", orderId)
        .single()

    if (!current) return { success: false, error: "Ordem de serviço não encontrada." }

    const { error } = await admin.from("service_orders").delete().eq("id", orderId)
    if (error) return { success: false, error: error.message }

    await logAuditEvent({
        partnerId: current.partner_id,
        actorUserId: adminUser.userId,
        actorName: "Equipe Dudit",
        entityType: "service_order",
        entityId: orderId,
        actionType: "deleted",
        source: "manual",
        changeLines: [`OS #${current.order_number} excluída pela Equipe Dudit`],
        metadata: {
            is_admin_action: true,
            dudit_action: true,
            admin_actor_name: "Equipe Dudit",
            reason: actionContext?.reason || null,
        },
    })

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.SERVICE_ORDER_DELETE || "service_order_delete",
        targetType: "service_order",
        targetId: orderId,
        metadata: { reason: actionContext?.reason || null },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "service_order",
        targetId: orderId,
        actionTitle: `Ordem de Serviço #${current.order_number} excluída pela administração`,
        entityLabel: "Ordem de Serviço",
        entityName: current.title || `#${current.order_number}`,
        sellerUrl: `/erp/ordens-de-servico`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/ordens-de-servico")
    return { success: true }
}

export async function updateAdminServiceOrderStatus(
    orderId: string,
    newStatus: string,
    reason?: string,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    return updateAdminServiceOrder(
        orderId,
        { status: newStatus, internal_notes: reason ? `[Motivo do status]: ${reason}` : undefined },
        { ...actionContext, reason: reason || actionContext?.reason, changedFields: ["status"] }
    )
}

