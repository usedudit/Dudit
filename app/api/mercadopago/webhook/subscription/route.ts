import { type NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { invalidatePartnerPlanCache } from "@/lib/services/subscription.service"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000  // 5 minutes
const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 5000, 8000]

// ─── Signature Verification (MANDATORY) ─────────────────────────────────────

function validateWebhookSignature(
  signature: string,
  requestId: string | null,
  dataId: string | null,
): boolean {
  try {
    const webhookSecret = process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET
    if (!webhookSecret) {
      SecureLogger.error("[SUB_WEBHOOK] MP_SUBSCRIPTION_WEBHOOK_SECRET not configured - rejecting")
      return false
    }

    const parts = signature.split(",")
    let timestamp = ""
    let receivedSignature = ""

    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.startsWith("ts=")) {
        timestamp = trimmed.replace("ts=", "")
      } else if (trimmed.startsWith("v1=")) {
        receivedSignature = trimmed.replace("v1=", "")
      }
    }

    if (!timestamp || !receivedSignature) return false

    // Replay attack protection
    const timestampMs = parseInt(timestamp, 10) * 1000
    if (Date.now() - timestampMs > MAX_WEBHOOK_AGE_MS) {
      console.warn("[SUB_WEBHOOK] Webhook expired")
      return false
    }

    // Build the template per Mercado Pago docs:
    // id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
    let template = ""
    if (dataId) template += `id:${dataId};`
    if (requestId) template += `request-id:${requestId};`
    template += `ts:${timestamp};`

    const computedHmac = createHmac("sha256", webhookSecret)
      .update(template)
      .digest("hex")

    if (computedHmac.length !== receivedSignature.length) return false
    return timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedSignature))
  } catch (error: any) {
    SecureLogger.error("[SUB_WEBHOOK] Signature validation error", { error: error.message })
    return false
  }
}

// ─── Mercado Pago API Verification ──────────────────────────────────────────

/**
 * Fetch the actual subscription status from Mercado Pago API.
 * SECURITY: Never trust the webhook body alone - always verify with MP.
 */
