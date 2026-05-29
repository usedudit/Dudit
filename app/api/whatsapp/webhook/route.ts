import { NextRequest, NextResponse } from "next/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { handleWhatsappWebhookPayload, verifyMetaWebhookSignature } from "@/lib/services/whatsapp-webhook.service"

export async function GET(request: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.WEBHOOK, "whatsapp-webhook-verify")
  } catch {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge") || ""

  if (mode !== "subscribe" || !token) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data: connection } = await admin
    .from("partner_whatsapp_connections")
    .select("webhook_verify_token")
    .eq("webhook_verify_token", token)
    .eq("is_active", true)
    .maybeSingle()

  if (!connection) {
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
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const signature = request.headers.get("x-hub-signature-256")
  const entry = (body.entry as unknown[])?.[0] as Record<string, unknown> | undefined
  const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined
  const value = (changes?.value as Record<string, unknown>) || {}
  const metadata = (value.metadata as Record<string, unknown>) || {}
  const phoneNumberId = String(metadata.phone_number_id || "")

  if (phoneNumberId) {
    const admin = getAdminClient()
    const { data: connection } = await admin
      .from("partner_whatsapp_connections")
      .select("access_token_encrypted, webhook_secret, phone_number_id")
      .eq("phone_number_id", phoneNumberId)
      .eq("is_active", true)
      .maybeSingle()

    const appSecret = connection?.webhook_secret || process.env.WHATSAPP_APP_SECRET
    if (appSecret && signature) {
      const valid = verifyMetaWebhookSignature(rawBody, signature, appSecret)
      if (!valid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }
  }

  try {
    await handleWhatsappWebhookPayload(body)
  } catch (err) {
    console.error("[whatsapp webhook]", err)
  }

  return NextResponse.json({ success: true })
}
