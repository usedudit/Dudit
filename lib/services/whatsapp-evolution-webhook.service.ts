import "server-only"

import { timingSafeEqual } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { SecureLogger } from "@/lib/secure-logger"
import { decrypt } from "@/lib/cryptoService"
import { EvolutionWhatsappClient } from "@/lib/whatsapp/providers/evolution-client"
import { updateConnectionStatus, getWebhookUrl, EVOLUTION_WEBHOOK_EVENTS } from "./whatsapp-connection.service"
import type { WhatsappConnectionStatus } from "@/lib/whatsapp/types"

// ─── Webhook Secret Verification ─────────────────────────────────────────────

export function verifyEvolutionWebhookSecret(
  receivedSecret: string | null,
  expectedSecret: string,
): boolean {
  if (!receivedSecret || !expectedSecret) return false
  try {
    return timingSafeEqual(
      Buffer.from(receivedSecret),
      Buffer.from(expectedSecret),
    )
  } catch {
    return false
  }
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

function buildEvolutionEventKey(instanceName: string, event: string, messageId: string): string {
  return ["evolution", event, instanceName, messageId].join(":")
}

async function claimEvolutionEvent(params: {
  idempotencyKey: string
  resourceId: string
  action: string
  partnerId?: string | null
  requestId?: string | null
}): Promise<boolean> {
  const admin = getAdminClient()
  const { error } = await admin
    .from("processed_webhook_events")
    .insert({
      idempotency_key: params.idempotencyKey,
      webhook_type: "whatsapp_evolution",
      resource_id: params.resourceId,
      action: params.action,
      partner_id: params.partnerId || null,
      request_id: params.requestId || null,
    })

  if (!error) return true

  const message = String(error.message || "").toLowerCase()
  if (error.code === "23505" || message.includes("duplicate") || message.includes("unique")) {
    return false
  }

  throw new Error(`Failed to claim Evolution webhook event: ${error.message}`)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type EvolutionWebhookProcessingResult = {
  processed: number
  duplicates: number
  errors: Array<{ error: string }>
}

function emptyResult(): EvolutionWebhookProcessingResult {
  return { processed: 0, duplicates: 0, errors: [] }
}

// ─── Resolve connection by instance name ─────────────────────────────────────

type EvolutionWebhookConnection = {
  id: string
  partner_id: string
  instance_name: string
  is_active: boolean
  evolution_webhook_secret: string | null
}

async function getConnectionByInstanceName(
  instanceName: string,
): Promise<EvolutionWebhookConnection | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("partner_whatsapp_connections")
    .select("id, partner_id, instance_name, is_active, evolution_webhook_secret")
    .eq("instance_name", instanceName)
    .eq("provider", "evolution")
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw new Error(`Failed to resolve Evolution connection: ${error.message}`)
  return (data as EvolutionWebhookConnection | null) || null
}

// ─── Process status update events ────────────────────────────────────────────

async function processEvolutionStatusEvent(params: {
  data: Record<string, unknown>
  instanceName: string
  partnerId: string
  requestId?: string | null
}): Promise<"processed" | "duplicate" | "skipped"> {
  const messageId = String(
    (params.data.key as Record<string, unknown>)?.id ||
    params.data.messageId ||
    params.data.id ||
    "",
  )
  const status = String(params.data.status || "")
  if (!messageId || !status) return "skipped"

  const claimed = await claimEvolutionEvent({
    idempotencyKey: buildEvolutionEventKey(params.instanceName, `status.${status}`, messageId),
    resourceId: messageId,
    action: `status.${status}`,
    partnerId: params.partnerId,
    requestId: params.requestId,
  })
  if (!claimed) return "duplicate"

  const admin = getAdminClient()
  const updates: Record<string, string | null> = {}

  // Map Evolution status names to our internal status
  const statusLower = status.toLowerCase()
  if (statusLower === "sent" || statusLower === "server_ack") {
    updates.status = "sent"
    updates.sent_at = new Date().toISOString()
  } else if (statusLower === "delivered" || statusLower === "delivery_ack") {
    updates.status = "delivered"
    updates.delivered_at = new Date().toISOString()
  } else if (statusLower === "read" || statusLower === "read_ack" || statusLower === "played") {
    updates.status = "read"
    updates.read_at = new Date().toISOString()
  } else if (statusLower === "failed" || statusLower === "error") {
    updates.status = "failed"
    updates.failed_at = new Date().toISOString()
    updates.error_message = String(params.data.message || params.data.error || "Falha no envio")
  }

  if (!Object.keys(updates).length) return "skipped"

  // Prevent status downgrades due to out-of-order webhook delivery
  const { data: currentMsg } = await admin
    .from("whatsapp_messages")
    .select("status")
    .eq("partner_id", params.partnerId)
    .eq("provider_message_id", messageId)
    .maybeSingle()

  if (currentMsg?.status && updates.status) {
    const statusPrecedence: Record<string, number> = {
      pending: 1,
      queued: 2,
      sent: 3,
      delivered: 4,
      read: 5,
      failed: 6,
      failed_permanently: 7,
    }
    const currentPrecedence = statusPrecedence[currentMsg.status] || 0
    const newPrecedence = statusPrecedence[updates.status] || 0
    if (currentPrecedence >= newPrecedence) {
      delete updates.status
    }
  }

  await admin
    .from("whatsapp_messages")
    .update(updates)
    .eq("partner_id", params.partnerId)
    .eq("provider_message_id", messageId)

  return "processed"
}

// ─── Process connection events ───────────────────────────────────────────────

async function processEvolutionConnectionEvent(params: {
  data: Record<string, unknown>
  instanceName: string
  partnerId: string
}): Promise<void> {
  const rawState = String(params.data.state || params.data.status || "")
  const stateLower = rawState.toLowerCase()

  let status: WhatsappConnectionStatus = "disconnected"
  if (stateLower === "open" || stateLower === "connected") {
    status = "connected"
  } else if (stateLower === "close" || stateLower === "closed" || stateLower === "disconnected") {
    status = "disconnected"
  } else if (stateLower === "connecting") {
    status = "connecting"
  } else if (stateLower === "qr" || stateLower === "qrcode") {
    status = "qr_pending"
  }

  // Extract detailed disconnect properties for logging
  const reason = params.data.reason ?? null
  const statusCode = params.data.statusCode ?? null
  const lastDisconnect = params.data.lastDisconnect ?? null
  const disconnectReason = params.data.disconnectReason ?? null
  const disconnectionReasonCode = params.data.disconnectionReasonCode ?? null
  const disconnectionObject = params.data.disconnectionObject ?? null

  const admin = getAdminClient()
  const { data: currentConn } = await admin
    .from("partner_whatsapp_connections")
    .select("status")
    .eq("partner_id", params.partnerId)
    .eq("provider", "evolution")
    .maybeSingle()

  if (status === "disconnected") {
    if (currentConn && (currentConn.status === "qr_pending" || currentConn.status === "connecting")) {
      // Ignored: expected close states during pairing / QR scanning handshake
      SecureLogger.info("[evolution webhook] Preserved connection status during pairing", {
        instance: params.instanceName,
        partnerId: params.partnerId,
        currentStatus: currentConn.status,
        ignoredStatus: status,
        reason,
        statusCode,
        lastDisconnect,
        disconnectReason,
        disconnectionReasonCode,
        disconnectionObject,
      })
      return
    }

    // Real disconnect: log with details
    SecureLogger.warn("[evolution webhook] Active instance disconnected", {
      instance: params.instanceName,
      partnerId: params.partnerId,
      currentStatus: currentConn?.status,
      reason,
      statusCode,
      lastDisconnect,
      disconnectReason,
      disconnectionReasonCode,
      disconnectionObject,
    })
  }

  const extra: Record<string, string> = {}
  if (status === "connected") {
    extra.connected_at = new Date().toISOString()
    // Try to capture the phone number from the connection event
    const owner = params.data.ownerJid || params.data.owner
    if (typeof owner === "string" && owner.includes("@")) {
      extra.phone_number = owner.split("@")[0]
    }
  }

  await updateConnectionStatus(params.partnerId, "evolution", status, extra)

  SecureLogger.info("[evolution webhook] Connection status changed", {
    instance: params.instanceName,
    partnerId: params.partnerId,
    status,
  })
}

// ─── Main webhook handler ────────────────────────────────────────────────────

export async function handleEvolutionWebhookPayload(
  body: Record<string, unknown>,
  options: {
    connection?: { id: string; partner_id: string; instance_name: string | null; is_active: boolean; evolution_webhook_secret: string | null } | null
    requestId?: string | null
  } = {},
): Promise<EvolutionWebhookProcessingResult> {
  const result = emptyResult()

  // Evolution v2 webhook format: { event, instance, data, ... }
  const event = String(body.event || "")
  const instanceName = String(body.instance || body.instanceName || "")
  const data = (body.data as Record<string, unknown>) || {}

  if (!event || !instanceName) {
    SecureLogger.warn("[evolution webhook] Missing event or instance", { event, instanceName })
    return result
  }

  // Resolve connection (avoid duplicate query if connection is already passed from route)
  const connection = options.connection !== undefined
    ? options.connection
    : await getConnectionByInstanceName(instanceName)

  if (!connection) {
    SecureLogger.warn("[evolution webhook] Unknown instance", { instanceName })
    return result
  }

  try {
    switch (event) {
      case "messages.update":
      case "message.update":
      case "send.message": {
        const outcome = await processEvolutionStatusEvent({
          data,
          instanceName,
          partnerId: connection.partner_id,
          requestId: options.requestId,
        })
        if (outcome === "duplicate") result.duplicates++
        if (outcome === "processed") result.processed++
        break
      }

      case "connection.update":
      case "status.instance": {
        await processEvolutionConnectionEvent({
          data,
          instanceName,
          partnerId: connection.partner_id,
        })
        result.processed++
        break
      }

      case "qrcode.updated": {
        // QR code events are handled by updating connection status
        await updateConnectionStatus(connection.partner_id, "evolution", "qr_pending")
        result.processed++
        break
      }

      default:
        // Unknown events are logged but not processed
        SecureLogger.info("[evolution webhook] Unhandled event type", {
          event,
          instanceName,
        })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.errors.push({ error: message })
    SecureLogger.error("[evolution webhook] Processing error", {
      event,
      instanceName,
      error: message,
    })
  }

  return result
}

/**
 * Atualiza o webhook de uma instância Evolution para incluir ?secret= na URL.
 *
 * Isso garante que instâncias existentes (registradas antes da correção do ?secret=)
 * passem a validar corretamente mesmo que a Evolution API não repasse headers customizados.
 *
 * A função é fire-and-forget: erros são logados mas nunca propagados.
 * Chamada após cada validação bem-sucedida de webhook que não veio com ?secret=.
 */
export async function refreshEvolutionWebhookUrl(
  connection: EvolutionWebhookConnection & {
    api_url: string | null
    api_key_encrypted: string | null
  },
): Promise<void> {
  try {
    if (!connection.instance_name || !connection.api_url || !connection.evolution_webhook_secret) return

    const apiKey = connection.api_key_encrypted
      ? decrypt(connection.api_key_encrypted, "whatsapp")
      : process.env.EVOLUTION_API_KEY?.trim()

    if (!apiKey) return

    const webhookUrl = getWebhookUrl("evolution", connection.id, connection.evolution_webhook_secret)
    const webhookEvents = [...EVOLUTION_WEBHOOK_EVENTS]
    const webhookHeaders = { "x-evolution-signature": connection.evolution_webhook_secret }

    const client = new EvolutionWhatsappClient({
      apiUrl: connection.api_url,
      apiKey,
      instanceName: connection.instance_name,
    })

    await client.setWebhook(webhookUrl, webhookEvents, webhookHeaders)

    SecureLogger.info("[evolution webhook] Updated webhook URL with ?secret=", {
      instance: connection.instance_name,
      connectionId: connection.id,
    })
  } catch (err) {
    // Non-fatal: o webhook continuará funcionando se a Evolution repassar headers
    SecureLogger.warn("[evolution webhook] Failed to refresh webhook URL", {
      instance: connection.instance_name,
      connectionId: connection.id,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}
