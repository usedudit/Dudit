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
 *   2. Apply manual discount (fixed or percentage)
 *   3. Apply coupon discount (percentage/fixed, capped by max_discount_value)
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
}

export type PricingCoupon = {
  id: string
  discountType: "percentage" | "fixed" | "free_shipping"
  discountValue: number | null
  maxDiscountValue: number | null
  freeShipping: boolean
}

export type PricingInput = {
  items: PricingItem[]
  shippingCost: number
  additionalCosts?: number
  /** Manual discount applied by the user (ERP/POS discount field) */
  manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
  /** Pre-validated coupon data (null = no coupon) */
  coupon?: PricingCoupon | null
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
  /** Total of all discounts combined */
  totalDiscounts: number
  /** Final shipping value (0 if free shipping coupon) */
  shipping: number
  /** Other costs passed through */
  additionalCosts: number
  /** max(0, subtotal - discounts + shipping + additionalCosts) */
  finalTotal: number
  /** ID of the applied coupon (null if none) */
  appliedCouponId: string | null
  /** Whether free shipping was applied */
  freeShippingApplied: boolean
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

  // ── Step 2: Manual Discount ───────────────────────────────────────────
  let manualDiscountAmount = 0

  if (input.manualDiscount && input.manualDiscount.value > 0) {
    const { type, value } = input.manualDiscount

    if (type === "percentage") {
      const pct = Math.min(100, Math.max(0, value))
      manualDiscountAmount = round2(subtotal * (pct / 100))
    } else {
      manualDiscountAmount = round2(Math.min(value, subtotal))
    }
  }

  manualDiscountAmount = round2(clampMin0(manualDiscountAmount))

  // Remaining after manual discount
  const afterManual = round2(clampMin0(subtotal - manualDiscountAmount))

  // ── Step 3: Coupon Discount ───────────────────────────────────────────
  let couponDiscountAmount = 0
  let appliedCouponId: string | null = null
  let freeShippingApplied = false

  if (input.coupon) {
    const coupon = input.coupon
    appliedCouponId = coupon.id

    if (coupon.discountType === "percentage" && coupon.discountValue) {
      const pct = Math.min(100, Math.max(0, coupon.discountValue))
      couponDiscountAmount = round2(afterManual * (pct / 100))
    } else if (coupon.discountType === "fixed" && coupon.discountValue) {
      couponDiscountAmount = round2(Math.min(coupon.discountValue, afterManual))
    }
    // free_shipping type: discount is 0 on items, but shipping is zeroed below

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

  couponDiscountAmount = round2(clampMin0(couponDiscountAmount))

  // ── Step 4: Shipping ──────────────────────────────────────────────────
  const shipping = freeShippingApplied ? 0 : round2(rawShipping)

  // ── Step 5: Additional Costs ──────────────────────────────────────────
  const additionalCosts = round2(rawAdditionalCosts)

  // ── Step 6: Final Total (never negative) ──────────────────────────────
  const totalDiscounts = round2(manualDiscountAmount + couponDiscountAmount)
  const finalTotal = round2(
    clampMin0(subtotal - totalDiscounts + shipping + additionalCosts)
  )

  return {
    subtotal,
    promotionSavings,
    manualDiscountAmount,
    couponDiscountAmount,
    totalDiscounts,
    shipping,
    additionalCosts,
    finalTotal,
    appliedCouponId,
    freeShippingApplied,
  }
}
