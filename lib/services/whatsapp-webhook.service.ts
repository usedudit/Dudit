import "server-only"

import { createHash, createHmac, timingSafeEqual } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { SecureLogger } from "@/lib/secure-logger"
import { logAuditEvent } from "./timeline.service"

function normalizeQuickReplyText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
}

export function resolveAppointmentAction(
  buttonId: string,
  buttonTitle: string,
): "confirm" | "cancel" | "talk" | null {
  if (buttonId === "confirm_appointment") return "confirm"
  if (buttonId === "cancel_appointment") return "cancel"
  if (buttonId === "talk_to_business") return "talk"

  const normalized = normalizeQuickReplyText(buttonTitle)
  if (normalized === "confirmar") return "confirm"
  if (normalized === "cancelar") return "cancel"
  if (normalized.includes("falar")) return "talk"

  return null
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !appSecret) return false
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const received = signature.replace(/^sha256=/, "")
  if (expected.length !== received.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    return false
  }
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function buildWhatsappStatusEventKey(phoneNumberId: string, status: Record<string, unknown>): string {
  return [
    "whatsapp",
    "status",
    phoneNumberId,
    String(status.id || "unknown"),
    String(status.status || "unknown"),
    String(status.timestamp || ""),
  ].join(":")
}

export function buildWhatsappMessageEventKey(phoneNumberId: string, message: Record<string, unknown>): string {
  const messageId = String(message.id || "")
  if (messageId) return ["whatsapp", "message", phoneNumberId, messageId].join(":")
  return ["whatsapp", "message", phoneNumberId, stableHash(message)].join(":")
}

