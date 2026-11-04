"use server"

import { headers } from "next/headers"
import { createHash } from "node:crypto"
import { z } from "zod"
import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import {
  computePendingLegalConsents,
  type LegalDocumentRow,
  type PendingLegalConsent,
  type UserConsentRow,
} from "@/lib/legal/pending"
import {
  LEGAL_CONSENT_ORIGINS,
  type LegalConsentOrigin,
  type LegalDocumentType,
} from "@/lib/legal/constants"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { traceServerAction } from "@/lib/observability/request-trace"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

const recordConsentSchema = z.object({
  tipo: z.enum(["terms", "privacy"]),
  versao: z.string().min(1).max(50),
  origem: z.enum(Object.values(LEGAL_CONSENT_ORIGINS) as [LegalConsentOrigin, ...LegalConsentOrigin[]]).default("signup"),
  userId: z.string().uuid().optional(),
})

export interface RecordLegalConsentResult {
  success: boolean
  error?: string
}

/**
 * Registra o aceite de um documento legal.
 *
 * - No cadastro (pré-confirmação de e-mail / OAuth) o cliente envia `userId`
 *   proveniente do retorno do `signUp`, e o registro é feito via service_role.
 * - No re-consentimento o usuário está autenticado; `userId` é resolvido da sessão.
 *
 * O hash do conteúdo é resolvido a partir da versão publicada em
 * `legal_documents`, garantindo que a linha grave exatamente o que foi aceito.
 */
export async function recordLegalConsent(input: {
  tipo: LegalDocumentType
  versao: string
  origem?: LegalConsentOrigin
  userId?: string
}): Promise<RecordLegalConsentResult> {
  try {
    await requireRateLimit(RateLimitCategory.AUTH_REGISTER)
  } catch {
    return { success: false, error: "Muitas tentativas. Aguarde alguns instantes." }
  }

  const parsed = recordConsentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: "Dados de consentimento inválidos." }
  }

  const { tipo, versao, origem, userId: providedUserId } = parsed.data

  const user = await getCurrentUser()
  let userId: string

  if (user) {
    // If authenticated, prevent recording consent for another user ID (CWE-284)
    if (providedUserId && providedUserId !== user.id) {
      return { success: false, error: "Acesso não autorizado." }
    }
    userId = user.id
  } else if (providedUserId) {
    userId = providedUserId
  } else {
    return { success: false, error: "Usuário não autenticado." }
  }

  const admin = getAdminClient()

  // Impede registros órfãos a partir de um userId manipulado no cliente.
  const { data: existingUser } = await admin.auth.admin.getUserById(userId)
  if (!existingUser?.user) {
    return { success: false, error: "Usuário não encontrado." }
  }

  // Se não autenticado, só permite consentimento pré-login para contas recém-criadas (1 hora)
  if (!user) {
    const createdAt = new Date(existingUser.user.created_at).getTime()
    if (Date.now() - createdAt > 60 * 60 * 1000) {
      return { success: false, error: "Sessão expirada. Faça login para registrar o consentimento." }
    }
  }

  const { data: doc } = (await admin
    .from("legal_documents")
    .select("id, conteudo_hash")
    .eq("tipo", tipo)
    .eq("versao", versao)
    .maybeSingle()) as {
    data: { id: string; conteudo_hash: string | null } | null
    error: unknown
  }

  if (!doc?.conteudo_hash) {
    console.error(`[LEGAL-CONSENT] Documento sem hash publicado (tipo=${tipo}, versao=${versao}).`)
    return { success: false, error: "O documento legal está sendo atualizado. Tente novamente em instantes." }
  }

  const headerList = await headers()
  const ip = getTrustedClientIP(headerList)
  const userAgent = headerList.get("user-agent") || null

  const { error } = await admin.from("user_legal_consents").insert({
    user_id: userId,
    user_id_hash: createHash("sha256").update(userId).digest("hex"),
    documento_id: doc?.id ?? null,
    tipo,
    versao,
    conteudo_hash: doc.conteudo_hash,
    origem,
    ip_address: ip,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
  })

  if (error) {
    console.error("[LEGAL-CONSENT] Falha ao registrar consentimento:", error)
    return { success: false, error: "Falha ao registrar o aceite." }
  }

  return { success: true }
}

/**
 * Retorna os documentos legais vigentes (versão em vigor no momento) que o
 * usuário ainda não aceitou. Usado pelo banner de re-consentimento.
 */
export async function getPendingLegalConsents(): Promise<PendingLegalConsent[]> {
  await traceServerAction("legal.getPendingConsents")
  const user = await getCurrentUser()
  if (!user) return []

  const admin = getAdminClient()
  const now = new Date().toISOString()

  const { data: documents } = (await admin
    .from("legal_documents")
    .select("id, tipo, versao, url, publicado_em, vigente_em")
    .lte("vigente_em", now)
    .order("vigente_em", { ascending: false })) as {
    data: LegalDocumentRow[] | null
    error: unknown
  }

  if (!documents || documents.length === 0) return []

  const { data: consents } = (await admin
    .from("user_legal_consents")
    .select("tipo, documento_id, versao, aceito_em")
    .eq("user_id", user.id)
    .order("aceito_em", { ascending: false })) as {
    data: UserConsentRow[] | null
    error: unknown
  }

  return computePendingLegalConsents(documents, consents ?? [])
}

/**
 * Garante que o usuário tenha aceite para todas as versões vigentes.
 * Registra somente os documentos que faltam (sem duplicar). Usado no
 * callback de autenticação (OAuth/confirmação de e-mail) como rede de
 * segurança para usuários que ainda não registraram aceite.
 */
export async function ensureLegalConsents(
  userId: string,
  origin: LegalConsentOrigin = "oauth"
): Promise<{ success: boolean }> {
  const admin = getAdminClient()
  const now = new Date().toISOString()

  const { data: documents } = (await admin
    .from("legal_documents")
    .select("id, tipo, versao, conteudo_hash, url, publicado_em, vigente_em")
    .lte("vigente_em", now)
    .order("vigente_em", { ascending: false })) as {
    data: LegalDocumentRow[] | null
    error: unknown
  }

  if (!documents || documents.length === 0) return { success: true }

  if (documents.some((document) => !document.conteudo_hash)) {
    console.error("[LEGAL-CONSENT] Documento vigente sem hash publicado.")
    return { success: false }
  }

  const { data: consents } = (await admin
    .from("user_legal_consents")
    .select("tipo, documento_id, versao, aceito_em")
    .eq("user_id", userId)
    .order("aceito_em", { ascending: false })) as {
    data: UserConsentRow[] | null
    error: unknown
  }

  const pending = computePendingLegalConsents(documents, consents ?? [])
  if (pending.length === 0) return { success: true }

  const docByKey = new Map((documents ?? []).map((d) => [`${d.tipo}:${d.versao}`, d]))

  const headerList = await headers()
  const ip = getTrustedClientIP(headerList)
  const userAgent = headerList.get("user-agent") || null

  const rows = pending.map((p) => {
    const doc = docByKey.get(`${p.tipo}:${p.versao}`)
    return {
      user_id: userId,
      user_id_hash: createHash("sha256").update(userId).digest("hex"),
      documento_id: doc?.id ?? null,
      tipo: p.tipo,
      versao: p.versao,
      conteudo_hash: doc?.conteudo_hash ?? null,
      origem: origin,
      ip_address: ip,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    }
  })

  const { error } = await admin.from("user_legal_consents").insert(rows)

  if (error) {
    console.error("[LEGAL-CONSENT] Falha ao garantir consentimentos:", error)
    return { success: false }
  }

  return { success: true }
}
