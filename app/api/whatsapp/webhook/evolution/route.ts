import { NextRequest, NextResponse } from "next/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  handleEvolutionWebhookPayload,
  verifyEvolutionWebhookSecret,
  refreshEvolutionWebhookUrl,
} from "@/lib/services/whatsapp-evolution-webhook.service"
import { SecureLogger } from "@/lib/secure-logger"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Evolution API Webhook Endpoint
 *
 * Receives webhook events from Evolution API instances.
 * Validates the webhook secret before processing.
 * Completely isolated from the Meta Cloud API webhook route.
 */

export async function POST(request: NextRequest) {
  try {
    await requireRateLimit(RateLimitCategory.WEBHOOK, "evolution-webhook")
  } catch {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const requestId = request.headers.get("x-request-id") || crypto.randomUUID()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Resolve instance to validate the webhook secret
  const instanceName = String(body.instance || body.instanceName || "")
  if (!instanceName) {
    SecureLogger.warn("[evolution webhook] Missing instance name", { requestId })
    return NextResponse.json({ error: "Missing instance" }, { status: 400 })
  }

  // Verify webhook secret
  const receivedSecret =
    request.headers.get("x-evolution-signature") ||
    request.headers.get("apikey") ||
    request.nextUrl.searchParams.get("secret")

  const cid = request.nextUrl.searchParams.get("cid")

  // Look up the expected secret for this instance
  const admin = getAdminClient()
  
  let query = admin
    .from("partner_whatsapp_connections")
    .select("id, partner_id, instance_name, is_active, evolution_webhook_secret, api_url, api_key_encrypted")
    .eq("provider", "evolution")
    .eq("is_active", true)

  if (cid) {
    query = query.eq("id", cid)
  } else {
    query = query
      .eq("instance_name", instanceName)
      .order("store_id", { ascending: true, nullsFirst: false })
      .limit(1)
  }

  const { data: connection } = await query.maybeSingle()

  const expectedSecret = connection?.evolution_webhook_secret

  if (!expectedSecret) {
    SecureLogger.warn("[evolution webhook] No active connection or secret configured for instance", { requestId, instanceName, cid })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!receivedSecret || !verifyEvolutionWebhookSecret(receivedSecret, expectedSecret)) {
    SecureLogger.warn("[evolution webhook] Invalid or missing secret", { requestId, instanceName, cid })
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 })
  }

  // Se o webhook chegou sem ?secret= na URL, a instância pode estar usando a URL antiga.
  // Dispara uma atualização assíncrona do webhook para incluir ?secret=.
  const hasUrlSecret = !!request.nextUrl.searchParams.get("secret")
  if (!hasUrlSecret && connection?.evolution_webhook_secret) {
    refreshEvolutionWebhookUrl(connection as any).catch(() => {})
  }

  try {
    const result = await handleEvolutionWebhookPayload(body, { connection, requestId })
    SecureLogger.info("[evolution webhook] Processed", {
      requestId,
      instanceName,
      event: String(body.event || "unknown"),
      processed: result.processed,
      duplicates: result.duplicates,
      errorCount: result.errors.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    SecureLogger.error("[evolution webhook] Handler error", { requestId, instanceName, error: message })
  }

  return NextResponse.json({ success: true })
}
