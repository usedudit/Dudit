import "server-only"
import crypto from "crypto"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { SecureLogger } from "@/lib/secure-logger"

export interface StoredComplianceIntegrationSnapshot {
  provider_slug: string
  account_id: string | null
  account_email_masked: string | null
  account_email_hash: string | null
  account_email_encrypted: string | null
  account_label: string | null
  connected_at: string | null
  disconnected_at: string | null
  status_at_deletion: "connected" | "disconnected"
}

export interface StoredComplianceStoreSnapshot {
  store_id: string
  name: string | null
  document_type: "cnpj" | "cpf" | null
  document_masked: string | null
  document_hash: string | null
  document_encrypted: string | null
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const cleaned = email?.trim().toLowerCase()
  return cleaned && cleaned.includes("@") ? cleaned : null
}

export function hashNormalizedValue(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

export function maskEmailAddress(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const [local, domain] = normalized.split("@")
  if (!local || !domain) return null
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

export function maskTaxDocument(rawDoc: string | null | undefined): {
  type: "cnpj" | "cpf" | null
  digits: string | null
  masked: string | null
} {
  if (!rawDoc) return { type: null, digits: null, masked: null }
  const digits = rawDoc.replace(/\D/g, "")
  if (digits.length === 14) {
    return {
      type: "cnpj",
      digits,
      masked: `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`,
    }
  }
  if (digits.length === 11) {
    return {
      type: "cpf",
      digits,
      masked: `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`,
    }
  }
  return { type: null, digits: digits || null, masked: null }
}

export function safeEncryptCompliancePii(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    return encrypt(trimmed, "compliance")
  } catch (err: any) {
    SecureLogger.warn("Compliance PII encryption skipped (key unavailable)", {
      error: err?.message,
    })
    return null
  }
}

export function safeDecryptCompliancePii(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return decrypt(value, "compliance")
  } catch (err: any) {
    SecureLogger.warn("Compliance PII decryption failed", {
      error: err?.message,
    })
    return null
  }
}

/**
 * Records an integration connection in the immutable partner_integration_history table.
 * Never throws so it cannot block OAuth / API-key connect flows.
 */
