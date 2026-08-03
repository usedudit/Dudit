"use server"

import { requireUser, requirePartner } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
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

    return successResponse({
      plan: {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        limits: plan.limits_json,
        features: plan.features_json,
      },
      subscription: subscriptionPayload,
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

    return successResponse({ message: SUBSCRIPTION_MESSAGES.SUBSCRIPTION_CANCELLED })
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
