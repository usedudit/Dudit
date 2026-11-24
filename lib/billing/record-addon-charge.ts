import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { refreshInvoiceForPurchase } from "./invoice-generation"
import { cycleKey, resolveBillingCycle } from "./subscription-period"
import { mapPurchaseStatus, type SubscriptionCharge } from "./record-charge"
import type { InvoiceItem } from "./types"

export interface RecordAddonBundleChargeInput {
  partnerId: string
  mpPreapprovalId: string
  addonSlugs: string[]
  addonItems: InvoiceItem[]
  charge: SubscriptionCharge
  cycleStart?: Date | null
  anchorDate?: Date | null
  context?: "webhook" | "manual" | "reconciliation"
}

export interface RecordAddonBundleChargeResult {
  purchaseId: string | null
  paymentId: string | null
  createdPurchase: boolean
}

/**
 * Records a recurring billing charge for a partner's consolidated Add-on bundle
 * in `billing_purchases`, `billing_payments`, and `billing_invoices`
 * (using `purchase_type = 'addon'` and itemized `metadata.addon_items`).
 *
 * Idempotent per (partner, addon_bundle, cycle) and per gateway_payment_id.
 */
export async function recordAddonBundleCharge(
  input: RecordAddonBundleChargeInput,
): Promise<RecordAddonBundleChargeResult> {
  const admin = getAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const cycleBaseDate = input.cycleStart && !isNaN(input.cycleStart.getTime()) ? input.cycleStart : now
  const anchor = input.anchorDate && !isNaN(input.anchorDate.getTime()) ? input.anchorDate : cycleBaseDate
  const cycle = resolveBillingCycle(anchor, cycleBaseDate)
  const key = cycleKey(cycle.start)

  const itemsTotal = Math.round(
    input.addonItems.reduce((acc, item) => acc + Number(item.total || 0), 0) * 100,
  ) / 100
  const amount =
    input.charge.amount != null && Number.isFinite(Number(input.charge.amount)) && Number(input.charge.amount) > 0
      ? Number(input.charge.amount)
      : itemsTotal

  const description =
    input.addonItems.length === 1
      ? input.addonItems[0].name
      : `Aplicativos Dudit (${input.addonItems.length} ativos)`

  // Resolve partner owner user_id for invoice customer details
  const { data: partnerRow } = await admin
    .from("partners")
    .select("user_id")
    .eq("id", input.partnerId)
    .maybeSingle()

  const userId = partnerRow?.user_id || null

  // 1. Find existing purchase for this partner's addon bundle in this cycle
  const { data: existingPurchases } = await admin
    .from("billing_purchases")
    .select("id, status, metadata, invoice_id")
    .eq("partner_id", input.partnerId)
    .eq("purchase_type", "addon")
    .eq("purchaseable_type", "addon_bundle")
    .eq("billing_cycle_start", key)
    .order("created_at", { ascending: false })
    .limit(1)

  const existing = existingPurchases?.[0] || null
  const nextPurchaseStatus = mapPurchaseStatus(
    input.charge.status,
    (existing?.status as any) || null,
  )

  const mergedMetadata = {
    ...((existing?.metadata as Record<string, any>) || {}),
    addon_slugs: input.addonSlugs,
    addon_items: input.addonItems,
    mp_preapproval_id: input.mpPreapprovalId,
    cycle_key: key,
    synced_via: input.context || "webhook",
    ...(input.charge.method ? { payment_method: input.charge.method } : {}),
  }

  let purchaseId: string
  let createdPurchase = false

  if (existing) {
    purchaseId = existing.id
    await admin
      .from("billing_purchases")
      .update({
        amount,
        total_amount: amount,
        status: nextPurchaseStatus,
        gateway_payment_id: input.charge.gatewayPaymentId || undefined,
        gateway_status: input.charge.gatewayStatus || undefined,
        description,
        metadata: mergedMetadata,
        billing_period_start: cycle.start.toISOString(),
        billing_period_end: cycle.end.toISOString(),
        updated_at: nowIso,
      })
      .eq("id", purchaseId)
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("billing_purchases")
      .insert({
        partner_id: input.partnerId,
        user_id: userId,
        purchase_type: "addon",
        purchaseable_type: "addon_bundle",
        purchaseable_id: input.partnerId,
        amount,
        currency: "BRL",
        discount_amount: 0,
        total_amount: amount,
        status: nextPurchaseStatus,
        gateway: "mercado_pago",
        gateway_payment_id: input.charge.gatewayPaymentId || null,
        gateway_status: input.charge.gatewayStatus || null,
        description,
        metadata: mergedMetadata,
        billing_period_start: cycle.start.toISOString(),
        billing_period_end: cycle.end.toISOString(),
        billing_cycle_start: key,
      })
      .select("id")
      .single()

    if (insertErr || !inserted?.id) {
      console.error("[recordAddonBundleCharge] Failed to insert billing_purchases:", insertErr?.message)
      return { purchaseId: null, paymentId: null, createdPurchase: false }
    }

    purchaseId = inserted.id
    createdPurchase = true
  }

  // 2. Upsert payment row (deduplicated by gateway_payment_id when numeric)
  let paymentId: string | null = null
  const gatewayPaymentId = input.charge.gatewayPaymentId ? String(input.charge.gatewayPaymentId) : null

  if (gatewayPaymentId) {
    const { data: existingPay } = await admin
      .from("billing_payments")
      .select("id, status, paid_at")
      .eq("gateway", "mercado_pago")
      .eq("gateway_payment_id", gatewayPaymentId)
      .maybeSingle()

    if (existingPay?.id) {
      paymentId = existingPay.id
      const keepPaidAt = existingPay.paid_at || input.charge.paidAt || (input.charge.status === "approved" ? nowIso : null)
      await admin
        .from("billing_payments")
        .update({
          purchase_id: purchaseId,
          amount,
          net_amount: amount,
          status: input.charge.status,
          gateway_status: input.charge.gatewayStatus || null,
          gateway_response: input.charge.gatewayResponse || null,
          payment_method_type: input.charge.method || null,
          payment_method_details: input.charge.details || null,
          paid_at: keepPaidAt,
          expires_at: input.charge.expiresAt || null,
          updated_at: nowIso,
        })
        .eq("id", paymentId)
    }
  }

  if (!paymentId) {
    const { data: insertedPay, error: payErr } = await admin
      .from("billing_payments")
      .insert({
        purchase_id: purchaseId,
        amount,
        currency: "BRL",
        fee_amount: 0,
        net_amount: amount,
        status: input.charge.status,
        gateway: "mercado_pago",
        gateway_payment_id: gatewayPaymentId,
        gateway_status: input.charge.gatewayStatus || null,
        gateway_response: input.charge.gatewayResponse || null,
        payment_method_type: input.charge.method || null,
        payment_method_details: input.charge.details || null,
        checkout_url: input.charge.checkoutUrl || null,
        paid_at: input.charge.paidAt || (input.charge.status === "approved" ? nowIso : null),
        expires_at: input.charge.expiresAt || null,
      })
      .select("id")
      .single()

    if (!payErr && insertedPay?.id) {
      paymentId = insertedPay.id
    }
  }

  // 3. Generate or refresh the itemized invoice snapshot
  await refreshInvoiceForPurchase(purchaseId).catch((err) => {
    console.warn("[recordAddonBundleCharge] Invoice refresh failed:", err?.message)
  })

  return { purchaseId, paymentId, createdPurchase }
}
