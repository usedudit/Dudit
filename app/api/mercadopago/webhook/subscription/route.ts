import { type NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { invalidatePartnerPlanCache } from "@/lib/services/subscription.service"

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000
const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 5000, 8000]

// ─── Signature Verification ─────────────────────────────────────────────────

function validateWebhookSignature(
  signature: string,
  requestId: string | null,
  dataId: string | null,
): boolean {
  try {
    const webhookSecret = process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error("[SUB_WEBHOOK] MP_SUBSCRIPTION_WEBHOOK_SECRET not configured")
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

    const timestampMs = parseInt(timestamp, 10) * 1000
    if (Date.now() - timestampMs > MAX_WEBHOOK_AGE_MS) {
      console.warn("[SUB_WEBHOOK] Webhook expired")
      return false
    }

    // Build the template per Mercado Pago docs:
    // id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
    // If any value is not present, remove that part entirely.
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
    console.error("[SUB_WEBHOOK] Signature validation error:", error.message)
    return false
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.SUBSCRIPTION_WEBHOOK,
    "subscription-webhook"
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  try {
    const signature = request.headers.get("x-signature")
    const requestId = request.headers.get("x-request-id")

    if (!signature) {
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    const body = await request.json()

    // MP sends data.id in query params (per docs) OR in the body
    const url = new URL(request.url)
    const dataIdFromQuery = url.searchParams.get("data.id")
    const dataIdFromBody = body?.data?.id?.toString()
    const dataId = dataIdFromQuery || dataIdFromBody

    if (!dataId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const isValid = validateWebhookSignature(signature, requestId, dataId)
    if (!isValid) {
      SecureLogger.error("Subscription webhook: invalid signature", {
        requestId,
        type: body.type,
      })
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    // ACK immediately
    const response = NextResponse.json({ received: true }, { status: 200 })

    // Process asynchronously
    processSubscriptionWebhook(body, requestId || "unknown").catch((error) => {
      SecureLogger.error("Subscription webhook processing failed", {
        error: error.message,
      })
    })

    return response
  } catch (error: any) {
    SecureLogger.error("Subscription webhook handler error", { error: error.message })
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

  try {
    // Only handle subscription_preapproval events
    if (type !== "subscription_preapproval" || !resourceId) {
      return
    }

    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]
    await new Promise((resolve) => setTimeout(resolve, delay))

    const supabase = createAdminClient()

    // Find subscription by MP ID
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
      SecureLogger.error("Subscription webhook: subscription not found", {
        mpId: resourceId,
      })
      return
    }

    // Determine new status from MP webhook action
    const newStatus = mapMpActionToStatus(action)
    if (!newStatus) {
      console.log("[SUB_WEBHOOK] Unhandled action:", action)
      return
    }

    // Idempotent: skip if already in this status
    if (sub.status === newStatus) return

    // Guard: don't regress from cancelled
    if (sub.status === "cancelled" && newStatus !== "active") return

    // Update subscription status
    const updatePayload: any = {
      status: newStatus,
    }

    if (newStatus === "cancelled") {
      updatePayload.cancelled_at = new Date().toISOString()
      updatePayload.ended_at = new Date().toISOString()
    }

    if (newStatus === "active") {
      // Set period dates when subscription becomes active
      updatePayload.current_period_start = new Date().toISOString()
      updatePayload.current_period_end = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString()
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", sub.id)

    if (updateError) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processSubscriptionWebhook(body, requestId, attempt + 1)
      }
      SecureLogger.error("Subscription webhook: update failed", {
        error: updateError.message,
      })
      return
    }

    invalidatePartnerPlanCache(sub.partner_id)

    // Log billing event
    await logBillingEvent(supabase, sub.partner_id, `subscription_${newStatus}`, null, {
      mp_subscription_id: resourceId,
      mp_action: action,
      previous_status: sub.status,
    })

    // Audit log
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
        via: "webhook",
      },
    })

    console.log(
      `[SUB_WEBHOOK] Subscription ${sub.id} updated: ${sub.status} → ${newStatus}`
    )
  } catch (error: any) {
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return processSubscriptionWebhook(body, requestId, attempt + 1)
    }
    SecureLogger.error("Subscription webhook processing failed after retries", {
      error: error.message,
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapMpActionToStatus(
  action: string,
): "active" | "paused" | "cancelled" | "pending" | null {
  switch (action) {
    case "authorized":
    case "updated":
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
