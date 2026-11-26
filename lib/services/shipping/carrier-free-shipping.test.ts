import { describe, it, expect } from "vitest"
import {
  resolveStateFromCep,
  evaluateCarrierFreeShipping,
  applyCarrierFreeShippingToOptions,
  type CarrierFreeShippingRule,
} from "./carrier-free-shipping"

describe("resolveStateFromCep", () => {
  it("identifica UFs corretamente pelas faixas oficiais de CEP", () => {
    expect(resolveStateFromCep("01310-100")).toBe("SP")
    expect(resolveStateFromCep("19999999")).toBe("SP")
    expect(resolveStateFromCep("80010-000")).toBe("PR")
    expect(resolveStateFromCep("88015-200")).toBe("SC")
    expect(resolveStateFromCep("90010-000")).toBe("RS")
    expect(resolveStateFromCep("20040-020")).toBe("RJ")
    expect(resolveStateFromCep("30130-010")).toBe("MG")
    expect(resolveStateFromCep("40020-000")).toBe("BA")
    expect(resolveStateFromCep("70040-010")).toBe("DF")
    expect(resolveStateFromCep("72800-000")).toBe("GO")
    expect(resolveStateFromCep("69900-000")).toBe("AC")
  })

  it("retorna null para CEPs inválidos", () => {
    expect(resolveStateFromCep("")).toBeNull()
    expect(resolveStateFromCep("1234")).toBeNull()
    expect(resolveStateFromCep("00000-000")).toBeNull()
  })
})

describe("evaluateCarrierFreeShipping", () => {
  const rules: CarrierFreeShippingRule[] = [
    {
      id: "rule-sp-pr-50",
      minOrderValue: 50,
      allStates: false,
      states: ["SP", "PR"],
      appliesTo: "cheapest",
      isActive: true,
    },
    {
      id: "rule-sul-sp-100",
      minOrderValue: 100,
      allStates: false,
      states: ["SP", "PR", "SC"],
      appliesTo: "all",
      isActive: true,
    },
    {
      id: "rule-brasil-250",
      minOrderValue: 250,
      allStates: true,
      states: [],
      appliesTo: "cheapest",
      isActive: true,
    },
  ]

  it("aplica regra de R$ 50 para SP/PR quando subtotal é 60", () => {
    const res = evaluateCarrierFreeShipping({
      destinationCep: "80010-000", // PR
      orderSubtotal: 60,
      rules,
    })
    expect(res.destinationState).toBe("PR")
    expect(res.isFree).toBe(true)
    expect(res.appliesTo).toBe("cheapest")
    expect(res.matchedRule?.id).toBe("rule-sp-pr-50")
    expect(res.applicableThreshold).toBe(50)
  })

  it("não aplica frete grátis para SC quando subtotal é 60, mas informa threshold 100", () => {
    const res = evaluateCarrierFreeShipping({
      destinationCep: "88015-200", // SC
      orderSubtotal: 60,
      rules,
    })
    expect(res.destinationState).toBe("SC")
    expect(res.isFree).toBe(false)
    expect(res.applicableThreshold).toBe(100)
  })

  it("aplica regra de R$ 100 (all) para SP quando subtotal é 120", () => {
    const res = evaluateCarrierFreeShipping({
      destinationCep: "01310-100", // SP
      orderSubtotal: 120,
      rules,
    })
    expect(res.isFree).toBe(true)
    expect(res.appliesTo).toBe("all")
    expect(res.matchedRule?.id).toBe("rule-sul-sp-100")
  })

  it("aplica regra de todo o Brasil para BA quando subtotal >= 250", () => {
    const res = evaluateCarrierFreeShipping({
      destinationCep: "40020-000", // BA
      orderSubtotal: 250,
      rules,
    })
    expect(res.destinationState).toBe("BA")
    expect(res.isFree).toBe(true)
    expect(res.matchedRule?.id).toBe("rule-brasil-250")
  })

  it("ignora regras inativas", () => {
    const res = evaluateCarrierFreeShipping({
      destinationCep: "01310-100",
      orderSubtotal: 500,
      rules: [{ ...rules[0], isActive: false }],
    })
    expect(res.isFree).toBe(false)
    expect(res.applicableThreshold).toBeNull()
  })
})

describe("applyCarrierFreeShippingToOptions", () => {
  const options = [
    { serviceId: 1, serviceName: "PAC", price: 18.5 },
    { serviceId: 2, serviceName: "SEDEX", price: 34.9 },
  ]

  it("zera apenas a opção mais barata quando appliesTo === 'cheapest'", () => {
    const updated = applyCarrierFreeShippingToOptions(options, {
      destinationState: "SP",
      applicableThreshold: 50,
      isFree: true,
      appliesTo: "cheapest",
      matchedRule: {
        id: "r1",
        minOrderValue: 50,
        allStates: false,
        states: ["SP"],
        appliesTo: "cheapest",
        isActive: true,
      },
    })
    expect(updated[0].price).toBe(0)
    expect(updated[0].originalPrice).toBe(18.5)
    expect(updated[0].isFreeShipping).toBe(true)
    expect(updated[1].price).toBe(34.9)
    expect(updated[1].isFreeShipping).toBeUndefined()
    // Não muta original
    expect(options[0].price).toBe(18.5)
  })

  it("zera todas as opções quando appliesTo === 'all'", () => {
    const updated = applyCarrierFreeShippingToOptions(options, {
      destinationState: "SP",
      applicableThreshold: 100,
      isFree: true,
      appliesTo: "all",
      matchedRule: {
        id: "r2",
        minOrderValue: 100,
        allStates: false,
        states: ["SP"],
        appliesTo: "all",
        isActive: true,
      },
    })
    expect(updated[0].price).toBe(0)
    expect(updated[1].price).toBe(0)
    expect(updated[1].originalPrice).toBe(34.9)
    expect(updated[1].isFreeShipping).toBe(true)
  })
})
