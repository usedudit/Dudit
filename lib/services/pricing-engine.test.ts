import { describe, it, expect } from "vitest"
import {
  calculateOrderPricing,
  computeItemCampaignPricing,
  type PricingItem,
  type PricingCoupon,
  type PricingInput,
} from "./pricing-engine"
import { PromotionType, DiscountType, ApplyScope, type PricingPromotion } from "@/lib/types/promotion"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(overrides: Partial<PricingItem> = {}): PricingItem {
  return { unitPrice: 100, quantity: 1, ...overrides }
}

function discountPromotion(overrides: Partial<PricingPromotion> = {}): PricingPromotion {
  return {
    id: "promo-1",
    campaignId: "camp-1",
    partnerId: "partner-1",
    name: "10% off",
    promotionType: PromotionType.DISCOUNT,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    maxDiscountAmount: null,
    minSpendAmount: null,
    giftProductId: null,
    giftServiceId: null,
    buyQuantity: null,
    payQuantity: null,
    priority: 1,
    applyScope: ApplyScope.ENTIRE_CART,
    allowCouponCombination: true,
    applicableProductIds: undefined,
    applicableCategoryIds: undefined,
    applicableServiceIds: undefined,
    ...overrides,
  }
}

function coupon(overrides: Partial<PricingCoupon> = {}): PricingCoupon {
  return {
    id: "coupon-1",
    code: "TEST10",
    discountType: "percentage",
    discountValue: 10,
    maxDiscountValue: null,
    freeShipping: false,
    allowCombination: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// calculateOrderPricing
// ---------------------------------------------------------------------------

describe("calculateOrderPricing", () => {
  it("includes pricingVersion for audit trail", () => {
    const r = calculateOrderPricing({ items: [{ unitPrice: 100, quantity: 1 }], shippingCost: 0 })
    expect(r.pricingVersion).toBe("2.0")
  })

  // ── Step 1: Basic subtotal ─────────────────────────────────────────────
  it("computes subtotalOriginal from basePrice × quantity", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "p1", unitPrice: 100, basePrice: 100, quantity: 2 },
        { productId: "p2", unitPrice: 50, basePrice: 50, quantity: 3 },
      ],
      shippingCost: 0,
    })
    expect(r.subtotalOriginal).toBe(350) // 100*2 + 50*3
    expect(r.finalTotal).toBe(350)
    expect(r.finalAmountWithPayment).toBe(350)
  })

  it("falls back to unitPrice when basePrice is missing", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 2 }],
      shippingCost: 0,
    })
    expect(r.subtotalOriginal).toBe(200)
  })

  it("handles zero quantities", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 0 }],
      shippingCost: 0,
    })
    expect(r.subtotalOriginal).toBe(0)
    expect(r.finalTotal).toBe(0)
  })

  // ── Step 2: Best item price (manual vs campaign) ──────────────────────
  it("picks promotionalPrice when it is lower than unitPrice", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 80, quantity: 1 }],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(80)
    expect(r.itemDiscountAmount).toBe(20)
    expect(r.itemDiscountSource).toBe("manual")
    expect(r.subtotalOriginal).toBe(100)
  })

  it("uses unitPrice when promotionalPrice is higher", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 120, quantity: 1 }],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(100)
    expect(r.itemDiscountAmount).toBe(0)
    expect(r.itemDiscountSource).toBe("none")
  })

  it("picks campaign price over unit price when campaign is better", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 20 })], // 20% off → 80
    })
    expect(r.subtotal).toBe(80)
    expect(r.itemDiscountAmount).toBe(20)
    expect(r.itemDiscountSource).toBe("campaign")
    expect(r.campaignDiscountAmount).toBe(20)
  })

  it("picks manual promo over campaign when manual is better", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 70, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 10 })], // 10% off → 90
    })
    // min(100, 70, 90) = 70 → manual wins
    expect(r.subtotal).toBe(70)
    expect(r.itemDiscountAmount).toBe(30)
    expect(r.itemDiscountSource).toBe("manual")
    expect(r.campaignDiscountAmount).toBe(0)
  })

  it("picks campaign over manual promo when campaign is better", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 95, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 30 })], // 30% off → 70
    })
    // min(100, 95, 70) = 70 → campaign wins
    expect(r.subtotal).toBe(70)
    expect(r.itemDiscountAmount).toBe(30)
    expect(r.itemDiscountSource).toBe("campaign")
    expect(r.campaignDiscountAmount).toBe(30)
  })

  it("never accumulates manual + campaign (picks the lowest)", () => {
    // Manual = 75, Campaign = 80 (20% off 100). min(100, 75, 80) = 75 → manual wins
    // If it accumulated: 100 → 80 (campaign) → 60 (manual 75% of 80) → INCORRECT
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 75, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 20 })],
    })
    expect(r.subtotal).toBe(75)
    expect(r.itemDiscountAmount).toBe(25)
    expect(r.itemDiscountSource).toBe("manual")
  })

  it("enforces minimum price of R$ 0.01 per unit when promotional price is zero", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, promotionalPrice: 0, quantity: 1 }],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(0.01)
    expect(r.minPriceWarning).toBe(true)
  })

  // ── Buy X Pay Y ───────────────────────────────────────────────────────
  it("applies buy_x_pay_y promotion (cheapest units free)", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "a", unitPrice: 50, quantity: 1 },
        { productId: "b", unitPrice: 30, quantity: 1 },
        { productId: "c", unitPrice: 20, quantity: 1 },
      ],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          id: "bogo",
          promotionType: PromotionType.BUY_X_PAY_Y,
          buyQuantity: 2,
          payQuantity: 1,
          discountType: null,
          discountValue: null,
          applyScope: ApplyScope.ENTIRE_CART,
        }),
      ],
    })
    // buy 2 pay 1 → cheapest unit free: 20 free → total = 50+30 = 80
    // the "free" unit is clamped to R$ 0.01 → subtotal = 80.01
    expect(r.subtotal).toBe(80.01)
    expect(r.minPriceWarning).toBe(true)
    expect(r.appliedPromotionIds).toContain("bogo")
  })

  // ── GIFT ───────────────────────────────────────────────────────────────
  it("identifies gift products from gift promotions", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          id: "gift-promo",
          promotionType: PromotionType.GIFT,
          giftProductId: "gift-123",
          discountType: null,
          discountValue: null,
        }),
      ],
    })
    expect(r.appliedGiftProductIds).toContain("gift-123")
    expect(r.appliedPromotionIds).toContain("gift-promo")
  })

  // ── FREE SHIPPING ──────────────────────────────────────────────────────
  it("zeros shipping from free_shipping campaign promotion", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 25,
      promotions: [
        discountPromotion({
          id: "free-ship-promo",
          promotionType: PromotionType.FREE_SHIPPING,
          discountType: null,
          discountValue: null,
        }),
      ],
    })
    expect(r.shipping).toBe(0)
    expect(r.freeShippingApplied).toBe(true)
  })

  // ── Step 3: Coupon stacking (allowCombination = true) ──────────────────
  it("stacks coupon on top of item discounts when allowCombination = true", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 20 })], // 20% off → 80
      coupon: coupon({ discountValue: 10, allowCombination: true }), // 10% off on 80 → 72
    })
    expect(r.subtotal).toBe(80) // after campaign
    expect(r.couponDiscountAmount).toBe(8) // 10% of 80
    expect(r.finalTotal).toBe(72)
    expect(r.appliedCouponId).toBe("coupon-1")
    expect(r.couponCode).toBe("TEST10")
  })

  // ── Step 3: Coupon scenario comparison (allowCombination = false) ──────
  it("picks campaign-only scenario when cheaper than coupon-only (allowCombination = false)", () => {
    // Campaign gives 40% off → 60. Coupon gives 10% off on 100 → 90.
    // Scenario A (campaign): 60. Scenario B (coupon): 90. Campaign (60) wins.
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 40 })],
      coupon: coupon({ discountValue: 10, allowCombination: false }),
    })
    expect(r.finalTotal).toBe(60)
    expect(r.couponDiscountAmount).toBe(0)
    expect(r.appliedCouponId).toBeNull()
    expect(r.couponReplacedCampaign).toBe(false)
    expect(r.itemDiscountAmount).toBe(40)
    expect(r.itemDiscountSource).toBe("campaign")
  })

  it("allowCombination=false: NEVER acumula — campanha 20% (80) vence cupom R$10 (90)", () => {
    // Produto R$100, Campanha 20% → R$80, Cupom R$10 fixo → R$90
    // Comparação limpa: Cenário A (campanha)=80, Cenário B (cupom sobre 100)=90
    // MENOR = 80 → campanha vence, cupom descartado
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 20 })],
      coupon: coupon({ discountValue: 10, discountType: "fixed", allowCombination: false }),
    })
    expect(r.finalTotal).toBe(80)
    expect(r.itemDiscountAmount).toBe(20)
    expect(r.itemDiscountSource).toBe("campaign")
    expect(r.couponDiscountAmount).toBe(0)
    expect(r.appliedCouponId).toBeNull()
    expect(r.couponReplacedCampaign).toBe(false)
    // Garantia de que NÃO acumulou: subtotal final === campanha pura, sem cupom
    expect(r.subtotal).toBe(80)
  })

  it("allowCombination=false: NEVER acumula — cupom R$20 (80) vence campanha 5% (95)", () => {
    // Produto R$100, Campanha 5% → R$95, Cupom R$20 fixo → R$80
    // Comparação limpa: Cenário A (campanha)=95, Cenário B (cupom sobre 100)=80
    // MENOR = 80 → cupom vence, campanhas revertidas
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 5 })],
      coupon: coupon({ discountValue: 20, discountType: "fixed", allowCombination: false }),
    })
    expect(r.finalTotal).toBe(80)
    expect(r.couponDiscountAmount).toBe(20)
    expect(r.appliedCouponId).toBe("coupon-1")
    expect(r.couponReplacedCampaign).toBe(true)
    expect(r.itemDiscountAmount).toBe(0)      // campanhas revertidas
    expect(r.campaignDiscountAmount).toBe(0)   // campanhas zeradas
    expect(r.appliedPromotionIds).toEqual([])  // nenhuma promoção aplicada
    // Garantia de que NÃO acumulou: subtotal = 100 (original), só cupom agiu
    expect(r.subtotal).toBe(100)
  })

  // ── Step 4: ERP manual discount ───────────────────────────────────────
  it("applies manual discount (fixed) after coupon", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      manualDiscount: { type: "fixed", value: 15 },
    })
    expect(r.finalTotal).toBe(85)
    expect(r.manualDiscountAmount).toBe(15)
  })

  it("applies manual discount (percentage) after coupon", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      manualDiscount: { type: "percentage", value: 10 },
    })
    expect(r.finalTotal).toBe(90)
    expect(r.manualDiscountAmount).toBe(10)
  })

  it("applies manual discount after coupon when both exist", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      coupon: coupon({ discountValue: 10, allowCombination: true }),
      manualDiscount: { type: "fixed", value: 5 },
    })
    // 100 - 10 (coupon) = 90 - 5 (manual) = 85
    expect(r.finalTotal).toBe(85)
    expect(r.couponDiscountAmount).toBe(10)
    expect(r.manualDiscountAmount).toBe(5)
  })

  // ── Step 5: Shipping ───────────────────────────────────────────────────
  it("adds shipping cost", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 15,
    })
    expect(r.shipping).toBe(15)
    expect(r.finalTotal).toBe(115)
  })

  it("zeros shipping when free shipping coupon is applied", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 15,
      coupon: coupon({ discountType: "free_shipping", freeShipping: true, discountValue: null }),
    })
    expect(r.shipping).toBe(0)
    expect(r.freeShippingApplied).toBe(true)
    expect(r.finalTotal).toBe(100)
  })

  // ── Step 6: Additional costs ───────────────────────────────────────────
  it("adds additional costs", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      additionalCosts: 8.5,
    })
    expect(r.additionalCosts).toBe(8.5)
    expect(r.finalTotal).toBe(108.5)
  })

  // ── Step 7: Payment method ─────────────────────────────────────────────
  it("applies payment method discount (Pix)", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      paymentMethod: { discountPercent: 5, feePercent: 0, feeFixed: 0, feeBearer: "merchant" },
    })
    // finalTotal (pre-payment) = 100
    // payment: 5% discount = 5 → finalAmountWithPayment = 95
    expect(r.finalTotal).toBe(100) // unchanged before payment
    expect(r.finalAmountWithPayment).toBe(95)
    expect(r.paymentMethodDiscountAmount).toBe(5)
    expect(r.paymentMethodInterestAmount).toBe(0)
    expect(r.appliedPaymentDiscountPercent).toBe(5)
  })

  it("applies payment method interest (credit card installments)", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      paymentMethod: {
        discountPercent: 0,
        feePercent: 0,
        feeFixed: 0,
        feeBearer: "merchant",
        interestType: "fixed",
        interestValue: 3,
        installmentNumber: 2,
        installmentFees: [{ installmentNumber: 2, feePercent: 2 }],
      },
    })
    // finalTotal = 100
    // interest = fixed(3%) + installment(2%) = 5% → interestAmount = 5
    // finalAmountWithPayment = 105
    expect(r.finalAmountWithPayment).toBe(105)
    expect(r.paymentMethodInterestAmount).toBe(5)
  })

  it("applies payment method fee when feeBearer = customer", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      paymentMethod: {
        discountPercent: 0,
        feePercent: 3.5,
        feeFixed: 1,
        feeBearer: "customer",
      },
    })
    // fee = 3.5% of 100 + 1 = 4.5
    // finalAmountWithPayment = 100 + 4.5 = 104.5
    expect(r.finalAmountWithPayment).toBe(104.5)
    expect(r.paymentMethodFeeAmount).toBe(4.5)
  })

  it("does not add payment method fee when feeBearer = merchant", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 100, quantity: 1 }],
      shippingCost: 0,
      paymentMethod: {
        discountPercent: 0,
        feePercent: 3.5,
        feeFixed: 1,
        feeBearer: "merchant",
      },
    })
    // fee = not passed to customer
    // finalAmountWithPayment = 100
    expect(r.finalAmountWithPayment).toBe(100)
    expect(r.paymentMethodFeeAmount).toBe(4.5) // fee still tracked but not added
  })

  // ── Combination: all steps ─────────────────────────────────────────────
  it("full pipeline: items + campaign + coupon + shipping + costs + payment", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "p1", unitPrice: 200, basePrice: 200, promotionalPrice: 180, quantity: 2 },
        { productId: "p2", unitPrice: 100, basePrice: 100, quantity: 1 },
      ],
      shippingCost: 20,
      additionalCosts: 5,
      promotions: [discountPromotion({ id: "camp-10", discountValue: 10 })], // 10% off on p2 (100→90)
      coupon: coupon({ discountValue: 5, allowCombination: true }),
      paymentMethod: { discountPercent: 3, feePercent: 0, feeFixed: 0, feeBearer: "merchant" },
    })
    // subtotalOriginal = 200*2 + 100 = 500
    // p1: manual (180) vs campaign (200*0.9=180) → tie, manual wins → 180 each → 360
    // p2: unit (100) vs campaign (100*0.9=90) → campaign wins → 90
    // subtotal = 360 + 90 = 450
    // itemDiscount = 500 - 450 = 50
    // coupon: 5% on 450 = 22.5
    // after coupon: 450 - 22.5 = 427.5
    // manual discount: 0
    // shipping: +20 = 447.5
    // costs: +5 = 452.5
    // finalTotal (pre-payment) = 452.5
    // payment: 3% discount on 452.5 = 13.575 → finalAmountWithPayment = 438.925

    expect(r.subtotalOriginal).toBe(500)
    expect(r.subtotal).toBe(450)
    expect(r.itemDiscountAmount).toBe(50)
    expect(r.itemDiscountSource).toBe("hybrid")
    expect(r.couponDiscountAmount).toBeCloseTo(22.5)
    expect(r.shipping).toBe(20)
    expect(r.additionalCosts).toBe(5)
    expect(r.finalTotal).toBeCloseTo(452.5)
    // Payment method rounding may vary by 0.01
    expect(r.finalAmountWithPayment).toBeCloseTo(438.93, 1)
    expect(r.paymentMethodDiscountAmount).toBeCloseTo(13.58)
  })

  // ── Edge cases ─────────────────────────────────────────────────────────
  it("returns zero for completely free items (clamped to min 0.01)", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 0, quantity: 5 }],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(0.05)
    expect(r.minPriceWarning).toBe(true)
  })

  it("handles DISCOUNT with maxDiscountAmount cap", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 1000, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 50, maxDiscountAmount: 100 })], // 50% of 1000 = 500, capped to 100
    })
    expect(r.subtotal).toBe(900) // 1000 - 100
    expect(r.campaignDiscountAmount).toBe(100)
  })

  it("handles DISCOUNT with minSpendAmount (item does not qualify)", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 30, quantity: 1 }],
      shippingCost: 0,
      promotions: [discountPromotion({ discountValue: 10, minSpendAmount: 50 })], // 30 < 50 → does not apply
    })
    expect(r.subtotal).toBe(30) // no discount applied
    expect(r.appliedPromotionIds).toEqual([])
  })

  it("handles FIXED discount with filter (value > unit price → skipped)", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 10, quantity: 1 }],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          discountType: DiscountType.FIXED,
          discountValue: 20, // 20 > 10 → filtered out
        }),
      ],
    })
    expect(r.subtotal).toBe(10)
    expect(r.campaignDiscountAmount).toBe(0)
  })

  it("handles SPECIFIC_PRODUCTS scope", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "p1", unitPrice: 100, quantity: 1 },
        { productId: "p2", unitPrice: 50, quantity: 1 },
      ],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          applyScope: ApplyScope.SPECIFIC_PRODUCTS,
          applicableProductIds: ["p1"],
          discountValue: 20,
        }),
      ],
    })
    // p1: 100 * 0.8 = 80 → campaign
    // p2: 50 (no promo)
    expect(r.subtotal).toBe(130)
    expect(r.campaignDiscountAmount).toBe(20)
  })

  it("handles CATEGORY scope", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "p1", categoryId: "cat-1", unitPrice: 100, quantity: 1 },
        { productId: "p2", categoryId: "cat-2", unitPrice: 50, quantity: 1 },
      ],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          applyScope: ApplyScope.CATEGORY,
          applicableCategoryIds: ["cat-1"],
          discountValue: 15,
        }),
      ],
    })
    expect(r.subtotal).toBe(135) // 85 + 50
    expect(r.campaignDiscountAmount).toBe(15)
  })

  it("handles SPECIFIC_SERVICES scope", () => {
    const r = calculateOrderPricing({
      items: [
        { serviceId: "s1", unitPrice: 200, quantity: 1 },
        { serviceId: "s2", unitPrice: 100, quantity: 1 },
      ],
      shippingCost: 0,
      promotions: [
        discountPromotion({
          applyScope: ApplyScope.SPECIFIC_SERVICES,
          applicableServiceIds: ["s1"],
          discountValue: 25,
        }),
      ],
    })
    // s1: 200 * 0.75 = 150
    // s2: 100
    expect(r.subtotal).toBe(250)
    expect(r.campaignDiscountAmount).toBe(50)
  })

  // ── Integration: mixed product + service (misto) ──────────────────────
  it("handles mixed product + service items (misto)", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "prod-1", unitPrice: 80, quantity: 2 },
        { serviceId: "svc-1", unitPrice: 50, quantity: 1 },
      ],
      shippingCost: 20,
    })
    expect(r.subtotalOriginal).toBe(210) // 160 + 50
    expect(r.subtotal).toBe(210)
    expect(r.shipping).toBe(20)
    expect(r.finalTotal).toBe(230)
    expect(r.finalAmountWithPayment).toBe(230)
  })

  // ── Integration: PDV-like (items + manual fixed discount) ─────────────
  it("handles PDV-like scenario (items + manual discount + shipping)", () => {
    const r = calculateOrderPricing({
      items: [
        { productId: "p1", unitPrice: 100, quantity: 2 },
        { productId: "p2", unitPrice: 50, quantity: 1 },
      ],
      shippingCost: 15,
      manualDiscount: { type: "fixed", value: 30 },
    })
    expect(r.subtotal).toBe(250) // 200 + 50
    expect(r.manualDiscountAmount).toBe(30)
    expect(r.finalTotal).toBe(235) // 250 - 30 + 15
  })

  // ── Integration: agendamentos-like (single service item) ──────────────
  it("handles appointment-like (single service item, no discounts)", () => {
    const r = calculateOrderPricing({
      items: [{ serviceId: "svc-1", unitPrice: 150, quantity: 1 }],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(150)
    expect(r.finalTotal).toBe(150)
    expect(r.finalAmountWithPayment).toBe(150)
    expect(r.pricingVersion).toBe("2.0")
  })

  // ── Integration: recorrentes-like (subscription items) ────────────────
  it("handles recurring subscription-like (multiple qty, no shipping)", () => {
    const r = calculateOrderPricing({
      items: [
        { recurringPlanId: "plan-1", unitPrice: 99.90, quantity: 1 },
      ],
      shippingCost: 0,
    })
    expect(r.subtotal).toBe(99.90)
    expect(r.finalTotal).toBe(99.90)
    expect(r.manualDiscountAmount).toBe(0)
  })

  // ── Integration: payment method discount + interest combined ──────────
  it("combines payment method discount and interest (fixed) correctly", () => {
    const r = calculateOrderPricing({
      items: [{ unitPrice: 500, quantity: 1 }],
      shippingCost: 0,
      paymentMethod: {
        discountPercent: 5,
        interestType: "fixed",
        interestValue: 3, // 3% fixed interest rate
        installmentNumber: 1,
        maxInstallments: 12,
      },
    })
    expect(r.paymentMethodDiscountAmount).toBe(25) // 5% of 500
    expect(r.paymentMethodInterestAmount).toBe(14.25) // 3% of 475 (after discount)
    expect(r.finalAmountWithPayment).toBe(489.25) // 475 + 14.25
  })
})

