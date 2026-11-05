"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccess } from "@/lib/auth/authorization"
import { getAdminRole, requireAdminScope, requireScope } from "@/lib/auth/admin-authorization"
import { resolveBillingPartnerScope } from "@/lib/billing/auth-helper"
import { logBillingAudit } from "@/lib/billing/audit"
import type { BillingPurchase, CreatePurchaseInput, PurchaseWithRelations, BillingPageResult, BillingPageData, BillingFilters } from "@/lib/billing/types"
import { validateCSRFForAction } from "@/lib/security/csrf-middleware"

function applyFilters(query: any, filters?: BillingFilters, skipPartnerId = false) {
    if (!skipPartnerId && filters?.partner_id) {
        query = query.eq("partner_id", filters.partner_id)
    }
    if (filters?.purchase_type && filters.purchase_type !== "all") {
        if (Array.isArray(filters.purchase_type)) {
            if (filters.purchase_type.length === 1) {
                query = query.eq("purchase_type", filters.purchase_type[0])
            } else if (filters.purchase_type.length > 1) {
                query = query.in("purchase_type", filters.purchase_type)
            }
        } else {
            query = query.eq("purchase_type", filters.purchase_type)
        }
    }
    if (filters?.status) {
        if (Array.isArray(filters.status)) {
            if (filters.status.length === 1) {
                query = query.eq("status", filters.status[0])
            } else if (filters.status.length > 1) {
                query = query.in("status", filters.status)
            }
        } else {
            query = query.eq("status", filters.status)
        }
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

export async function listPurchasesAction(
    cursor?: string | null,
    limit: number = 20,
    filters?: BillingFilters,
): Promise<BillingPageResult<PurchaseWithRelations>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }

    const scope = await resolveBillingPartnerScope(user, filters?.partner_id)
    if (!scope.allowed) {
        return { data: [], nextCursor: null, hasMore: false }
    }

    const admin = getAdminClient()
    let query = admin
        .from("billing_purchases")
        .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name))")

    if (scope.partnerIds) {
        if (scope.partnerIds.length === 1) {
            query = query.eq("partner_id", scope.partnerIds[0])
        } else {
            query = query.in("partner_id", scope.partnerIds)
        }
    }

    query = applyFilters(query, filters, true)
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
    const [rowResult, adminUser] = await Promise.all([
        admin
            .from("billing_purchases")
            .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name)), billing_payments(*), billing_invoices(*)")
            .eq("id", purchaseId)
            .maybeSingle(),
        getAdminRole(),
    ])

    const { data, error } = rowResult

    if (error || !data) return null

    if (adminUser) {
        try {
            requireScope(adminUser, "billing_control")
        } catch {
            return null
        }
    } else {
        try {
            await requirePartnerAccess(data.partner_id, user)
        } catch {
            return null
        }
    }

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

        const adminUser = await getAdminRole()
        if (!adminUser) {
            return { success: false, error: "Apenas administradores podem criar faturas manualmente" }
        }
        await requireAdminScope("billing_control", "admin")

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

    const scope = await resolveBillingPartnerScope(user, filters?.partner_id)
    if (!scope.allowed) {
        return { data: [], total: 0, page, pageSize }
    }

    const admin = getAdminClient()
    let dataQuery = admin
        .from("billing_purchases")
        .select("*, partners!billing_purchases_partner_id_fkey(id, stores(name)), billing_payments(payment_method_type)", { count: "exact" })

    if (scope.partnerIds) {
        if (scope.partnerIds.length === 1) {
            dataQuery = dataQuery.eq("partner_id", scope.partnerIds[0])
        } else {
            dataQuery = dataQuery.in("partner_id", scope.partnerIds)
        }
    }

    dataQuery = applyFilters(dataQuery, filters, true)
        .order(sortBy || "created_at", { ascending: sortDir === "asc" })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)

    const { data, count, error } = await dataQuery

    if (error) {
        console.error("[Billing] listPurchasesPage error:", error.message)
        return { data: [], total: 0, page, pageSize }
    }

    return {
        data: (data || []).map((item: any) => {
            const firstPayment = (item.billing_payments && item.billing_payments[0]) || null
            return {
                ...item,
                partner_name: item.partners?.stores?.[0]?.name || null,
                payment_method_type: firstPayment?.payment_method_type || null,
            }
        }),
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
            .select("partner_id, status")
            .eq("id", purchaseId)
            .maybeSingle()

        if (!purchase) return { success: false, error: "Compra não encontrada" }

        const adminUser = await getAdminRole()
        if (adminUser) {
            await requireAdminScope("billing_control", "admin")
        } else {
            await requirePartnerAccess(purchase.partner_id, user)
            if (status !== "cancelled" || purchase.status !== "pending") {
                return { success: false, error: "Operação não permitida" }
            }
        }

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

export async function getLatestPurchaseForSubscriptionAction(subscriptionId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        if (!subscriptionId) return { success: false, error: "ID da assinatura não fornecido" }

        const admin = getAdminClient()

        // 1. Busca prioritária por subscription_id (SaaS ERP platform subscriptions) com status completed
        const { data: bySaaSCompleted } = await admin
            .from("billing_purchases")
            .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
            .eq("subscription_id", subscriptionId)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (bySaaSCompleted) {
            const scope = await resolveBillingPartnerScope(user, bySaaSCompleted.partner_id)
            if (!scope.allowed) return { success: false, error: "Acesso negado" }
            return { success: true, data: bySaaSCompleted }
        }

        // 2. Busca por subscription_id (qualquer status)
        const { data: bySaaS } = await admin
            .from("billing_purchases")
            .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
            .eq("subscription_id", subscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (bySaaS) {
            const scope = await resolveBillingPartnerScope(user, bySaaS.partner_id)
            if (!scope.allowed) return { success: false, error: "Acesso negado" }
            return { success: true, data: bySaaS }
        }

        // 3. Fallback: Busca se subscriptionId for da tabela SaaS subscriptions mas com partner_id
        const { data: saasSub } = await admin
            .from("subscriptions")
            .select("partner_id")
            .eq("id", subscriptionId)
            .maybeSingle()

        if (saasSub?.partner_id) {
            const { data: byPartner } = await admin
                .from("billing_purchases")
                .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
                .eq("partner_id", saasSub.partner_id)
                .eq("purchase_type", "subscription")
                .eq("status", "completed")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (byPartner) {
                const scope = await resolveBillingPartnerScope(user, byPartner.partner_id)
                if (!scope.allowed) return { success: false, error: "Acesso negado" }
                return { success: true, data: byPartner }
            }
        }

        // 4. Fallback: Busca por recurring_subscription_id (marketplace customer subscriptions)
        const { data: byRecurring } = await admin
            .from("billing_purchases")
            .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
            .eq("recurring_subscription_id", subscriptionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (byRecurring) {
            const scope = await resolveBillingPartnerScope(user, byRecurring.partner_id)
            if (!scope.allowed) return { success: false, error: "Acesso negado" }
            return { success: true, data: byRecurring }
        }

        return { success: false, error: "Nenhuma fatura encontrada para esta assinatura." }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getLatestCompletedPurchaseForPartnerAction(partnerId: string) {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        if (!partnerId) return { success: false, error: "ID do parceiro não fornecido" }

        const scope = await resolveBillingPartnerScope(user, partnerId)
        if (!scope.allowed) return { success: false, error: "Acesso negado" }

        const admin = getAdminClient()
        const { data: purchase } = await admin
            .from("billing_purchases")
            .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
            .eq("partner_id", partnerId)
            .eq("purchase_type", "subscription")
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (purchase) return { success: true, data: purchase }

        // Fallback: qualquer compra completada do parceiro
        const { data: anyCompleted } = await admin
            .from("billing_purchases")
            .select("id, description, total_amount, amount, status, created_at, partner_id, metadata")
            .eq("partner_id", partnerId)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (anyCompleted) return { success: true, data: anyCompleted }

        return { success: false, error: "Nenhuma fatura paga encontrada." }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
