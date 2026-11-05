import { NextRequest, NextResponse } from "next/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { handleWhatsappWebhookPayload, verifyMetaWebhookSignature } from "@/lib/services/whatsapp-webhook.service"
import { timingSafeStringEqual } from "@/lib/security/timing-safe"
import { SecureLogger } from "@/lib/secure-logger"

export async function GET(request: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.WEBHOOK, "whatsapp-webhook-verify")
  } catch {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge") || ""
  const platformVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode !== "subscribe" || !token) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!platformVerifyToken) {
    SecureLogger.error("[whatsapp webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  if (!timingSafeStringEqual(token, platformVerifyToken)) {
    SecureLogger.warn("[whatsapp webhook] Verification rejected")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

export async function POST(request: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.WEBHOOK, "whatsapp-webhook")
  } catch {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const requestId = request.headers.get("x-request-id") || request.headers.get("x-fb-trace-id")

  if (!appSecret) {
    SecureLogger.error("[whatsapp webhook] WHATSAPP_APP_SECRET is not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  if (!signature) {
    SecureLogger.warn("[whatsapp webhook] Rejected unsigned request", { requestId })
    return NextResponse.json({ error: "Missing signature" }, { status: 401 })
  }

  if (!verifyMetaWebhookSignature(rawBody, signature, appSecret)) {
    SecureLogger.warn("[whatsapp webhook] Rejected invalid signature", { requestId })
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const result = await handleWhatsappWebhookPayload(body, { requestId })
    SecureLogger.info("[whatsapp webhook] Processed", {
      requestId,
      processed: result.processed,
      duplicates: result.duplicates,
      unknownPhoneNumberIds: result.unknownPhoneNumberIds,
      errorCount: result.errors.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    SecureLogger.error("[whatsapp webhook] Handler error", { requestId, error: message })
  }

  return NextResponse.json({ success: true })
}
