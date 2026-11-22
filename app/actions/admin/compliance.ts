"use server"

/**
 * Admin Compliance & Anti-Fraud (KYC) actions for deleted accounts.
 *
 * SECURITY:
 * - Strictly restricted to `super_admin`.
 * - Listing NEVER returns encrypted or plaintext PII — only masked fields and
 *   external integration account IDs.
 * - Revealing sensitive fields (email, full name, integration email, store CPF/CNPJ)
 *   requires a single-use step-up re-authentication token, a mandatory reason,
 *   and is immutably logged to `admin_audit_logs`.
 */

import { requireSuperAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireStepUp } from "@/lib/admin/step-up-auth"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import {
  hashNormalizedValue,
  safeDecryptCompliancePii,
  type StoredComplianceIntegrationSnapshot,
  type StoredComplianceStoreSnapshot,
} from "@/lib/services/compliance/integration-history"

export interface SafeComplianceIntegration {
  provider_slug: string
  account_id: string | null
  account_email_masked: string | null
  account_label: string | null
  connected_at: string | null
  disconnected_at: string | null
  status_at_deletion: "connected" | "disconnected"
  has_encrypted_email: boolean
}

export interface SafeComplianceStore {
  store_id: string
  name: string | null
  document_type: "cnpj" | "cpf" | null
  document_masked: string | null
  has_encrypted_document: boolean
}

export interface ComplianceDeletionEntry {
  id: string
  user_id_hash: string | null
  partner_id: string | null
  email_hash: string
  email_masked: string | null
  has_encrypted_email: boolean
  has_encrypted_name: boolean
  mp_subscription_id: string | null
  request_ip: string | null
  request_country: string | null
  user_agent: string | null
  deletion_reason: string | null
  requested_at: string
  deleted_at: string
  status: string
  integrations: SafeComplianceIntegration[]
  stores: SafeComplianceStore[]
  certificate: Record<string, unknown> | null
}

export interface ComplianceRevealedPii {
  email: string | null
  full_name: string | null
  integrations: Array<{
    provider_slug: string
    account_id: string | null
    account_email: string | null
  }>
  stores: Array<{
    store_id: string
    name: string | null
    document_type: "cnpj" | "cpf" | null
    document: string | null
  }>
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (c) => `\\${c}`)
}

function toSafeEntry(row: any): ComplianceDeletionEntry {
  const rawIntegrations = Array.isArray(row.integrations_snapshot)
    ? (row.integrations_snapshot as StoredComplianceIntegrationSnapshot[])
    : []
  const rawStores = Array.isArray(row.partner_stores_snapshot)
    ? (row.partner_stores_snapshot as StoredComplianceStoreSnapshot[])
    : []

  return {
    id: String(row.id),
    user_id_hash: row.user_id_hash ?? null,
    partner_id: row.partner_id ?? null,
    email_hash: String(row.email_hash || ""),
    email_masked: row.email_masked ?? null,
    has_encrypted_email: Boolean(row.email_encrypted),
    has_encrypted_name: Boolean(row.user_full_name_encrypted),
    mp_subscription_id: row.mp_subscription_id ?? null,
    request_ip: row.request_ip ?? null,
    request_country: row.request_country ?? null,
    user_agent: row.user_agent ?? null,
    deletion_reason: row.deletion_reason ?? null,
    requested_at: row.requested_at,
    deleted_at: row.deleted_at,
    status: row.status || "completed",
    integrations: rawIntegrations.map((i) => ({
      provider_slug: i.provider_slug,
      account_id: i.account_id ?? null,
      account_email_masked: i.account_email_masked ?? null,
      account_label: i.account_label ?? null,
      connected_at: i.connected_at ?? null,
      disconnected_at: i.disconnected_at ?? null,
      status_at_deletion: i.status_at_deletion === "connected" ? "connected" : "disconnected",
      has_encrypted_email: Boolean(i.account_email_encrypted),
    })),
    stores: rawStores.map((s) => ({
      store_id: s.store_id,
      name: s.name ?? null,
      document_type: s.document_type ?? null,
      document_masked: s.document_masked ?? null,
      has_encrypted_document: Boolean(s.document_encrypted),
    })),
    certificate: (row.certificate as Record<string, unknown> | null) ?? null,
  }
}

