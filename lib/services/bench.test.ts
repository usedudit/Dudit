import { describe, it } from "vitest"
import { computeItemDisplayPrice, findBestItemPrice, getPricingCallStats, resetPricingCallStats } from "./pricing-engine"
import { PromotionType, DiscountType, ApplyScope, type PricingPromotion } from "@/lib/types/promotion"

// Generate mock promotions
const mockPromotions: PricingPromotion[] = Array.from({ length: 20 }, (_, idx) => ({
  id: `promo-${idx}`,
  campaignId: `camp-${idx}`,
  partnerId: `partner-1`,
  name: `Promo ${idx}`,
  promotionType: PromotionType.DISCOUNT,
  discountType: idx % 2 === 0 ? DiscountType.PERCENTAGE : DiscountType.FIXED,
  discountValue: idx % 2 === 0 ? 10 : 5,
  priority: idx,
  applyScope: idx % 4 === 0 ? ApplyScope.ENTIRE_CART
    : idx % 4 === 1 ? ApplyScope.SPECIFIC_PRODUCTS
    : idx % 4 === 2 ? ApplyScope.CATEGORY
    : ApplyScope.SPECIFIC_SERVICES,
  applicableProductIds: idx % 4 === 1 ? [`prod-${idx}`, `prod-${idx + 1}`] : [],
  applicableCategoryIds: idx % 4 === 2 ? [`cat-${idx}`, `cat-${idx + 1}`] : [],
  applicableServiceIds: idx % 4 === 3 ? [`svc-${idx}`, `svc-${idx + 1}`] : [],
  allowCouponCombination: true,
}))

// Generate mock items
const mockProducts = Array.from({ length: 50 }, (_, idx) => ({
  id: `prod-${idx}`,
  price: 10 + idx * 5,
  promotional_price: idx % 5 === 0 ? 5 + idx * 5 : null,
  category_id: `cat-${idx}`,
  name: `Product ${idx}`,
}))

const mockServices = Array.from({ length: 30 }, (_, idx) => ({
  id: `svc-${idx}`,
  price: 20 + idx * 10,
  promotional_price: idx % 6 === 0 ? 10 + idx * 10 : null,
  category_id: `cat-${idx}`,
  name: `Service ${idx}`,
}))

describe("Baseline Pricing Telemetry Profiling", () => {
  it("Profile Homepage & VendorPage Cards Render (50 product cards + 30 service cards)", () => {
    resetPricingCallStats()
    const startTime = performance.now()

    // Simulate rendering each card on Homepage/VendorPage
    for (const prod of mockProducts) {
      const basePrice = prod.price
      const individualPromo = prod.promotional_price
      computeItemDisplayPrice(basePrice, individualPromo, mockPromotions, {
        productId: prod.id,
        categoryId: prod.category_id,
      })
    }

    for (const svc of mockServices) {
      const basePrice = svc.price
      const individualPromo = svc.promotional_price
      computeItemDisplayPrice(basePrice, individualPromo, mockPromotions, {
        serviceId: svc.id,
        categoryId: svc.category_id,
      })
    }

    const duration = performance.now() - startTime
    const stats = getPricingCallStats()

    console.log("=========================================")
    console.log("HOMEPAGE & VENDORPAGE RENDER PROFILE:")
    console.log(`- computeItemDisplayPrice calls: ${stats.computeCount}`)
    console.log(`- findBestItemPrice calls: ${stats.findBestCount}`)
    console.log(`- campaignPricingCount calls: ${stats.campaignPricingCount}`)
    console.log(`- Duration: ${duration.toFixed(3)}ms`)
    console.log("=========================================")
  })

  it("Profile ERP Search / PDV Catalog typing (typing triggers renders of filtered results)", () => {
    resetPricingCallStats()
    const startTime = performance.now()

    // Simulate typing: user types and gets 15 filtered products, rendering them 5 times (5 keystrokes)
    const filtered = mockProducts.slice(0, 15)
    for (let keystroke = 0; keystroke < 5; keystroke++) {
      for (const prod of filtered) {
        computeItemDisplayPrice(prod.price, prod.promotional_price, mockPromotions, {
          productId: prod.id,
          categoryId: prod.category_id,
        })
      }
    }

    const duration = performance.now() - startTime
    const stats = getPricingCallStats()

    console.log("=========================================")
    console.log("ERP SEARCH / PDV TYPING PROFILE:")
    console.log(`- computeItemDisplayPrice calls: ${stats.computeCount}`)
    console.log(`- findBestItemPrice calls: ${stats.findBestCount}`)
    console.log(`- campaignPricingCount calls: ${stats.campaignPricingCount}`)
    console.log(`- Duration: ${duration.toFixed(3)}ms`)
    console.log("=========================================")
  })
})