export async function recordIntegrationConnected(
  admin: any,
  params: {
    partnerId: string
    providerSlug: string
    externalAccountId?: string | null
    externalAccountEmail?: string | null
    externalAccountLabel?: string | null
    connectedAt?: string | null
  }
): Promise<void> {
  try {
    const nowIso = params.connectedAt || new Date().toISOString()
    const accountId = params.externalAccountId ? String(params.externalAccountId).trim() : null
    const normalizedEmail = normalizeEmail(params.externalAccountEmail)
    const emailHash = normalizedEmail ? hashNormalizedValue(normalizedEmail) : null
    const emailMasked = maskEmailAddress(normalizedEmail)
    const emailEncrypted = normalizedEmail ? safeEncryptCompliancePii(normalizedEmail) : null
    const label = params.externalAccountLabel?.trim() || null

    // Close any currently open history record for this partner+provider if switching accounts
    const { data: openRows } = await admin
      .from("partner_integration_history")
      .select("id, external_account_id, external_account_email_hash")
      .eq("partner_id", params.partnerId)
      .eq("provider_slug", params.providerSlug)
      .is("disconnected_at", null)

    const existingSame = (openRows || []).find(
      (r: any) =>
        (r.external_account_id || null) === accountId &&
        (r.external_account_email_hash || null) === emailHash
    )

    if (existingSame) {
      await admin
        .from("partner_integration_history")
        .update({
          external_account_email_encrypted: emailEncrypted ?? undefined,
          external_account_email_masked: emailMasked ?? undefined,
          external_account_label: label ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSame.id)
      return
    }

    if (openRows && openRows.length > 0) {
      await admin
        .from("partner_integration_history")
        .update({
          disconnected_at: nowIso,
          updated_at: new Date().toISOString(),
        })
        .eq("partner_id", params.partnerId)
        .eq("provider_slug", params.providerSlug)
        .is("disconnected_at", null)
    }

    await admin.from("partner_integration_history").insert({
      partner_id: params.partnerId,
      provider_slug: params.providerSlug,
      external_account_id: accountId,
      external_account_email_hash: emailHash,
      external_account_email_encrypted: emailEncrypted,
      external_account_email_masked: emailMasked,
      external_account_label: label,
      connected_at: nowIso,
      disconnected_at: null,
    })
  } catch (err: any) {
    SecureLogger.warn("Failed to record partner integration connection history (non-blocking)", {
      partnerId: params.partnerId,
      providerSlug: params.providerSlug,
      error: err?.message,
    })
  }
}

/**
 * Marks open integration history rows as disconnected.
 * If no open history row existed (legacy connection made before this table existed),
 * inserts a backfilled closed row from the fallback fields so the external ID is not lost.
 * Never throws so it cannot block disconnect flows.
 */
export async function recordIntegrationDisconnected(
  admin: any,
  params: {
    partnerId: string
    providerSlug: string
    disconnectedAt?: string | null
    fallbackAccountId?: string | null
    fallbackAccountEmail?: string | null
    fallbackAccountLabel?: string | null
    fallbackConnectedAt?: string | null
  }
): Promise<void> {
  try {
    const nowIso = params.disconnectedAt || new Date().toISOString()

    const { data: closedRows } = await admin
      .from("partner_integration_history")
      .update({
        disconnected_at: nowIso,
        updated_at: nowIso,
      })
      .eq("partner_id", params.partnerId)
      .eq("provider_slug", params.providerSlug)
      .is("disconnected_at", null)
      .select("id")

    if (!closedRows || closedRows.length === 0) {
      const accountId = params.fallbackAccountId ? String(params.fallbackAccountId).trim() : null
      const normalizedEmail = normalizeEmail(params.fallbackAccountEmail)
      if (accountId || normalizedEmail) {
        await admin.from("partner_integration_history").insert({
          partner_id: params.partnerId,
          provider_slug: params.providerSlug,
          external_account_id: accountId,
          external_account_email_hash: normalizedEmail ? hashNormalizedValue(normalizedEmail) : null,
          external_account_email_encrypted: normalizedEmail ? safeEncryptCompliancePii(normalizedEmail) : null,
          external_account_email_masked: maskEmailAddress(normalizedEmail),
          external_account_label: params.fallbackAccountLabel?.trim() || null,
          connected_at: params.fallbackConnectedAt || nowIso,
          disconnected_at: nowIso,
        })
      }
    }
  } catch (err: any) {
    SecureLogger.warn("Failed to record partner integration disconnect history (non-blocking)", {
      partnerId: params.partnerId,
      providerSlug: params.providerSlug,
      error: err?.message,
    })
  }
}

/**
 * Collects all current and historical external integrations linked to a partner
 * for retention in compliance_logs during account deletion.
 * Never includes OAuth tokens, API keys, or webhook secrets.
 */
export async function collectComplianceIntegrationSnapshot(
  admin: any,
  partnerId: string
): Promise<{
  snapshot: StoredComplianceIntegrationSnapshot[]
  accountIds: string[]
  emailHashes: string[]
}> {
  const snapshot: StoredComplianceIntegrationSnapshot[] = []
  const seenKeys = new Set<string>()
  const accountIdSet = new Set<string>()
  const emailHashSet = new Set<string>()

  try {
    const [historyRes, currentRes] = await Promise.all([
      admin
        .from("partner_integration_history")
        .select(
          "provider_slug, external_account_id, external_account_email_masked, external_account_email_hash, external_account_email_encrypted, external_account_label, connected_at, disconnected_at"
        )
        .eq("partner_id", partnerId)
        .order("connected_at", { ascending: false }),
      admin
        .from("partner_integrations")
        .select("provider_slug, status, account_id, account_email, connected_at, disconnected_at")
        .eq("partner_id", partnerId),
    ])

    const addEntry = (entry: StoredComplianceIntegrationSnapshot) => {
      const dedupeKey = `${entry.provider_slug}::${entry.account_id || ""}::${entry.account_email_hash || ""}`
      if (seenKeys.has(dedupeKey)) return
      seenKeys.add(dedupeKey)
      snapshot.push(entry)
      if (entry.account_id) accountIdSet.add(entry.account_id)
      if (entry.account_email_hash) emailHashSet.add(entry.account_email_hash)
    }

    // Current active/disconnected integrations first
    for (const row of currentRes?.data || []) {
      const accountId = row.account_id ? String(row.account_id).trim() : null
      const normalizedEmail = normalizeEmail(row.account_email)
      if (!accountId && !normalizedEmail) continue
      addEntry({
        provider_slug: String(row.provider_slug),
        account_id: accountId,
        account_email_masked: maskEmailAddress(normalizedEmail),
        account_email_hash: normalizedEmail ? hashNormalizedValue(normalizedEmail) : null,
        account_email_encrypted: normalizedEmail ? safeEncryptCompliancePii(normalizedEmail) : null,
        account_label: null,
        connected_at: row.connected_at || null,
        disconnected_at: row.disconnected_at || null,
        status_at_deletion: row.status === "connected" ? "connected" : "disconnected",
      })
    }

    // Historical integrations (including accounts disconnected prior to deletion)
    for (const h of historyRes?.data || []) {
      const accountId = h.external_account_id ? String(h.external_account_id).trim() : null
      if (!accountId && !h.external_account_email_hash) continue
      addEntry({
        provider_slug: String(h.provider_slug),
        account_id: accountId,
        account_email_masked: h.external_account_email_masked || null,
        account_email_hash: h.external_account_email_hash || null,
        account_email_encrypted: h.external_account_email_encrypted || null,
        account_label: h.external_account_label || null,
        connected_at: h.connected_at || null,
        disconnected_at: h.disconnected_at || null,
        status_at_deletion: h.disconnected_at ? "disconnected" : "connected",
      })
    }
  } catch (err: any) {
    SecureLogger.warn("Failed to collect compliance integration snapshot (continuing deletion)", {
      partnerId,
      error: err?.message,
    })
  }

  return {
    snapshot,
    accountIds: Array.from(accountIdSet),
    emailHashes: Array.from(emailHashSet),
  }
}
