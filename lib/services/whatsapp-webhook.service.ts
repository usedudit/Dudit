import "server-only"

import { createHmac, timingSafeEqual } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "./timeline.service"
import { getActiveWhatsappConnection } from "./whatsapp-connection.service"

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

  const messages = (value.messages as unknown[]) || []
  for (const msg of messages) {
    const m = msg as Record<string, unknown>
    if (m.type !== "interactive") continue
    const interactive = m.interactive as Record<string, unknown>
    const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined
    const buttonId = String(buttonReply?.id || "")
    const fromPhone = String(m.from || "")

    if (!buttonId) continue

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

    if (buttonId === "confirm_appointment") {
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
    } else if (buttonId === "cancel_appointment") {
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
    // talk_to_business: no status change — customer opens normal WhatsApp chat
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
