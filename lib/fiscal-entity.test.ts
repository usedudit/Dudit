import { describe, expect, it } from "vitest"
import {
  computeRevenueLimitSnapshot,
  detectDocumentType,
  formatDocument,
  getDefaultAnnualLimit,
  getMeiAnnualLimit,
  getNanoAnnualLimit,
  getProratedAnnualLimit,
  MEI_TOLERANCE_RATE,
  normalizeDocument,
} from "./fiscal-entity"

describe("limites anuais", () => {
  it("segue a tabela do MEI por ano", () => {
    expect(getMeiAnnualLimit(2026)).toBe(81_000)
    expect(getMeiAnnualLimit(2027)).toBe(110_000)
    expect(getMeiAnnualLimit(2028)).toBe(140_000)
  })

  it("nanoempreendedor é metade do limite do MEI", () => {
    expect(getNanoAnnualLimit(2027)).toBe(55_000)
    expect(getNanoAnnualLimit(2028)).toBe(70_000)
  })

  it("só define limite padrão para MEI e nano", () => {
    expect(getDefaultAnnualLimit("mei", 2027)).toBe(110_000)
    expect(getDefaultAnnualLimit("nano", 2027)).toBe(55_000)
    expect(getDefaultAnnualLimit("pf_contribuinte", 2027)).toBeNull()
    expect(getDefaultAnnualLimit("nao_informado", 2027)).toBeNull()
  })

  it("proporcionaliza o limite no ano de abertura", () => {
    // Aberto em julho/2027: julho a dezembro = 6/12 do limite.
    expect(getProratedAnnualLimit(110_000, 2027, "2027-07-10")).toBe(55_000)
    // Aberto em janeiro: ano cheio.
    expect(getProratedAnnualLimit(110_000, 2027, "2027-01-10")).toBe(110_000)
    // Aberto em outro ano: não proporcionaliza o ano corrente.
    expect(getProratedAnnualLimit(110_000, 2027, "2025-07-10")).toBe(110_000)
    // Sem data de abertura: limite cheio.
    expect(getProratedAnnualLimit(110_000, 2027, null)).toBe(110_000)
  })
})

describe("snapshot do limite de faturamento", () => {
  const base = {
    profile: "mei" as const,
    limit: 110_000,
    year: 2027,
    referenceDate: new Date(2027, 6, 2),
  }

  it("sem limite configurado retorna sem_perfil", () => {
    const snapshot = computeRevenueLimitSnapshot({ ...base, limit: null, revenue: 10_000 })
    expect(snapshot.status).toBe("sem_perfil")
    expect(snapshot.percentage).toBe(0)
  })

  it("classifica atenção a partir de 80%", () => {
    const snapshot = computeRevenueLimitSnapshot({ ...base, revenue: 88_000 })
    expect(snapshot.percentage).toBe(80)
    expect(snapshot.status).toBe("atencao")
    expect(snapshot.remaining).toBe(22_000)
  })

  it("marca limite atingido e margem de tolerância", () => {
    const atLimit = computeRevenueLimitSnapshot({ ...base, revenue: 110_000 })
    expect(atLimit.status).toBe("limite")

    const withinTolerance = computeRevenueLimitSnapshot({
      ...base,
      revenue: 110_000 + 110_000 * MEI_TOLERANCE_RATE * 0.5,
    })
    expect(withinTolerance.status).toBe("tolerancia")
    expect(withinTolerance.toleranceRemaining).toBeGreaterThan(0)
  })

  it("não antecipa o limite por arredondamento de percentual", () => {
    const almostAtLimit = computeRevenueLimitSnapshot({ ...base, revenue: 109_999 })
    expect(almostAtLimit.status).toBe("atencao")
    expect(almostAtLimit.percentage).toBe(99)

    const justBelowAttention = computeRevenueLimitSnapshot({ ...base, revenue: 87_900 })
    expect(justBelowAttention.status).toBe("ok")
    expect(justBelowAttention.percentage).toBe(79)
  })

  it("marca excesso acima da tolerância de 20%", () => {
    const snapshot = computeRevenueLimitSnapshot({ ...base, revenue: 140_000 })
    expect(snapshot.status).toBe("excedido")
    expect(snapshot.toleranceRemaining).toBe(0)
  })

  it("nanoempreendedor não tem margem de 20%: acima do limite já é excedido", () => {
    const nanoBase = { ...base, profile: "nano" as const, limit: 55_000 }
    const atLimit = computeRevenueLimitSnapshot({ ...nanoBase, revenue: 55_000 })
    expect(atLimit.status).toBe("limite")
    expect(atLimit.toleranceLimit).toBe(55_000)

    const aboveLimit = computeRevenueLimitSnapshot({ ...nanoBase, revenue: 55_001 })
    expect(aboveLimit.status).toBe("excedido")
  })

  it("projeta o fechamento do ano pelo ritmo atual", () => {
    const snapshot = computeRevenueLimitSnapshot({ ...base, revenue: 55_000 })
    expect(snapshot.projectedAnnual).not.toBeNull()
    expect(snapshot.projectedAnnual!).toBeGreaterThan(100_000)
  })
})

describe("documento fiscal", () => {
  it("normaliza e detecta CNPJ/CPF", () => {
    const cnpj = "12.345.678/0001-90"
    const cpf = "123.456.789-01"
    expect(normalizeDocument(cnpj)).toBe("12345678000190")
    expect(detectDocumentType(cnpj)).toBe("cnpj")
    expect(detectDocumentType(cpf)).toBe("cpf")
    expect(detectDocumentType("123")).toBeNull()
  })

  it("formata documentos", () => {
    expect(formatDocument("12345678000190")).toBe("12.345.678/0001-90")
    expect(formatDocument("12345678901")).toBe("123.456.789-01")
  })
})
