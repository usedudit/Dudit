import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "./timeline.service"
import { createWhatsappProviderFromConnection } from "@/lib/whatsapp/providers"
import { getActiveWhatsappConnection } from "./whatsapp-connection.service"
import { normalizePhoneToE164 } from "@/lib/whatsapp/phone"
import { isRetryableWhatsappError } from "@/lib/whatsapp/errors"
import { SecureLogger } from "@/lib/secure-logger"
import type { QueueMessageInput, WhatsappTemplateComponent, WhatsappExecutionResult } from "@/lib/whatsapp/types"

function calculateNextRetryAt(retryCount: number): string {
  const delayMinutes = Math.pow(2, Math.min(retryCount, 5))
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
}

export function buildTemplateComponentsFromPayload(payload: Record<string, unknown>): WhatsappTemplateComponent[] | undefined {
  if (Array.isArray(payload.components)) {
    return payload.components as WhatsappTemplateComponent[]
  }

  const variables = payload.variables
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    return undefined
  }

  const parameters = Object.values(variables as Record<string, unknown>)
    .filter((value) => value !== undefined && value !== null)
    .map((value) => ({ type: "text", text: String(value) }))

  if (parameters.length === 0) return undefined

  return [{ type: "body", parameters }]
}

export async function queueWhatsappMessage(input: QueueMessageInput): Promise<WhatsappExecutionResult> {
  const admin = getAdminClient()

  const e164 = normalizePhoneToE164(input.phoneNumber)
  if (!e164) {
    SecureLogger.info("[whatsapp] queue: invalid phone", {
      partnerId: input.partnerId,
      triggerType: input.triggerType,
      rawPhone: input.phoneNumber,
    })
    return { success: false, resultStatus: "skipped_invalid_phone", reason: "invalid_phone_number", messageId: null, providerMessageId: null }
  }

  SecureLogger.info("[whatsapp] queue: phone_normalized", { partnerId: input.partnerId, e164 })

  const connection = await getActiveWhatsappConnection(input.partnerId, input.storeId)
  if (!connection?.is_active) {
    SecureLogger.warn("[whatsapp] queue: no active connection", { partnerId: input.partnerId, storeId: input.storeId })
    return { success: false, resultStatus: "skipped_no_connection", reason: "integration_inactive", messageId: null, providerMessageId: null }
  }

  SecureLogger.info("[whatsapp] queue: connection found", { partnerId: input.partnerId, storeId: input.storeId, provider: connection.provider })

  if (input.idempotencyKey) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id, status")
      .eq("partner_id", input.partnerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle()
    if (existing?.id) {
      SecureLogger.info("[whatsapp] queue: idempotency hit", { partnerId: input.partnerId, existingId: existing.id })
      return { success: false, resultStatus: "skipped_duplicate", reason: "idempotency_match", messageId: existing.id, providerMessageId: null }
    }
  }

  SecureLogger.info("[whatsapp] queue: inserting message", { partnerId: input.partnerId, messageType: input.messageType })

  const { data: inserted, error } = await admin
    .from("whatsapp_messages")
    .insert({
      partner_id: input.partnerId,
      store_id: input.storeId || null,
      customer_id: input.customerId || null,
      order_id: input.orderId || null,
      appointment_id: input.appointmentId || null,
      quote_id: input.quoteId || null,
      delivery_id: input.deliveryId || null,
      provider: connection.provider,
      phone_number: e164,
      template_name: input.templateName || null,
      message_type: input.messageType,
      payload: { ...input.payload, triggerType: input.triggerType },
      status: "pending",
      idempotency_key: input.idempotencyKey,
      scheduled_at: input.scheduledAt?.toISOString() || null,
    })
    .select("id")
    .single()

  if (error) {
    SecureLogger.error("[whatsapp] queue: insert failed", { partnerId: input.partnerId, error: error.message })
    throw new Error(`Supabase insert failed: ${error.message} (code: ${error.code}, details: ${error.details || "none"})`)
  }

  SecureLogger.info("[whatsapp] queue: inserted", { messageId: inserted?.id })
  return { success: true, resultStatus: "queued", reason: null, messageId: inserted?.id || null, providerMessageId: null }
}

export async function processWhatsappMessageById(messageId: string): Promise<WhatsappExecutionResult> {
  const admin = getAdminClient()

  SecureLogger.info("[whatsapp] process: start", { messageId })

  const { data: message, error } = await admin
    .from("whatsapp_messages")
    .select("*")
    .eq("id", messageId)
    .single()

  if (error || !message) {
    SecureLogger.warn("[whatsapp] process: message not found", { messageId, error: error?.message })
    return { success: false, resultStatus: "failed_unknown", reason: "message_not_found", messageId, providerMessageId: null }
  }

  if (!["pending", "queued"].includes(message.status)) {
    SecureLogger.info("[whatsapp] process: wrong status", { messageId, status: message.status })
    return { success: false, resultStatus: "failed_unknown", reason: `unexpected_status_${message.status}`, messageId, providerMessageId: null }
  }

  return sendQueuedMessage(message)
}

