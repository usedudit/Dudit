"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"

export async function getAdminRefundRequestDetail(refundRequestId: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        await requireAdminScope("billing_control")

    const admin = getAdminClient()

    const { data: refund, error } = await admin
        .from("billing_refund_requests")
        .select(`
            id, token, status, amount, refunded_amount, reason_category, reason_description,
            images, documents, admin_response, admin_evidence, is_within_7_days,
            grace_period_ends_at, requested_at, processed_at, created_at, updated_at, admin_id,
            partner:partner_id (
                id, user_id, is_active, risk_score,
                stores (id, name, logo_url, phone, cnpj, cpf, is_headquarters, risk_score)
            ),
            purchase:purchase_id (
                id, amount, total_amount, currency, status, purchase_type, description,
                gateway, gateway_payment_id, billing_period_start, billing_period_end,
                created_at, purchaseable_type, purchaseable_id, subscription_id,
                partner_id, user_id
            ),
            subscription:subscription_id (
                id, status, current_period_start, current_period_end,
                trial_end, cancel_at_period_end, mercado_pago_subscription_id, cancelled_at, ended_at
            ),
            payment:payment_id (
                id, gateway, status, gateway_payment_id, paid_at, amount
            )
        `)
        .eq("id", refundRequestId)
        .maybeSingle()

    if (error) throw error
    if (!refund) return null

    // Carregar plano se purchaseable_id existir
    let plan = null
    if (refund.purchase?.purchaseable_id) {
        const { data: planData } = await admin
            .from("billing_plans")
            .select("id, name, slug, price, features, description")
            .eq("id", refund.purchase.purchaseable_id)
            .maybeSingle()
        plan = planData
    }

    // Buscar eventos de auditoria para esta solicitação
    const { data: auditEvents } = await admin
        .from("audit_logs")
        .select("id, action_type, metadata, change_lines, source, created_at, actor_name")
        .eq("entity_type", "billing_refund_request")
        .eq("entity_id", refundRequestId)
        .order("created_at", { ascending: true })

    const refundEvents = (auditEvents || []).map((e: any) => ({
        id: e.id,
        event_type: e.action_type || "updated",
        message: (Array.isArray(e.change_lines) && e.change_lines[0])
            ? e.change_lines[0]
            : (e.metadata?.message || e.metadata?.notes || "Atualização"),
        metadata: e.metadata || {},
        source: e.source || "system",
        created_at: e.created_at,
        actor_name: e.actor_name || "Sistema",
    }))

    return {
        refund: {
            ...refund,
            purchase: refund.purchase ? {
                ...refund.purchase,
                plan,
            } : null,
        },
        events: refundEvents,
    }
}
