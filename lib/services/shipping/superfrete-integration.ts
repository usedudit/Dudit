import type { SupabaseClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/cryptoService"
import {
  createSuperFreteClient,
  type SuperFreteClient,
  type SuperFreteEnvironment,
} from "@/lib/services/shipping/superfrete"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const SUPERFRETE_PROVIDER = "superfrete"

export type { PartnerIntegrationRow }

export function resolveSuperFreteEnvironment(
  explicit: unknown,
  fallback?: unknown,
): SuperFreteEnvironment {
  if (explicit === "sandbox" || explicit === "production") return explicit
  if (fallback === "sandbox" || fallback === "production") return fallback
  return process.env.NODE_ENV === "production" ? "production" : "sandbox"
}

export async function findSuperFreteIntegration(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<PartnerIntegrationRow | null> {
  const { data } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", SUPERFRETE_PROVIDER)
    .maybeSingle()
  return (data as PartnerIntegrationRow) || null
}

export function buildSuperFreteClient(
  integration: PartnerIntegrationRow | null,
): SuperFreteClient | null {
  if (!integration?.access_token_encrypted) return null
  const token = decrypt(integration.access_token_encrypted, SUPERFRETE_PROVIDER)
  const environment = resolveSuperFreteEnvironment((integration.config as Record<string, any>)?.environment)
  return createSuperFreteClient(token, integration.account_email || undefined, environment)
}

export function buildSuperFreteVolumes(config: Record<string, any>): {
  height: number
  width: number
  length: number
  weight: number
} {
  return {
    height: Number(config.height ?? 10),
    width: Number(config.width ?? 10),
    length: Number(config.length ?? 10),
    weight: Number(config.weight ?? 0.5),
  }
}
