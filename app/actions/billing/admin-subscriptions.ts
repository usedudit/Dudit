"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export interface AdminSubscriptionsStats {
    total: number
    active: number
    past_due: number
    cancelled: number
    trial: number
}

export interface AdminListSubscriptionsResult {
    success: boolean
    data?: any[]
    totalCount?: number
    page?: number
    limit?: number
    stats?: AdminSubscriptionsStats
    error?: string
}

export async function adminListBillingSubscriptionsAction(params?: {
    status?: string
    search?: string
    page?: number
    limit?: number
    date_from?: string
    date_to?: string
}): Promise<AdminListSubscriptionsResult> {
    try {
        await requireAdminScope("billing_control", "admin")
        const supabase = getAdminClient()

        const page = params?.page || 1
        const limit = params?.limit || 100
        const from = (page - 1) * limit
        const to = from + limit - 1

        // Fetch subscription-type purchases with their related data
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
            .eq("purchase_type", "subscription")

        if (params?.status && params.status !== "all") {
            query = query.eq("status", params.status)
        }
        if (params?.search) {
            query = query.or(`description.ilike.%${params.search}%,partner_id.ilike.%${params.search}%`)
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
            console.error("[adminListBillingSubscriptionsAction] Error:", error)
            return { success: false, error: error.message }
        }

        // Load plans for subscription purchases
        const planIds = Array.from(
            new Set((data || []).map((r: any) => r.purchaseable_id).filter(Boolean))
        )
        const { data: plansData } = planIds.length
            ? await supabase.from("billing_plans").select("id, name, slug, price, interval").in("id", planIds)
            : { data: [] }
        const planMap = new Map((plansData || []).map((p: any) => [p.id, p]))

        // Also fetch subscription status from subscriptions table if available
        const subscriptionIds = Array.from(
            new Set((data || []).map((r: any) => r.subscription_id).filter(Boolean))
        )
        let subscriptionMap = new Map<string, any>()
        if (subscriptionIds.length) {
            const { data: subsData } = await supabase
                .from("subscriptions")
                .select("id, status, current_period_start, current_period_end, trial_end, cancel_at_period_end, mercado_pago_subscription_id")
                .in("id", subscriptionIds)
            subscriptionMap = new Map((subsData || []).map((s: any) => [s.id, s]))
        }

        const enrichedData = (data || []).map((r: any) => {
            const plan = r.purchaseable_id ? planMap.get(r.purchaseable_id) || null : null
            const subscription = r.subscription_id ? subscriptionMap.get(r.subscription_id) || null : null
            return {
                ...r,
                partner_name: r.partner?.stores?.[0]?.name || null,
                plan,
                subscription,
                payments: r.billing_payments || [],
                invoice: r.billing_invoices?.[0] || null,
            }
        })

        // Quick stats from subscriptions table
        const { data: subsStatsData } = await supabase
            .from("subscriptions")
            .select("status")

        const stats: AdminSubscriptionsStats = {
            total: subsStatsData?.length || 0,
            active: subsStatsData?.filter((s: any) => s.status === "active").length || 0,
            past_due: subsStatsData?.filter((s: any) => s.status === "past_due").length || 0,
            cancelled: subsStatsData?.filter((s: any) => s.status === "cancelled").length || 0,
            trial: subsStatsData?.filter((s: any) => s.status === "trialing").length || 0,
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
        console.error("[adminListBillingSubscriptionsAction] Error:", error)
        return { success: false, error: error?.message || "Erro ao listar assinaturas." }
    }
}