// ---------------------------------------------------------------------------
// computeItemCampaignPricing
// ---------------------------------------------------------------------------

describe("computeItemCampaignPricing", () => {
  it("returns manual price when no promotion", () => {
    const r = computeItemCampaignPricing(100, null, null)
    expect(r.effectivePrice).toBe(100)
    expect(r.bestPrice).toBe(100)
    expect(r.discountSource).toBe("none")
  })

  it("returns manual promotional price when lower", () => {
    const r = computeItemCampaignPricing(100, 80, null)
    expect(r.effectivePrice).toBe(80)
    expect(r.discountSource).toBe("manual")
  })

  it("applies campaign DISCOUNT percentage on unit price", () => {
    const r = computeItemCampaignPricing(100, null, discountPromotion({ discountValue: 15 }))
    expect(r.bestPrice).toBe(85)
    expect(r.discountSource).toBe("campaign")
  })

  it("compares manual vs campaign and picks the lowest", () => {
    // Manual: 70. Campaign: 80. Best: 70 (manual wins)
    const r = computeItemCampaignPricing(100, 70, discountPromotion({ discountValue: 20 }))
    expect(r.bestPrice).toBe(70)
    expect(r.discountSource).toBe("manual")
  })

  it("picks campaign when campaign is lower than manual", () => {
    // Manual: 90. Campaign: 60. Best: 60 (campaign wins)
    const r = computeItemCampaignPricing(100, 90, discountPromotion({ discountValue: 40 }))
    expect(r.bestPrice).toBe(60)
    expect(r.discountSource).toBe("campaign")
  })

  it("applies maxDiscountAmount cap to campaign discount", () => {
    const r = computeItemCampaignPricing(
      1000, null,
      discountPromotion({ discountValue: 50, maxDiscountAmount: 30 }),
    )
    // 50% of 1000 = 500, capped to 30 → campaign price = 970
    expect(r.bestPrice).toBe(970)
    expect(r.campaignDiscount).toBe(30)
  })

  it("returns none for out-of-scope item", () => {
    const r = computeItemCampaignPricing(100, null, discountPromotion({
      applyScope: ApplyScope.SPECIFIC_PRODUCTS,
      applicableProductIds: ["other-product"],
    }), { productId: "my-product" })
    expect(r.bestPrice).toBe(100)
    expect(r.discountSource).toBe("none")
  })

  it("ignores NON-DISCOUNT promotion types", () => {
    const r = computeItemCampaignPricing(100, null, discountPromotion({
      promotionType: PromotionType.GIFT,
      discountType: null,
      discountValue: null,
    }))
    expect(r.bestPrice).toBe(100)
    expect(r.discountSource).toBe("none")
  })

  it("enforces minimum price of R$ 0.01", () => {
    const r = computeItemCampaignPricing(1, null, discountPromotion({ discountValue: 99 }))
    expect(r.bestPrice).toBe(0.01)
  })
})
