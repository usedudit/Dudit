import { describe, it, expect } from "vitest"
import { computeItemDisplayPrice, calculateOrderPricing } from "./pricing-engine"
import { PromotionType, DiscountType, ApplyScope, type PricingPromotion } from "@/lib/types/promotion"

describe("Pricing Calculations Across All Surfaces", () => {
  // Scenario Context: Product with price = 15.00, promotional_price = 9.90, campaign = 10% off
  const dbProduct = {
    id: "prod-123",
    price: 15.00,
    promotional_price: 9.90,
  }

  const dbService = {
    id: "svc-123",
    price: 15.00,
    promotional_price: 9.90,
  }

  const campaign10Percent: PricingPromotion = {
    id: "promo-camp",
    campaignId: "camp-1",
    partnerId: "partner-1",
    name: "10% Off Campanha",
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
  }

  const campaign20Percent: PricingPromotion = {
    id: "promo-camp-20",
    campaignId: "camp-2",
    partnerId: "partner-1",
    name: "20% Off Campanha",
    promotionType: PromotionType.DISCOUNT,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 20,
    maxDiscountAmount: null,
    minSpendAmount: null,
    giftProductId: null,
    giftServiceId: null,
    buyQuantity: null,
    payQuantity: null,
    priority: 1,
    applyScope: ApplyScope.ENTIRE_CART,
    allowCouponCombination: true,
  }

  const promotionsList = [campaign10Percent]

  it("Surface 1: Marketplace ItemCard", () => {
    // Marketplace ItemCard maps db columns like:
    const basePrice = Number(dbProduct.promotional_price ? dbProduct.price : dbProduct.price)
    const individualPromo = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : null
    
    // In shared-components.tsx:
    // const basePrice = Number(product.originalPrice) || Number(product.price) || 0
    // const individualPromo = product.originalPrice ? Number(product.price) : null
    // (where originalPrice is mapped to price, and price is mapped to promotional_price)
    const mappedProductForMarketplaceItemCard = {
      id: dbProduct.id,
      originalPrice: dbProduct.price,
      price: dbProduct.promotional_price,
    }

    const mBasePrice = Number(mappedProductForMarketplaceItemCard.originalPrice) || Number(mappedProductForMarketplaceItemCard.price) || 0
    const mIndividualPromo = mappedProductForMarketplaceItemCard.originalPrice ? Number(mappedProductForMarketplaceItemCard.price) : null

    const pr = computeItemDisplayPrice(mBasePrice, mIndividualPromo, promotionsList, { productId: dbProduct.id })

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("Surface 2: Checkout (checkout-context.ts)", () => {
    // Checkout maps and calculates using computeItemDisplayPrice directly:
    const basePrice = Number(dbProduct.price || 0)
    const individualPromo = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : null

    const pr = computeItemDisplayPrice(basePrice, individualPromo, promotionsList, { productId: dbProduct.id })

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("Surface 3: PDV (POSPage.tsx)", () => {
    // POSPage product selection / card rendering logic:
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0
    const pr = computeItemDisplayPrice(
      Number(dbProduct.price || 0),
      promoPrice > 0 && promoPrice < Number(dbProduct.price || 0) ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("Surface 4: Novo Pedido (CreateOrder.tsx / OrderGeneralTab.tsx)", () => {
    // CreateOrder / OrderGeneralTab product selection/search logic:
    const pr = computeItemDisplayPrice(
      Number(dbProduct.price || 0),
      dbProduct.promotional_price && Number(dbProduct.promotional_price) < Number(dbProduct.price || 0) ? Number(dbProduct.promotional_price) : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("Surface 5: Novo Orçamento (QuoteEditor.tsx)", () => {
    // QuoteEditor pricing rendering:
    const pr = computeItemDisplayPrice(
      Number(dbProduct.price || 0),
      dbProduct.promotional_price && Number(dbProduct.promotional_price) < Number(dbProduct.price || 0) ? Number(dbProduct.promotional_price) : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("Surface 6: AppointmentSheet (AppointmentSheet.tsx)", () => {
    // AppointmentSheet pricing rendering for services:
    const pr = computeItemDisplayPrice(
      Number(dbService.price || 0),
      dbService.promotional_price && Number(dbService.promotional_price) < Number(dbService.price || 0) ? Number(dbService.promotional_price) : null,
      promotionsList,
      { serviceId: dbService.id }
    )

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  // ── Issue 2: POS Cart + Pricing Alignment ──────────────────────────────

  it("POS cart item uses promotional winner when adding non-variant product", () => {
    // Simulates the new addToCart flow: listUnit = price, then computeItemDisplayPrice
    const listUnit = Number(dbProduct.price || 0)
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0
    const effectiveUnit = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    ).bestPrice

    // Card display (Surface 3) also uses the same logic
    const cardPrice = computeItemDisplayPrice(
      Number(dbProduct.price || 0),
      promoPrice > 0 && promoPrice < Number(dbProduct.price || 0) ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    ).bestPrice

    expect(effectiveUnit).toBe(9.90)
    expect(cardPrice).toBe(9.90)
    expect(effectiveUnit).toBe(cardPrice)
  })

  it("POS cart item uses campaign winner when campaign beats promotional price", () => {
    // Product with price=100, promotional_price=90, campaign=50% off → campaign wins (50)
    const prod2 = { id: "prod-456", price: 100.00, promotional_price: 90.00 }
    const campaign50Percent: PricingPromotion = {
      id: "promo-camp-50",
      campaignId: "camp-50",
      partnerId: "partner-1",
      name: "50% Off",
      promotionType: PromotionType.DISCOUNT,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 50,
      maxDiscountAmount: null,
      minSpendAmount: null,
      giftProductId: null,
      giftServiceId: null,
      buyQuantity: null,
      payQuantity: null,
      priority: 1,
      applyScope: ApplyScope.ENTIRE_CART,
      allowCouponCombination: true,
    }

    const listUnit = Number(prod2.price || 0)
    const promoPrice = prod2.promotional_price ? Number(prod2.promotional_price) : 0
    const pr = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      [campaign50Percent],
      { productId: prod2.id }
    )

    // campaign 50% off 100 = 50, promotional = 90 → campaign wins (50)
    expect(pr.bestPrice).toBe(50.00)
    expect(pr.discountSource).toBe("campaign")
    expect(pr.badgeVariant).toBe("blue")
  })

  it("POS cart item for variant products uses computeItemDisplayPrice", () => {
    // Variant: product.price=15.00 + variant.price_adjustment=2.00 → listUnit=17.00
    // promotional_price=9.90 < 17.00 → wins
    const listUnit = Number(dbProduct.price || 0) + 2.00
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0
    const pr = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    expect(pr.bestPrice).toBe(9.90)
    expect(pr.discountSource).toBe("manual")
    expect(pr.badgeVariant).toBe("orange")
  })

  it("POS cart item for variant products with campaign beating variant base price", () => {
    // Variant: product.price=100 + variant.price_adjustment=50 → listUnit=150
    // No promotional price. Campaign = 20% off → 120
    const listUnit = 100 + 50
    const pr = computeItemDisplayPrice(
      listUnit,
      null,
      [campaign20Percent],
      { productId: "prod-789" }
    )

    expect(pr.bestPrice).toBe(120.00)
    expect(pr.discountSource).toBe("campaign")
    expect(pr.badgeVariant).toBe("blue")
  })

  it("POS cart price matches card price for same product (no variants)", () => {
    const listUnit = Number(dbProduct.price || 0)
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0

    // Card display
    const cardPr = computeItemDisplayPrice(
      Number(dbProduct.price || 0),
      promoPrice > 0 && promoPrice < Number(dbProduct.price || 0) ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    // Cart add (using listUnit which equals price for non-variants)
    const cartPr = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    )

    expect(cartPr.bestPrice).toBe(cardPr.bestPrice)
    expect(cartPr.discountSource).toBe(cardPr.discountSource)
    expect(cartPr.badgeVariant).toBe(cardPr.badgeVariant)
  })

  it("POS final sale pricing matches cart pricing via calculateOrderPricing", () => {
    const listUnit = Number(dbProduct.price || 0)
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0
    const cartPrice = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    ).bestPrice

    // simulate the order pricing pipeline
    const pricingResult = calculateOrderPricing({
      items: [{ productId: dbProduct.id, unitPrice: cartPrice, quantity: 1 }],
      shippingCost: 0,
      additionalCosts: 0,
    })

    expect(pricingResult.subtotal).toBe(9.90)
    expect(pricingResult.finalTotal).toBe(9.90)
    expect(pricingResult.itemDiscountSource).toBe("none")
  })

  it("POS-generated order preserves winning price in order_items", () => {
    const listUnit = Number(dbProduct.price || 0)
    const promoPrice = dbProduct.promotional_price ? Number(dbProduct.promotional_price) : 0
    const cartPrice = computeItemDisplayPrice(
      listUnit,
      promoPrice > 0 && promoPrice < listUnit ? promoPrice : null,
      promotionsList,
      { productId: dbProduct.id }
    ).bestPrice

    // Simulates syncPosSaleToOrders: reads sale_items.unit_price and passes to order_items.product_price
    const orderItemPrice = cartPrice

    expect(orderItemPrice).toBe(9.90)
  })

  it("Product with variants and price = 0 resolves lowest variant price", () => {
    const productWithVariants = {
      id: "prod-var-1",
      name: "Camiseta Personalizada",
      price: 0,
      promotional_price: null,
      product_variants: [
        { id: "v1", variant_name: "G", price_adjustment: 45.00, is_active: true },
        { id: "v2", variant_name: "P", price_adjustment: 32.50, is_active: true },
        { id: "v3", variant_name: "M", price_adjustment: 40.00, is_active: true },
        { id: "v4", variant_name: "GG Inativo", price_adjustment: 20.00, is_active: false },
      ],
    }

    const activeVariants = productWithVariants.product_variants.filter(v => v.is_active !== false)
    const prices = activeVariants.map(v => Number(v.price_adjustment || 0)).filter(p => p > 0)
    const lowestVariantPrice = Math.min(...prices)

    expect(lowestVariantPrice).toBe(32.50)

    const pr = computeItemDisplayPrice(
      lowestVariantPrice,
      null,
      [],
      { productId: productWithVariants.id }
    )

    expect(pr.bestPrice).toBe(32.50)
  })

  it("Product with fallback_variant_price renders proper price in ItemCard pricing logic", () => {
    const productFromExploreOrDiscover = {
      id: "prod-var-2",
      name: "Tênis Esportivo",
      price: 129.90, // already normalized to lowest variant price
      fallback_variant_price: 129.90,
      originalPrice: undefined,
    }

    const effectivePrice = productFromExploreOrDiscover.price
    const pr = computeItemDisplayPrice(
      effectivePrice,
      null,
      [],
      { productId: productFromExploreOrDiscover.id }
    )

    expect(pr.bestPrice).toBe(129.90)
  })
})