export async function sendQueuedMessage(message: Record<string, unknown>): Promise<WhatsappExecutionResult> {
  const admin = getAdminClient()
  const partnerId = String(message.partner_id)
  const messageId = String(message.id)

  SecureLogger.info("[whatsapp] send: starting", { messageId, partnerId })

  // Usa store_id da mensagem (se disponível) para resolver conexão.
  // Se a mensagem tem store_id, resolve com ele (store-level, depois fallback partner).
  // Se não tem (mensagens antigas / sem contexto de loja), fallback global.
  const messageStoreId = message.store_id ? String(message.store_id) : undefined
  const connection = await getActiveWhatsappConnection(
    partnerId,
    messageStoreId,
    message.provider as "meta" | "evolution" | "twilio" | undefined,
  )
  if (!connection?.is_active) {
    SecureLogger.warn("[whatsapp] send: connection inactive", { messageId, partnerId })
    await admin
      .from("whatsapp_messages")
      .update({ status: "failed", error_message: "Integração inativa", failed_at: new Date().toISOString() })
      .eq("id", messageId)
    return { success: false, resultStatus: "failed_provider", reason: "integration_inactive", messageId, providerMessageId: null }
  }

  SecureLogger.info("[whatsapp] send: connection found", { messageId, provider: connection.provider })

  try {
    const provider = createWhatsappProviderFromConnection(connection)
    SecureLogger.info("[whatsapp] send: provider_created", { messageId, providerId: provider.id })

    const payload = (message.payload || {}) as Record<string, unknown>
    const phone = String(message.phone_number)
    let result: { providerMessageId: string }

    if (message.message_type === "text" && payload.body) {
      const body = String(payload.body)
      SecureLogger.info("[whatsapp] send: calling evolution sendText", { messageId, phone, bodyLength: body.length })
      result = await provider.sendText({ to: phone, body })
    } else {
      const templateName = String(message.template_name || payload.templateName || "hello_world")
      const languageCode = String(payload.languageCode || "en_US")
      const interactiveButtons = payload.interactiveButtons as Array<{ id: string; title: string }> | undefined

      SecureLogger.info("[whatsapp] send: calling evolution sendTemplate", { messageId, phone, templateName, languageCode })
      result = await provider.sendTemplate({
        to: phone,
        templateName,
        languageCode,
        components: buildTemplateComponentsFromPayload(payload),
        interactiveButtons,
      })
    }

    SecureLogger.info("[whatsapp] send: evolution_response", {
      messageId,
      providerMessageId: result.providerMessageId,
    })

    await admin
      .from("whatsapp_messages")
      .update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", messageId)

    const entityType = message.appointment_id
      ? "appointment"
      : message.order_id
        ? "order"
        : message.quote_id
          ? "quote"
          : "customer"

    await logAuditEvent({
      partnerId,
      actorUserId: null,
      entityType: entityType as "appointment" | "order" | "quote" | "customer",
      entityId: String(message.appointment_id || message.order_id || message.quote_id || message.customer_id || partnerId),
      actionType: "whatsapp_message_sent",
      changeLines: ["Mensagem WhatsApp enviada"],
      metadata: { messageId, template: message.template_name },
      source: "system",
    })

    SecureLogger.info("[whatsapp] send: completed successfully", { messageId, providerMessageId: result.providerMessageId })
    return { success: true, resultStatus: "sent", reason: null, messageId, providerMessageId: result.providerMessageId }

  } catch (err: unknown) {
    const retryable = isRetryableWhatsappError(err)
    const retryCount = Number(message.retry_count || 0) + 1
    const maxRetries = Number(message.max_retries || 5)
    const errorMessage = err instanceof Error ? err.message : "Erro ao enviar mensagem"

    SecureLogger.error("[whatsapp] send: error", {
      messageId,
      partnerId,
      error: errorMessage,
      retryable,
      retryCount,
    })

    if (retryable && retryCount < maxRetries) {
      await admin
        .from("whatsapp_messages")
        .update({
          status: "pending",
          retry_count: retryCount,
          next_retry_at: calculateNextRetryAt(retryCount),
          error_message: errorMessage,
        })
        .eq("id", messageId)

      SecureLogger.info("[whatsapp] send: will retry", { messageId, retryCount, nextRetryAt: calculateNextRetryAt(retryCount) })
      return { success: false, resultStatus: "failed_send", reason: errorMessage, messageId, providerMessageId: null }
    } else {
      await admin
        .from("whatsapp_messages")
        .update({
          status: "failed",
          retry_count: retryCount,
          error_message: errorMessage,
          failed_at: new Date().toISOString(),
        })
        .eq("id", messageId)

      SecureLogger.error("[whatsapp] send: failed permanently", { messageId, error: errorMessage })
      return { success: false, resultStatus: "failed_send", reason: errorMessage, messageId, providerMessageId: null }
    }
  }
}

export async function processPendingWhatsappMessages(limit = 10): Promise<{ processed: number }> {
  const admin = getAdminClient()
  const { data: claimed, error } = await admin.rpc("claim_whatsapp_messages", { p_limit: limit })
  if (error) {
    console.error("[whatsapp] claim error", error.message)
    return { processed: 0 }
  }

  const messages = (claimed || []) as Record<string, unknown>[]
  for (const msg of messages) {
    await sendQueuedMessage(msg)
  }
  return { processed: messages.length }
}
