import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { encrypt } from "@/lib/cryptoService"
import { MetaWhatsappManagementClient } from "@/lib/whatsapp/providers/meta-management-client"
import type { PartnerWhatsappConnection, WhatsappConnectionSource, WhatsappProviderId } from "@/lib/whatsapp/types"
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

export async function findActiveConnectionByPhoneNumberId(
  phoneNumberId: string,
  excludePartnerId?: string,
): Promise<{ partner_id: string } | null> {
  const admin = getAdminClient()
  let query = admin
    .from("partner_whatsapp_connections")
    .select("partner_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)

  if (excludePartnerId) {
    query = query.neq("partner_id", excludePartnerId)
  }

  const { data } = await query.maybeSingle()
  return data
}

export async function upsertWhatsappConnection(params: {
  partnerId: string
  provider: WhatsappProviderId
  phoneNumber?: string
  phoneNumberId: string
  businessAccountId?: string
  accessToken: string
  activate?: boolean
  connectionSource?: WhatsappConnectionSource
  wabaName?: string
  lastSyncedAt?: string
}): Promise<PartnerWhatsappConnection> {
  const admin = getAdminClient()
  const verifyToken = randomBytes(16).toString("hex")
  const webhookSecret = randomBytes(24).toString("hex")
  const now = new Date().toISOString()

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
    connection_source: params.connectionSource || "manual",
    waba_name: params.wabaName || null,
    last_synced_at: params.lastSyncedAt || now,
    status: "connected" as const,
    is_active: params.activate !== false,
    connected_at: now,
    updated_at: now,
  }

  if (existing?.id) {
    const { data, error } = await admin
      .from("partner_whatsapp_connections")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single()
    if (error) throw new Error(`Supabase update failed: ${error.message} (code: ${error.code}, details: ${error.details || "none"})`)
    return data as PartnerWhatsappConnection
  }

  const { data, error } = await admin
    .from("partner_whatsapp_connections")
    .insert(row)
    .select("*")
    .single()
  if (error) throw new Error(`Supabase insert failed: ${error.message} (code: ${error.code}, details: ${error.details || "none"})`)
  return data as PartnerWhatsappConnection
}

export async function syncWhatsappTemplates(params: {
  partnerId: string
  accessToken: string
  wabaId: string
}): Promise<{ synced: number }> {
  const admin = getAdminClient()
  const management = new MetaWhatsappManagementClient(params.accessToken)
  const response = await management.getMessageTemplates(params.wabaId)
  const templates = response.data || []

  let synced = 0
  for (const raw of templates) {
    const templateName = String(raw.name || "")
    const language = String(raw.language || "pt_BR")
    if (!templateName) continue

    const status = String(raw.status || "")
    const category = String(raw.category || "utility")
    const components = raw.components

    const { error } = await admin.from("whatsapp_templates").upsert(
      {
        partner_id: params.partnerId,
        provider: "meta",
        template_name: templateName,
        language,
        category,
        content: templateName,
        variables: {
          meta_status: status,
          meta_id: raw.id ?? null,
          components: components ?? null,
        },
        is_active: status === "APPROVED",
      },
      { onConflict: "partner_id,provider,template_name,language" },
    )

    if (!error) synced++
  }

  const now = new Date().toISOString()
  await admin
    .from("partner_whatsapp_connections")
    .update({ last_synced_at: now, updated_at: now })
    .eq("partner_id", params.partnerId)
    .eq("provider", "meta")

  return { synced }
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
