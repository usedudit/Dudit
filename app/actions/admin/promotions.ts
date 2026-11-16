"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { revalidatePath } from "next/cache"

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export interface AdminCampaignStats {
    total: number
    active: number
    inactive: number
    expired: number
}

export async function getAdminCampaignsStats(): Promise<AdminCampaignStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()
    const now = new Date().toISOString()

    const [totalRes, activeRes, inactiveRes] = await Promise.all([
        admin.from("campaigns").select("id", { count: "exact", head: true }),
        admin.from("campaigns").select("id", { count: "exact", head: true }).eq("is_active", true),
        admin.from("campaigns").select("id", { count: "exact", head: true }).eq("is_active", false),
    ])

    return {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        inactive: inactiveRes.count || 0,
        expired: 0,
    }
}

export async function getAdminCampaigns(
    cursor?: string | null,
    limit: number = 20,
    filters?: {
        isActive?: string
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
        .from("campaigns")
        .select(`
            id,
            partner_id,
            store_id,
            name,
            description,
            customer_scope,
            starts_at,
            ends_at,
            is_active,
            created_at,
            promotions(*),
            campaign_customers(customer_id),
            stores!left(id, name, logo_url, phone, partner_id, partners!left(id))
        `)

    if (filters?.search && filters.search.trim().length > 0) {
        const s = sanitizeIlike(filters.search.trim())
        query = query.ilike("name", `%${s}%`)
    }

    if (filters?.isActive === "active") {
        query = query.eq("is_active", true)
    } else if (filters?.isActive === "inactive") {
        query = query.eq("is_active", false)
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

export async function getAdminCampaignDetail(campaignId: string): Promise<any | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    const { data: campaign, error } = await admin
        .from("campaigns")
        .select(`
            *,
            promotions(*),
            campaign_customers(customer_id),
            stores!left(id, name, person_type, logo_url, banner_url, phone, description, risk_score, partner_id, partners!left(id))
        `)
        .eq("id", campaignId)
        .maybeSingle()

    if (error || !campaign) return null

    const [auditRes, timelineRes] = await Promise.all([
        admin.from("admin_audit_logs").select("*").eq("target_id", campaignId).order("created_at", { ascending: false }).limit(20),
        admin.from("audit_logs").select("*").eq("entity_id", campaignId).order("created_at", { ascending: false }).limit(50),
    ])

    return {
        ...campaign,
        audit_events: auditRes.data || [],
        history: (timelineRes.data || []).map((t: any) => ({
            ...t,
            actor_name: t.actor_name || (t.metadata?.dudit_action || t.metadata?.is_admin_action ? "Equipe Dudit" : "Sistema"),
        })),
        store_name: campaign.stores?.name || "Loja Parceira",
        partner_name: campaign.stores?.name || "Loja Parceira",
    }
}

export async function updateAdminCampaign(
    campaignId: string,
    updates: {
        name?: string
        description?: string | null
        startsAt?: string | null
        endsAt?: string | null
        isActive?: boolean
        customerScope?: "all" | "specific"
        customerIds?: string[]
        storeId?: string | null
        rule?: any
    },
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current, error: fetchErr } = await admin
        .from("campaigns")
        .select("id, partner_id, store_id, name, is_active")
        .eq("id", campaignId)
        .single()

    if (fetchErr || !current) {
        return { success: false, error: "Campanha não encontrada." }
    }

    const payloadToUpdate: Record<string, any> = {}

    if (updates.name !== undefined) payloadToUpdate.name = sanitizeInput(updates.name)
    if (updates.description !== undefined) payloadToUpdate.description = sanitizeNotes(updates.description || "")
    if (updates.startsAt !== undefined) payloadToUpdate.starts_at = updates.startsAt
    if (updates.endsAt !== undefined) payloadToUpdate.ends_at = updates.endsAt
    if (updates.isActive !== undefined) payloadToUpdate.is_active = updates.isActive
    if (updates.customerScope !== undefined) payloadToUpdate.customer_scope = updates.customerScope
    if (updates.storeId !== undefined) payloadToUpdate.store_id = updates.storeId

    const { error: updateErr } = await admin
        .from("campaigns")
        .update(payloadToUpdate)
        .eq("id", campaignId)

    if (updateErr) {
        return { success: false, error: updateErr.message }
    }

    // Customers
    if (updates.customerScope === "specific" && Array.isArray(updates.customerIds)) {
        await admin.from("campaign_customers").delete().eq("campaign_id", campaignId)
        if (updates.customerIds.length > 0) {
            await admin.from("campaign_customers").insert(
                updates.customerIds.map(cid => ({ campaign_id: campaignId, customer_id: cid }))
            )
        }
    }

    // Promotion rule update if provided
    if (updates.rule) {
        const rule = updates.rule
        const rulePayload: Record<string, any> = {
            promotion_type: rule.promotion_type,
            discount_type: rule.discount_type || null,
            discount_value: rule.discount_value !== undefined ? Number(rule.discount_value) : null,
            max_discount_amount: rule.max_discount_amount !== undefined ? Number(rule.max_discount_amount) : null,
            min_spend_amount: rule.min_spend_amount !== undefined ? Number(rule.min_spend_amount) : null,
            gift_product_id: rule.gift_product_id || null,
            gift_service_id: rule.gift_service_id || null,
            buy_quantity: rule.buy_quantity ? Number(rule.buy_quantity) : null,
            pay_quantity: rule.pay_quantity ? Number(rule.pay_quantity) : null,
            apply_scope: rule.apply_scope || "entire_cart",
            allow_coupon_combination: !!rule.allow_coupon_combination,
            usage_limit: rule.usage_limit ? Number(rule.usage_limit) : null,
            usage_limit_per_customer: rule.usage_limit_per_customer ? Number(rule.usage_limit_per_customer) : null,
        }
        if (rule.id) {
            await admin.from("promotions").update(rulePayload).eq("id", rule.id)
        }
    }

    const changedLabels = actionContext?.changedFields && actionContext.changedFields.length > 0
        ? actionContext.changedFields
        : Object.keys(updates)

    // Log to audit_logs (timeline visible with Equipe Dudit highlight)
    await logAuditEvent({
        partnerId: current.partner_id,
        actorUserId: adminUser.userId,
        actorName: "Equipe Dudit",
        entityType: "promotion",
        entityId: campaignId,
        actionType: "updated",
        source: "manual",
        changeLines: [
            `Campanha alterada pela Equipe Dudit.`,
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

    // Log to admin_audit_logs
    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.PROMOTION_UPDATE || "promotion_update",
        targetType: "promotion",
        targetId: campaignId,
        metadata: {
            name: updates.name || current.name,
            changedFields: changedLabels,
            reason: actionContext?.reason || null,
        },
    })

    // Notify seller
    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "promotion",
        targetId: campaignId,
        actionTitle: `Campanha "${updates.name || current.name}" alterada pela administração`,
        entityLabel: "Campanha",
        entityName: updates.name || current.name,
        sellerUrl: `/erp/promocoes?view=${campaignId}`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/promocoes")
    return { success: true }
}

export async function deleteAdminCampaign(
    campaignId: string,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()

    const { data: current } = await admin
        .from("campaigns")
        .select("id, partner_id, store_id, name")
        .eq("id", campaignId)
        .single()

    if (!current) return { success: false, error: "Campanha não encontrada." }

    const { error } = await admin.from("campaigns").delete().eq("id", campaignId)
    if (error) return { success: false, error: error.message }

    await logAuditEvent({
        partnerId: current.partner_id,
        actorUserId: adminUser.userId,
        actorName: "Equipe Dudit",
        entityType: "promotion",
        entityId: campaignId,
        actionType: "deleted",
        source: "manual",
        changeLines: [`Campanha "${current.name}" excluída pela Equipe Dudit`],
        metadata: {
            is_admin_action: true,
            dudit_action: true,
            admin_actor_name: "Equipe Dudit",
            reason: actionContext?.reason || null,
        },
    })

    await adminAuditLog({
        adminUserId: adminUser.userId,
        actionType: AdminActionType.PROMOTION_DELETE || "promotion_delete",
        targetType: "promotion",
        targetId: campaignId,
        metadata: { reason: actionContext?.reason || null },
    })

    await applyAdminActionContext({
        adminUserId: adminUser.userId,
        partnerId: current.partner_id,
        storeId: current.store_id,
        targetType: "promotion",
        targetId: campaignId,
        actionTitle: `Campanha "${current.name}" excluída pela administração`,
        entityLabel: "Campanha",
        entityName: current.name,
        sellerUrl: `/erp/promocoes`,
        ctx: actionContext,
    })

    revalidatePath("/ddt-admin/promocoes")
    return { success: true }
}

export async function toggleAdminCampaignsStatus(
    ids: string[],
    isActive: boolean,
    actionContext?: AdminActionContext | null
): Promise<{ success: boolean; error?: string }> {
    const adminUser = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const admin = getAdminClient()
    const { error } = await admin
        .from("campaigns")
        .update({ is_active: isActive })
        .in("id", ids)

    if (error) return { success: false, error: error.message }

    revalidatePath("/ddt-admin/promocoes")
    return { success: true }
}

export async function getAdminPromotionScopeData(partnerId?: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdminScope("moderation")

    const admin = getAdminClient()

    let pQuery = admin.from("products").select("id, name, category_id, price, sku, images, is_active, store_id").limit(100)
    let sQuery = admin.from("services").select("id, name, category_id, price, sku, images, is_active, store_id").limit(100)
    let cQuery = admin.from("product_categories").select("id, name, is_active, store_ids").is("parent_id", null)
    let scQuery = admin.from("service_categories").select("id, name, is_active, store_ids")
    let custQuery = admin.from("customers").select("id, name, email, phone").limit(100)
    let stQuery = admin.from("stores").select("id, name, is_active")

    if (partnerId && partnerId !== "admin") {
        pQuery = pQuery.eq("partner_id", partnerId)
        sQuery = sQuery.eq("partner_id", partnerId)
        cQuery = cQuery.eq("partner_id", partnerId)
        scQuery = scQuery.eq("partner_id", partnerId)
        custQuery = custQuery.eq("partner_id", partnerId)
        stQuery = stQuery.eq("partner_id", partnerId)
    }

    const [products, services, categories, serviceCategories, customers, stores] = await Promise.all([
        pQuery, sQuery, cQuery, scQuery, custQuery, stQuery,
    ])

    return {
        products: products.data || [],
        services: services.data || [],
        categories: categories.data || [],
        serviceCategories: serviceCategories.data || [],
        customers: customers.data || [],
        stores: (stores.data || []).map((s: any) => ({ id: s.id, name: s.name, isActive: s.is_active })),
    }
}
