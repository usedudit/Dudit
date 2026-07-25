import { getAdminClient } from "@/lib/supabase/admin"
import type { BillingPurchase, BillingPayment, BillingInvoice } from "./types"
import { generateInvoiceData } from "./invoice-generator"
import { logBillingAudit } from "./audit"

type SyncContext = "webhook" | "manual" | "migration"

const SUBSCRIPTION_PURCHASE_MAP: Record<string, string> = {
    active: "completed",
    trialing: "completed",
    past_due: "pending",
    pending: "pending",
    cancelled: "cancelled",
    paused: "pending",
}

function findPaymentMethod(mpData: any): string | null {
    if (!mpData) return null
    const payer = mpData.payer
    if (payer?.payment_method?.id) return payer.payment_method.id
    if (payer?.payment_method_id) return payer.payment_method_id
    return null
}

/**
 * Sync a subscription's billing state into billing_purchases.
 *
 * FULLY IDEMPOTENT:
 * - Looks up billing_purchase by subscription_id – updates if exists, creates if not.
 * - Looks up billing_payment by gateway_payment_id – updates if exists, creates if not.
 * - Invoice is generated only once (check by purchase.invoice_id).
 *
 * Safe to call multiple times with the same subscription.
 */
export async function syncSubscriptionToBilling(
    subscriptionId: string,
    context: SyncContext = "webhook",
): Promise<{ purchaseId: string | null; created: boolean }> {
    const supabase = getAdminClient()

    // ── 1. Load subscription with plan and partner ──
    const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select(`
            *,
            plan:plan_id (*),
            partner:partner_id (id, document, email, phone, image_url, user_id),
            stores(id, name)
        `)
        .eq("id", subscriptionId)
        .single()

    if (subError || !sub) {
        console.error(`[BillingSync] Subscription ${subscriptionId} not found:`, subError?.message)
        return { purchaseId: null, created: false }
    }

    const plan = sub.plan
    const partner = sub.partner
    const planPrice = plan?.price || 0
    const purchaseStatus = SUBSCRIPTION_PURCHASE_MAP[sub.status] || "pending"
    const isActiveOrTrialing = ["active", "trialing"].includes(sub.status)

    console.log(`[BillingSync] Syncing sub ${subscriptionId} (status=${sub.status}, purchase=${purchaseStatus})`)

    // ── 2. Idempotent upsert billing_purchase ──
    const { data: existingPurchase } = await supabase
        .from("billing_purchases")
        .select("*")
        .eq("subscription_id", subscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    let purchase: BillingPurchase | null = existingPurchase
    let purchaseCreated = false

    const now = new Date().toISOString()

    if (purchase) {
        // Update existing purchase
        const updateData: Record<string, any> = {
            status: purchaseStatus,
            total_amount: planPrice,
            amount: planPrice,
            description: plan?.name ? `Plano ${plan.name}` : "Assinatura",
            updated_at: now,
        }

        if (sub.mercado_pago_subscription_id) {
            updateData.gateway_payment_id = sub.mercado_pago_subscription_id
            updateData.gateway_status = sub.status
        }

        if (purchase.status !== purchaseStatus) {
            const { error: updateErr } = await supabase
                .from("billing_purchases")
                .update(updateData)
                .eq("id", purchase.id)

            if (updateErr) {
                console.error(`[BillingSync] Failed to update purchase ${purchase.id}:`, updateErr.message)
                return { purchaseId: purchase.id, created: false }
            }

            await logBillingAudit(purchaseStatus === "completed" ? "billing.purchase.completed"
                : purchaseStatus === "failed" ? "billing.purchase.failed"
                    : purchaseStatus === "cancelled" ? "billing.purchase.cancelled"
                        : purchaseStatus === "refunded" ? "billing.purchase.refunded"
                            : "billing.purchase.completed", sub.partner_id, {
                purchase_id: purchase.id,
                subscription_id: subscriptionId,
                previous_status: purchase.status,
                new_status: purchaseStatus,
                via: context,
            }, partner?.user_id || undefined)

            console.log(`[BillingSync] Updated purchase ${purchase.id}: ${purchase.status} → ${purchaseStatus}`)
        }

        purchase = { ...purchase, ...updateData } as BillingPurchase
    } else {
        // Create new purchase
        const { data: newPurchase, error: createErr } = await supabase
            .from("billing_purchases")
            .insert({
                partner_id: sub.partner_id,
                user_id: partner?.user_id || null,
                purchase_type: "subscription",
                purchaseable_type: "plan",
                purchaseable_id: plan?.id || null,
                amount: planPrice,
                total_amount: planPrice,
                discount_amount: 0,
                currency: "BRL",
                status: purchaseStatus,
                gateway: "mercado_pago",
                gateway_payment_id: sub.mercado_pago_subscription_id || null,
                gateway_status: sub.status,
                subscription_id: subscriptionId,
                description: plan?.name ? `Plano ${plan.name}` : "Assinatura",
                metadata: {
                    plan_name: plan?.name || null,
                    plan_slug: plan?.slug || null,
                    synced_via: context,
                    synced_at: now,
                },
            })
            .select()
            .single()

        if (createErr || !newPurchase) {
            console.error(`[BillingSync] Failed to create purchase for sub ${subscriptionId}:`, createErr?.message)
            return { purchaseId: null, created: false }
        }

        purchase = newPurchase as unknown as BillingPurchase
        purchaseCreated = true

        await logBillingAudit("billing.purchase.created", sub.partner_id, {
            purchase_id: purchase.id,
            subscription_id: subscriptionId,
            plan_name: plan?.name,
            status: purchaseStatus,
            via: context,
        }, partner?.user_id || undefined)

        console.log(`[BillingSync] Created purchase ${purchase.id} for sub ${subscriptionId}`)
    }

    // ── 3. Idempotent upsert billing_payment (only for active/trialing) ──
    const mpSubId = sub.mercado_pago_subscription_id

    if (mpSubId && isActiveOrTrialing) {
        const { data: existingPayment } = await supabase
            .from("billing_payments")
            .select("*")
            .eq("purchase_id", purchase.id)
            .eq("gateway_payment_id", mpSubId)
            .maybeSingle()

        if (!existingPayment) {
            const { error: payErr } = await supabase
                .from("billing_payments")
                .insert({
                    purchase_id: purchase.id,
                    amount: planPrice,
                    currency: "BRL",
                    fee_amount: 0,
                    net_amount: planPrice,
                    status: purchaseStatus === "completed" ? "approved" : "pending",
                    gateway: "mercado_pago",
                    gateway_payment_id: mpSubId,
                    gateway_status: sub.status,
                    payment_method_type: null,
                    paid_at: purchaseStatus === "completed" ? now : null,
                })

            if (payErr) {
                console.error(`[BillingSync] Failed to create payment for purchase ${purchase.id}:`, payErr.message)
            } else {
                console.log(`[BillingSync] Created payment for purchase ${purchase.id}`)
            }
        }
    }

    // ── 4. Idempotent invoice generation ──
    if (purchaseStatus === "completed" && !purchase.invoice_id) {
        try {
            const { generateInvoiceAction } = await import("@/app/actions/billing/invoices")
            const result = await generateInvoiceAction(purchase.id)

            if (result.success && result.data) {
                console.log(`[BillingSync] Generated invoice ${result.data.invoice_number} for purchase ${purchase.id}`)
            } else {
                console.warn(`[BillingSync] Invoice generation skipped for purchase ${purchase.id}:`, result.error || "already exists")
            }
        } catch (err: any) {
            console.error(`[BillingSync] Invoice generation error for purchase ${purchase.id}:`, err.message)
        }
    }

    // ── 5. Invalidate plan cache ──
    try {
        const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
        invalidatePartnerPlanCache(sub.partner_id)
    } catch {
        // non-critical
    }

    return { purchaseId: purchase.id, created: purchaseCreated }
}