async function verifySubscriptionWithMpApi(
  mpSubscriptionId: string,
): Promise<{ verified: boolean; mpStatus: string | null; mpData: any }> {
  try {
    const accessToken = await getMpPlatformAccessToken()
    const response = await fetch(
      `https://api.mercadopago.com/preapproval/${mpSubscriptionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )

    if (!response.ok) {
      console.error(`[SUB_WEBHOOK] MP API returned ${response.status} for subscription ${mpSubscriptionId}`)
      return { verified: false, mpStatus: null, mpData: null }
    }

    const mpData = await response.json()
    return {
      verified: true,
      mpStatus: mpData.status,
      mpData,
    }
  } catch (err: any) {
    console.error("[SUB_WEBHOOK] Error verifying with MP API:", err.message)
    return { verified: false, mpStatus: null, mpData: null }
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log("[SUB_WEBHOOK] ========== SUBSCRIPTION WEBHOOK RECEIVED ==========")

  // Rate limit
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.SUBSCRIPTION_WEBHOOK,
    "subscription-webhook",
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  try {
    // ── Step 1: Validate required headers (FAIL CLOSED) ──
    const signature = request.headers.get("x-signature")
    const requestId = request.headers.get("x-request-id")

    if (!signature) {
      console.error("[SUB_WEBHOOK] Rejected: missing x-signature header")
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    // ── Step 2: Parse body and extract data ID ──
    const body = await request.json()

    const url = new URL(request.url)
    const dataIdFromQuery = url.searchParams.get("data.id")
    const dataIdFromBody = body?.data?.id?.toString()
    const dataId = dataIdFromQuery || dataIdFromBody

    if (!dataId) {
      console.error("[SUB_WEBHOOK] Rejected: missing data.id")
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    console.log("[SUB_WEBHOOK] Event:", JSON.stringify({
      type: body.type,
      action: body.action,
      dataId,
    }))

    // ── Step 3: Validate signature (MANDATORY - no bypass) ──
    const isValid = validateWebhookSignature(signature, requestId, dataId)
    if (!isValid) {
      SecureLogger.error("[SUB_WEBHOOK] Rejected: invalid signature", {
        requestId,
        type: body.type,
      })
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    console.log("[SUB_WEBHOOK] Signature validated successfully")

    // ── Step 4: ACK immediately, process async ──
    const response = NextResponse.json({ received: true }, { status: 200 })

    processSubscriptionWebhook(body, requestId || "unknown").catch((error) => {
      SecureLogger.error("[SUB_WEBHOOK] Async processing failed", {
        error: error.message,
      })
    })

    return response
  } catch (error: any) {
    SecureLogger.error("[SUB_WEBHOOK] Handler error", { error: error.message })
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

// ─── Async Processor ────────────────────────────────────────────────────────

async function processSubscriptionWebhook(
  body: any,
  requestId: string,
  attempt: number = 0,
): Promise<void> {
  const { type, data, action } = body
  const resourceId = data?.id?.toString()

  console.log(`[SUB_WEBHOOK] Processing subscription ${resourceId} action="${action}" (attempt ${attempt + 1}/${MAX_RETRIES})`)

  try {
    // Only handle subscription_preapproval events
    if (type !== "subscription_preapproval" || !resourceId) {
      console.log("[SUB_WEBHOOK] Not a subscription_preapproval event, skipping")
      return
    }

    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]
    await new Promise((resolve) => setTimeout(resolve, delay))

    const supabase = createAdminClient()

    // ── DB-Level Idempotency ──
    // Uses UNIQUE constraint on idempotency_key - if a duplicate INSERT
    // is attempted, ON CONFLICT DO NOTHING makes it a no-op.
    // This is enforced by the database, not application logic.
    const idempotencyKey = `sub_${resourceId}_${action}_${requestId}`

    const { data: insertedEvent, error: idempotencyError } = await supabase
      .from("processed_webhook_events")
      .insert({
        idempotency_key: idempotencyKey,
        webhook_type: "subscription",
        resource_id: resourceId,
        action: action,
        request_id: requestId,
      })
      .select("id")
      .maybeSingle()

    if (idempotencyError) {
      // Check if this is a unique constraint violation (duplicate)
      if (idempotencyError.code === "23505") {
        console.log(`[SUB_WEBHOOK] Duplicate webhook blocked by DB constraint (key=${idempotencyKey})`)
        return
      }
      // Other DB error - log but continue (don't block processing on logging failure)
      console.error("[SUB_WEBHOOK] Idempotency table insert error:", idempotencyError.message)
    }

    // ── Find subscription by MP ID ──
    const { data: sub, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, partner_id, plan_id, status, cancel_at_period_end, pending_plan_id")
      .eq("mercado_pago_subscription_id", resourceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError || !sub) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processSubscriptionWebhook(body, requestId, attempt + 1)
      }
      SecureLogger.error("[SUB_WEBHOOK] Subscription not found after retries", {
        mpId: resourceId,
      })
      return
    }

    console.log(`[SUB_WEBHOOK] Found subscription ${sub.id}, current status: ${sub.status}`)

    // ── CRITICAL: Verify actual status with Mercado Pago API ──
    // NEVER trust the webhook action alone
    const { verified, mpStatus, mpData } = await verifySubscriptionWithMpApi(resourceId)

    if (!verified || !mpStatus) {
      console.error("[SUB_WEBHOOK] Could not verify subscription with MP API")
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processSubscriptionWebhook(body, requestId, attempt + 1)
      }
      SecureLogger.error("[SUB_WEBHOOK] MP API verification failed after retries", {
        mpId: resourceId,
        subscriptionId: sub.id,
      })
      return
    }

    console.log(`[SUB_WEBHOOK] MP API verified - actual status: "${mpStatus}" (webhook action: "${action}")`)

    // ── Map the VERIFIED MP status to our internal status ──
    const newStatus = mapMpStatusToInternal(mpStatus)
    if (!newStatus) {
      console.log(`[SUB_WEBHOOK] Unhandled MP status: "${mpStatus}"`)
      return
    }

    // Idempotent: skip if already in this status
    if (sub.status === newStatus) {
      console.log(`[SUB_WEBHOOK] Subscription ${sub.id} already in status "${newStatus}", skipping`)
      return
    }

    // Guard: don't regress from cancelled
    if (sub.status === "cancelled" && newStatus !== "active") {
      console.log(`[SUB_WEBHOOK] Subscription ${sub.id} is cancelled, not regressing to "${newStatus}"`)
      return
    }

    // ── Build update payload ──
    const updatePayload: any = {
      status: newStatus,
    }

    if (newStatus === "active") {
      // Set period dates when subscription becomes active
      const now = new Date()
      updatePayload.current_period_start = now.toISOString()
      updatePayload.current_period_end = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString()
      // Clear past_due_at when reactivated
      updatePayload.past_due_at = null
    }

    if (newStatus === "past_due") {
      // Record the EXACT moment the subscription enters past_due.
      // This is the deterministic anchor for the grace period.
      updatePayload.past_due_at = new Date().toISOString()
    }

    if (newStatus === "cancelled") {
      updatePayload.cancelled_at = new Date().toISOString()
      updatePayload.ended_at = new Date().toISOString()
      updatePayload.past_due_at = null
    }

    // ── Update subscription ──
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", sub.id)

    if (updateError) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processSubscriptionWebhook(body, requestId, attempt + 1)
      }
      SecureLogger.error("[SUB_WEBHOOK] Update failed after retries", {
        error: updateError.message,
        subscriptionId: sub.id,
      })
      return
    }

    // ── Update the idempotency record with result context ──
    if (insertedEvent?.id) {
      await supabase
        .from("processed_webhook_events")
        .update({
          status_before: sub.status,
          status_after: newStatus,
          mp_verified_status: mpStatus,
          partner_id: sub.partner_id,
        })
        .eq("id", insertedEvent.id)
    }

    // ── Invalidate plan cache ONLY after actual status change ──
    invalidatePartnerPlanCache(sub.partner_id)

    // ── Log billing event (for audit trail, separate from idempotency) ──
    await logBillingEvent(supabase, sub.partner_id, `subscription_${newStatus}`, null, {
      mp_subscription_id: resourceId,
      mp_action: action,
      mp_verified_status: mpStatus,
      previous_status: sub.status,
      idempotency_key: idempotencyKey,
    })

    // ── Audit log ──
    const auditAction = newStatus === "cancelled"
      ? "subscription.cancelled" as const
      : "subscription.status_changed" as const

    await auditLog({
      action: auditAction,
      actorUserId: "system",
      partnerId: sub.partner_id,
      metadata: {
        subscription_id: sub.id,
        previous_status: sub.status,
        new_status: newStatus,
        mp_action: action,
        mp_verified_status: mpStatus,
        via: "webhook",
      },
    })

    console.log(
      `[SUB_WEBHOOK] ✅ Subscription ${sub.id} updated: "${sub.status}" → "${newStatus}" (MP verified: "${mpStatus}")`,
    )
    console.log("[SUB_WEBHOOK] ==========================================================\n")
  } catch (error: any) {
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return processSubscriptionWebhook(body, requestId, attempt + 1)
    }
    SecureLogger.error("[SUB_WEBHOOK] Processing failed after all retries", {
      error: error.message,
      resourceId,
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map the VERIFIED Mercado Pago subscription status to our internal status.
 * Uses the status from the MP API response (NOT the webhook action field).
 */
function mapMpStatusToInternal(
  mpStatus: string,
): "active" | "past_due" | "paused" | "cancelled" | "pending" | null {
  switch (mpStatus) {
    case "authorized":
      return "active"
    case "paused":
      return "paused"
    case "cancelled":
      return "cancelled"
    case "pending":
      return "pending"
    default:
      return null
  }
}

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
    console.error("[BILLING_EVENT] Failed to log:", {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
