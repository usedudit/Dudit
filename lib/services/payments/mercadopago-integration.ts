import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const MERCADOPAGO_PROVIDER = "mercadopago"

export type { PartnerIntegrationRow }

export async function findMercadoPagoIntegration(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<PartnerIntegrationRow | null> {
  const { data } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", MERCADOPAGO_PROVIDER)
    .maybeSingle()
  return (data as PartnerIntegrationRow) || null
}

export function isMercadoPagoConnected(integration: PartnerIntegrationRow | null): boolean {
  return integration?.status === "connected" && !!integration?.account_id
}

export function getMpTokenExpiresAt(
  integration: PartnerIntegrationRow | null,
): Date | null {
  const raw = integration?.metadata?.token_expires_at
  if (!raw || typeof raw !== "string") return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getMpRefreshTokenEncrypted(
  integration: PartnerIntegrationRow | null,
): string | null {
  const value = integration?.credentials?.refresh_token_encrypted
  return typeof value === "string" && value ? value : null
}
