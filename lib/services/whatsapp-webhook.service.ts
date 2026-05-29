import "server-only"

import { createHmac, timingSafeEqual } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "./timeline.service"
import { getActiveWhatsappConnection } from "./whatsapp-connection.service"

/**
 * Normalizes Quick Reply button text for matching.
 * Meta Quick Reply buttons ("Resposta pré-configurada") return the button text
 * selected by the user rather than custom payload IDs. This helper strips
 * whitespace, lowercases, and removes diacritics so that "Confirmar",
 * "confirmar", "CONFIRMAR" all map to "confirmar".
 */
function normalizeQuickReplyText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip emojis and special characters
    .trim()
}

/**
 * Resolves the user's intended action from a webhook button interaction.
 *
 * Priority:
 *  1. Legacy payload ID (e.g. "confirm_appointment") — backward compatibility.
 *  2. Normalized button text (e.g. "Confirmar" → "confirmar") — primary path
 *     for Meta Quick Reply templates.
 */
function resolveAppointmentAction(
  buttonId: string,
  buttonTitle: string,
): "confirm" | "cancel" | "talk" | null {
  // 1. Legacy payload-based detection
  if (buttonId === "confirm_appointment") return "confirm"
  if (buttonId === "cancel_appointment") return "cancel"
  if (buttonId === "talk_to_business") return "talk"

  // 2. Normalized text matching (Meta Quick Reply buttons)
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

export async function handleWhatsappWebhookPayload(body: Record<string, unknown>) {
  const entry = (body.entry as unknown[])?.[0] as Record<string, unknown> | undefined
  const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined
  const value = (changes?.value as Record<string, unknown>) || {}
  const metadata = (value.metadata as Record<string, unknown>) || {}
  const phoneNumberId = String(metadata.phone_number_id || "")

  if (!phoneNumberId) return

  const admin = getAdminClient()
  const { data: connection } = await admin
    .from("partner_whatsapp_connections")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle()

  if (!connection) return

  const partnerId = connection.partner_id

  const statuses = (value.statuses as unknown[]) || []
  for (const st of statuses) {
    const s = st as Record<string, unknown>
    const providerMessageId = String(s.id || "")
    const status = String(s.status || "")
    if (!providerMessageId) continue

    const updates: Record<string, string> = {}
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
    }

    if (Object.keys(updates).length) {
      await admin
        .from("whatsapp_messages")
        .update(updates)
        .eq("partner_id", partnerId)
        .eq("provider_message_id", providerMessageId)
    }
  }

  // Process interactive messages (Quick Reply button responses).
  // Meta Quick Reply buttons may return the button text (title) instead of a
  // custom payload ID. We support both: payload ID for backward compatibility
  // and normalized text matching as the primary detection method.
  const messages = (value.messages as unknown[]) || []
  for (const msg of messages) {
    const m = msg as Record<string, unknown>
    if (m.type !== "interactive") continue
    const interactive = m.interactive as Record<string, unknown>
    const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined
    const buttonId = String(buttonReply?.id || "")
    const buttonTitle = String(buttonReply?.title || "")
    const fromPhone = String(m.from || "")

    // Skip if neither payload ID nor button text is available
    if (!buttonId && !buttonTitle) continue

    const contextMessageId = String((m.context as Record<string, unknown>)?.id || "")
    let appointmentId: string | null = null

    if (contextMessageId) {
      const { data: waMsg } = await admin
        .from("whatsapp_messages")
        .select("appointment_id")
        .eq("partner_id", partnerId)
        .eq("provider_message_id", contextMessageId)
        .maybeSingle()
      appointmentId = waMsg?.appointment_id || null
    }

    if (!appointmentId) {
      const { data: recent } = await admin
        .from("whatsapp_messages")
        .select("appointment_id")
        .eq("partner_id", partnerId)
        .eq("phone_number", fromPhone)
        .not("appointment_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      appointmentId = recent?.appointment_id || null
    }

    if (!appointmentId) continue

    // Resolve action from payload ID or button text (Meta Quick Reply)
    const action = resolveAppointmentAction(buttonId, buttonTitle)

    if (action === "confirm") {
      await admin
        .from("appointments")
        .update({ status: "Confirmado", updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("partner_id", partnerId)

      await logAuditEvent({
        partnerId,
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
        .eq("partner_id", partnerId)

      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "appointment",
        entityId: appointmentId,
        actionType: "whatsapp_appointment_cancelled",
        changeLines: ["Cliente cancelou agendamento via WhatsApp"],
        source: "webhook",
      })
    }
    // "talk" / talk_to_business: no status change — customer opens normal WhatsApp chat
  }
}

export async function resolveConnectionForVerify(phoneNumberId: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from("partner_whatsapp_connections")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle()
  return data || (await getActiveWhatsappConnection("", "meta"))
}
