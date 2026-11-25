import { describe, it, expect } from "vitest"
import { buildProximityRings } from "./proximity-rings"

describe("buildProximityRings", () => {
  it("separa corretamente local, cidades vizinhas e envio nacional", () => {
    const localItems = [
      { id: "p1", itemType: "produto", name: "Pneu Aro 15 Local", partners: { distance_km: 2.3, state: "SP" }, fulfillment_modes: ["delivery", "pickup"] },
    ]
    const distantItems = [
      { id: "p2", itemType: "produto", name: "Pneu Cidade Vizinha", partners: { distance_km: 32, state: "SP" }, fulfillment_modes: ["pickup"] },
      { id: "p3", itemType: "produto", name: "Pneu Envio Nacional", partners: { distance_km: 420, state: "PR" }, fulfillment_modes: ["shipping"] },
      { id: "p4", itemType: "produto", name: "Pneu Distante Sem Envio", partners: { distance_km: 300, state: "MG" }, fulfillment_modes: ["pickup"] },
    ]
    const distantSellers = [
      { id: "s1", itemType: "loja", name: "Borracharia Vizinha", partners: { distance_km: 25, state: "SP" } },
      { id: "s2", itemType: "loja", name: "Autocenter Longe", partners: { distance_km: 210, state: "RJ" } },
    ]

    const rings = buildProximityRings(localItems, distantItems, distantSellers, {
      intent: "product",
      localState: "SP",
    })

    expect(rings.nearby.map((i) => i.id)).toEqual(["p1"])
    expect(rings.regional.map((i) => i.id)).toEqual(["p2"])
    expect(rings.regionalSellers.map((i) => i.id)).toEqual(["s1"])
    expect(rings.nationalShipping.map((i) => i.id)).toEqual(["p3"])
    expect(rings.otherDistant.map((i) => i.id)).toEqual(["p4"])
    expect(rings.otherDistantSellers.map((i) => i.id)).toEqual(["s2"])
  })

  it("não coloca serviços no anel de envio nacional", () => {
    const rings = buildProximityRings(
      [],
      [{ id: "sv1", itemType: "servico", name: "Eletricista Longe", partners: { distance_km: 150, state: "RJ" }, fulfillment_modes: ["customer_location"] }],
      [],
      { intent: "service", localState: "SP" },
    )
    expect(rings.nationalShipping).toHaveLength(0)
    expect(rings.otherDistant.map((i) => i.id)).toEqual(["sv1"])
  })

  it("evita duplicatas entre local e distante", () => {
    const item = { id: "p1", itemType: "produto", partners: { distance_km: 3 } }
    const rings = buildProximityRings([item], [item], [])
    expect(rings.nearby).toHaveLength(1)
    expect(rings.regional).toHaveLength(0)
  })
})
