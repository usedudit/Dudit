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
        .from("quotes")
        .select(`
            id,
            partner_id,
            store_id,
            quote_number,
            customer_name,
            customer_phone,
            customer_email,
            status,
            total_amount,
            notes,
            valid_until,
            public_token,
            created_at,
            updated_at,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.or(`quote_number.ilike.%${s}%,customer_name.ilike.%${s}%`)
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

    const items = (data || []) as any[]
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
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id, partners!left(id))
        `)
        .eq("id", quoteId)
        .maybeSingle()

    if (error || !quote) return null

    // Get quote items and audit events
    const [itemsRes, auditRes] = await Promise.all([
        admin.from("quote_items").select("*").eq("quote_id", quoteId).order("created_at", { ascending: true }),
        admin.from("admin_audit_logs").select("*").eq("target_id", quoteId).order("created_at", { ascending: false }).limit(20),
    ])

    return {
        ...quote,
        items: itemsRes.data || [],
        audit_events: auditRes.data || [],
    }
}

export async function updateAdminQuote(
    quoteId: string,
    updates: {
        status?: string
        notes?: string
        valid_until?: string | null
    },
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

    const payloadToUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
    }

    if (updates.status !== undefined) payloadToUpdate.status = updates.status
    if (updates.notes !== undefined) payloadToUpdate.notes = sanitizeNotes(updates.notes)
    if (updates.valid_until !== undefined) payloadToUpdate.valid_until = updates.valid_until

    const { error: updateErr } = await admin
        .from("quotes")
        .update(payloadToUpdate)
        .eq("id", quoteId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Apply Admin Action Context (Notification to seller + Audit Log + Risk Score)
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.QUOTE_UPDATE,
        targetType: "quote",
        targetId: quoteId,
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
        targetType: "quote",
        targetId: quoteId,
        actionTitle: `Orçamento #${current.quote_number} atualizado pela administração`,
        entityLabel: "Orçamento",
        entityName: `#${current.quote_number}`,
        sellerUrl: `/erp/orcamentos?view=${quoteId}`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/orcamentos")
    return { success: true }
}

