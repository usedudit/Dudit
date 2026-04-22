/**
 * Mercado Pago Subscriptions Integration - Platform-level subscription management.
 *
 * Uses PLATFORM credentials (MP_SUBSCRIPTION_CLIENT_ID / MP_SUBSCRIPTION_CLIENT_SECRET),
 * NOT partner OAuth tokens. The subscription flow is: partner pays Dudit.
 *
 * @module mercadopago-subscriptions
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import {
  getPartnerSubscription,
  getPlanById,
  invalidatePartnerPlanCache,
} from "@/lib/services/subscription.service"
import type { Plan } from "@/lib/services/subscription.service"

// ─── Types ──────────────────────────────────────────────────────────────────

interface MpTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface MpPreapprovalResponse {
  id: string
  status: string
  init_point: string
  payer_id?: number
  [key: string]: unknown
}

export interface CreateSubscriptionResult {
  success: boolean
  subscriptionId?: string
  mpSubscriptionId?: string
  initPoint?: string
  error?: string
}

export interface CancelSubscriptionResult {
  success: boolean
  error?: string
}

export interface UpdateSubscriptionResult {
  success: boolean
  type: "upgrade" | "downgrade"
  initPoint?: string
  message?: string
  error?: string
}

// ─── Platform Access Token (cached) ─────────────────────────────────────────

let platformTokenCache: { token: string; expiresAt: number } | null = null

/**
 * Get a valid platform-level access token for Mercado Pago Subscriptions API.
 * Uses client_credentials grant with MP_SUBSCRIPTION_CLIENT_ID / MP_SUBSCRIPTION_CLIENT_SECRET.
 * Caches the token with a 5-minute buffer before expiry.
 */
export async function getMpPlatformAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  const BUFFER_MS = 5 * 60 * 1000
  if (platformTokenCache && platformTokenCache.expiresAt - BUFFER_MS > Date.now()) {
    return platformTokenCache.token
  }

  const clientId = process.env.MP_SUBSCRIPTION_CLIENT_ID
  const clientSecret = process.env.MP_SUBSCRIPTION_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return "build-time-placeholder-token"
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      SecureLogger.error("MP platform token fetch failed", {
        status: response.status,
        error: errorData?.error,
      })
      throw new Error(`MP platform token fetch failed with status ${response.status}`)
    }

    const data = (await response.json()) as MpTokenResponse

    if (!data.access_token) {
      throw new Error("Invalid response from MP platform token endpoint")
    }

    platformTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 21600) * 1000,
    }

    return data.access_token
  } catch (err) {
    clearTimeout(timeoutId)
    SecureLogger.error("MP platform token network error", {
      error: err instanceof Error ? err.message : "Unknown error",
    })
    throw err
  }
}

// ─── Create Subscription ────────────────────────────────────────────────────

/**
 * Create a new subscription for a partner via Mercado Pago Preapproval API.
 *
 * SECURITY:
 * - Race condition guard: checks for existing active/pending/trialing subscription
 * - Stores plan_snapshot for immutability
 * - Creates billing_event for audit trail
 */
