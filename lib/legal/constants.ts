/**
 * Versões vigentes dos documentos legais da Dudit.
 *
 * Ao publicar uma nova versão:
 *  1. Suba o texto em um arquivo .txt
 *  2. Rode: npm run seed:legal -- terms <nova-versao> <arquivo.txt>
 *  3. Atualize `CURRENT_LEGAL_DOCUMENTS` abaixo com a nova versão.
 *  4. Atualize a data/versão no topo de /institucional/termos e /institucional/privacidade.
 */

export const LEGAL_DOCUMENT_TYPES = {
  terms: "terms",
  privacy: "privacy",
} as const

export type LegalDocumentType = keyof typeof LEGAL_DOCUMENT_TYPES

export const LEGAL_CONSENT_ORIGINS = {
  signup: "signup",
  oauth: "oauth",
  reconsent: "reconsent",
  migration: "migration",
} as const

export type LegalConsentOrigin = keyof typeof LEGAL_CONSENT_ORIGINS

export interface LegalDocumentReference {
  tipo: LegalDocumentType
  versao: string
  url: string
}

export const CURRENT_LEGAL_DOCUMENTS: LegalDocumentReference[] = [
  { tipo: "terms", versao: "1.0", url: "/institucional/termos" },
  { tipo: "privacy", versao: "1.0", url: "/institucional/privacidade" },
]

export const CURRENT_LEGAL_DOCUMENTS_BY_TYPE = Object.fromEntries(
  CURRENT_LEGAL_DOCUMENTS.map((doc) => [doc.tipo, doc])
) as Record<LegalDocumentType, LegalDocumentReference>

export const TERMS_EFFECTIVE_DELAY_DAYS = 10