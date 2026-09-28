export type PartnerIntegrationStatus = "disconnected" | "pending" | "connected" | "error"

export interface PartnerIntegrationRow {
  id: string
  partner_id: string
  provider_slug: string
  status: PartnerIntegrationStatus
  account_id: string | null
  account_email: string | null
  access_token_encrypted: string | null
  webhook_secret_encrypted: string | null
  webhook_id: string | null
  config: Record<string, any>
  credentials: Record<string, any>
  metadata: Record<string, any>
  connected_at: string | null
  disconnected_at?: string | null
}
