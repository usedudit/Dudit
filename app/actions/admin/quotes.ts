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
import { revalidateQuotes } from "@/lib/utils/revalidation"
import { revalidatePath } from "next/cache"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export interface AdminQuoteStats {
    total: number
    pendente: number
    aprovado: number
    recusado: number
    expirado: number
}

export async function getAdminQuotesStats(): Promise<AdminQuoteStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const [totalRes, pendenteRes, aprovadoRes, recusadoRes, expiradoRes] = await Promise.all([
        admin.from("quotes").select("id", { count: "exact", head: true }),
        admin.from("quotes").select("id", { count: "exact", head: true }).in("status", ["pending", "pendente", "draft", "rascunho", "sent", "enviado"]),
        admin.from("quotes").select("id", { count: "exact", head: true }).in("status", ["approved", "aprovado"]),
        admin.from("quotes").select("id", { count: "exact", head: true }).in("status", ["rejected", "recusado", "cancelled", "cancelado"]),
        admin.from("quotes").select("id", { count: "exact", head: true }).in("status", ["expired", "expirado"]),
    ])

    return {
        total: totalRes.count || 0,
        pendente: pendenteRes.count || 0,
        aprovado: aprovadoRes.count || 0,
        recusado: recusadoRes.count || 0,
        expirado: expiradoRes.count || 0,
    }
}

