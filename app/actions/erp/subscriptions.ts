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
} from "@/lib/services/subscription.service"
import {
  createMpSubscription,
  cancelMpSubscription,
  updateMpSubscription,
  getMpSubscriptionStatus,
} from "@/lib/services/mercadopago/subscriptions"
import { computeSubscriptionPeriods } from "@/lib/billing/subscription-period"
import { SUBSCRIPTION_MESSAGES } from "@/lib/constants/messages"

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

    const [subscription, plan, counters] = await Promise.all([
      getPartnerSubscription(partner.id),
      getPartnerPlan(partner.id),
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

    // Enrich with the next payment date from Mercado Pago when available.
    // This is more reliable than current_period_end for subscriptions that
    // were created before period dates were tracked.
    if (
      subscriptionPayload &&
      subscription?.mercado_pago_subscription_id &&
      ["active", "trialing", "past_due"].includes(subscription.status)
    ) {
      try {
        const mpStatus = await getMpSubscriptionStatus(subscription.mercado_pago_subscription_id)
        if (mpStatus?.next_payment_date) {
          subscriptionPayload.next_payment_date = mpStatus.next_payment_date
        }
      } catch {
        // Non-critical: fall back to current_period_end on the client.
      }
    }

    // Always provide a correct upcoming charge date (never in the past).
    if (subscriptionPayload && subscription) {
      if (!subscriptionPayload.next_payment_date) {
        const periods = computeSubscriptionPeriods(subscription)
        subscriptionPayload.next_payment_date = periods.nextStart.toISOString()
      }
    }

    // ── Fetch the NEXT cycle purchase (the "Próxima Fatura") from billing ──
    let nextInvoice: any = null
    if (
      subscriptionPayload &&
      subscription &&
      ["active", "trialing"].includes(subscription.status)
    ) {
      try {
        const admin = getAdminClient()
        const { data: nextPurchase } = await admin
          .from("billing_purchases")
          .select("*, billing_invoices(*)")
          .eq("subscription_id", subscription.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (nextPurchase) {
          const invoice = (nextPurchase as any).billing_invoices?.[0] || null
          nextInvoice = {
            purchase_id: nextPurchase.id,
            invoice_id: invoice?.id || nextPurchase.invoice_id || null,
            invoice_number: invoice?.invoice_number || null,
            due_date: nextPurchase.billing_period_start
              || (nextPurchase.metadata?.due_date || null),
            period_start: nextPurchase.billing_period_start || null,
            period_end: nextPurchase.billing_period_end || null,
            amount: Number(nextPurchase.total_amount),
            status: nextPurchase.status,
          }
        }
      } catch (err: any) {
        console.error("[Subscriptions] Error fetching next invoice:", err?.message)
      }
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
export async function cancelSubscriptionAction(): Promise<ActionResponse<any>> {
  await requireRateLimit(RateLimitCategory.SUBSCRIPTION_CANCEL)

  try {
    const user = await requireUser()
    const partner = await requirePartner()

    const subscription = await getPartnerSubscription(partner.id)
    if (!subscription) {
      return errorResponse(SUBSCRIPTION_MESSAGES.SUBSCRIPTION_NOT_FOUND)
    }

    const result = await cancelMpSubscription(subscription.id, user.id)

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

    const result = await updateMpSubscription(partner.id, newPlanId, user.id)

    if (!result.success) {
      return errorResponse(result.error || "Erro ao alterar plano")
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
