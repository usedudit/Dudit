/**
 * ============================================================================
 * UNIFIED PRICING ENGINE
 * ============================================================================
 *
 * Single source of truth for all pricing calculations across the platform:
 *   - ERP Orders
 *   - POS (PDV)
 *   - Marketplace Checkout
 *
 * This is a PURE function with zero side effects and zero DB calls.
 * It runs identically on client and server.
 *
 * ORDER OF OPERATIONS (fixed):
 *   1. Compute subtotal from items (using promotional price when lower)
 *   2. Apply manual discount sequentially
 *   3. Apply coupon discount sequentially
 *   4. Add shipping (zeroed if coupon grants free shipping)
 *   5. Add additional costs
 *   6. Clamp final total to max(0, result)
 *
 * SAFETY RULES:
 *   - Final total is NEVER negative
 *   - Shipping is zeroed exactly once for free-shipping coupons
 *   - max_discount_value is strictly enforced on coupon discounts
 *   - All monetary values are rounded to 2 decimal places
 * ============================================================================
 */

import { PricingPromotion, PromotionType, DiscountType, ApplyScope } from "@/lib/types/promotion"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PricingItem = {
  productId?: string | null
  serviceId?: string | null
  unitPrice: number
  quantity: number
  /** Product-level promotional price (used instead of unitPrice when lower) */
  promotionalPrice?: number | null
  categoryId?: string | null
}

export type PricingCoupon = {
  id: string
  discountType: "percentage" | "fixed" | "free_shipping"
  discountValue: number | null
  maxDiscountValue: number | null
  freeShipping: boolean
  allowCombination?: boolean
}

export type PricingInput = {
  items: PricingItem[]
  shippingCost: number
  additionalCosts?: number
  /** Manual discount applied by the user (ERP/POS discount field) */
  manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
  /** Pre-validated coupon data (null = no coupon) */
  coupon?: PricingCoupon | null
  /** Pre-loaded promotion data */
  promotions?: PricingPromotion[] | null
}

