"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"
import { revalidatePath } from "next/cache"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export interface AdminPromotionStats {
    total: number
    active: number
    inactive: number
    expired: number
}

export async function getAdminPromotionsStats(): Promise<AdminPromotionStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()
    const now = new Date().toISOString()

    const [totalRes, activeRes, inactiveRes] = await Promise.all([
        admin.from("coupons").select("id", { count: "exact", head: true }),
        admin.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", true),
        admin.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", false),
    ])

    return {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        inactive: inactiveRes.count || 0,
        expired: 0,
    }
}

export async function getAdminPromotions(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        status?: string
        search?: string
    }
): Promise<CursorPaginatedResult<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()
    const pageSize = Math.min(limit, 100)

    let query = admin
        .from("coupons")
        .select(`
            id,
            partner_id,
            store_id,
            code,
            discount_type,
            discount_value,
            min_cart_value,
            max_discount_value,
            usage_limit,
            coupon_usages(count),
            is_active,
            starts_at,
            ends_at,
            created_at,
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.ilike("code", `%${s}%`)
    }

    if (filters?.status === "active") {
        query = query.eq("is_active", true)
    } else if (filters?.status === "inactive") {
        query = query.eq("is_active", false)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data, error } = await query
    if (error) throw error

    const items = ((data || []) as any[]).map((row: any) => ({
        ...row,
        usage_count: Array.isArray(row.coupon_usages) ? row.coupon_usages[0]?.count || 0 : 0,
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

export async function updateAdminPromotion(
    couponId: string,
    updates: {
        is_active?: boolean
        discount_value?: number
        ends_at?: string | null
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("coupons")
        .select("id, partner_id, store_id, code, is_active")
        .eq("id", couponId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Cupom/Promoção não encontrada." }
    }

    const payloadToUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
    }

    if (updates.is_active !== undefined) payloadToUpdate.is_active = updates.is_active
    if (updates.discount_value !== undefined) payloadToUpdate.discount_value = updates.discount_value
    if (updates.ends_at !== undefined) payloadToUpdate.ends_at = updates.ends_at

    const { error: updateErr } = await admin
        .from("coupons")
        .update(payloadToUpdate)
        .eq("id", couponId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Apply Admin Action Context (Notification to seller + Audit Log + Risk Score)
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.PROMOTION_UPDATE,
        targetType: "promotion",
        targetId: couponId,
        metadata: {
            previousActive: current.is_active,
            newActive: updates.is_active ?? current.is_active,
            changedFields: actionContext?.changedFields || Object.keys(updates),
            reason: actionContext?.reason || null,
        },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "promotion",
        targetId: couponId,
        actionTitle: `Cupom ${current.code} atualizado pela administração`,
        entityLabel: "Cupom/Promoção",
        entityName: current.code,
        sellerUrl: `/erp/cupons`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/promocoes")
    return { success: true }
}

