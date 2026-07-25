"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { logBillingAudit, logBillingAdminAudit } from "@/lib/billing/audit"
import type { BillingPurchase, BillingPayment, BillingPageResult } from "@/lib/billing/types"
import { validateCSRFForAction } from "@/lib/security/csrf-middleware"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function adminListPurchasesAction(
    cursor?: string | null,
    limit: number = 20,
    filters?: { search?: string; status?: string; purchase_type?: string; partner_id?: string; date_from?: string; date_to?: string },
): Promise<BillingPageResult<BillingPurchase & { partner_name?: string }>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }
    await requireAdmin("moderator")
    const rlResult = await requireRateLimit(RateLimitCategory.ADMIN_READ)
    if (!rlResult.success) return { data: [], nextCursor: null, hasMore: false }

    const admin = getAdminClient()
    let query = admin
        .from("billing_purchases")
        .select("*, partners!billing_purchases_partner_id_fkey(stores(name))")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (filters?.partner_id) query = query.eq("partner_id", filters.partner_id)
    if (filters?.purchase_type) query = query.eq("purchase_type", filters.purchase_type)
    if (filters?.status) query = query.eq("status", filters.status)
    if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,purchase_type.ilike.%${filters.search}%`)
    }
    if (filters?.date_from) query = query.gte("created_at", filters.date_from)
    if (filters?.date_to) query = query.lte("created_at", filters.date_to)
    if (cursor) query = query.lt("created_at", cursor)

    const { data, error } = await query
    if (error) return { data: [], nextCursor: null, hasMore: false }

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

export async function adminListPaymentsAction(
    cursor?: string | null,
    limit: number = 20,
    filters?: { status?: string; gateway?: string },
): Promise<BillingPageResult<BillingPayment>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }
    await requireAdmin("moderator")
    const rlResult2 = await requireRateLimit(RateLimitCategory.ADMIN_READ)
    if (!rlResult2.success) return { data: [], nextCursor: null, hasMore: false }

    const admin = getAdminClient()
    let query = admin
        .from("billing_payments")
        .select("*, billing_purchases!inner(partner_id, purchase_type, description)")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (filters?.status) query = query.eq("status", filters.status)
    if (filters?.gateway) query = query.eq("gateway", filters.gateway)
    if (cursor) query = query.lt("created_at", cursor)

    const { data, error } = await query
    if (error) return { data: [], nextCursor: null, hasMore: false }

    const hasMore = data.length > limit
    const items = hasMore ? data.slice(0, limit) : data

    return {
        data: items as BillingPayment[],
        nextCursor: items.length > 0 ? items[items.length - 1].created_at : null,
        hasMore,
    }
}

export async function adminCancelPurchaseAction(
    purchaseId: string,
    reason: string,
    csrfToken: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const csrfResult = await validateCSRFForAction(csrfToken)
        if (!csrfResult.valid) return { success: false, error: "CSRF inválido" }
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }
        const admin = await requireAdmin("admin")
        const rlResult = await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
        if (!rlResult.success) return { success: false, error: rlResult.error }

        const supabase = getAdminClient()
        const { data: purchase } = await supabase
            .from("billing_purchases")
            .select("*")
            .eq("id", purchaseId)
            .maybeSingle()

        if (!purchase) return { success: false, error: "Compra não encontrada" }

        await supabase
            .from("billing_purchases")
            .update({ status: "cancelled", metadata: { ...purchase.metadata, cancel_reason: reason, cancelled_by_admin: true, cancelled_at: new Date().toISOString() } })
            .eq("id", purchaseId)

        await logBillingAudit("billing.admin.cancelled", purchase.partner_id, {
            purchase_id: purchaseId,
            reason,
            admin_id: user.id,
        }, user.id)

        await logBillingAdminAudit("billing.admin.cancelled", "purchase", purchaseId, {
            reason,
            partner_id: purchase.partner_id,
        }, user.id)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function adminMarkPaymentPaidAction(
    paymentId: string,
    csrfToken: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const csrfResult = await validateCSRFForAction(csrfToken)
        if (!csrfResult.valid) return { success: false, error: "CSRF inválido" }
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }
        await requireAdmin("admin")
        const rlResult = await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
        if (!rlResult.success) return { success: false, error: rlResult.error }

        const supabase = getAdminClient()

        const { data: payment } = await supabase
            .from("billing_payments")
            .select("*, billing_purchases!inner(partner_id)")
            .eq("id", paymentId)
            .maybeSingle()

        if (!payment) return { success: false, error: "Pagamento não encontrado" }

        await supabase
            .from("billing_payments")
            .update({
                status: "approved",
                paid_at: new Date().toISOString(),
            })
            .eq("id", paymentId)

        const partnerId = (payment as any).billing_purchases?.partner_id
        if (partnerId) {
            await logBillingAudit("billing.admin.marked_paid", partnerId, {
                payment_id: paymentId,
                admin_id: user.id,
            }, user.id)
        }

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function adminAddNoteAction(
    purchaseId: string,
    note: string,
    csrfToken: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const csrfResult = await validateCSRFForAction(csrfToken)
        if (!csrfResult.valid) return { success: false, error: "CSRF inválido" }
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }
        await requireAdmin("moderator")

        const supabase = getAdminClient()
        const { data: purchase } = await supabase
            .from("billing_purchases")
            .select("partner_id, metadata")
            .eq("id", purchaseId)
            .maybeSingle()

        if (!purchase) return { success: false, error: "Compra não encontrada" }

        const existingNotes = purchase.metadata?.admin_notes || []
        const updatedNotes = [...existingNotes, { note, added_by: user.id, added_at: new Date().toISOString() }]

        await supabase
            .from("billing_purchases")
            .update({ metadata: { ...purchase.metadata, admin_notes: updatedNotes } })
            .eq("id", purchaseId)

        await logBillingAudit("billing.admin.note_added", purchase.partner_id, {
            purchase_id: purchaseId,
            admin_id: user.id,
        }, user.id)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
