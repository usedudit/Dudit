"use server"

import { requireUser, requirePartner } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  getAllPlans,
  getPartnerPlan,
  getPartnerSubscription,
  getUsageCounters,
  PAST_DUE_GRACE_PERIOD_DAYS,
} from "@/lib/services/subscription.service"
import {
  createMpSubscription,
  cancelMpSubscription,
  cancelPendingPlanChangeAttempts,
  updateMpSubscription,
  getMpSubscriptionStatus,
  ensurePendingInvoiceForCheckout,
} from "@/lib/services/mercadopago/subscriptions"
import { computeSubscriptionPeriods } from "@/lib/billing/subscription-period"
import { SUBSCRIPTION_MESSAGES } from "@/lib/constants/messages"
import { sendPlanChanged } from "@/lib/services/discord-general-webhook.service"

// ============================================================================
// READ ACTIONS
// ============================================================================

/**
 * Get all active plans (for pricing page / plan selector).
 */
export async function listPlansAction(): Promise<ActionResponse<any>> {
  try {
    const plans = await getAllPlans()
    return successResponse(plans)
  } catch (error: any) {
    return errorResponse(error.message)
  }
}

/**
 * Get the current subscription status, plan, and usage counters for the partner.
 */
export async function getSubscriptionStatusAction(): Promise<ActionResponse<any>> {
  try {
    const user = await requireUser()
    const partner = await requirePartner()

    // 1. Resolve active plan first (triggers expiration downgrade if past period end)
    const plan = await getPartnerPlan(partner.id)
    const [subscription, counters] = await Promise.all([
      getPartnerSubscription(partner.id),
      getUsageCounters(partner.id),
    ])

    let subscriptionPayload: any = subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billing_email: subscription.billing_email,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          pending_plan_id: subscription.pending_plan_id,
          trial_end: subscription.trial_end,
          payment_provider: subscription.payment_provider,
        }
      : null

    // Enrich with Mercado Pago status (display only).
    // The local status is owned by the billing sync (webhook + reconciliation).
    // A preapproval being "authorized" does NOT mean the current cycle was paid,
    // so we never flip the subscription to active from a page load.
    if (
      subscriptionPayload &&
      subscription?.mercado_pago_subscription_id &&
      !subscription.cancel_at_period_end
    ) {
      try {
        const mpStatus = await getMpSubscriptionStatus(subscription.mercado_pago_subscription_id)
        subscriptionPayload.mp_status = mpStatus?.status ?? null
        // Expose the preapproval checkout link only for an unfinished checkout;
        // an active contract has nothing left to pay on that link.
        const initPoint =
          subscription.status === "pending" && typeof mpStatus?.init_point === "string"
            ? mpStatus.init_point
            : null
        subscriptionPayload.payment_url = initPoint
      } catch {
        // Non-critical: fall back to the local state.
      }
    }

    // Upcoming charge date comes from the calendar anchor, never from MP's
    // next_payment_date (which can drift after retries).
    if (subscriptionPayload && subscription && !subscription.cancel_at_period_end) {
      const periods = computeSubscriptionPeriods(subscription)
      subscriptionPayload.next_payment_date = periods.nextStart.toISOString()
      subscriptionPayload.billing_cycle_start = periods.periodStart.toISOString()
      subscriptionPayload.billing_cycle_end = periods.periodEnd.toISOString()
    }

    // Grace period visibility (3 days from the first failure).
    if (subscriptionPayload && subscription) {
      if (subscription.status === "past_due" && subscription.past_due_at) {
        const graceDeadline = new Date(
          new Date(subscription.past_due_at).getTime() +
            PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
        )
        subscriptionPayload.grace_period_ends_at = graceDeadline.toISOString()
        subscriptionPayload.grace_days_left = Math.max(
          0,
          Math.ceil((graceDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        )
      } else {
        subscriptionPayload.grace_period_ends_at = null
        subscriptionPayload.grace_days_left = null
      }
    }

    // ── Overdue/open invoice of the current cycle ──
    let nextInvoice: any = null
    if (
      subscriptionPayload &&
      subscription &&
      ["past_due", "pending"].includes(subscription.status)
    ) {
      try {
        const admin = getAdminClient()
        const { data: pendingPurchase } = await admin
          .from("billing_purchases")
          .select("*, billing_invoices(*)")
          .eq("subscription_id", subscription.id)
          .in("status", ["pending", "failed"])
          .order("billing_period_start", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pendingPurchase) {
          const invoice = (pendingPurchase as any).billing_invoices?.[0] || null
          const dueDate = pendingPurchase.billing_period_start || null
          nextInvoice = {
            purchase_id: pendingPurchase.id,
            invoice_id: invoice?.id || pendingPurchase.invoice_id || null,
            invoice_number: invoice?.invoice_number || null,
            // Vencimento = início do ciclo desta fatura.
            due_date: dueDate,
            period_start: pendingPurchase.billing_period_start || null,
            period_end: pendingPurchase.billing_period_end || null,
            amount: Number(pendingPurchase.total_amount || plan.price),
            status: pendingPurchase.status,
            days_overdue: dueDate
              ? Math.max(
                  0,
                  Math.floor((Date.now() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000)),
                )
              : null,
          }
        }
      } catch (err: any) {
        console.error("[Subscriptions] Error fetching pending invoice:", err?.message)
      }
    }

    // ── Pending plan-change attempt ──
    // An upgrade/downgrade checkout creates a pending subscription while the
    // current paid one stays active. Surface the latest attempt separately so
    // the UI can show "aguardando pagamento" without pretending the current
    // plan (or the free plan) is the one that wasn't paid.
    let pendingChange: any = null
    try {
      const admin = getAdminClient()
      const { data: pendingSub } = await admin
        .from("subscriptions")
        .select(
          "id, plan_id, status, created_at, billing_email, mercado_pago_subscription_id, plan:plans!plan_id(id, name, slug, price)",
        )
        .eq("partner_id", partner.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const pendingPlan = (pendingSub as any)?.plan
      const pendingPrice = Number(pendingPlan?.price || 0)

      if (pendingSub && pendingPrice > 0 && pendingPlan?.slug !== "free") {
        const loadPendingPurchase = () =>
          admin
            .from("billing_purchases")
            .select("*, billing_invoices(*)")
            .eq("subscription_id", pendingSub.id)
            .in("status", ["pending", "failed"])
            .order("billing_period_start", { ascending: false })
            .limit(1)
            .maybeSingle()

        let { data: pendingPurchase } = await loadPendingPurchase()

        // Legacy attempts created before the invoice invariant may have no
        // purchase. Materialize it lazily so the latest unfinished plan change
        // is always visible and payable in the billing history.
        if (!pendingPurchase) {
          await ensurePendingInvoiceForCheckout(pendingSub.id, null)
          const retry = await loadPendingPurchase()
          pendingPurchase = retry.data
        }

        const pendingInvoice = (pendingPurchase as any)?.billing_invoices?.[0] || null
        const dueDate =
          pendingPurchase?.billing_period_start || (pendingSub as any).created_at || null

        let pendingPaymentUrl: string | null = null
        if (pendingSub.mercado_pago_subscription_id) {
          try {
            const mpStatus = await getMpSubscriptionStatus(
              pendingSub.mercado_pago_subscription_id,
            )
            if (typeof mpStatus?.init_point === "string") {
              pendingPaymentUrl = mpStatus.init_point
            }
          } catch {
            // Non-critical: the UI falls back to the manual PIX flow.
          }
        }

        pendingChange = {
          subscription_id: pendingSub.id,
          plan_id: pendingSub.plan_id,
          plan_name: pendingPlan.name,
          plan_slug: pendingPlan.slug,
          amount: Number(pendingPurchase?.total_amount ?? pendingPrice),
          status: pendingPurchase?.status ?? "pending",
          payment_url: pendingPaymentUrl,
          created_at: (pendingSub as any).created_at ?? null,
          invoice: pendingPurchase
            ? {
                purchase_id: pendingPurchase.id,
                invoice_id: pendingInvoice?.id || pendingPurchase.invoice_id || null,
                invoice_number: pendingInvoice?.invoice_number || null,
                due_date: dueDate,
                period_start: pendingPurchase.billing_period_start || null,
                period_end: pendingPurchase.billing_period_end || null,
                amount: Number(pendingPurchase.total_amount || pendingPrice),
                status: pendingPurchase.status,
              }
            : null,
        }
      }
    } catch (err: any) {
      console.error("[Subscriptions] Error fetching pending plan change:", err?.message)
    }

    return successResponse({
      partner_id: partner.id,
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        limits: plan.limits_json,
        features: plan.features_json,
      },
      subscription: subscriptionPayload,
      next_invoice: nextInvoice,
      pending_change: pendingChange,
      usage: counters || {
        products_count: 0,
        users_count: 0,
        images_count: 0,
        services_count: 0,
        quotes_month_count: 0,
      },
    })
  } catch (error: any) {
    return errorResponse(error.message)
  }
}

/**
 * Resolve the Mercado Pago preapproval checkout link for a subscription that is
 * waiting for payment (status "pending"). Used by the billing history list to
 * surface a per-row "Pagar" action without storing the init_point in the DB.
 */
export async function getSubscriptionPaymentUrlAction(
  subscriptionId: string,
): Promise<ActionResponse<{ payment_url: string | null }>> {
  try {
    await requireUser()
    const partner = await requirePartner()

    const admin = getAdminClient()
    const { data: sub } = await admin
      .from("subscriptions")
      .select("mercado_pago_subscription_id, status, cancel_at_period_end")
      .eq("partner_id", partner.id)
      .eq("id", subscriptionId)
      .maybeSingle()

    // Only an unfinished checkout can be resumed. Cancelled subscriptions must
    // never expose a pay link (the preapproval was cancelled on purpose).
    if (!sub?.mercado_pago_subscription_id || sub.status !== "pending" || sub.cancel_at_period_end) {
      return successResponse({ payment_url: null })
    }

    const mpStatus = await getMpSubscriptionStatus(sub.mercado_pago_subscription_id)
    const payment_url = typeof mpStatus?.init_point === "string" ? mpStatus.init_point : null

    return successResponse({ payment_url })
  } catch (error: any) {
    return errorResponse(error.message)
  }
}

// ============================================================================
// MUTATION ACTIONS
// ============================================================================

/**
 * Create a new subscription for the current partner.
 */
export async function createSubscriptionAction(
  planId: string,
  billingEmail: string,
): Promise<ActionResponse<any>> {
  await requireRateLimit(RateLimitCategory.SUBSCRIPTION_CREATE)

  try {
    const user = await requireUser()
    const partner = await requirePartner()

    if (!planId || typeof planId !== "string") {
      return errorResponse(SUBSCRIPTION_MESSAGES.PLAN_NOT_FOUND)
    }

    if (!billingEmail || typeof billingEmail !== "string" || !billingEmail.includes("@")) {
      return errorResponse("Email de faturamento inválido")
    }

    const result = await createMpSubscription(
      partner.id,
      planId,
      billingEmail.trim().toLowerCase(),
      user.id,
    )

    if (!result.success) {
      return errorResponse(result.error || "Erro ao criar assinatura")
    }

    return successResponse({
      subscriptionId: result.subscriptionId,
      initPoint: result.initPoint,
    })
  } catch (error: any) {
    return errorResponse(error.message)
  }
}

/**
 * Cancel the current subscription for the current partner.
 */
export async function cancelSubscriptionAction(input?: {
  reason?: string
  reasonCategory?: string
  feedback?: string
}): Promise<ActionResponse<any>> {
  await requireRateLimit(RateLimitCategory.SUBSCRIPTION_CANCEL)

  try {
    const user = await requireUser()
    const partner = await requirePartner()

    const subscription = await getPartnerSubscription(partner.id)
    if (!subscription) {
      return errorResponse(SUBSCRIPTION_MESSAGES.SUBSCRIPTION_NOT_FOUND)
    }

    const reasonText = input?.reason || (input?.feedback ? `Motivo: ${input.feedback}` : undefined)

    // Cancelling the plan also discards any unfinished upgrade checkout, so a
    // later payment cannot resurrect a plan the partner just cancelled.
    await cancelPendingPlanChangeAttempts(partner.id)

    const result = await cancelMpSubscription(subscription.id, user.id, reasonText)

    if (!result.success) {
      return errorResponse(result.error || "Erro ao cancelar assinatura")
    }

    const message = result.cancelAtPeriodEnd
      ? "Renovação cancelada. Seu plano permanecerá ativo até o final do ciclo atual."
      : SUBSCRIPTION_MESSAGES.SUBSCRIPTION_CANCELLED

    return successResponse({
      message,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      currentPeriodEnd: result.currentPeriodEnd,
    })
  } catch (error: any) {
    return errorResponse(error.message)
  }
}

/**
 * Upgrade or downgrade the current subscription.
 * - Upgrade: takes effect immediately (cancel old + create new)
 * - Downgrade: takes effect at end of current billing cycle
 */
export async function upgradeSubscriptionAction(
  newPlanId: string,
): Promise<ActionResponse<any>> {
  await requireRateLimit(RateLimitCategory.SUBSCRIPTION_CREATE)

  try {
    const user = await requireUser()
    const partner = await requirePartner()

    if (!newPlanId || typeof newPlanId !== "string") {
      return errorResponse(SUBSCRIPTION_MESSAGES.PLAN_NOT_FOUND)
    }

    // Get current plan before change
    const currentPlan = await getPartnerPlan(partner.id)

    const result = await updateMpSubscription(partner.id, newPlanId, user.id)

    if (!result.success) {
      return errorResponse(result.error || "Erro ao alterar plano")
    }

    // Webhook Discord: notificar mudança de plano (fail-open)
    const { getAllPlans } = await import("@/lib/services/subscription.service")
    const allPlans = await getAllPlans()
    const newPlan = allPlans.find(p => p.id === newPlanId)

    if (newPlan && currentPlan) {
      const changeType = result.type === "upgrade" ? "upgrade" : "downgrade"
      sendPlanChanged({
        userId: user.id,
        userEmail: user.email,
        userName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0],
        partnerId: partner.id,
        previousPlan: currentPlan.name || currentPlan.slug || "Desconhecido",
        newPlan: newPlan.name || newPlan.slug || "Desconhecido",
        changeType,
      }).catch(err => console.warn("[SUBSCRIPTION] Discord webhook failed (non-blocking):", err))
    }

    return successResponse({
      type: result.type,
      initPoint: result.initPoint,
      message: result.message,
    })
  } catch (error: any) {
    return errorResponse(error.message)
  }
}
