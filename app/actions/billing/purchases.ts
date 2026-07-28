"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccess } from "@/lib/auth/authorization"
import { logBillingAudit } from "@/lib/billing/audit"
import type { BillingPurchase, CreatePurchaseInput, PurchaseWithRelations, BillingPageResult, BillingPageData, BillingFilters } from "@/lib/billing/types"
import { validateCSRFForAction } from "@/lib/security/csrf-middleware"

function applyFilters(query: any, filters?: BillingFilters) {
    if (filters?.partner_id) {
        query = query.eq("partner_id", filters.partner_id)
    }
    if (filters?.purchase_type && filters.purchase_type !== "all") {
        query = query.eq("purchase_type", filters.purchase_type)
    }
    if (filters?.status) {
        query = query.eq("status", filters.status)
    }
    if (filters?.gateway) {
        query = query.eq("gateway", filters.gateway)
    }
    if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,purchase_type.ilike.%${filters.search}%`)
    }
    if (filters?.date_from) {
        query = query.gte("created_at", filters.date_from)
    }
    if (filters?.date_to) {
        query = query.lte("created_at", filters.date_to)
    }
    return query
}

function buildPurchaseQuery(filters?: BillingFilters) {
    const admin = getAdminClient()
    let query = admin
        .from("billing_purchases")
        .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name))")
    return applyFilters(query, filters)
}

export async function listPurchasesAction(
    cursor?: string | null,
    limit: number = 20,
    filters?: BillingFilters,
): Promise<BillingPageResult<PurchaseWithRelations>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }

    const admin = getAdminClient()
    let query = buildPurchaseQuery(filters)
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    const { data, error } = await query

    if (error) {
        console.error("[Billing] listPurchases error:", error.message)
        return { data: [], nextCursor: null, hasMore: false }
    }

    const hasMore = data.length > limit
    const items = hasMore ? data.slice(0, limit) : data

    return {
        data: items.map((item: any) => ({
            ...item,
            partner_name: item.partners?.stores?.[0]?.name || null,
        })),
        nextCursor: items.length > 0 ? items[items.length - 1].created_at : null,
        hasMore,
    }
}

export async function getPurchaseAction(purchaseId: string): Promise<PurchaseWithRelations | null> {
    const user = await getCurrentUser()
    if (!user) return null

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_purchases")
        .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name)), billing_payments(*), billing_invoices(*)")
        .eq("id", purchaseId)
        .maybeSingle()

    if (error || !data) return null

    return {
        ...data,
        partner_name: (data as any).partners?.stores?.[0]?.name || null,
        payments: (data as any).billing_payments || [],
        invoice: (data as any).billing_invoices?.[0] || null,
    } as PurchaseWithRelations
}

export async function createPurchaseAction(
    input: CreatePurchaseInput,
    csrfToken: string,
): Promise<{ success: boolean; data?: BillingPurchase; error?: string }> {
    try {
        const csrfResult = await validateCSRFForAction(csrfToken)
        if (!csrfResult.valid) return { success: false, error: "CSRF inválido" }
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        await requirePartnerAccess(input.partner_id, user)

        const admin = getAdminClient()
        const totalAmount = input.total_amount ?? input.amount
        const discountAmount = input.discount_amount ?? 0

        const { data, error } = await admin
            .from("billing_purchases")
            .insert({
                partner_id: input.partner_id,
                user_id: input.user_id || user.id,
                purchase_type: input.purchase_type,
                purchaseable_type: input.purchaseable_type || null,
                purchaseable_id: input.purchaseable_id || null,
                amount: input.amount,
                discount_amount: discountAmount,
                total_amount: totalAmount,
                gateway: input.gateway || "mercado_pago",
                description: input.description || null,
                metadata: input.metadata || {},
                subscription_id: input.subscription_id || null,
                order_id: input.order_id || null,
            })
            .select()
            .single()

        if (error) {
            console.error("[Billing] createPurchase error:", error.message)
            return { success: false, error: error.message }
        }

        await logBillingAudit("billing.purchase.created", input.partner_id, {
            purchase_id: data.id,
            purchase_type: input.purchase_type,
            amount: totalAmount,
        }, user.id)

        return { success: true, data: data as BillingPurchase }
    } catch (error: any) {
        return { success: false, error: error.message || "Erro ao criar compra" }
    }
}

export async function listPurchasesPageAction(
    page: number = 1,
    pageSize: number = 20,
    filters?: BillingFilters,
    sortBy?: string,
    sortDir?: "asc" | "desc",
): Promise<BillingPageData> {
    const user = await getCurrentUser()
    if (!user) return { data: [], total: 0, page, pageSize }

    const admin = getAdminClient()
    const baseQuery = applyFilters(admin.from("billing_purchases"), filters)
    const { count } = await baseQuery.select("*", { count: "exact", head: true })

    let dataQuery = baseQuery
        .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name))")
        .order(sortBy || "created_at", { ascending: sortDir === "asc" })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)

    const { data, error } = await dataQuery

    if (error) {
        console.error("[Billing] listPurchasesPage error:", error.message)
        return { data: [], total: 0, page, pageSize }
    }

    return {
        data: (data || []).map((item: any) => ({
            ...item,
            partner_name: item.partners?.stores?.[0]?.name || null,
        })),
        total: count ?? 0,
        page,
        pageSize,
    }
}

export async function updatePurchaseStatusAction(
    purchaseId: string,
    status: string,
    csrfToken: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const csrfResult = await validateCSRFForAction(csrfToken)
        if (!csrfResult.valid) return { success: false, error: "CSRF inválido" }
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const admin = getAdminClient()
        const { data: purchase } = await admin
            .from("billing_purchases")
            .select("partner_id")
            .eq("id", purchaseId)
            .maybeSingle()

        if (!purchase) return { success: false, error: "Compra não encontrada" }

        await requirePartnerAccess(purchase.partner_id, user)

        const { error } = await admin
            .from("billing_purchases")
            .update({ status })
            .eq("id", purchaseId)

        if (error) return { success: false, error: error.message }

        const auditAction = status === "completed" ? "billing.purchase.completed"
            : status === "failed" ? "billing.purchase.failed"
                : status === "cancelled" ? "billing.purchase.cancelled"
                    : "billing.purchase.completed"

        await logBillingAudit(auditAction, purchase.partner_id, { purchase_id: purchaseId, status }, user.id)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
