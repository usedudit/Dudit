import type { SupabaseClient } from "@supabase/supabase-js"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const MERCADOPAGO_PROVIDER = "mercadopago"

export type { PartnerIntegrationRow }

// Projection of partner_integrations used by embeds: keep selects narrow so
// credential columns never leave the database.
export type MercadoPagoIntegrationSummary = Pick<
  PartnerIntegrationRow,
  "provider_slug" | "status" | "account_id" | "connected_at" | "config" | "metadata"
>

// Shape of the legacy partners.mp_* status columns, kept stable so DTOs,
// props and components do not have to change while reads move over.
export interface MpPartnerFields {
  mp_user_id: string | null
  mp_public_key: string | null
  mp_connected_at: string | null
  mp_live_mode: boolean | null
  mp_token_expires_at: string | null
  mp_accepted_payment_methods: Record<string, boolean> | null
}

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

export function isMercadoPagoConnected(
  integration: Pick<PartnerIntegrationRow, "status" | "account_id"> | null | undefined,
): boolean {
  return integration?.status === "connected" && !!integration?.account_id
}

export function pickMercadoPagoIntegration(
  rows: MercadoPagoIntegrationSummary | MercadoPagoIntegrationSummary[] | null | undefined,
): MercadoPagoIntegrationSummary | null {
  if (!rows) return null
  const row = Array.isArray(rows)
    ? rows.find((candidate) => candidate?.provider_slug === MERCADOPAGO_PROVIDER) ?? null
    : rows
  return row && row.provider_slug === MERCADOPAGO_PROVIDER ? row : null
}

export function mapToMpPartnerFields(
  rows: MercadoPagoIntegrationSummary | MercadoPagoIntegrationSummary[] | null | undefined,
): MpPartnerFields {
  const integration = pickMercadoPagoIntegration(rows)
  const config = integration?.config || {}
  const connected = isMercadoPagoConnected(integration)
  const methods = config.accepted_payment_methods
  const expiresAt = connected ? integration?.metadata?.token_expires_at : null

  return {
    // Connection-scoped fields stay null while the integration is not
    // connected, mirroring what disconnect does to the legacy columns.
    mp_user_id: connected ? integration?.account_id ?? null : null,
    mp_public_key:
      connected && typeof config.public_key === "string" && config.public_key ? config.public_key : null,
    mp_connected_at: connected ? integration?.connected_at ?? null : null,
    mp_live_mode: connected && typeof config.live_mode === "boolean" ? config.live_mode : null,
    mp_token_expires_at: typeof expiresAt === "string" && expiresAt ? expiresAt : null,
    // Kept across disconnects: the seller's method choices are preferences,
    // not connection state (the legacy column behaved the same way).
    mp_accepted_payment_methods:
      methods && typeof methods === "object" ? (methods as Record<string, boolean>) : null,
  }
}

// Spreads the legacy mp_* status fields over a partner row selected with
// `partner_integrations(...)`. The embed itself is dropped from the result:
// only the legacy-shaped fields travel on to DTOs and client props.
export function withMpPartnerFields<T>(partner: T | T[] | null | undefined): any {
  if (!partner) return partner
  if (Array.isArray(partner)) return partner.map((row) => withMpPartnerFields(row))

  const row = partner as Record<string, any>
  const { partner_integrations, ...rest } = row
  return { ...rest, ...mapToMpPartnerFields(partner_integrations) }
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
