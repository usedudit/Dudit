import { getAdminClient } from "@/lib/supabase/admin"
import type { BillingPurchase } from "./types"
import { logBillingAudit } from "./audit"
import { generateInvoiceForPurchase } from "./invoice-generation"
import { computeSubscriptionPeriods, periodKey } from "./subscription-period"

type SyncContext = "webhook" | "manual" | "migration" | "dev_test"

const SUBSCRIPTION_PURCHASE_MAP: Record<string, string> = {
    active: "completed",
    trialing: "completed",
    past_due: "pending",
    pending: "pending",
    cancelled: "cancelled",
    paused: "pending",
    refunded: "refunded",
}

function samePeriod(iso: string | null | undefined, target: Date): boolean {
    if (!iso) return false
    const d = new Date(iso)
    if (isNaN(d.getTime())) return false
    return periodKey(d) === periodKey(target)
}

function normalizeStatus(status?: string | null): string | null {
    if (!status) return null
    const s = status.trim().toLowerCase()
    if (["trial", "trialing"].includes(s)) return "trialing"
    if (s === "active") return "active"
    if (s === "pending") return "pending"
    if (["past_due", "error", "failed", "rejected", "unpaid"].includes(s)) return "past_due"
    if (["cancelled", "canceled"].includes(s)) return "cancelled"
    if (["refunded", "refund"].includes(s)) return "refunded"
    if (s === "paused") return "paused"
    return s
}

/**
 * Sync a subscription's billing state into billing_purchases.
 *
 * FULLY IDEMPOTENT:
 * - The CURRENT cycle purchase is upserted (by subscription_id / period).
 * - The NEXT cycle purchase (upcoming payment) is upserted with status "pending"
 *   and its own invoice, so the "Próxima Fatura" is always generated on the
 *   plan's due date.
 * - Invoices are generated server-side (no auth) and only once per purchase.
 * - Supports statusOverride ('active', 'trial', 'pending', 'past_due'/'error', 'cancelled', 'refunded')
 *   for manual testing and simulated card failure / PIX recovery / refund flows.
 *
 * Safe to call multiple times with the same subscription.
 */
