import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "./timeline.service"
import { createWhatsappProviderFromConnection } from "@/lib/whatsapp/providers"
import { getActiveWhatsappConnection } from "./whatsapp-connection.service"
import { normalizePhoneToE164 } from "@/lib/whatsapp/phone"
import { isRetryableWhatsappError } from "@/lib/whatsapp/errors"
import type { QueueMessageInput, WhatsappAutomationTrigger, WhatsappTemplateComponent } from "@/lib/whatsapp/types"

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

export async function logWhatsappAutomation(params: {
  partnerId: string
  triggerType: WhatsappAutomationTrigger
  entityType: string
  entityId?: string | null
  executionStatus: "success" | "skipped" | "failed"
  payload?: Record<string, unknown>
  response?: Record<string, unknown>
}) {
  const admin = getAdminClient()
  await admin.from("whatsapp_automation_logs").insert({
    partner_id: params.partnerId,
    trigger_type: params.triggerType,
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    execution_status: params.executionStatus,
    payload: params.payload || {},
    response: params.response || {},
  })
}

export async function queueWhatsappMessage(input: QueueMessageInput): Promise<{ messageId: string | null; skipped: boolean }> {
  const admin = getAdminClient()
  const e164 = normalizePhoneToE164(input.phoneNumber)
  if (!e164) {
    await logWhatsappAutomation({
      partnerId: input.partnerId,
      triggerType: input.triggerType,
      entityType: input.appointmentId ? "appointment" : input.orderId ? "order" : "customer",
      entityId: input.appointmentId || input.orderId || input.customerId,
      executionStatus: "skipped",
      payload: input.payload,
      response: { reason: "invalid_phone" },
    })
    return { messageId: null, skipped: true }
  }

  const connection = await getActiveWhatsappConnection(input.partnerId)
  if (!connection?.is_active) {
    await logWhatsappAutomation({
      partnerId: input.partnerId,
      triggerType: input.triggerType,
      entityType: input.appointmentId ? "appointment" : "general",
      entityId: input.appointmentId || input.orderId,
      executionStatus: "skipped",
      response: { reason: "integration_inactive" },
    })
    return { messageId: null, skipped: true }
  }

  if (input.idempotencyKey) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id, status")
      .eq("partner_id", input.partnerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle()
    if (existing?.id) {
      return { messageId: existing.id, skipped: true }
    }
  }

  const { data: inserted, error } = await admin
    .from("whatsapp_messages")
    .insert({
      partner_id: input.partnerId,
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

  if (error) throw new Error(`Supabase insert failed: ${error.message} (code: ${error.code}, details: ${error.details || "none"})`)
  return { messageId: inserted?.id || null, skipped: false }
}

export async function processWhatsappMessageById(messageId: string): Promise<void> {
  const admin = getAdminClient()
  const { data: message, error } = await admin
    .from("whatsapp_messages")
    .select("*")
    .eq("id", messageId)
    .single()

  if (error || !message) return
  if (!["pending", "queued"].includes(message.status)) return

  await sendQueuedMessage(message)
}

export async function sendQueuedMessage(message: Record<string, unknown>): Promise<void> {
  const admin = getAdminClient()
  const partnerId = String(message.partner_id)
  const messageId = String(message.id)

  const connection = await getActiveWhatsappConnection(partnerId, message.provider as "meta" | "evolution" | "twilio" | undefined)
  if (!connection?.is_active) {
    await admin
      .from("whatsapp_messages")
      .update({ status: "failed", error_message: "Integração inativa", failed_at: new Date().toISOString() })
      .eq("id", messageId)
    return
  }

  try {
    const provider = createWhatsappProviderFromConnection(connection)
    const payload = (message.payload || {}) as Record<string, unknown>
    const phone = String(message.phone_number)
    let result

    if (message.message_type === "text" && payload.body) {
      result = await provider.sendText({ to: phone, body: String(payload.body) })
    } else {
      const interactiveButtons = payload.interactiveButtons as Array<{ id: string; title: string }> | undefined
      result = await provider.sendTemplate({
        to: phone,
        templateName: String(message.template_name || payload.templateName || "hello_world"),
        languageCode: String(payload.languageCode || "en_US"),
        components: buildTemplateComponentsFromPayload(payload),
        interactiveButtons,
      })
    }

    await admin
      .from("whatsapp_messages")
      .update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", messageId)

    const triggerType = String(payload.triggerType || "manual_resend")
    const entityType = message.appointment_id
      ? "appointment"
      : message.order_id
        ? "order"
        : message.quote_id
          ? "quote"
          : "customer"

    await logWhatsappAutomation({
      partnerId,
      triggerType: triggerType as never,
      entityType,
      entityId: String(message.appointment_id || message.order_id || message.quote_id || message.customer_id || ""),
      executionStatus: "success",
      response: { providerMessageId: result.providerMessageId },
    })

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
  } catch (err: unknown) {
    const retryable = isRetryableWhatsappError(err)
    const retryCount = Number(message.retry_count || 0) + 1
    const maxRetries = Number(message.max_retries || 5)
    const errorMessage = err instanceof Error ? err.message : "Erro ao enviar mensagem"

    console.error("[whatsapp] sendQueuedMessage failed", {
      messageId,
      partnerId,
      phone: String(message.phone_number),
      template: message.template_name,
      error: errorMessage,
      retryable,
      retryCount,
      rawError: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
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

      await logWhatsappAutomation({
        partnerId,
        triggerType: String((message.payload as Record<string, unknown>)?.triggerType || "manual_resend") as never,
        entityType: "message",
        entityId: messageId,
        executionStatus: "failed",
        response: { error: errorMessage, retryable },
      })
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
