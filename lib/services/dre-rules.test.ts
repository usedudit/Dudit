import { describe, it, expect } from "vitest"
import { getOrderRevenueBucket, isOrderDerivedTransaction } from "./dre-rules"

describe("getOrderRevenueBucket", () => {
  it("pedidos de assinatura entram no bucket recorrente", () => {
    expect(getOrderRevenueBucket("Assinatura")).toBe("recurring")
  })

  it("normaliza caixa e espaços do order_source", () => {
    expect(getOrderRevenueBucket("assinatura")).toBe("recurring")
    expect(getOrderRevenueBucket("  ASSINATURA  ")).toBe("recurring")
  })

  it("demais origens ficam no bucket de produtos", () => {
    expect(getOrderRevenueBucket("Marketplace")).toBe("products")
    expect(getOrderRevenueBucket("Balcão")).toBe("products")
    expect(getOrderRevenueBucket("Entrega")).toBe("products")
    expect(getOrderRevenueBucket("manual")).toBe("products")
  })

  it("origem ausente cai no bucket de produtos", () => {
    expect(getOrderRevenueBucket(null)).toBe("products")
    expect(getOrderRevenueBucket(undefined)).toBe("products")
    expect(getOrderRevenueBucket("")).toBe("products")
  })
})

describe("isOrderDerivedTransaction", () => {
  it("transações do ledger de pedidos são ignoradas no DRE", () => {
    expect(isOrderDerivedTransaction({ kind: "recognition" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "settlement" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "fee" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "refund" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "chargeback" })).toBe(true)
  })

  it("transações manuais continuam contabilizadas", () => {
    expect(isOrderDerivedTransaction({ kind: null })).toBe(false)
    expect(isOrderDerivedTransaction({ kind: "" })).toBe(false)
    expect(isOrderDerivedTransaction({})).toBe(false)
    expect(isOrderDerivedTransaction(undefined)).toBe(false)
    expect(isOrderDerivedTransaction(null)).toBe(false)
  })

  it("kind com espaços em branco não conta como derivado", () => {
    expect(isOrderDerivedTransaction({ kind: "   " })).toBe(false)
  })
})