export async function createMpSubscription(
  partnerId: string,
  planId: string,
  payerEmail: string,
  actorUserId: string,
): Promise<CreateSubscriptionResult> {
  const admin = getAdminClient()

  // ── Race condition guard ──
  const existing = await getPartnerSubscription(partnerId)
  if (existing) {
    if (["active", "trialing", "past_due"].includes(existing.status)) {
      return { success: false, error: "Já existe uma assinatura ativa para este parceiro" }
    }

    // If there's a stale "pending" subscription (checkout never completed),
    // cancel it so the user can start a fresh checkout.
    if (existing.status === "pending") {
      SecureLogger.info("Cancelling stale pending subscription to allow new checkout", {
        partnerId,
        oldSubscriptionId: existing.id,
        oldMpId: existing.mercado_pago_subscription_id,
      })

      const { error: cancelError } = await admin
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (cancelError) {
        SecureLogger.error("Failed to cancel stale pending subscription", {
          error: cancelError.message,
          subscriptionId: existing.id,
        })
        return { success: false, error: "Erro ao limpar assinatura pendente. Tente novamente." }
      }

      await logBillingEvent(admin, partnerId, "stale_pending_replaced", null, {
        cancelled_subscription_id: existing.id,
        reason: "User initiated new checkout",
      })
    }
  }

  // ── Get plan ──
  const plan = await getPlanById(planId)
  if (!plan || !plan.is_active) {
    return { success: false, error: "Plano não encontrado ou inativo" }
  }

  // Free plan doesn't need MP subscription
  if (plan.price <= 0) {
    const { data: sub, error } = await admin
      .from("subscriptions")
      .insert({
        partner_id: partnerId,
        plan_id: planId,
        plan_snapshot: plan,
        status: "active",
        billing_email: payerEmail,
        current_period_start: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (error) {
      SecureLogger.error("Failed to create free subscription", { error: error.message, partnerId })
      return { success: false, error: error.message }
    }

    invalidatePartnerPlanCache(partnerId)

    await logBillingEvent(admin, partnerId, "subscription_created", 0, { plan_slug: plan.slug })
    await auditLog({
      action: "subscription.created",
      actorUserId,
      partnerId,
      metadata: { plan_id: planId, plan_name: plan.name, type: "free" },
    })

    return { success: true, subscriptionId: sub.id }
  }

  // ── Create MP preapproval ──
  try {
    const accessToken = await getMpPlatformAccessToken()

    const backUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"}/erp/settings/subscription`

    const mpPayload = {
      reason: `Dudit ${plan.name} - Assinatura mensal`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.price,
        currency_id: "BRL",
      },
      payer_email: payerEmail,
      back_url: backUrl,
      external_reference: partnerId,
    }

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mpPayload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      SecureLogger.error("MP preapproval creation failed", {
        status: response.status,
        partnerId,
        error: errorData,
      })
      return { success: false, error: "Erro ao criar assinatura no Mercado Pago" }
    }

    const mpData = (await response.json()) as MpPreapprovalResponse

    // ── Store subscription ──
    const { data: sub, error: insertError } = await admin
      .from("subscriptions")
      .insert({
        partner_id: partnerId,
        plan_id: planId,
        plan_snapshot: plan,
        mercado_pago_subscription_id: mpData.id,
        status: "pending",
        billing_email: payerEmail,
        payment_provider: "mercado_pago",
      })
      .select("id")
      .single()

    if (insertError) {
      SecureLogger.error("Failed to store subscription", {
        error: insertError.message,
        partnerId,
        mpId: mpData.id,
      })
      return { success: false, error: insertError.message }
    }

    // NOTE: Do NOT invalidate plan cache here. The subscription is "pending"
    // and must NOT affect plan resolution until activated via webhook.
    // invalidatePartnerPlanCache(partnerId) — REMOVED for security

    await logBillingEvent(admin, partnerId, "subscription_created", plan.price, {
      plan_slug: plan.slug,
      mp_subscription_id: mpData.id,
    })

    await auditLog({
      action: "subscription.created",
      actorUserId,
      partnerId,
      metadata: {
        plan_id: planId,
        plan_name: plan.name,
        mp_subscription_id: mpData.id,
      },
    })

    return {
      success: true,
      subscriptionId: sub.id,
      mpSubscriptionId: mpData.id,
      initPoint: mpData.init_point,
    }
  } catch (err) {
    SecureLogger.error("createMpSubscription error", {
      error: err instanceof Error ? err.message : "Unknown",
      partnerId,
    })
    return { success: false, error: "Erro interno ao criar assinatura" }
  }
}

// ─── Cancel Subscription ────────────────────────────────────────────────────

/**
 * Cancel a subscription. If it has a MP subscription ID, cancels on MP too.
 * Sets cancelled_at timestamp and updates status.
 */