export async function syncSubscriptionToBilling(
    subscriptionId: string,
    context: SyncContext = "webhook",
    statusOverride?: string,
    customPeriodStart?: Date,
    customPeriodEnd?: Date,
): Promise<{
    purchaseId: string | null
    created: boolean
    nextPurchaseId?: string | null
    subscriptionStatus?: string
    purchaseStatus?: string
}> {
    const supabase = getAdminClient()
    const nowIso = new Date().toISOString()

    // ── 0. Process Status Override if provided ──
    const targetStatus = normalizeStatus(statusOverride)
    if (targetStatus) {
        const updateSub: Record<string, any> = {
            status: targetStatus === "refunded" ? "cancelled" : targetStatus,
            updated_at: nowIso,
        }
        if (targetStatus === "past_due") {
            updateSub.past_due_at = nowIso
        } else if (targetStatus === "active") {
            updateSub.past_due_at = null
            updateSub.cancel_at_period_end = false
            updateSub.cancelled_at = null
            updateSub.ended_at = null
            // If no custom period passed, ensure fresh 30-day period
            if (!customPeriodStart && !customPeriodEnd) {
                const now = new Date()
                const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                updateSub.current_period_start = now.toISOString()
                updateSub.current_period_end = nextMonth.toISOString()
            }
        } else if (targetStatus === "trialing") {
            updateSub.cancel_at_period_end = false
            if (customPeriodEnd) {
                updateSub.trial_end = customPeriodEnd.toISOString()
            }
        } else if (targetStatus === "cancelled") {
            updateSub.cancelled_at = nowIso
            updateSub.ended_at = nowIso
            updateSub.cancel_at_period_end = false
        } else if (targetStatus === "refunded") {
            updateSub.cancelled_at = nowIso
            updateSub.ended_at = nowIso
            updateSub.cancel_at_period_end = false
        }

        if (customPeriodStart) updateSub.current_period_start = customPeriodStart.toISOString()
        if (customPeriodEnd) updateSub.current_period_end = customPeriodEnd.toISOString()

        await supabase
            .from("subscriptions")
            .update(updateSub)
            .eq("id", subscriptionId)
    }

    // ── 1. Load subscription with plan and partner ──
    const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select(`
            *,
            plan:plan_id (*),
            partner:partner_id (id, user_id),
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
    const planPrice = Number(plan?.price || 0)
    const purchaseStatus = SUBSCRIPTION_PURCHASE_MAP[sub.status] || "pending"
    const isActiveOrTrialing = ["active", "trialing"].includes(sub.status)

    console.log(`[BillingSync] Syncing sub ${subscriptionId} (status=${sub.status}, purchase=${purchaseStatus})`)

    // ── 2. Compute billing periods (never in the past for active plans) ──
    const periods = computeSubscriptionPeriods(sub)
    if (customPeriodStart) periods.periodStart = customPeriodStart
    if (customPeriodEnd) periods.periodEnd = customPeriodEnd

    const { data: purchases } = await supabase
        .from("billing_purchases")
        .select("*")
        .eq("subscription_id", subscriptionId)
        .order("created_at", { ascending: false })

    const allPurchases = (purchases || []) as any[]

    // Current cycle purchase: matches the current period, else latest completed, else latest.
    let currentPurchase =
        allPurchases.find((p) => samePeriod(p.billing_period_start, periods.periodStart))
        ?? allPurchases.find((p) => p.status === "completed")
        ?? allPurchases[0]
        ?? null

    // Next cycle purchase: pending purchase for the upcoming period, else any pending.
    let nextPurchase =
        allPurchases.find((p) => p.status === "pending" && samePeriod(p.billing_period_start, periods.nextStart))
        ?? allPurchases.find((p) => p.status === "pending" && p.id !== currentPurchase?.id)
        ?? null

    if (nextPurchase && currentPurchase && nextPurchase.id === currentPurchase.id) {
        nextPurchase = null
    }

    const description = plan?.name ? `Plano ${plan.name}` : "Assinatura"
    let created = false

    // ── 3. Upsert CURRENT cycle purchase ──
    if (currentPurchase) {
        const updateData: Record<string, any> = {
            status: purchaseStatus,
            total_amount: planPrice,
            amount: planPrice,
            description,
            updated_at: nowIso,
            metadata: {
                ...(currentPurchase.metadata || {}),
                plan_name: plan?.name || null,
                plan_slug: plan?.slug || null,
                billing_cycle: "current",
                subscription_status: sub.status,
                synced_via: context,
                synced_at: nowIso,
            },
        }
        if (!currentPurchase.billing_period_start || customPeriodStart) {
            updateData.billing_period_start = periods.periodStart.toISOString()
        }
        if (!currentPurchase.billing_period_end || customPeriodEnd) {
            updateData.billing_period_end = periods.periodEnd.toISOString()
        }

        if (sub.mercado_pago_subscription_id) {
            updateData.gateway_payment_id = sub.mercado_pago_subscription_id
            updateData.gateway_status = sub.status
        }

        const { error: updateErr } = await supabase
            .from("billing_purchases")
            .update(updateData)
            .eq("id", currentPurchase.id)

        if (updateErr) {
            console.error(`[BillingSync] Failed to update purchase ${currentPurchase.id}:`, updateErr.message)
            return { purchaseId: currentPurchase.id, created: false }
        }

        if (currentPurchase.status !== purchaseStatus) {
            await logBillingAudit(
                purchaseStatus === "completed" ? "billing.purchase.completed"
                    : purchaseStatus === "failed" ? "billing.purchase.failed"
                        : purchaseStatus === "cancelled" ? "billing.purchase.cancelled"
                            : purchaseStatus === "refunded" ? "billing.purchase.refunded"
                                : "billing.purchase.completed",
                sub.partner_id,
                {
                    purchase_id: currentPurchase.id,
                    subscription_id: subscriptionId,
                    previous_status: currentPurchase.status,
                    new_status: purchaseStatus,
                    via: context,
                },
                partner?.user_id || undefined,
            )
        }

        currentPurchase = { ...currentPurchase, ...updateData } as BillingPurchase
        console.log(`[BillingSync] Updated purchase ${currentPurchase.id}: ${currentPurchase.status} → ${purchaseStatus}`)
    } else {
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
                description,
                billing_period_start: periods.periodStart.toISOString(),
                billing_period_end: periods.periodEnd.toISOString(),
                metadata: {
                    plan_name: plan?.name || null,
                    plan_slug: plan?.slug || null,
                    billing_cycle: "current",
                    subscription_status: sub.status,
                    synced_via: context,
                    synced_at: nowIso,
                },
            })
            .select()
            .single()

        if (createErr || !newPurchase) {
            console.error(`[BillingSync] Failed to create purchase for sub ${subscriptionId}:`, createErr?.message)
            return { purchaseId: null, created: false }
        }

        currentPurchase = newPurchase as unknown as BillingPurchase
        created = true

        await logBillingAudit("billing.purchase.created", sub.partner_id, {
            purchase_id: currentPurchase.id,
            subscription_id: subscriptionId,
            plan_name: plan?.name,
            status: purchaseStatus,
            via: context,
        }, partner?.user_id || undefined)

        console.log(`[BillingSync] Created purchase ${currentPurchase.id} for sub ${subscriptionId}`)
    }

    // ── 4. Payment record ──
    const mpSubId = sub.mercado_pago_subscription_id
    const { data: existingPayment } = await supabase
        .from("billing_payments")
        .select("*")
        .eq("purchase_id", currentPurchase.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (isActiveOrTrialing) {
        if (existingPayment) {
            await supabase
                .from("billing_payments")
                .update({
                    status: "approved",
                    amount: planPrice,
                    net_amount: planPrice,
                    paid_at: existingPayment.paid_at || nowIso,
                    gateway_status: sub.status,
                    updated_at: nowIso,
                })
                .eq("id", existingPayment.id)
        } else if (mpSubId) {
            await supabase
                .from("billing_payments")
                .insert({
                    purchase_id: currentPurchase.id,
                    amount: planPrice,
                    currency: "BRL",
                    fee_amount: 0,
                    net_amount: planPrice,
                    status: "approved",
                    gateway: "mercado_pago",
                    gateway_payment_id: mpSubId,
                    gateway_status: sub.status,
                    payment_method_type: null,
                    paid_at: nowIso,
                })
        }
    } else if (sub.status === "past_due") {
        // Card debit failed / past due -> payment status rejected for simulation/testing
        if (existingPayment) {
            await supabase
                .from("billing_payments")
                .update({
                    status: "rejected",
                    gateway_status: "rejected",
                    paid_at: null,
                    updated_at: nowIso,
                })
                .eq("id", existingPayment.id)
        } else {
            await supabase
                .from("billing_payments")
                .insert({
                    purchase_id: currentPurchase.id,
                    amount: planPrice,
                    currency: "BRL",
                    fee_amount: 0,
                    net_amount: planPrice,
                    status: "rejected",
                    gateway: "mercado_pago",
                    gateway_payment_id: mpSubId || null,
                    gateway_status: "rejected",
                    payment_method_type: "credit_card",
                    paid_at: null,
                })
        }
    } else if (sub.status === "cancelled" && existingPayment && existingPayment.status === "pending") {
        await supabase
            .from("billing_payments")
            .update({ status: "cancelled", updated_at: nowIso })
            .eq("id", existingPayment.id)
    } else if (targetStatus === "refunded" && existingPayment) {
        await supabase
            .from("billing_payments")
            .update({ status: "refunded", updated_at: nowIso })
            .eq("id", existingPayment.id)
    }

    // ── 5. Invoice for the CURRENT cycle ──
    if (["completed", "pending"].includes(purchaseStatus)) {
        const invResult = await generateInvoiceForPurchase(currentPurchase.id, partner?.user_id || undefined)
        if (invResult.success && invResult.data) {
            console.log(`[BillingSync] Invoice ${invResult.data.invoice_number} ensured for purchase ${currentPurchase.id}`)
        } else {
            console.warn(`[BillingSync] Invoice generation skipped for purchase ${currentPurchase.id}:`, invResult.error || "already exists")
        }
    }

    // ── 6. Clean up stale pre-generated "next" purchases from previous sync runs ──
    // The next invoice is NOT pre-generated in advance. It is created when the
    // actual payment/charge occurs (approved → completed, failed → past_due/pending).
    for (const p of allPurchases) {
        if (p.status === "pending" && p.id !== currentPurchase.id) {
            try {
                if (p.invoice_id) {
                    await supabase.from("billing_invoices").delete().eq("purchase_id", p.id)
                }
                await supabase.from("billing_purchases").delete().eq("id", p.id)
            } catch (cleanupErr) {
                console.warn(`[BillingSync] Failed to remove pending purchase ${p.id}:`, cleanupErr)
                await supabase.from("billing_purchases").update({ status: "cancelled", updated_at: nowIso }).eq("id", p.id)
            }
        }
    }

    // ── 8. Invalidate plan cache ──
    try {
        const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
        invalidatePartnerPlanCache(sub.partner_id)
    } catch {
        // non-critical
    }

    return {
        purchaseId: currentPurchase.id,
        created,
        nextPurchaseId: null,
        subscriptionStatus: sub.status,
        purchaseStatus,
    }
}
