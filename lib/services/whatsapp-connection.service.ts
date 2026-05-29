import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { encrypt } from "@/lib/cryptoService"
import type { PartnerWhatsappConnection, WhatsappProviderId } from "@/lib/whatsapp/types"
import { randomBytes } from "crypto"

export async function getActiveWhatsappConnection(
  partnerId: string,
  provider: WhatsappProviderId = "meta",
): Promise<PartnerWhatsappConnection | null> {
  const admin = getAdminClient()
  const { data } = await admin
    .from("partner_whatsapp_connections")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle()

  return (data as PartnerWhatsappConnection) || null
}

export async function upsertWhatsappConnection(params: {
  partnerId: string
  provider: WhatsappProviderId
  phoneNumber?: string
  phoneNumberId: string
  businessAccountId?: string
  accessToken: string
  activate?: boolean
}): Promise<PartnerWhatsappConnection> {
  const admin = getAdminClient()
  const verifyToken = randomBytes(16).toString("hex")
  const webhookSecret = randomBytes(24).toString("hex")

  const { data: existing } = await admin
    .from("partner_whatsapp_connections")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("provider", params.provider)
    .maybeSingle()

  const row = {
    partner_id: params.partnerId,
    provider: params.provider,
    phone_number: params.phoneNumber || null,
    phone_number_id: params.phoneNumberId,
    business_account_id: params.businessAccountId || null,
    access_token_encrypted: encrypt(params.accessToken, "whatsapp"),
    webhook_verify_token: verifyToken,
    webhook_secret: webhookSecret,
    status: "connected" as const,
    is_active: params.activate !== false,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await admin
      .from("partner_whatsapp_connections")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single()
    if (error) throw error
    return data as PartnerWhatsappConnection
  }

  const { data, error } = await admin
    .from("partner_whatsapp_connections")
    .insert(row)
    .select("*")
    .single()
  if (error) throw error
  return data as PartnerWhatsappConnection
}

export async function deactivateWhatsappConnection(partnerId: string, provider: WhatsappProviderId = "meta") {
  const admin = getAdminClient()
  await admin
    .from("partner_whatsapp_connections")
    .update({
      is_active: false,
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("partner_id", partnerId)
    .eq("provider", provider)
}

export async function setWhatsappConnectionActive(partnerId: string, isActive: boolean, provider: WhatsappProviderId = "meta") {
  const admin = getAdminClient()
  await admin
    .from("partner_whatsapp_connections")
    .update({
      is_active: isActive,
      status: isActive ? "connected" : "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("partner_id", partnerId)
    .eq("provider", provider)
}

export function getWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!base) return "/api/whatsapp/webhook"
  const origin = base.startsWith("http") ? base : `https://${base}`
  return `${origin}/api/whatsapp/webhook`
}
