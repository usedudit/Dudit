import { describe, it, expect } from "vitest"
import { computeItemDisplayPrice } from "./pricing-engine"
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
})
