"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccess, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminRole, requireAdminScope, requireScope } from "@/lib/auth/admin-authorization"
import { resolveBillingPartnerScope } from "@/lib/billing/auth-helper"
import { generateInvoiceForPurchase } from "@/lib/billing/invoice-generation"
import { logBillingAudit } from "@/lib/billing/audit"
import type { BillingPurchase, BillingPayment, BillingInvoice, BillingPageResult, InvoiceData } from "@/lib/billing/types"

export async function generateInvoiceAction(
    purchaseId: string,
): Promise<{ success: boolean; data?: BillingInvoice; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const admin = getAdminClient()

        const { data: purchase } = await admin
            .from("billing_purchases")
            .select("partner_id")
            .eq("id", purchaseId)
            .maybeSingle()

        if (!purchase) {
            return { success: false, error: "Compra não encontrada" }
        }

        const adminUser = await getAdminRole()
        if (adminUser) {
            await requireAdminScope("billing_control", "admin")
        } else {
            await requirePartnerAccessWithPermission(
                purchase.partner_id,
                "billing" as any,
                "view",
                user,
            )
        }

        return await generateInvoiceForPurchase(purchaseId, user.id)
    } catch (error: any) {
        return { success: false, error: error.message || "Erro ao gerar fatura" }
    }
}

export async function listInvoicesAction(
    cursor?: string | null,
    limit: number = 20,
    partnerId?: string,
): Promise<BillingPageResult<BillingInvoice>> {
    const user = await getCurrentUser()
    if (!user) return { data: [], nextCursor: null, hasMore: false }

    const scope = await resolveBillingPartnerScope(user, partnerId)
    if (!scope.allowed) {
        return { data: [], nextCursor: null, hasMore: false }
    }

    const admin = getAdminClient()
    let query = admin
        .from("billing_invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (scope.partnerIds) {
        if (scope.partnerIds.length === 1) {
            query = query.eq("partner_id", scope.partnerIds[0])
        } else {
            query = query.in("partner_id", scope.partnerIds)
        }
    }
    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    const { data, error } = await query

    if (error) {
        return { data: [], nextCursor: null, hasMore: false }
    }

    const hasMore = data.length > limit
    const items = hasMore ? data.slice(0, limit) : data

    return {
        data: items as BillingInvoice[],
        nextCursor: items.length > 0 ? items[items.length - 1].created_at : null,
        hasMore,
    }
}

export async function getInvoiceAction(invoiceId: string): Promise<BillingInvoice | null> {
    const user = await getCurrentUser()
    if (!user) return null

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle()

    if (error || !data) return null

    const adminUser = await getAdminRole()
    if (adminUser) {
        try {
            requireScope(adminUser, "billing_control")
        } catch {
            return null
        }
    } else if (data.partner_id) {
        try {
            await requirePartnerAccess(data.partner_id, user)
        } catch {
            return null
        }
    }

    return data as BillingInvoice
}

export async function getInvoiceByPurchaseAction(purchaseId: string): Promise<BillingInvoice | null> {
    const user = await getCurrentUser()
    if (!user) return null

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_invoices")
        .select("*")
        .eq("purchase_id", purchaseId)
        .maybeSingle()

    if (error || !data) return null

    const adminUser = await getAdminRole()
    if (adminUser) {
        try {
            requireScope(adminUser, "billing_control")
        } catch {
            return null
        }
    } else if (data.partner_id) {
        try {
            await requirePartnerAccess(data.partner_id, user)
        } catch {
            return null
        }
    }

    return data as BillingInvoice
}

export async function getInvoiceForPrintAction(invoiceId: string): Promise<InvoiceData | null> {
    const user = await getCurrentUser()
    if (!user) return null

    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_invoices")
        .select("*, billing_purchases!inner(partner_id)")
        .eq("id", invoiceId)
        .maybeSingle()

    if (error || !data) return null

    const adminUser = await getAdminRole()
    if (adminUser) {
        try {
            requireScope(adminUser, "billing_control")
        } catch {
            return null
        }
    } else {
        try {
            await requirePartnerAccessWithPermission(
                data.billing_purchases.partner_id,
                "billing" as any,
                "view",
                user,
            )
        } catch {
            return null
        }
    }

    await admin
        .from("billing_invoices")
        .update({
            viewed_at: new Date().toISOString(),
            download_count: (data as any).download_count + 1,
            last_downloaded_at: new Date().toISOString(),
        })
        .eq("id", invoiceId)

    await logBillingAudit("billing.invoice.downloaded", data.billing_purchases.partner_id, {
        invoice_id: invoiceId,
        invoice_number: (data as any).invoice_number,
    }, user.id)

    return (data as any).invoice_data as InvoiceData
}
