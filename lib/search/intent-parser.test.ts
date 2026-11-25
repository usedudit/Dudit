import { describe, it, expect } from "vitest"
import { parseSearchIntent } from "./intent-parser"

// Quarta-feira, 25 de novembro de 2026, 12:00 BRT (15:00 UTC)
const FIXED_NOW = new Date("2026-11-25T15:00:00Z")

describe("parseSearchIntent", () => {
  it("limpa frase natural de produto e associa categorias automotivas", () => {
    const res = parseSearchIntent("Preciso de um pneu aro 15.", FIXED_NOW)
    expect(res.cleanQuery).toBe("pneu aro 15")
    expect(res.intent).toBe("product")
    expect(res.timeWindow).toBeNull()
    expect(res.relatedTerms).toContain("borracharia")
    expect(res.relatedTerms).toContain("oficina mecanica")
    expect(res.needsAiFallback).toBe(false)
  })

  it("detecta intenção de serviço e janela de tempo em 'Preciso de um eletricista amanhã de manhã'", () => {
    const res = parseSearchIntent("Preciso de um eletricista amanhã de manhã", FIXED_NOW)
    expect(res.cleanQuery).toBe("eletricista")
    expect(res.intent).toBe("service")
    expect(res.timeWindow).not.toBeNull()
    expect(res.timeWindow?.targetDate).toBe("2026-11-26")
    expect(res.timeWindow?.dayOfWeekKey).toBe("thursday")
    expect(res.timeWindow?.period).toBe("morning")
    expect(res.timeWindow?.startMinutes).toBe(8 * 60)
    expect(res.timeWindow?.endMinutes).toBe(12 * 60)
    expect(res.timeWindow?.label).toBe("amanhã de manhã")
  })

  it("detecta urgência e horário 'hoje à tarde'", () => {
    const res = parseSearchIntent("encanador urgente hoje à tarde", FIXED_NOW)
    expect(res.intent).toBe("service")
    expect(res.urgency).toBe("high")
    expect(res.timeWindow?.targetDate).toBe("2026-11-25")
    expect(res.timeWindow?.period).toBe("afternoon")
    expect(res.cleanQuery).toBe("encanador")
  })

  it("sinaliza needsAiFallback para problemas em linguagem natural", () => {
    const res = parseSearchIntent("meu chuveiro queimou e não esquenta", FIXED_NOW)
    expect(res.needsAiFallback).toBe(true)
    expect(res.relatedTerms).toContain("eletricista")
  })

  it("lida com query vazia sem erro", () => {
    const res = parseSearchIntent("   ", FIXED_NOW)
    expect(res.cleanQuery).toBe("")
    expect(res.intent).toBe("mixed")
    expect(res.needsAiFallback).toBe(false)
  })
})