export async function getComplianceDeletionLogs(params?: {
  search?: string
  provider?: string
  page?: number
  limit?: number
}): Promise<{
  data: ComplianceDeletionEntry[]
  total: number
  page: number
  limit: number
}> {
  await requireSuperAdmin()
  await requireRateLimit(RateLimitCategory.ADMIN_READ)

  const page = Math.max(1, params?.page || 1)
  const limit = Math.min(50, Math.max(1, params?.limit || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  const admin = getAdminClient()

  let query = admin
    .from("compliance_logs")
    .select(
      "id, user_id_hash, partner_id, email_hash, email_masked, email_encrypted, user_full_name_encrypted, mp_subscription_id, request_ip, request_country, user_agent, deletion_reason, requested_at, deleted_at, status, integrations_snapshot, partner_stores_snapshot, certificate",
      { count: "exact" }
    )
    .order("deleted_at", { ascending: false })

  const rawSearch = params?.search?.trim()
  if (rawSearch) {
    if (rawSearch.includes("@")) {
      const emailHash = hashNormalizedValue(rawSearch)
      query = query.or(
        `email_hash.eq.${emailHash},integration_email_hashes.cs.{${emailHash}}`
      )
    } else if (UUID_REGEX.test(rawSearch)) {
      query = query.or(`partner_id.eq.${rawSearch},id.eq.${rawSearch}`)
    } else {
      const safeLike = sanitizeIlike(rawSearch)
      const safeArrayVal = rawSearch.replace(/[",{}]/g, "")
      const clauses = [
        `request_ip.ilike.%${safeLike}%`,
        `mp_subscription_id.ilike.%${safeLike}%`,
        `email_hash.eq.${safeArrayVal}`,
        `user_id_hash.eq.${safeArrayVal}`,
      ]
      if (safeArrayVal) {
        clauses.push(`integration_account_ids.cs.{${safeArrayVal}}`)
      }
      query = query.or(clauses.join(","))
    }
  }

  const provider = params?.provider?.trim()
  if (provider && provider !== "all") {
    query = query.contains("integrations_snapshot", JSON.stringify([{ provider_slug: provider }]))
  }

  const { data, count, error } = await query.range(from, to)

  if (error) {
    throw new Error(`Erro ao consultar registros de compliance: ${error.message}`)
  }

  return {
    data: (data || []).map(toSafeEntry),
    total: count || 0,
    page,
    limit,
  }
}

export async function revealComplianceLogPiiAction(input: {
  complianceLogId: string
  reason: string
  stepUpToken: string
}): Promise<{ success: true; pii: ComplianceRevealedPii } | { success: false; error: string }> {
  try {
    const adminUser = await requireSuperAdmin()
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const cleanReason = input.reason?.trim() || ""
    if (cleanReason.length < 5) {
      return {
        success: false,
        error: "Informe uma justificativa clara (mínimo 5 caracteres) para revelar os dados.",
      }
    }

    if (!UUID_REGEX.test(input.complianceLogId || "")) {
      return { success: false, error: "ID de registro inválido." }
    }

    // Enforce single-use password re-authentication
    await requireStepUp(adminUser.userId, input.stepUpToken)

    const admin = getAdminClient()
    const { data: row, error } = await admin
      .from("compliance_logs")
      .select(
        "id, partner_id, email_encrypted, user_full_name_encrypted, integrations_snapshot, partner_stores_snapshot"
      )
      .eq("id", input.complianceLogId)
      .maybeSingle()

    if (error || !row) {
      return { success: false, error: "Registro de compliance não encontrado." }
    }

    const email = safeDecryptCompliancePii(row.email_encrypted)
    const fullName = safeDecryptCompliancePii(row.user_full_name_encrypted)

    const rawIntegrations = Array.isArray(row.integrations_snapshot)
      ? (row.integrations_snapshot as StoredComplianceIntegrationSnapshot[])
      : []

    const integrations = rawIntegrations.map((i) => ({
      provider_slug: i.provider_slug,
      account_id: i.account_id ?? null,
      account_email: safeDecryptCompliancePii(i.account_email_encrypted),
    }))

    const rawStores = Array.isArray(row.partner_stores_snapshot)
      ? (row.partner_stores_snapshot as StoredComplianceStoreSnapshot[])
      : []

    const stores = rawStores.map((s) => ({
      store_id: s.store_id,
      name: s.name ?? null,
      document_type: s.document_type ?? null,
      document: safeDecryptCompliancePii(s.document_encrypted),
    }))

    const fieldsRevealed: string[] = []
    if (email) fieldsRevealed.push("email")
    if (fullName) fieldsRevealed.push("full_name")
    if (integrations.some((i) => i.account_email)) fieldsRevealed.push("integration_emails")
    if (stores.some((s) => s.document)) fieldsRevealed.push("store_documents")

    await adminAuditLog({
      adminUserId: adminUser.userId,
      actionType: AdminActionType.COMPLIANCE_REVEAL_PII,
      targetType: "compliance_log",
      targetId: row.id,
      metadata: {
        reason: cleanReason,
        partner_id: row.partner_id ?? null,
        fields_revealed: fieldsRevealed,
      },
    })

    return {
      success: true,
      pii: {
        email,
        full_name: fullName,
        integrations,
        stores,
      },
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Não foi possível revelar os dados sensíveis.",
    }
  }
}
