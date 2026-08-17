import { describe, it, expect } from "vitest"
import {
  computePendingLegalConsents,
  type LegalDocumentRow,
  type UserConsentRow,
} from "./pending"

const DOC = (
  overrides: Partial<LegalDocumentRow> & { tipo: string; versao: string }
): LegalDocumentRow => ({
  id: `doc-${overrides.tipo}-${overrides.versao}`,
  url: `/institucional/${overrides.tipo}`,
  publicado_em: "2026-08-01T00:00:00.000Z",
  vigente_em: "2026-08-11T00:00:00.000Z",
  ...overrides,
})

const CONSENT = (
  overrides: Partial<UserConsentRow> & { tipo: string; versao: string }
): UserConsentRow => ({
  documento_id: null,
  ...overrides,
})

describe("computePendingLegalConsents", () => {
  it("retorna [] quando não há documentos vigentes", () => {
    expect(computePendingLegalConsents([], [])).toEqual([])
  })

  it("retorna todos os documentos vigentes quando o usuário não tem nenhum aceite", () => {
    const documents = [
      DOC({ tipo: "terms", versao: "1.0" }),
      DOC({ tipo: "privacy", versao: "1.0" }),
    ]
    const result = computePendingLegalConsents(documents, [])
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.tipo).sort()).toEqual(["privacy", "terms"])
  })

  it("retorna [] quando o usuário aceitou a versão vigente (match por documento_id)", () => {
    const documents = [DOC({ id: "doc-terms-2", tipo: "terms", versao: "2.0" })]
    const consents = [CONSENT({ tipo: "terms", versao: "2.0", documento_id: "doc-terms-2" })]
    expect(computePendingLegalConsents(documents, consents)).toEqual([])
  })

  it("retorna [] quando o usuário aceitou a versão vigente (fallback por versao)", () => {
    const documents = [DOC({ id: "doc-terms-2", tipo: "terms", versao: "2.0" })]
    const consents = [CONSENT({ tipo: "terms", versao: "2.0" })]
    expect(computePendingLegalConsents(documents, consents)).toEqual([])
  })

  it("retorna pendente quando o usuário aceitou apenas uma versão antiga", () => {
    const documents = [
      DOC({ id: "doc-terms-2", tipo: "terms", versao: "2.0" }),
      DOC({ id: "doc-terms-1", tipo: "terms", versao: "1.0" }),
    ]
    const consents = [CONSENT({ tipo: "terms", versao: "1.0", documento_id: "doc-terms-1" })]
    const result = computePendingLegalConsents(documents, consents)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ tipo: "terms", versao: "2.0" })
  })

  it("retorna pendente quando aceite antigo e outro documento vigente aceito", () => {
    const documents = [
      DOC({ id: "doc-terms-2", tipo: "terms", versao: "2.0" }),
      DOC({ id: "doc-privacy-2", tipo: "privacy", versao: "2.0" }),
    ]
    const consents = [
      CONSENT({ tipo: "terms", versao: "1.0", documento_id: "doc-terms-1" }),
      CONSENT({ tipo: "privacy", versao: "2.0", documento_id: "doc-privacy-2" }),
    ]
    const result = computePendingLegalConsents(documents, consents)
    expect(result).toHaveLength(1)
    expect(result[0].tipo).toBe("terms")
  })

  it("considera apenas o último aceite de cada tipo (append-only)", () => {
    const documents = [DOC({ id: "doc-terms-3", tipo: "terms", versao: "3.0" })]
    const consents = [
      CONSENT({ tipo: "terms", versao: "3.0", documento_id: "doc-terms-3" }),
      CONSENT({ tipo: "terms", versao: "2.0", documento_id: "doc-terms-2" }),
    ]
    expect(computePendingLegalConsents(documents, consents)).toEqual([])
  })

  it("mantém a ordem dos documentos vigentes ao retornar pendentes", () => {
    const documents = [
      DOC({ id: "doc-terms-3", tipo: "terms", versao: "3.0" }),
      DOC({ id: "doc-privacy-2", tipo: "privacy", versao: "2.0" }),
    ]
    const result = computePendingLegalConsents(documents, [])
    expect(result.map((p) => p.versao)).toEqual(["3.0", "2.0"])
  })
})