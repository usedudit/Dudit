"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { logBillingAudit } from "@/lib/billing/audit"
import { generateInvoiceData } from "@/lib/billing/invoice-generator"
import type { BillingPurchase, BillingPayment, BillingInvoice, BillingPageResult, InvoiceData } from "@/lib/billing/types"

export async function generateInvoiceAction(
    purchaseId: string,
): Promise<{ success: boolean; data?: BillingInvoice; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const admin = getAdminClient()

        const { data: purchase, error: purchaseError } = await admin
            .from("billing_purchases")
            .select("*, partners:partners!billing_purchases_partner_id_fkey(*)")
            .eq("id", purchaseId)
            .maybeSingle()

        if (purchaseError || !purchase) {
            return { success: false, error: "Compra não encontrada" }
        }

        await requirePartnerAccessWithPermission(
            purchase.partner_id,
            "billing" as any,
            "view",
            user,
        )

        const { data: payments } = await admin
            .from("billing_payments")
            .select("*")
            .eq("purchase_id", purchaseId)
            .order("created_at", { ascending: false })

        const partner = (purchase as any).partners || {}
        const partnerAddress = partner.address || ""

        // Doc comes from stores (fiscal fields per-store)
        const { data: storeDoc } = await admin
            .from("stores")
            .select("cnpj, cpf")
            .eq("partner_id", purchase.partner_id)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()
        const partnerDoc = storeDoc?.cnpj || storeDoc?.cpf || ""

        let customerDetails: { name: string; document: string | null; email: string | null } | null = null
        if (purchase.user_id) {
            const { data: profile } = await admin
                .from("user_profiles")
                .select("full_name, email")
                .eq("user_id", purchase.user_id)
                .maybeSingle()

            if (profile) {
                customerDetails = {
                    name: profile.full_name || "Usuário",
                    document: null,
                    email: profile.email || null,
                }
            }
        }

        const purchaseableDetails: { name?: string; description?: string } = {}
        if (purchase.purchaseable_type === "plan" && purchase.purchaseable_id) {
            const { data: plan } = await admin
                .from("plans")
                .select("name, slug")
                .eq("id", purchase.purchaseable_id)
                .maybeSingle()
            if (plan) {
                purchaseableDetails.name = `Plano ${plan.name}`
                purchaseableDetails.description = plan.slug
            }
        }

        let periodStart: string | null = null
        let periodEnd: string | null = null
        if (purchase.subscription_id) {
            const { data: sub } = await admin
                .from("subscriptions")
                .select("current_period_start, current_period_end")
                .eq("id", purchase.subscription_id)
                .maybeSingle()
            if (sub) {
                periodStart = sub.current_period_start
                periodEnd = sub.current_period_end
            }
        }

        const { invoiceNumber, verificationHash, invoiceData } = await generateInvoiceData(
            purchase as BillingPurchase,
            (payments || []) as BillingPayment[],
            {
                name: partner.stores?.[0]?.name || partner.name || "Empresa",
                document: partnerDoc,
                address: partnerAddress,
                email: partner.email || null,
                phone: partner.phone || null,
                image_url: partner.store_image_url || null,
            },
            customerDetails,
            purchaseableDetails,
            periodStart,
            periodEnd,
        )

        const { data: invoice, error: invoiceError } = await admin
            .from("billing_invoices")
            .insert({
                purchase_id: purchaseId,
                partner_id: purchase.partner_id,
                invoice_number: invoiceNumber,
                verification_hash: verificationHash,
                invoice_data: invoiceData,
            })
            .select()
            .single()

        if (invoiceError) {
            return { success: false, error: invoiceError.message }
        }

        await admin
            .from("billing_purchases")
            .update({ invoice_id: invoice.id })
            .eq("id", purchaseId)

        await logBillingAudit("billing.invoice.generated", purchase.partner_id, {
            purchase_id: purchaseId,
            invoice_id: invoice.id,
            invoice_number: invoiceNumber,
        }, user.id)

        return { success: true, data: invoice as BillingInvoice }
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

    const admin = getAdminClient()
    let query = admin
        .from("billing_invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit + 1)

    if (partnerId) {
        query = query.eq("partner_id", partnerId)
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
    return data as BillingInvoice
}

export async function getInvoiceByPurchaseAction(purchaseId: string): Promise<BillingInvoice | null> {
    const admin = getAdminClient()
    const { data, error } = await admin
        .from("billing_invoices")
        .select("*")
        .eq("purchase_id", purchaseId)
        .maybeSingle()

    if (error || !data) return null
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
