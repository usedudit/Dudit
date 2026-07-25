"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { logBillingAudit } from "@/lib/billing/audit"
import type { BillingPayment, BillingPageResult, BillingFilters } from "@/lib/billing/types"

export async function listPaymentsAction(
    cursor?: string | null,
    limit: number = 20,
    filters?: BillingFilters,
): Promise<BillingPageResult<BillingPayment>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }

    const admin = getAdminClient()
    let query = admin
        .from("billing_payments")
        .select("*, billing_purchases!inner(partner_id, purchase_type, description, partners!inner(id, stores(name)))")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (filters?.partner_id) {
        query = query.eq("billing_purchases.partner_id", filters.partner_id)
    }
    if (filters?.status) {
        query = query.eq("status", filters.status)
    }
    if (filters?.gateway) {
        query = query.eq("gateway", filters.gateway)
    }
    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    const { data, error } = await query

    if (error) {
        console.error("[Billing] listPayments error:", error.message)
        return { data: [], nextCursor: null, hasMore: false }
    }

    const hasMore = data.length > limit
    const items = hasMore ? data.slice(0, limit) : data

    return {
        data: items as BillingPayment[],
        nextCursor: items.length > 0 ? items[items.length - 1].created_at : null,
        hasMore,
    }
}

export async function getPaymentsForPurchaseAction(purchaseId: string): Promise<BillingPayment[]> {
    const user = await getCurrentUser()
    if (!user) return []

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_payments")
        .select("*")
        .eq("purchase_id", purchaseId)
        .order("created_at", { ascending: false })

    if (error) return []
    return data as BillingPayment[]
}

export async function createPaymentAction(
    input: {
        purchase_id: string
        amount: number
        gateway?: string
        payment_method_type?: string
        checkout_url?: string
    },
): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const admin = getAdminClient()

        const { data: purchase } = await admin
            .from("billing_purchases")
            .select("partner_id")
            .eq("id", input.purchase_id)
            .maybeSingle()

        if (!purchase) return { success: false, error: "Compra não encontrada" }

        const { error } = await admin
            .from("billing_payments")
            .insert({
                purchase_id: input.purchase_id,
                amount: input.amount,
                gateway: input.gateway || "mercado_pago",
                payment_method_type: input.payment_method_type || null,
                checkout_url: input.checkout_url || null,
            })

        if (error) return { success: false, error: error.message }

        await logBillingAudit("billing.payment.created", purchase.partner_id, {
            purchase_id: input.purchase_id,
            amount: input.amount,
        }, user.id)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updatePaymentStatusAction(
    paymentId: string,
    status: string,
    metadata?: Record<string, any>,
): Promise<{ success: boolean; error?: string }> {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: "Não autenticado" }

    const admin = getAdminClient()

    const { data: payment } = await admin
        .from("billing_payments")
        .select("*, billing_purchases!inner(partner_id)")
        .eq("id", paymentId)
        .maybeSingle()

    if (!payment) return { success: false, error: "Pagamento não encontrado" }

    const updateData: Record<string, any> = { status }
    if (status === "approved") {
        updateData.paid_at = new Date().toISOString()
    }
    if (status === "refunded") {
        updateData.refunded_at = new Date().toISOString()
    }
    if (status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString()
    }

    const { error } = await admin
        .from("billing_payments")
        .update(updateData)
        .eq("id", paymentId)

    if (error) return { success: false, error: error.message }

    const partnerId = (payment as any).billing_purchases?.partner_id
    if (partnerId) {
        const auditAction = status === "approved" ? "billing.payment.approved"
            : status === "rejected" ? "billing.payment.rejected"
                : status === "refunded" ? "billing.payment.refunded"
                    : "billing.payment.created"

        await logBillingAudit(auditAction, partnerId, {
            payment_id: paymentId,
            status,
            ...(metadata || {}),
        }, user.id)
    }

    return { success: true }
}
