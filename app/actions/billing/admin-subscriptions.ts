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

export interface AdminGrantPartnerPlanInput {
    partnerId: string
    planSlug: "free" | "crescer" | "escalar" | string
    durationMonths?: number
    isLifetime?: boolean
    notes?: string
}

/**
 * Concede um plano manualmente a um parceiro com período específico ou vitalício.
 * Define payment_provider = 'manual' e mercado_pago_subscription_id = null
 * para que o cron do Mercado Pago nunca verifique nem cancele o plano.
 */
export async function adminGrantPartnerPlanAction(
    input: AdminGrantPartnerPlanInput
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
    try {
        const admin = await requireAdminScope("billing_control", "admin")
        const supabase = getAdminClient()

        if (!input.partnerId) {
            return { success: false, error: "partnerId é obrigatório" }
        }

        const normalizedSlug = input.planSlug.trim().toLowerCase()
        const { data: plan, error: planError } = await supabase
            .from("plans")
            .select("*")
            .eq("slug", normalizedSlug)
            .single()

        if (planError || !plan) {
            return { success: false, error: `Plano '${input.planSlug}' não encontrado.` }
        }

        const now = new Date()
        let periodEnd: Date
        if (input.isLifetime) {
            periodEnd = new Date("2099-12-31T23:59:59.000Z")
        } else {
            const months = input.durationMonths && input.durationMonths > 0 ? input.durationMonths : 1
            periodEnd = new Date(now)
            periodEnd.setMonth(periodEnd.getMonth() + months)
        }

        // Cancela assinaturas ativas/pendentes/past_due anteriores para evitar conflito com idx_subscriptions_active_partner
        const { data: existingSubs } = await supabase
            .from("subscriptions")
            .select("id, mercado_pago_subscription_id")
            .eq("partner_id", input.partnerId)
            .in("status", ["active", "trialing", "past_due", "pending"])

        if (existingSubs && existingSubs.length > 0) {
            const { cancelMpPreapproval } = await import("@/lib/services/mercadopago/subscriptions")
            for (const sub of existingSubs) {
                if (sub.mercado_pago_subscription_id) {
                    try {
                        await cancelMpPreapproval(sub.mercado_pago_subscription_id)
                    } catch {}
                }
                await supabase
                    .from("subscriptions")
                    .update({
                        status: "cancelled",
                        cancelled_at: now.toISOString(),
                        ended_at: now.toISOString(),
                        updated_at: now.toISOString(),
                    })
                    .eq("id", sub.id)
            }
        }

        // Insere a nova assinatura manual.
        // mercado_pago_subscription_id = NULL garante que o cron do MP nunca vai mexer nem cancelar!
        const { data: newSub, error: insertError } = await supabase
            .from("subscriptions")
            .insert({
                partner_id: input.partnerId,
                plan_id: plan.id,
                plan_snapshot: plan,
                mercado_pago_subscription_id: null,
                status: "active",
                payment_provider: "manual",
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                cancel_at_period_end: false,
                past_due_at: null,
                pending_plan_id: null,
            })
            .select("id")
            .single()

        if (insertError || !newSub) {
            return { success: false, error: insertError?.message || "Erro ao criar assinatura manual" }
        }

        // Invalida o cache do plano para surtir efeito imediato no ERP
        const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
        invalidatePartnerPlanCache(input.partnerId)

        return { success: true, subscriptionId: newSub.id }
    } catch (err: any) {
        console.error("[adminGrantPartnerPlanAction] Error:", err)
        return { success: false, error: err?.message || "Erro interno" }
    }
}