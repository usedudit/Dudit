import { type NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const SUPPORTED_EVENTS = new Set([
  "subscription_preapproval",
  "subscription_authorized_payment",
])

function validateWebhookSignature(
  signature: string,
  requestId: string,
  dataId: string,
): boolean {
  try {
    const secret = process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET
    if (!secret) {
      SecureLogger.error("[SUB_WEBHOOK] MP_SUBSCRIPTION_WEBHOOK_SECRET not configured - rejecting")
      return false
    }

    let timestamp = ""
    let receivedSignature = ""
    for (const part of signature.split(",")) {
      const trimmed = part.trim()
      if (trimmed.startsWith("ts=")) timestamp = trimmed.slice(3)
      else if (trimmed.startsWith("v1=")) receivedSignature = trimmed.slice(3)
    }
    if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(receivedSignature)) return false

    const timestampMs = Number(timestamp) * 1000
    if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_WEBHOOK_AGE_MS) {
      return false
    }

    const template = `id:${dataId};request-id:${requestId};ts:${timestamp};`
    const computed = createHmac("sha256", secret).update(template).digest("hex")
    const expectedBytes = Buffer.from(computed, "hex")
    const receivedBytes = Buffer.from(receivedSignature, "hex")
    return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  } catch (error: any) {
    SecureLogger.error("[SUB_WEBHOOK] Signature validation error", { error: error.message })
    return false
  }
}

/**
 * Subscription notifications use the same durable outbox as payment events.
 * The authenticated cron worker replays them through the main webhook handler,
 * which verifies state against Mercado Pago before mutating billing.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.SUBSCRIPTION_WEBHOOK,
    "subscription-webhook",
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  const signature = request.headers.get("x-signature")
  const requestId = request.headers.get("x-request-id")
  if (!signature || !requestId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 401 })
  }

  try {
    const declaredLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    const body = rawBody ? JSON.parse(rawBody) : {}
    const query = request.nextUrl.searchParams
    const dataId = String(body?.data?.id ?? query.get("data.id") ?? "").trim()
    const eventType = String(body?.type ?? query.get("type") ?? query.get("topic") ?? "").trim()
    const action = typeof body?.action === "string" ? body.action : undefined

    if (!dataId || !SUPPORTED_EVENTS.has(eventType)) {
      return NextResponse.json({ error: "Unsupported webhook event" }, { status: 400 })
    }
    if (!validateWebhookSignature(signature, requestId, dataId)) {
      SecureLogger.warn("[SUB_WEBHOOK] Rejected invalid signature", { eventType })
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    const payload = {
      ...body,
      type: eventType,
      ...(action ? { action } : {}),
      data: { ...(body?.data || {}), id: dataId },
    }
    const idempotencyKey = `mercadopago:${eventType}:${dataId}:${requestId}`
    const { error } = await createAdminClient()
      .from("pending_webhook_events")
      .insert({
        provider: "mercadopago",
        event_type: eventType,
        request_id: requestId,
        signature,
        payload,
        resource_id: dataId,
        status: "pending",
        idempotency_key: idempotencyKey,
      })

    if (error && error.code !== "23505") {
      SecureLogger.error("[SUB_WEBHOOK] Failed to persist event", {
        eventType,
        error: error.message,
      })
      return NextResponse.json({ error: "Could not queue webhook" }, { status: 503 })
    }

    return NextResponse.json({ received: true, duplicate: error?.code === "23505" }, { status: 200 })
  } catch (error: any) {
    SecureLogger.error("[SUB_WEBHOOK] Ingestion failed", { error: error.message })
    return NextResponse.json({ error: "Webhook ingestion unavailable" }, { status: 503 })
  }
}