export async function getAdminQuotes(
    cursor?: string | null,
    limit: number = 50,
    filters?: {
        status?: string
        statuses?: string[]
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
        .from("quotes")
        .select(`
            id,
            partner_id,
            store_id,
            quote_number,
            status,
            total,
            subtotal,
            notes,
            internal_notes,
            discount_type,
            discount_value,
            shipping_cost,
            additional_costs,
            issue_date,
            expiration_date,
            public_token,
            created_at,
            updated_at,
            customer_id,
            user_id,
            metadata,
            customers!customer_id (id, name, phone, email),
            items_count:quote_items(count),
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`quote_number.ilike.%${s}%,notes.ilike.%${s}%`)
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

    const items = ((data || []) as any[]).map((row: any) => {
        let formattedIssueDate = ""
        let createdAtTime = 0
        if (row.issue_date) {
            const [y, m, d] = String(row.issue_date).split("-")
            formattedIssueDate = `${d}/${m}/${y}`
            createdAtTime = new Date(Number(y), Number(m) - 1, Number(d)).getTime()
        } else if (row.created_at) {
            const dt = new Date(row.created_at)
            formattedIssueDate = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`
            createdAtTime = dt.getTime()
        }

        let formattedExpirationDate = null
        if (row.expiration_date) {
            const [y, m, d] = String(row.expiration_date).split("-")
            formattedExpirationDate = `${d}/${m}/${y}`
        }

        return {
            ...row,
            originalId: row.id,
            displayId: row.quote_number || `#${row.id.substring(0, 8)}`,
            customer_name: row.customers?.name || "Cliente não informado",
            customer_phone: row.customers?.phone || null,
            customer_email: row.customers?.email || null,
            total_amount: Number(row.total || row.subtotal || 0),
            store_name: row.stores?.name || "Loja Parceira",
            partner_name: row.stores?.name || "Loja Parceira",
            items_count: Array.isArray(row.items_count) ? row.items_count[0]?.count || 0 : 0,
            formattedIssueDate,
            formattedExpirationDate,
            created_at_time: createdAtTime,
        }
    })
    const hasMore = items.length > pageSize

    return {
        data: items.slice(0, pageSize),
        nextCursor: hasMore && items.length > 0 ? items[pageSize - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

export async function getAdminQuoteDetail(quoteId: string): Promise<any | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const { data: quote, error } = await admin
        .from("quotes")
        .select(`
            *,
            customers (
                id, 
                name, 
                email, 
                phone,
                addresses (*)
            ),
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id, partners!left(id))
        `)
        .eq("id", quoteId)
        .maybeSingle()

    if (error || !quote) return null

    // Get quote items, attachments, and audit events
    const [itemsRes, attachRes, auditRes] = await Promise.all([
        admin
            .from("quote_items")
            .select(`
                *,
                products (
                    id, 
                    name, 
                    sku, 
                    images, 
                    price, 
                    stock_quantity, 
                    allow_sell_without_stock,
                    product_variants (
                        id,
                        variant_name,
                        sku,
                        variant_options
                    )
                )
            `)
            .eq("quote_id", quoteId)
            .order("sort_order", { ascending: true }),
        admin.from("quote_attachments").select("*").eq("quote_id", quoteId).order("created_at", { ascending: false }),
        admin.from("admin_audit_logs").select("*").eq("target_id", quoteId).order("created_at", { ascending: false }).limit(20),
    ])

    const mappedItems = (itemsRes.data || []).map((item: any) => {
        let resolvedImage = item.products?.images?.[0] || "https://img.dudit.com.br/static/Placeholder.png"
        if (item.custom_name && item.products?.product_variants) {
            const customName = item.custom_name.trim()
            const productName = item.products.name || ""
            const suffix = customName.startsWith(productName)
                ? customName.slice(productName.length).replace(/^[\s-–-]+/, "").trim()
                : customName

            const match = item.products.product_variants.find(
                (v: any) =>
                    v.variant_name?.toLowerCase().trim() === suffix.toLowerCase() ||
                    v.variant_name?.toLowerCase().trim() === customName.toLowerCase() ||
                    (item.product_sku_snapshot && v.sku?.toLowerCase().trim() === item.product_sku_snapshot.toLowerCase().trim())
            )
            if (match?.variant_options?.image) {
                resolvedImage = match.variant_options.image
            }
        }
        return {
            ...item,
            image: resolvedImage,
        }
    })

    let userProfile = null
    if (quote.user_id) {
        const { data: profile } = await admin
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", quote.user_id)
            .maybeSingle()
        if (profile) {
            userProfile = {
                full_name: profile.full_name,
                email: null,
            }
        }
    }

    return {
        ...quote,
        items: mappedItems,
        attachments: attachRes.data || [],
        user_profiles: userProfile,
        audit_events: auditRes.data || [],
        store_name: quote.stores?.name || "Loja Parceira",
        partner_name: quote.stores?.name || "Loja Parceira",
    }
}

export async function updateAdminQuoteFull(
    quoteId: string,
    payload: {
        customerId?: string | null
        issueDate?: string
        expirationDate?: string | null
        notes?: string
        internalNotes?: string
        discountType?: "percentage" | "fixed"
        discountValue?: number
        shippingCost?: number
        additionalCosts?: number
        status?: string
        items?: Array<{
            productId?: string | null
            customName?: string
            description?: string
            quantity: number
            unitPrice: number
            sortOrder?: number
        }>
        preview?: Record<string, any>
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("quotes")
        .select("id, partner_id, store_id, quote_number, status, total, metadata")
        .eq("id", quoteId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Orçamento não encontrado." }
    }

    // 1. Calculate financial totals
    const items = payload.items || []
    const calculatedSubtotal = items.reduce(
        (acc, it) => acc + Number(it.quantity || 0) * Number(it.unitPrice || 0),
        0
    )

    const discType = payload.discountType || "fixed"
    const discVal = Number(payload.discountValue || 0)
    const shipping = Number(payload.shippingCost || 0)
    const additional = Number(payload.additionalCosts || 0)

    let discountAmount = 0
    if (discType === "percentage") {
        discountAmount = (calculatedSubtotal * discVal) / 100
    } else {
        discountAmount = discVal
    }

    const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmount + shipping + additional)

    const updatedMetadata = {
        ...(current.metadata || {}),
        ...(payload.preview ? { preview: payload.preview } : {}),
    }

    // 2. Update quote row
    const quoteUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
        subtotal: Number(calculatedSubtotal.toFixed(2)),
        total: Number(calculatedTotal.toFixed(2)),
        discount_type: discType,
        discount_value: discVal,
        shipping_cost: shipping,
        additional_costs: additional,
        metadata: updatedMetadata,
    }

    if (payload.customerId !== undefined) quoteUpdate.customer_id = payload.customerId
    if (payload.issueDate !== undefined) quoteUpdate.issue_date = payload.issueDate
    if (payload.expirationDate !== undefined) quoteUpdate.expiration_date = payload.expirationDate
    if (payload.notes !== undefined) quoteUpdate.notes = sanitizeNotes(payload.notes)
    if (payload.internalNotes !== undefined) quoteUpdate.internal_notes = sanitizeNotes(payload.internalNotes)
    if (payload.status !== undefined) quoteUpdate.status = payload.status

    const { error: quoteErr } = await admin
        .from("quotes")
        .update(quoteUpdate)
        .eq("id", quoteId)

    if (quoteErr) {
        return { success: false, error: quoteErr.message }
    }

    // 3. Update items: delete and re-insert
    if (payload.items && payload.items.length > 0) {
        await admin.from("quote_items").delete().eq("quote_id", quoteId)
        const itemsToInsert = payload.items.map((it, idx) => ({
            quote_id: quoteId,
            partner_id: current.partner_id,
            product_id: it.productId || null,
            custom_name: it.customName || null,
            description: it.description || null,
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unitPrice || 0),
            total_price: Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
            sort_order: it.sortOrder !== undefined ? it.sortOrder : idx,
        }))
        const { error: itemsErr } = await admin.from("quote_items").insert(itemsToInsert)
        if (itemsErr) {
            console.error("[updateAdminQuoteFull] Items insert error:", itemsErr)
        }
    }

    // 4. Log to audit_logs (Dudit / seller visible in history timeline)
    await admin.from("audit_logs").insert({
        partner_id: current.partner_id,
        actor_user_id: adminUser.userId,
        entity_type: "quote",
        entity_id: quoteId,
        action_type: "updated",
        change_lines: [
            actionContext?.reason
                ? `Equipe Dudit alterou o orçamento. Motivo: ${actionContext.reason}`
                : "Equipe Dudit alterou os dados do orçamento.",
        ],
        metadata: {
            actor_name: "Equipe Dudit",
            dudit_action: true,
            is_admin_action: true,
            changed_fields: actionContext?.changedFields || Object.keys(payload),
            reason: actionContext?.reason || null,
        },
    })

    // 5. Admin Audit Log & Seller Notification
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteId,
        metadata: {
            previousStatus: current.status,
            newStatus: payload.status || current.status,
            changedFields: actionContext?.changedFields || Object.keys(payload),
            reason: actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "quote",
        targetId: quoteId,
        actionTitle: `Orçamento #${current.quote_number || quoteId.slice(0, 8)} atualizado pela administração`,
        entityLabel: "Orçamento",
        entityName: `#${current.quote_number || quoteId.slice(0, 8)}`,
        sellerUrl: `/erp/orcamentos?view=${quoteId}`,
        ctx: actionContext,
    })

    await revalidateQuotes(current.partner_id, quoteId)
    revalidatePath("/ddt-admin/orcamentos")
    return { success: true }
}

