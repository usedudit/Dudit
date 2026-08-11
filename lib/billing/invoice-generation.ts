import { getAdminClient } from "@/lib/supabase/admin"
import { generateInvoiceData } from "./invoice-generator"
import { logBillingAudit } from "./audit"
import type { BillingInvoice } from "./types"

/**
 * Generate (or fetch existing) invoice for a purchase.
 *
 * SERVER-ONLY, NO AUTH: this is used by webhooks and background sync where
 * there is no authenticated user session. Callers that need authorization must
 * check it BEFORE calling this function.
 *
 * Idempotent: if the purchase already has an invoice, it returns the existing
 * invoice instead of creating a duplicate.
 */
export async function generateInvoiceForPurchase(
  purchaseId: string,
  actorUserId?: string | null,
): Promise<{ success: boolean; data?: BillingInvoice; error?: string }> {
  try {
    const admin = getAdminClient()

    // Idempotency: invoice already generated for this purchase.
    const { data: existing } = await admin
      .from("billing_purchases")
      .select("invoice_id, partner_id")
      .eq("id", purchaseId)
      .maybeSingle()

    if (!existing) {
      return { success: false, error: "Compra não encontrada" }
    }

    if (existing.invoice_id) {
      const { data: inv } = await admin
        .from("billing_invoices")
        .select("*")
        .eq("id", existing.invoice_id)
        .maybeSingle()
      if (inv) {
        return { success: true, data: inv as BillingInvoice }
      }
    }

    const { data: purchase, error: purchaseError } = await admin
      .from("billing_purchases")
      .select("*, partners:partners!billing_purchases_partner_id_fkey(*)")
      .eq("id", purchaseId)
      .maybeSingle()

    if (purchaseError || !purchase) {
      return { success: false, error: "Compra não encontrada" }
    }

    const { data: payments } = await admin
      .from("billing_payments")
      .select("*")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: false })

    const partner = (purchase as any).partners || {}
    const partnerAddress = partner.address || ""

    // Data comes from stores (fiscal fields, phone, logo)
    const { data: storeData } = await admin
      .from("stores")
      .select("cnpj, cpf, phone, logo_url, name")
      .eq("partner_id", purchase.partner_id)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    const partnerDoc = storeData?.cnpj || storeData?.cpf || ""

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

    // Prefer the purchase's own billing period when available.
    if (purchase.billing_period_start) periodStart = purchase.billing_period_start
    if (purchase.billing_period_end) periodEnd = purchase.billing_period_end

    const { invoiceNumber, verificationHash, invoiceData } = await generateInvoiceData(
      purchase as any,
      (payments || []) as any,
      {
        name: storeData?.name || partner.name || "Empresa",
        document: partnerDoc,
        address: partnerAddress,
        email: partner.email || null,
        phone: storeData?.phone || partner.phone || null,
        image_url: storeData?.logo_url || partner.store_image_url || null,
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
      via: "sync",
    }, actorUserId || null)

    return { success: true, data: invoice as BillingInvoice }
  } catch (error: any) {
    return { success: false, error: error.message || "Erro ao gerar fatura" }
  }
}