export type PricingResult = {
  /** Sum of effective unit prices × quantities */
  subtotal: number
  /** Savings from promotional prices vs original prices */
  promotionSavings: number
  /** Manual discount amount (from discount field) */
  manualDiscountAmount: number
  /** Coupon discount amount */
  couponDiscountAmount: number
  /** Campaign/Promotion discount amount */
  promotionDiscountAmount: number
  /** Total of all discounts combined */
  totalDiscounts: number
  /** Final shipping value (0 if free shipping coupon/promotion) */
  shipping: number
  /** Other costs passed through */
  additionalCosts: number
  /** max(0, subtotal - discounts + shipping + additionalCosts) */
  finalTotal: number
  /** ID of the applied coupon (null if none) */
  appliedCouponId: string | null
  /** Whether free shipping was applied */
  freeShippingApplied: boolean
  /** List of applied promotion IDs */
  appliedPromotionIds: string[]
  /** List of gift product IDs earned from promotions */
  appliedGiftProductIds: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places using banker's rounding */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Clamp a number to a minimum of 0 */
function clampMin0(n: number): number {
  return Math.max(0, n)
}

/** Get the effective unit price considering promotional price */
function effectiveUnitPrice(item: PricingItem): number {
  if (
    item.promotionalPrice != null &&
    Number.isFinite(item.promotionalPrice) &&
    item.promotionalPrice > 0 &&
    item.promotionalPrice < item.unitPrice
  ) {
    return item.promotionalPrice
  }
  return item.unitPrice
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

function isItemInScope(
  item: CartUnit,
  applyScope: ApplyScope,
  applicableProductIds?: string[] | null,
  applicableCategoryIds?: string[] | null
): boolean {
  if (applyScope === ApplyScope.ENTIRE_CART) {
    return true
  }
  if (applyScope === ApplyScope.SPECIFIC_PRODUCTS) {
    return Boolean(item.productId && applicableProductIds?.includes(item.productId))
  }
  if (applyScope === ApplyScope.CATEGORY) {
    return Boolean(item.categoryId && applicableCategoryIds?.includes(item.categoryId))
  }
  return false
}

interface CartUnit {
  productId?: string | null
  categoryId?: string | null
  originalPrice: number
  currentPrice: number
}

export function calculateOrderPricing(input: PricingInput): PricingResult {
  const items = input.items || []
  const rawShipping = clampMin0(Number(input.shippingCost) || 0)
  const rawAdditionalCosts = clampMin0(Number(input.additionalCosts) || 0)

  // ── Step 1: Subtotal ──────────────────────────────────────────────────
  let subtotal = 0
  let promotionSavings = 0

  for (const item of items) {
    const qty = clampMin0(Number(item.quantity) || 0)
    const originalPrice = clampMin0(Number(item.unitPrice) || 0)
    const effective = clampMin0(effectiveUnitPrice(item))

    subtotal += round2(effective * qty)
    promotionSavings += round2((originalPrice - effective) * qty)
  }

  subtotal = round2(subtotal)
  promotionSavings = round2(clampMin0(promotionSavings))

  // Construct individual units for promotion and coupon calculations
  const units: CartUnit[] = []
  for (const item of items) {
    const qty = clampMin0(Number(item.quantity) || 0)
    const effective = clampMin0(effectiveUnitPrice(item))
    for (let i = 0; i < qty; i++) {
      units.push({
        productId: item.productId || null,
        categoryId: item.categoryId || null,
        originalPrice: effective,
        currentPrice: effective,
      })
    }
  }

  // ── Step 2: Promotions/Campaigns ──────────────────────────────────────
  const appliedPromotionIds: string[] = []
  const appliedGiftProductIds: string[] = []
  let promotionDiscountAmount = 0
  let freeShippingApplied = false

  const sortedPromotions = [...(input.promotions || [])].sort((a, b) => b.priority - a.priority)

  for (const promo of sortedPromotions) {
    // Stacking check:
    // If coupon is present and does not allow combination, skip all promotions.
    // If promotion does not allow combination with coupons, skip this promotion.
    if (input.coupon) {
      if (input.coupon.allowCombination === false) {
        continue
      }
      if (promo.allowCouponCombination === false) {
        continue
      }
    }

    // Filter units in scope
    const eligibleUnits = units.filter((u) =>
      isItemInScope(u, promo.applyScope, promo.applicableProductIds, promo.applicableCategoryIds)
    )

    if (eligibleUnits.length === 0) {
      continue
    }

    // Check minSpendAmount against eligible units original subtotal
    const eligibleSubtotal = eligibleUnits.reduce((sum, u) => sum + u.originalPrice, 0)
    if (promo.minSpendAmount != null && eligibleSubtotal < promo.minSpendAmount) {
      continue
    }

    if (promo.promotionType === PromotionType.GIFT) {
      if (promo.giftProductId) {
        appliedGiftProductIds.push(promo.giftProductId)
        appliedPromotionIds.push(promo.id)
      }
    } else if (promo.promotionType === PromotionType.FREE_SHIPPING) {
      freeShippingApplied = true
      appliedPromotionIds.push(promo.id)
    } else if (promo.promotionType === PromotionType.BUY_X_PAY_Y) {
      const buyQty = promo.buyQuantity || 1
      const payQty = promo.payQuantity || 1
      if (buyQty > payQty) {
        // Sort units by currentPrice ascending so that the cheapest units are discounted first
        eligibleUnits.sort((a, b) => a.currentPrice - b.currentPrice)
        const totalEligibleQty = eligibleUnits.length
        const freeUnitsCount = Math.floor(totalEligibleQty / buyQty) * (buyQty - payQty)

        let promoApplied = false
        for (let i = 0; i < freeUnitsCount; i++) {
          const unit = eligibleUnits[i]
          if (unit.currentPrice > 0) {
            promotionDiscountAmount += unit.currentPrice
            unit.currentPrice = 0
            promoApplied = true
          }
        }
        if (promoApplied || freeUnitsCount > 0) {
          appliedPromotionIds.push(promo.id)
        }
      }
    } else if (promo.promotionType === PromotionType.DISCOUNT) {
      let discountAmt = 0
      const currentEligibleSubtotal = eligibleUnits.reduce((sum, u) => sum + u.currentPrice, 0)

      if (currentEligibleSubtotal > 0) {
        if (promo.discountType === DiscountType.PERCENTAGE && promo.discountValue) {
          const pct = Math.min(100, Math.max(0, promo.discountValue))
          discountAmt = currentEligibleSubtotal * (pct / 100)
        } else if (promo.discountType === DiscountType.FIXED && promo.discountValue) {
          discountAmt = Math.min(promo.discountValue, currentEligibleSubtotal)
        }

        if (promo.maxDiscountAmount != null && promo.maxDiscountAmount > 0) {
          discountAmt = Math.min(discountAmt, promo.maxDiscountAmount)
        }

        discountAmt = round2(discountAmt)

        if (discountAmt > 0) {
          // Distribute discount proportionally across currentPrice of units
          let remainingDiscount = discountAmt
          for (let i = 0; i < eligibleUnits.length; i++) {
            const unit = eligibleUnits[i]
            if (unit.currentPrice > 0) {
              const share = round2((unit.currentPrice / currentEligibleSubtotal) * discountAmt)
              const actualDiscount = Math.min(share, unit.currentPrice, remainingDiscount)
              unit.currentPrice = round2(unit.currentPrice - actualDiscount)
              remainingDiscount = round2(remainingDiscount - actualDiscount)
            }
          }

          // Clean up rounding remainder
          if (remainingDiscount > 0) {
            for (const unit of eligibleUnits) {
              if (unit.currentPrice >= remainingDiscount) {
                unit.currentPrice = round2(unit.currentPrice - remainingDiscount)
                remainingDiscount = 0
                break
              }
            }
          }

          promotionDiscountAmount += discountAmt
          appliedPromotionIds.push(promo.id)
        }
      }
    }
  }

  promotionDiscountAmount = round2(clampMin0(promotionDiscountAmount))
  let currentTotal = round2(clampMin0(subtotal - promotionDiscountAmount))

  // ── Step 3: Manual Discount ───────────────────────────────────────────
  let manualDiscountAmount = 0

  if (input.manualDiscount && input.manualDiscount.value > 0) {
    const { type, value } = input.manualDiscount

    if (type === "percentage") {
      const pct = Math.min(100, Math.max(0, value))
      manualDiscountAmount = round2(currentTotal * (pct / 100))
    } else {
      manualDiscountAmount = round2(Math.min(value, currentTotal))
    }
  }

  manualDiscountAmount = round2(clampMin0(manualDiscountAmount))
  currentTotal = round2(clampMin0(currentTotal - manualDiscountAmount))

  // ── Step 4: Coupon Discount ───────────────────────────────────────────
  let couponDiscountAmount = 0
  let appliedCouponId: string | null = null

  if (input.coupon) {
    const coupon = input.coupon
    appliedCouponId = coupon.id

    const hasManualDiscount = manualDiscountAmount > 0
    const hasPromotionSavings = promotionSavings > 0
    const hasCampaignPromotions = promotionDiscountAmount > 0
    const isCombinationBlocked = coupon.allowCombination === false && (hasManualDiscount || hasPromotionSavings || hasCampaignPromotions)

    if (!isCombinationBlocked) {
      if (coupon.discountType === "percentage" && coupon.discountValue) {
        const pct = Math.min(100, Math.max(0, coupon.discountValue))
        couponDiscountAmount = round2(currentTotal * (pct / 100))
      } else if (coupon.discountType === "fixed" && coupon.discountValue) {
        couponDiscountAmount = round2(Math.min(coupon.discountValue, currentTotal))
      }

      // Enforce max_discount_value cap
      if (
        coupon.maxDiscountValue != null &&
        coupon.maxDiscountValue > 0 &&
        couponDiscountAmount > coupon.maxDiscountValue
      ) {
        couponDiscountAmount = round2(coupon.maxDiscountValue)
      }

      // Free shipping
      if (coupon.freeShipping || coupon.discountType === "free_shipping") {
        freeShippingApplied = true
      }
    }
  }

  couponDiscountAmount = round2(clampMin0(couponDiscountAmount))
  currentTotal = round2(clampMin0(currentTotal - couponDiscountAmount))

  // ── Step 5: Shipping ──────────────────────────────────────────────────
  const shipping = freeShippingApplied ? 0 : round2(rawShipping)

  // ── Step 6: Additional Costs ──────────────────────────────────────────
  const additionalCosts = round2(rawAdditionalCosts)

  // ── Step 7: Final Total (never negative) ──────────────────────────────
  const totalDiscounts = round2(manualDiscountAmount + couponDiscountAmount + promotionDiscountAmount)
  currentTotal = round2(clampMin0(currentTotal + shipping))
  currentTotal = round2(clampMin0(currentTotal + additionalCosts))
  const finalTotal = round2(clampMin0(currentTotal))

  return {
    subtotal,
    promotionSavings,
    manualDiscountAmount,
    couponDiscountAmount,
    promotionDiscountAmount,
    totalDiscounts,
    shipping,
    additionalCosts,
    finalTotal,
    appliedCouponId,
    freeShippingApplied,
    appliedPromotionIds,
    appliedGiftProductIds,
  }
}