export async function updateAdminQuoteStatus(
    quoteId: string,
    status: string,
    reason?: string,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("quotes")
        .select("id, partner_id, store_id, quote_number, status")
        .eq("id", quoteId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Orçamento não encontrado." }
    }

    const { error: updateErr } = await admin
        .from("quotes")
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq("id", quoteId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Log to audit_logs (Equipe Dudit)
    await admin.from("audit_logs").insert({
        partner_id: current.partner_id,
        actor_user_id: adminUser.userId,
        entity_type: "quote",
        entity_id: quoteId,
        action_type: "status_changed",
        change_lines: [
            reason
                ? `Equipe Dudit alterou o status para ${status}. Motivo: ${reason}`
                : `Equipe Dudit alterou o status de ${current.status} para ${status}.`,
        ],
        metadata: {
            actor_name: "Equipe Dudit",
            dudit_action: true,
            is_admin_action: true,
            previous_status: current.status,
            new_status: status,
            reason: reason || null,
        },
    })

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteId,
        metadata: {
            previousStatus: current.status,
            newStatus: status,
            reason: reason || actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "quote",
        targetId: quoteId,
        actionTitle: `Status do Orçamento #${current.quote_number || quoteId.slice(0, 8)} alterado pela administração`,
        entityLabel: "Orçamento",
        entityName: `#${current.quote_number || quoteId.slice(0, 8)}`,
        sellerUrl: `/erp/orcamentos?view=${quoteId}`,
        ctx: actionContext,
    })

    await revalidateQuotes(current.partner_id, quoteId)
    revalidatePath("/ddt-admin/orcamentos")
    return { success: true }
}

export async function deleteAdminQuote(
    quoteId: string,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("quotes")
        .select("id, partner_id, store_id, quote_number")
        .eq("id", quoteId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Orçamento não encontrado." }
    }

    const { error: delErr } = await admin.from("quotes").delete().eq("id", quoteId)
    if (delErr) {
        return { success: false, error: delErr.message }
    }

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteId,
        metadata: {
            action: "delete",
            quoteNumber: current.quote_number,
            reason: actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "quote",
        targetId: quoteId,
        actionTitle: `Orçamento #${current.quote_number || quoteId.slice(0, 8)} excluído pela administração`,
        entityLabel: "Orçamento",
        entityName: `#${current.quote_number || quoteId.slice(0, 8)}`,
        sellerUrl: `/erp/orcamentos`,
        ctx: actionContext,
    })

    await revalidateQuotes(current.partner_id, quoteId)
    revalidatePath("/ddt-admin/orcamentos")
    return { success: true }
}

export async function batchDeleteAdminQuotes(
    quoteIds: string[]
): Promise<{ success: boolean; count?: number; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    if (!quoteIds || quoteIds.length === 0) {
        return { success: true, count: 0 }
    }

    const admin = getAdminClient()
    const { error } = await admin.from("quotes").delete().in("id", quoteIds)
    if (error) {
        return { success: false, error: error.message }
    }

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteIds[0],
        metadata: {
            action: "batch_delete",
            quoteIds,
            count: quoteIds.length,
        },
    })

    revalidatePath("/ddt-admin/orcamentos")
    return { success: true, count: quoteIds.length }
}

export async function batchUpdateAdminQuotesStatus(
    quoteIds: string[],
    status: string
): Promise<{ success: boolean; count?: number; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    if (!quoteIds || quoteIds.length === 0) {
        return { success: true, count: 0 }
    }

    const admin = getAdminClient()
    const { error } = await admin
        .from("quotes")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", quoteIds)

    if (error) {
        return { success: false, error: error.message }
    }

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteIds[0],
        metadata: {
            action: "batch_status_update",
            quoteIds,
            status,
            count: quoteIds.length,
        },
    })

    revalidatePath("/ddt-admin/orcamentos")
    return { success: true, count: quoteIds.length }
}
