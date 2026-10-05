import { describe, it, expect } from "vitest"
import { resolveSubscriptionShipping } from "./shipping"

describe("resolveSubscriptionShipping", () => {
  it("retirada sempre tem frete zero", () => {
    expect(
      resolveSubscriptionShipping({ deliveryType: "pickup", shippingMode: "quote" }),
    ).toEqual({ amount: 0, source: "pickup", carrierServiceId: null, resolved: true })
  })

  it("modo included zera o frete", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "included",
        deliveryFee: 25,
      }),
    ).toMatchObject({ amount: 0, source: "included", resolved: true })
  })

  it("modo flat usa o valor fixo do plano", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "flat",
        shippingFlatAmount: 12.9,
      }),
    ).toMatchObject({ amount: 12.9, source: "flat", resolved: true })
  })

  it("modo flat ignora qualquer cotacao vinda do checkout", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "flat",
        shippingFlatAmount: 12.9,
        deliveryFee: 99,
      }),
    ).toMatchObject({ amount: 12.9, source: "flat" })
  })

  it("modo flat com valor invalido ou negativo vira zero", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "flat",
        shippingFlatAmount: -5,
      }),
    ).toMatchObject({ amount: 0, source: "flat" })
  })

  it("quote sem cotacao fica nao resolvido para o cadastro bloquear", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: null,
        deliveryBreakdown: null,
      }),
    ).toMatchObject({ amount: 0, resolved: false })
  })

  it("quote congela o valor ja cobrado no checkout", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: 18.4,
        deliveryBreakdown: { baseFee: 10, distanceFee: 8.4, deliveryPayer: "customer" },
      }),
    ).toEqual({ amount: 18.4, source: "quote_own", carrierServiceId: null, resolved: true })
  })

  it("cupom de frete gratis e one-off: congela o originalFee", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: 0,
        deliveryBreakdown: {
          originalFee: 22,
          deliveryPayer: "seller",
          freeDeliveryReason: "coupon",
        },
      }),
    ).toMatchObject({ amount: 22, source: "quote_own", resolved: true })
  })

  it("frete gratis por threshold e recorrente: mantem zero", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: 0,
        deliveryBreakdown: {
          originalFee: 22,
          freeDeliveryReason: "threshold",
          isFreeByThreshold: true,
        },
      }),
    ).toMatchObject({ amount: 0, resolved: true })
  })

  it("frete por conta do lojista mantem zero", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: 0,
        deliveryBreakdown: { originalFee: 30, deliveryPayer: "seller" },
      }),
    ).toMatchObject({ amount: 0, resolved: true })
  })

  it("cotacao da transportadora grava origem e servico", () => {
    expect(
      resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: "quote",
        deliveryFee: 41.9,
        deliveryBreakdown: { source: "superfrete", serviceId: 1, carrier: "SuperFrete" },
      }),
    ).toEqual({
      amount: 41.9,
      source: "quote_carrier",
      carrierServiceId: "1",
      resolved: true,
    })
  })

  it("deliveryType nulo cai em pickup", () => {
    expect(
      resolveSubscriptionShipping({ deliveryType: null, shippingMode: "flat", shippingFlatAmount: 9 }),
    ).toMatchObject({ amount: 0, source: "pickup" })
  })
})
