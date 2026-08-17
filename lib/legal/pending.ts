import type { LegalDocumentType } from "@/lib/legal/constants"

export interface LegalDocumentRow {
  id: string
  tipo: string
  versao: string
  url: string | null
  conteudo_hash?: string | null
  publicado_em: string
  vigente_em: string
}

export interface UserConsentRow {
  tipo: string
  documento_id: string | null
  versao: string
}

export interface PendingLegalConsent {
  tipo: LegalDocumentType
  versao: string
  url: string | null
  publicado_em: string
  vigente_em: string
}

/**
 * Dado o conjunto de documentos vigentes (já filtrados por `vigente_em <= now()`
 * e ordenados do mais recente para o mais antigo) e os aceites do usuário,
 * retorna os documentos que exigem um novo aceite.
 */
export function computePendingLegalConsents(
  documents: LegalDocumentRow[],
  consents: UserConsentRow[]
): PendingLegalConsent[] {
  const latestDocByTipo = new Map<string, LegalDocumentRow>()
  for (const doc of documents) {
    if (!latestDocByTipo.has(doc.tipo)) latestDocByTipo.set(doc.tipo, doc)
  }

  const latestConsentByTipo = new Map<string, UserConsentRow>()
  for (const consent of consents) {
    if (!latestConsentByTipo.has(consent.tipo)) latestConsentByTipo.set(consent.tipo, consent)
  }

  const pending: PendingLegalConsent[] = []
  for (const [tipo, doc] of latestDocByTipo) {
    const accepted = latestConsentByTipo.get(tipo)
    const acceptedLatest =
      !!accepted && (accepted.documento_id === doc.id || accepted.versao === doc.versao)

    if (!acceptedLatest) {
      pending.push({
        tipo: tipo as LegalDocumentType,
        versao: doc.versao,
        url: doc.url,
        publicado_em: doc.publicado_em,
        vigente_em: doc.vigente_em,
      })
    }
  }

  return pending
}