async function claimWebhookEvent(params: {
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
      webhook_type: "whatsapp",
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

  throw new Error(`Failed to claim WhatsApp webhook event: ${error.message}`)
}

type WhatsappWebhookConnection = {
  id: string
  partner_id: string
  phone_number_id: string
  is_active: boolean
}

export type WhatsappWebhookProcessingResult = {
  processed: number
  duplicates: number
  unknownPhoneNumberIds: string[]
  errors: Array<{ phoneNumberId?: string; error: string }>
}

function emptyResult(): WhatsappWebhookProcessingResult {
  return {
    processed: 0,
    duplicates: 0,
    unknownPhoneNumberIds: [],
    errors: [],
  }
}

async function getActiveConnectionByPhoneNumberId(
  phoneNumberId: string,
  cache: Map<string, WhatsappWebhookConnection | null>,
): Promise<WhatsappWebhookConnection | null> {
  if (cache.has(phoneNumberId)) return cache.get(phoneNumberId) || null

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("partner_whatsapp_connections")
    .select("id, partner_id, phone_number_id, is_active")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw new Error(`Failed to resolve WhatsApp connection: ${error.message}`)

  const connection = (data as WhatsappWebhookConnection | null) || null
  cache.set(phoneNumberId, connection)
  return connection
}

async function processStatusWebhook(params: {
  status: Record<string, unknown>
  phoneNumberId: string
  partnerId: string
  requestId?: string | null
}): Promise<"processed" | "duplicate" | "skipped"> {
  const providerMessageId = String(params.status.id || "")
  const status = String(params.status.status || "")
  if (!providerMessageId) return "skipped"

  const claimed = await claimWebhookEvent({
    idempotencyKey: buildWhatsappStatusEventKey(params.phoneNumberId, params.status),
    resourceId: providerMessageId,
    action: `status.${status || "unknown"}`,
    partnerId: params.partnerId,
    requestId: params.requestId,
  })
  if (!claimed) return "duplicate"

  const updates: Record<string, string | null> = {}
  if (status === "sent") {
    updates.sent_at = new Date().toISOString()
    updates.status = "sent"
  }
  if (status === "delivered") {
    updates.delivered_at = new Date().toISOString()
    updates.status = "delivered"
  }
  if (status === "read") {
    updates.read_at = new Date().toISOString()
    updates.status = "read"
  }
  if (status === "failed") {
    updates.failed_at = new Date().toISOString()
    updates.status = "failed"

    // Extract error details from Meta's webhook payload
    const errors = params.status.errors as Array<Record<string, unknown>> | undefined
    if (errors && errors.length > 0) {
      const firstError = errors[0]
      const code = String(firstError.code || "")
      const title = String(firstError.title || "")
      const message = String(firstError.message || "")
      const errorData = firstError.error_data as Record<string, unknown> | undefined
      const details = errorData ? String(errorData.details || "") : ""

      const parts = [code && `[${code}]`, title, message, details && `(${details})`].filter(Boolean)
      updates.error_message = parts.join(" ") || "Falha na entrega (sem detalhes da Meta)"

      SecureLogger.error("[whatsapp webhook] Message delivery failed", {
        providerMessageId,
        partnerId: params.partnerId,
        errorCode: code,
        errorTitle: title,
        errorMessage: message,
        errorDetails: details,
        rawErrors: errors,
      })
    } else {
      updates.error_message = "Falha na entrega (sem detalhes da Meta)"
      SecureLogger.warn("[whatsapp webhook] Message failed without error details", {
        providerMessageId,
        partnerId: params.partnerId,
        rawStatus: params.status,
      })
    }
  }

  if (!Object.keys(updates).length) return "skipped"

  const admin = getAdminClient()

  // Prevent status downgrades due to out-of-order webhook delivery
  const { data: currentMsg } = await admin
    .from("whatsapp_messages")
    .select("status")
    .eq("partner_id", params.partnerId)
    .eq("provider_message_id", providerMessageId)
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
    .eq("provider_message_id", providerMessageId)

  return "processed"
}

async function resolveAppointmentId(params: {
  partnerId: string
  contextMessageId: string
  fromPhone: string
}): Promise<string | null> {
  const admin = getAdminClient()

  if (params.contextMessageId) {
    const { data: waMsg } = await admin
      .from("whatsapp_messages")
      .select("appointment_id")
      .eq("partner_id", params.partnerId)
      .eq("provider_message_id", params.contextMessageId)
      .maybeSingle()
    if (waMsg?.appointment_id) return waMsg.appointment_id
  }

  const { data: recent } = await admin
    .from("whatsapp_messages")
    .select("appointment_id")
    .eq("partner_id", params.partnerId)
    .eq("phone_number", params.fromPhone)
    .not("appointment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return recent?.appointment_id || null
}

async function processMessageWebhook(params: {
  message: Record<string, unknown>
  phoneNumberId: string
  partnerId: string
  requestId?: string | null
}): Promise<"processed" | "duplicate"> {
  const claimed = await claimWebhookEvent({
    idempotencyKey: buildWhatsappMessageEventKey(params.phoneNumberId, params.message),
    resourceId: String(params.message.id || stableHash(params.message)),
    action: `message.${String(params.message.type || "unknown")}`,
    partnerId: params.partnerId,
    requestId: params.requestId,
  })
  if (!claimed) return "duplicate"

  if (params.message.type !== "interactive") return "processed"

  const interactive = params.message.interactive as Record<string, unknown>
  const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined
  const buttonId = String(buttonReply?.id || "")
  const buttonTitle = String(buttonReply?.title || "")
  if (!buttonId && !buttonTitle) return "processed"

  const appointmentId = await resolveAppointmentId({
    partnerId: params.partnerId,
    contextMessageId: String((params.message.context as Record<string, unknown>)?.id || ""),
    fromPhone: String(params.message.from || ""),
  })
  if (!appointmentId) return "processed"

  const action = resolveAppointmentAction(buttonId, buttonTitle)
  const admin = getAdminClient()

  if (action === "confirm") {
    await admin
      .from("appointments")
      .update({ status: "Confirmado", updated_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("partner_id", params.partnerId)

    await logAuditEvent({
      partnerId: params.partnerId,
      actorUserId: null,
      entityType: "appointment",
      entityId: appointmentId,
      actionType: "whatsapp_appointment_confirmed",
      changeLines: ["Cliente confirmou agendamento via WhatsApp"],
      source: "webhook",
    })
  } else if (action === "cancel") {
    await admin
      .from("appointments")
      .update({ status: "Cancelado", updated_at: new Date().toISOString() })
      .eq("id", appointmentId)
      .eq("partner_id", params.partnerId)

    await logAuditEvent({
      partnerId: params.partnerId,
      actorUserId: null,
      entityType: "appointment",
      entityId: appointmentId,
      actionType: "whatsapp_appointment_cancelled",
      changeLines: ["Cliente cancelou agendamento via WhatsApp"],
      source: "webhook",
    })
  }

  return "processed"
}

export async function processWhatsappWebhookChange(params: {
  value: Record<string, unknown>
  requestId?: string | null
  connectionCache?: Map<string, WhatsappWebhookConnection | null>
}): Promise<WhatsappWebhookProcessingResult> {
  const result = emptyResult()
  const metadata = (params.value.metadata as Record<string, unknown>) || {}
  const phoneNumberId = String(metadata.phone_number_id || "")
  if (!phoneNumberId) return result

  const connection = await getActiveConnectionByPhoneNumberId(
    phoneNumberId,
    params.connectionCache || new Map(),
  )

  if (!connection) {
    result.unknownPhoneNumberIds.push(phoneNumberId)
    SecureLogger.warn("[whatsapp webhook] Unknown phone_number_id", { phoneNumberId })
    return result
  }

  const statuses = (params.value.statuses as unknown[]) || []
  for (const status of statuses) {
    try {
      const outcome = await processStatusWebhook({
        status: status as Record<string, unknown>,
        phoneNumberId,
        partnerId: connection.partner_id,
        requestId: params.requestId,
      })
      if (outcome === "duplicate") result.duplicates++
      if (outcome === "processed") result.processed++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push({ phoneNumberId, error: message })
      SecureLogger.error("[whatsapp webhook] Status processing failed", { phoneNumberId, error: message })
    }
  }

  const messages = (params.value.messages as unknown[]) || []
  for (const message of messages) {
    try {
      const outcome = await processMessageWebhook({
        message: message as Record<string, unknown>,
        phoneNumberId,
        partnerId: connection.partner_id,
        requestId: params.requestId,
      })
      if (outcome === "duplicate") result.duplicates++
      if (outcome === "processed") result.processed++
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      result.errors.push({ phoneNumberId, error: messageText })
      SecureLogger.error("[whatsapp webhook] Message processing failed", { phoneNumberId, error: messageText })
    }
  }

  return result
}

export async function handleWhatsappWebhookPayload(
  body: Record<string, unknown>,
  options: { requestId?: string | null } = {},
): Promise<WhatsappWebhookProcessingResult> {
  const aggregate = emptyResult()
  const connectionCache = new Map<string, WhatsappWebhookConnection | null>()
  const entries = Array.isArray(body.entry) ? body.entry : []

  for (const rawEntry of entries) {
    const entry = rawEntry as Record<string, unknown>
    const changes = Array.isArray(entry.changes) ? entry.changes : []

    for (const rawChange of changes) {
      const change = rawChange as Record<string, unknown>
      const value = (change.value as Record<string, unknown>) || {}
      const result = await processWhatsappWebhookChange({
        value,
        requestId: options.requestId,
        connectionCache,
      })

      aggregate.processed += result.processed
      aggregate.duplicates += result.duplicates
      aggregate.unknownPhoneNumberIds.push(...result.unknownPhoneNumberIds)
      aggregate.errors.push(...result.errors)
    }
  }

  aggregate.unknownPhoneNumberIds = Array.from(new Set(aggregate.unknownPhoneNumberIds))
  return aggregate
}
