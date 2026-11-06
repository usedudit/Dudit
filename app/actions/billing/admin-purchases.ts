"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import type { PurchaseWithRelations, BillingPageData, BillingFilters } from "@/lib/billing/types"

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

export interface AdminPurchasesStats {
    total: number
    completed: number
    pending: number
    failed: number
    refunded: number
    cancelled: number
}

export interface AdminListPurchasesResult {
    success: boolean
    data?: PurchaseWithRelations[]
    totalCount?: number
    page?: number
    limit?: number
    stats?: AdminPurchasesStats
    error?: string
}

export async function adminListPurchasesAction(params?: {
    status?: string
    purchase_type?: string
    search?: string
    page?: number
    limit?: number
    date_from?: string
    date_to?: string
}): Promise<AdminListPurchasesResult> {
    try {
        await requireAdminScope("billing_control", "admin")
        const supabase = getAdminClient()

        const page = params?.page || 1
        const limit = params?.limit || 100
        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabase
            .from("billing_purchases")
            .select(`
                id, partner_id, user_id, purchase_type, purchaseable_type, purchaseable_id,
                amount, total_amount, discount_amount, currency, status, gateway, gateway_payment_id,
                description, metadata, subscription_id, order_id, created_at, updated_at,
                partner:partner_id (
                    id,
                    stores (id, name, logo_url, is_headquarters)
                ),
                billing_payments (
                    id, payment_method_type, status, paid_at, amount, gateway_payment_id
                ),
                billing_invoices (
                    id, invoice_number, status, invoice_data
                )
            `, { count: "exact" })

        if (params?.status && params.status !== "all") {
            query = query.eq("status", params.status)
        }
        if (params?.purchase_type && params.purchase_type !== "all") {
            query = query.eq("purchase_type", params.purchase_type)
        }
        if (params?.search) {
            query = query.or(`description.ilike.%${params.search}%,purchase_type.ilike.%${params.search}%`)
        }
        if (params?.date_from) {
            query = query.gte("created_at", params.date_from)
        }
        if (params?.date_to) {
            query = query.lte("created_at", params.date_to)
        }

        query = query.order("created_at", { ascending: false }).range(from, to)

        const { data, count, error } = await query

        if (error) {
            console.error("[adminListPurchasesAction] Error:", error)
            return { success: false, error: error.message }
        }

        // Load plans for subscription purchases
        const planIds = Array.from(
            new Set((data || []).map((r: any) => r.purchaseable_id).filter(Boolean))
        )
        const { data: plansData } = planIds.length
            ? await supabase.from("billing_plans").select("id, name, slug, price").in("id", planIds)
            : { data: [] }
        const planMap = new Map((plansData || []).map((p: any) => [p.id, p]))

        const enrichedData = (data || []).map((r: any) => ({
            ...r,
            partner_name: r.partner?.stores?.[0]?.name || null,
            purchase: r.purchaseable_id ? { plan: planMap.get(r.purchaseable_id) || null } : null,
            payments: r.billing_payments || [],
            invoice: r.billing_invoices?.[0] || null,
        }))

        // Quick stats
        const { data: statsData } = await supabase
            .from("billing_purchases")
            .select("status")

        const stats: AdminPurchasesStats = {
            total: statsData?.length || 0,
            completed: statsData?.filter((s: any) => s.status === "completed").length || 0,
            pending: statsData?.filter((s: any) => s.status === "pending").length || 0,
            failed: statsData?.filter((s: any) => s.status === "failed").length || 0,
            refunded: statsData?.filter((s: any) => s.status === "refunded" || s.status === "partially_refunded").length || 0,
            cancelled: statsData?.filter((s: any) => s.status === "cancelled").length || 0,
        }

        return {
            success: true,
            data: enrichedData,
            totalCount: count || 0,
            page,
            limit,
            stats,
        }
    } catch (error: any) {
        console.error("[adminListPurchasesAction] Error:", error)
        return { success: false, error: error?.message || "Erro ao listar compras." }
    }
}