export async function cancelMpSubscription(
  subscriptionId: string,
  actorUserId: string,
): Promise<CancelSubscriptionResult> {
  const admin = getAdminClient()

  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, partner_id, plan_id, mercado_pago_subscription_id, status")
    .eq("id", subscriptionId)
    .single()

  if (fetchError || !sub) {
    return { success: false, error: "Assinatura não encontrada" }
  }

  if (sub.status === "cancelled") {
    return { success: false, error: "Assinatura já foi cancelada" }
  }

  // Cancel on MP if present
  if (sub.mercado_pago_subscription_id) {
    try {
      const accessToken = await getMpPlatformAccessToken()

      const response = await fetch(
        `https://api.mercadopago.com/preapproval/${sub.mercado_pago_subscription_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        }
      )

      if (!response.ok) {
        SecureLogger.error("MP subscription cancellation failed", {
          status: response.status,
          mpId: sub.mercado_pago_subscription_id,
        })
        // Continue with local cancellation even if MP fails
      }
    } catch (err) {
      SecureLogger.error("MP cancellation network error", {
        error: err instanceof Error ? err.message : "Unknown",
        mpId: sub.mercado_pago_subscription_id,
      })
    }
  }

  // Update local subscription
  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: now,
      ended_at: now,
      cancel_at_period_end: false,
    })
    .eq("id", subscriptionId)

  if (updateError) {
    SecureLogger.error("Failed to update subscription status", {
      error: updateError.message,
      subscriptionId,
    })
    return { success: false, error: updateError.message }
  }

  invalidatePartnerPlanCache(sub.partner_id)

  await logBillingEvent(admin, sub.partner_id, "subscription_cancelled", null, {
    subscription_id: subscriptionId,
  })

  await auditLog({
    action: "subscription.cancelled",
    actorUserId,
    partnerId: sub.partner_id,
    metadata: { subscription_id: subscriptionId, plan_id: sub.plan_id },
  })

  return { success: true }
}

// ─── Update Subscription (Upgrade / Downgrade) ─────────────────────────────

/**
 * Handle plan changes:
 * - Upgrade: cancel old + create new immediately
 * - Downgrade: schedule switch at next billing cycle (cancel_at_period_end + pending_plan_id)
 */
export async function updateMpSubscription(
  partnerId: string,
  newPlanId: string,
  actorUserId: string,
): Promise<UpdateSubscriptionResult> {
  const admin = getAdminClient()

  const currentSub = await getPartnerSubscription(partnerId)
  if (!currentSub || !["active", "trialing"].includes(currentSub.status)) {
    return { success: false, type: "upgrade", error: "Nenhuma assinatura ativa encontrada" }
  }

  const newPlan = await getPlanById(newPlanId)
  if (!newPlan || !newPlan.is_active) {
    return { success: false, type: "upgrade", error: "Plano não encontrado ou inativo" }
  }

  const currentPlan = currentSub.plan
  const isUpgrade = newPlan.price > currentPlan.price

  if (isUpgrade) {
    // ── UPGRADE: Cancel current + create new immediately ──
    const cancelResult = await cancelMpSubscription(currentSub.id, actorUserId)
    if (!cancelResult.success) {
      return { success: false, type: "upgrade", error: cancelResult.error }
    }

    const billingEmail = currentSub.billing_email || ""
    const createResult = await createMpSubscription(partnerId, newPlanId, billingEmail, actorUserId)

    if (!createResult.success) {
      return { success: false, type: "upgrade", error: createResult.error }
    }

    await auditLog({
      action: "subscription.upgraded",
      actorUserId,
      partnerId,
      metadata: {
        from_plan: currentPlan.slug,
        to_plan: newPlan.slug,
      },
    })

    return {
      success: true,
      type: "upgrade",
      initPoint: createResult.initPoint,
      message: "Plano atualizado com sucesso",
    }
  } else {
    // ── DOWNGRADE: Schedule for next billing cycle ──
    const { error } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        pending_plan_id: newPlanId,
      })
      .eq("id", currentSub.id)

    if (error) {
      SecureLogger.error("Failed to schedule downgrade", {
        error: error.message,
        subscriptionId: currentSub.id,
      })
      return { success: false, type: "downgrade", error: error.message }
    }

    await logBillingEvent(admin, partnerId, "downgrade_scheduled", null, {
      from_plan: currentPlan.slug,
      to_plan: newPlan.slug,
      scheduled_at: currentSub.current_period_end,
    })

    await auditLog({
      action: "subscription.downgraded",
      actorUserId,
      partnerId,
      metadata: {
        from_plan: currentPlan.slug,
        to_plan: newPlan.slug,
        effective_at: currentSub.current_period_end,
      },
    })

    return {
      success: true,
      type: "downgrade",
      message: "Downgrade agendado para o próximo ciclo de faturamento",
    }
  }
}

// ─── Get MP Subscription Status ─────────────────────────────────────────────

/**
 * Fetch the current status of a Mercado Pago subscription.
 */
export async function getMpSubscriptionStatus(
  mpSubscriptionId: string,
): Promise<{ status: string; [key: string]: unknown } | null> {
  try {
    const accessToken = await getMpPlatformAccessToken()

    const response = await fetch(
      `https://api.mercadopago.com/preapproval/${mpSubscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function logBillingEvent(
  admin: any,
  partnerId: string,
  eventType: string,
  amount: number | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("billing_events").insert({
      partner_id: partnerId,
      event_type: eventType,
      amount,
      provider: "mercado_pago",
      metadata,
    })
  } catch (err) {
    // Billing event logging must never break the primary action
    console.error("[BILLING_EVENT] Failed to log:", {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
