/**
 * ============================================================================
 * UNIFIED PRICING ENGINE
 * ============================================================================
 *
 * Single source of truth for all pricing calculations across the platform:
 *   - Marketplace Checkout / Cart
 *   - Orders (ERP)
 *   - POS (PDV)
 *   - Agendamentos
 *   - Assinaturas
 *
 * Pure function – zero side effects, zero DB calls, runs identically on
 * client and server.
 *
 * ORDER OF OPERATIONS (fixed - NEVER reorder):
 *   1. subtotalOriginal = sum of basePrice × quantity (before any discount)
 *   2. Best item price = per-item min(unitPrice, manualPrice, campaignPrice)
 *   3. ERP manual discount (optional, applied on top of step 2)
 *   4. Coupon discount (with scenario comparison when allowCombination=false)
 *   5. Shipping (zeroed if free shipping applies from coupon or campaign)
 *   6. Additional costs
 *   7. Payment method discount / interest / fee
 *   8. finalTotal (never negative)
 *
 * ACCUMULATION RULES:
 *   - Manual promo (promotionalPrice) and campaign discounts NEVER stack on
 *     the same item; the engine always picks the lower effective price.
 *   - Coupon with allowCombination=true stacks on top of item discounts.
 *   - Coupon with allowCombination=false compares two full scenarios and
 *     picks the cheaper one for the customer.
 *   - Payment method calculation runs LAST, on the total after all other
 *     discounts, shipping and costs.
 * ============================================================================
 */

import { PricingPromotion, PromotionType, DiscountType, ApplyScope, CampaignCategory, getCampaignCategory } from "@/lib/types/promotion"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"

const sortedPromotionsCache = new WeakMap<PricingPromotion[], PricingPromotion[]>()
const emptyPromoArray: PricingPromotion[] = []

export function getSortedPromotions(promotions: PricingPromotion[] | null | undefined): PricingPromotion[] {
  const promoArray = promotions || emptyPromoArray
  let cached = sortedPromotionsCache.get(promoArray)
  if (!cached) {
    cached = [...promoArray].sort((a, b) => b.priority - a.priority)
    sortedPromotionsCache.set(promoArray, cached)
  }
  return cached
}

interface IndexedPromotions {
  byProduct: Map<string, PricingPromotion[]>
  byService: Map<string, PricingPromotion[]>
  byCategory: Map<string, PricingPromotion[]>
  entireCart: PricingPromotion[]
}

const promotionIndexCache = new WeakMap<PricingPromotion[], IndexedPromotions>()

function getIndexedPromotions(promotions: PricingPromotion[]): IndexedPromotions {
  const promoArray = promotions || emptyPromoArray
  let cached = promotionIndexCache.get(promoArray)
  if (!cached) {
    const byProduct = new Map<string, PricingPromotion[]>()
    const byService = new Map<string, PricingPromotion[]>()
    const byCategory = new Map<string, PricingPromotion[]>()
    const entireCart: PricingPromotion[] = []

    for (const promo of promoArray) {
      if (promo.applyScope === ApplyScope.ENTIRE_CART) {
        entireCart.push(promo)
      } else if (promo.applyScope === ApplyScope.SPECIFIC_PRODUCTS && promo.applicableProductIds) {
        for (const pid of promo.applicableProductIds) {
          if (!byProduct.has(pid)) byProduct.set(pid, [])
          byProduct.get(pid)!.push(promo)
        }
      } else if (promo.applyScope === ApplyScope.SPECIFIC_SERVICES && promo.applicableServiceIds) {
        for (const sid of promo.applicableServiceIds) {
          if (!byService.has(sid)) byService.set(sid, [])
          byService.get(sid)!.push(promo)
        }
      } else if (promo.applyScope === ApplyScope.CATEGORY && promo.applicableCategoryIds) {
        for (const cid of promo.applicableCategoryIds) {
          if (!byCategory.has(cid)) byCategory.set(cid, [])
          byCategory.get(cid)!.push(promo)
        }
      }
    }

    cached = { byProduct, byService, byCategory, entireCart }
    promotionIndexCache.set(promoArray, cached)
  }
  return cached
}

const promoSetsCache = new WeakMap<PricingPromotion, {
  products: Set<string>
  categories: Set<string>
  services: Set<string>
}>()

function getPromoSets(promo: PricingPromotion) {
  let cached = promoSetsCache.get(promo)
  if (!cached) {
    cached = {
      products: new Set(promo.applicableProductIds || []),
      categories: new Set(promo.applicableCategoryIds || []),
      services: new Set(promo.applicableServiceIds || []),
    }
    promoSetsCache.set(promo, cached)
  }
  return cached
}

const promotionMapCache = new WeakMap<PricingPromotion[], Map<string, PricingPromotion>>()

function getPromotionMap(promotions: PricingPromotion[]): Map<string, PricingPromotion> {
  const promoArray = promotions || emptyPromoArray
  let cached = promotionMapCache.get(promoArray)
  if (!cached) {
    cached = new Map()
    for (const p of promoArray) {
      cached.set(p.id, p)
    }
    promotionMapCache.set(promoArray, cached)
  }
  return cached
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PricingItem = {
  productId?: string | null
  serviceId?: string | null
  recurringPlanId?: string | null
  unitPrice: number
  quantity: number
  /** Product-level promotional price (used instead of unitPrice when lower) */
  promotionalPrice?: number | null
  /** Base price before any discount (product.price) */
  basePrice?: number | null
  categoryId?: string | null
  isManualPrice?: boolean | null
}

export type PricingCoupon = {
  id: string
  code?: string | null
  discountType: "percentage" | "fixed" | "free_shipping"
  discountValue: number | null
  maxDiscountValue: number | null
  freeShipping: boolean
  allowCombination?: boolean
  applyScope?: string | null
  customerScope?: string | null
  applicableProductIds?: string[] | null
  applicableServiceIds?: string[] | null
  applicableCategoryIds?: string[] | null
  applicablePlanIds?: string[] | null
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
  /** Payment method configuration for discount/interest/fee calculation */
  paymentMethod?: {
    discountPercent: number
    interestType?: "fixed" | "percentage"
    interestValue?: number
    feePercent?: number
    feeFixed?: number
    feeBearer?: "merchant" | "customer"
    installmentFeeBearer?: "merchant" | "customer"
    installmentFees?: Array<{ installmentNumber: number; feePercent: number }>
    installmentNumber?: number
    maxInstallments?: number
  } | null
}

/** Current pricing engine version for audit trail */
export const PRICING_VERSION = "2.0"

export type PricingResult = {
  /** Pricing engine version used for this calculation (audit trail) */
  pricingVersion: string
  /** Sum of effective unit prices × quantities (after best item price selection) */
  subtotal: number
  /** Savings from promotional prices vs original prices */
  promotionSavings: number
  /** Manual discount amount (from discount field) */
  manualDiscountAmount: number
  /** Coupon discount amount */
  couponDiscountAmount: number
  /** Campaign/Promotion discount amount */
  promotionDiscountAmount: number
  /** Total of all discounts combined (item + manual + coupon + promotion) */
  totalDiscounts: number
  /** Final shipping value (0 if free shipping coupon/promotion) */
  shipping: number
  /** Other costs passed through */
  additionalCosts: number
  /** max(0, subtotal - discounts + shipping + additionalCosts), BEFORE payment method adjustments */
  finalTotal: number
  /** ID of the applied coupon (null if none) */
  appliedCouponId: string | null
  /** Whether free shipping was applied */
  freeShippingApplied: boolean
  /** List of applied promotion IDs */
  appliedPromotionIds: string[]
  /** List of gift product IDs earned from promotions */
  appliedGiftProductIds: string[]
  /** Whether any item was clamped to min R$0.01 to prevent free/negative pricing */
  minPriceWarning: boolean

  // ── New breakdown fields (additive, never breaking) ────────────────────

  /** Sum of basePrice × quantity before any discount */
  subtotalOriginal: number
  /** Total savings from per-item best-price selection (manual promo + campaign) */
  itemDiscountAmount: number
  /** Aggregated source of item-level discount: "manual" | "campaign" | "hybrid" | "none" */
  itemDiscountSource: "manual" | "campaign" | "hybrid" | "none"
  /** Campaign-only portion of item discounts */
  campaignDiscountAmount: number
  /** Coupon code text (when coupon is applied) */
  couponCode: string | null
  /** Whether coupon replaced campaign (allowCombination=false scenario B won) */
  couponReplacedCampaign: boolean
  /** Payment method discount amount */
  paymentMethodDiscountAmount: number
  /** Payment method interest amount */
  paymentMethodInterestAmount: number
  /** Custo de parcelamento (juros das parcelas) do método de pagamento */
  paymentMethodInstallmentCostAmount: number
  /** Payment method fee amount */
  paymentMethodFeeAmount: number
  /** Payment method fixed fee amount */
  paymentMethodFixedFeeAmount: number
  /** Payment method applied discount percent */
  appliedPaymentDiscountPercent: number
  /** Final amount after ALL adjustments including payment method (the real charge) */
  finalAmountWithPayment: number
  eligibleSubtotal: number
  ineligibleSubtotal: number
  eligibleItemIds: string[]
  ineligibleItemIds: string[]
  eligibleItemsCount: number
  ineligibleItemsCount: number
  couponApplicability: "full" | "partial" | "none"
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

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

function isItemInScope(
  item: CartUnit,
  promo: PricingPromotion,
): boolean {
  if (item.isManualPrice && promo.applyScope !== ApplyScope.ENTIRE_CART) {
    return false
  }
  const applyScope = promo.applyScope
  if (applyScope === ApplyScope.ENTIRE_CART) {
    return true
  }
  const sets = getPromoSets(promo)
  if (applyScope === ApplyScope.SPECIFIC_PRODUCTS) {
    return Boolean(item.productId && sets.products.has(item.productId))
  }
  if (applyScope === ApplyScope.CATEGORY) {
    return Boolean(item.categoryId && sets.categories.has(item.categoryId))
  }
  if (applyScope === ApplyScope.SPECIFIC_SERVICES) {
    return Boolean(item.serviceId && sets.services.has(item.serviceId))
  }
  return false
}

interface CartUnit {
  productId?: string | null
  serviceId?: string | null
  recurringPlanId?: string | null
  categoryId?: string | null
  originalPrice: number
  currentPrice: number
  isManualPrice?: boolean
}

export function calculateOrderPricing(input: PricingInput): PricingResult {
  const items = input.items || []
  const rawShipping = clampMin0(Number(input.shippingCost) || 0)
  const rawAdditionalCosts = clampMin0(Number(input.additionalCosts) || 0)

  // ── Step 1: subtotalOriginal (base price × qty, no discounts) ─────────
  let subtotalOriginal = 0
  for (const item of items) {
    const qty = clampMin0(Number(item.quantity) || 0)
    const base = clampMin0(Number(item.basePrice ?? item.unitPrice) || 0)
    subtotalOriginal += round2(base * qty)
  }
  subtotalOriginal = round2(subtotalOriginal)

  // ── Step 2: Per-item best price (manual promo vs campaign) ────────────
  // Build CartUnits where originalPrice = unitPrice, then apply campaigns
  // to get campaignPrice. Finally pick min(unitPrice, manualPrice, campaignPrice).

  const units: CartUnit[] = []

  for (const item of items) {
    const qty = clampMin0(Number(item.quantity) || 0)
    const unitP = clampMin0(Number(item.unitPrice) || 0)
    const baseP = item.basePrice != null ? clampMin0(Number(item.basePrice) || 0) : unitP
    // promotionalPrice of 0 means free (will be clamped to R$0.01 minimum)
    const promoP = item.promotionalPrice != null && item.promotionalPrice >= 0 && item.promotionalPrice < baseP
      ? clampMin0(item.promotionalPrice)
      : null

    // Manual effective price (promotionalPrice if valid, else unitPrice)
    const manualEffective = promoP ?? unitP

    for (let i = 0; i < qty; i++) {
      units.push({
        productId: item.productId || null,
        serviceId: item.serviceId || null,
        recurringPlanId: item.recurringPlanId || null,
        categoryId: item.categoryId || null,
        originalPrice: baseP,
        currentPrice: manualEffective, // start with manual price
        isManualPrice: Boolean(item.isManualPrice),
      })
    }
  }

  // Apply campaigns on TOP of manual price → we'll then pick min(manual, campaign)
  const appliedPromotionIds: string[] = []
  const appliedGiftProductIds: string[] = []
  let campaignDiscountAmount = 0
  let freeShippingAppliedCampaign = false

  const sortedPromotions = getSortedPromotions(input.promotions)

  // We need to track campaign-only discount per unit to compare with manual price
  // Store the campaign-influenced price separately
  const campaignUnitPrices = units.map(u => u.originalPrice) // starts as unitPrice

  // Helper: get indices of units in scope for a promotion
  function eligibleUnitIndices(promo: PricingPromotion): number[] {
    return units.reduce<number[]>((acc, u, idx) => {
      if (isItemInScope(u, promo)) {
        acc.push(idx)
      }
      return acc
    }, [])
  }

  // ── Separation and Winner Selection ──
  const pricePromotions: PricingPromotion[] = []
  const benefitPromotions: PricingPromotion[] = []

  for (const promo of sortedPromotions) {
    if (getCampaignCategory(promo.promotionType) === CampaignCategory.PRICE) {
      pricePromotions.push(promo)
    } else {
      benefitPromotions.push(promo)
    }
  }

  // Evaluate PRICE campaigns to select exactly one winner
  let winningPricePromo: PricingPromotion | null = null
  let maxDiscount = -1

  for (const promo of pricePromotions) {
    const eligibleIdx = eligibleUnitIndices(promo)
    if (eligibleIdx.length === 0) continue

    const eligibleOrigSum = eligibleIdx.reduce((sum, idx) => sum + units[idx].originalPrice, 0)
    if (promo.minSpendAmount != null && eligibleOrigSum < promo.minSpendAmount) continue

    let discount = 0
    if (promo.promotionType === PromotionType.BUY_X_PAY_Y) {
      const buyQty = promo.buyQuantity || 1
      const payQty = promo.payQuantity || 1
      if (buyQty > payQty) {
        const sortedIdx = [...eligibleIdx].sort((a, b) => units[a].originalPrice - units[b].originalPrice)
        const freeCount = Math.floor(sortedIdx.length / buyQty) * (buyQty - payQty)
        for (let fi = 0; fi < freeCount; fi++) {
          discount += units[sortedIdx[fi]].originalPrice
        }
      }
    } else if (promo.promotionType === PromotionType.DISCOUNT) {
      let filteredIdx = eligibleIdx
      if (promo.discountType === DiscountType.FIXED && promo.discountValue) {
        filteredIdx = eligibleIdx.filter(idx => promo.discountValue! <= units[idx].originalPrice)
      }

      if (filteredIdx.length > 0) {
        const eligibleCurrentSum = filteredIdx.reduce((sum, idx) => sum + units[idx].originalPrice, 0)
        if (eligibleCurrentSum > 0) {
          let discountAmt = 0
          if (promo.discountType === DiscountType.PERCENTAGE && promo.discountValue) {
            const pct = Math.min(100, Math.max(0, promo.discountValue))
            discountAmt = eligibleCurrentSum * (pct / 100)
          } else if (promo.discountType === DiscountType.FIXED && promo.discountValue) {
            discountAmt = Math.min(promo.discountValue, eligibleCurrentSum)
          }

          if (promo.maxDiscountAmount != null && promo.maxDiscountAmount > 0) {
            discountAmt = Math.min(discountAmt, promo.maxDiscountAmount)
          }

          discount = round2(discountAmt)
        }
      }
    }

    if (discount > 0) {
      if (winningPricePromo === null) {
        winningPricePromo = promo
        maxDiscount = discount
      } else {
        if (promo.priority > winningPricePromo.priority) {
          winningPricePromo = promo
          maxDiscount = discount
        } else if (promo.priority === winningPricePromo.priority) {
          if (discount > maxDiscount) {
            winningPricePromo = promo
            maxDiscount = discount
          }
        }
      }
    }
  }

  // Apply winning PRICE campaign
  if (winningPricePromo) {
    const eligibleIdx = eligibleUnitIndices(winningPricePromo)
    if (winningPricePromo.promotionType === PromotionType.BUY_X_PAY_Y) {
      const buyQty = winningPricePromo.buyQuantity || 1
      const payQty = winningPricePromo.payQuantity || 1
      if (buyQty > payQty) {
        const sortedIdx = [...eligibleIdx].sort((a, b) => campaignUnitPrices[a] - campaignUnitPrices[b])
        const freeCount = Math.floor(sortedIdx.length / buyQty) * (buyQty - payQty)
        let applied = false
        for (let fi = 0; fi < freeCount; fi++) {
          const idx = sortedIdx[fi]
          const price = campaignUnitPrices[idx]
          if (price > 0) {
            campaignDiscountAmount += price
            campaignUnitPrices[idx] = 0
            applied = true
          }
        }
        if (applied || freeCount > 0) {
          appliedPromotionIds.push(winningPricePromo.id)
        }
      }
    } else if (winningPricePromo.promotionType === PromotionType.DISCOUNT) {
      let filteredIdx = eligibleIdx
      if (winningPricePromo.discountType === DiscountType.FIXED && winningPricePromo.discountValue) {
        filteredIdx = eligibleIdx.filter(idx => winningPricePromo.discountValue! <= campaignUnitPrices[idx])
      }

      if (filteredIdx.length > 0) {
        const eligibleCurrentSum = filteredIdx.reduce((sum, idx) => sum + campaignUnitPrices[idx], 0)
        if (eligibleCurrentSum > 0) {
          let discountAmt = 0
          if (winningPricePromo.discountType === DiscountType.PERCENTAGE && winningPricePromo.discountValue) {
            const pct = Math.min(100, Math.max(0, winningPricePromo.discountValue))
            discountAmt = eligibleCurrentSum * (pct / 100)
          } else if (winningPricePromo.discountType === DiscountType.FIXED && winningPricePromo.discountValue) {
            discountAmt = Math.min(winningPricePromo.discountValue, eligibleCurrentSum)
          }

          if (winningPricePromo.maxDiscountAmount != null && winningPricePromo.maxDiscountAmount > 0) {
            discountAmt = Math.min(discountAmt, winningPricePromo.maxDiscountAmount)
          }

          discountAmt = round2(discountAmt)
          if (discountAmt > 0) {
            let remaining = discountAmt
            for (let fi = 0; fi < filteredIdx.length; fi++) {
              const idx = filteredIdx[fi]
              const unitPrice = campaignUnitPrices[idx]
              const share = round2((unitPrice / eligibleCurrentSum) * discountAmt)
              const actualDiscount = Math.min(share, unitPrice, remaining)
              campaignUnitPrices[idx] = round2(clampMin0(campaignUnitPrices[idx] - actualDiscount))
              remaining = round2(remaining - actualDiscount)
            }

            if (remaining > 0) {
              for (const idx of filteredIdx) {
                if (campaignUnitPrices[idx] >= remaining) {
                  campaignUnitPrices[idx] = round2(campaignUnitPrices[idx] - remaining)
                  remaining = 0
                  break
                }
              }
            }

            campaignDiscountAmount = round2(campaignDiscountAmount + discountAmt)
            appliedPromotionIds.push(winningPricePromo.id)
          }
        }
      }
    }
  }

  // Apply all applicable BENEFIT campaigns (they can coexist)
  for (const promo of benefitPromotions) {
    const eligibleIdx = eligibleUnitIndices(promo)
    if (eligibleIdx.length === 0) continue

    const eligibleOrigSum = eligibleIdx.reduce((sum, idx) => sum + units[idx].originalPrice, 0)
    if (promo.minSpendAmount != null && eligibleOrigSum < promo.minSpendAmount) continue

    if (promo.promotionType === PromotionType.GIFT) {
      if (promo.giftUnavailable) {
        appliedPromotionIds.push(promo.id)
      } else {
        if (promo.giftProductId) {
          appliedGiftProductIds.push(promo.giftProductId)
          appliedPromotionIds.push(promo.id)
        }
        if (promo.giftServiceId) {
          appliedGiftProductIds.push(promo.giftServiceId)
          appliedPromotionIds.push(promo.id)
        }
      }
    }
  }

  campaignDiscountAmount = round2(clampMin0(campaignDiscountAmount))

  // ── Step 2b: Compare manual vs campaign per unit, pick the best ───────
  let itemDiscountAmount = 0
  let itemCampaignSavings = 0
  let itemManualSavings = 0
  let aggregatedSource: "manual" | "campaign" | "hybrid" | "none" = "none"
  let minPriceWarning = false

  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui]
    const unitPrice = u.originalPrice
    const manualP = u.currentPrice   // this was set to manual effective price earlier
    const campaignP = campaignUnitPrices[ui]

    // Pick the best price: min(unitPrice, manualPrice, campaignPrice)
    const bestPrice = Math.min(unitPrice, manualP, campaignP)

    // Attribute savings to source BEFORE clamping
    const rawSavings = round2(unitPrice - bestPrice)
    if (rawSavings > 0) {
      itemDiscountAmount = round2(itemDiscountAmount + rawSavings)
      if (bestPrice === manualP && manualP < unitPrice) {
        itemManualSavings = round2(itemManualSavings + rawSavings)
      } else if (bestPrice === campaignP && campaignP < unitPrice) {
        itemCampaignSavings = round2(itemCampaignSavings + rawSavings)
      }
    }

    // Clamp to minimum R$ 0.01 (only for items that actually have a base price;
    // zero-priced/free items stay at 0)
    let effectiveBest = bestPrice
    if (unitPrice > 0 && effectiveBest < 0.01) {
      effectiveBest = 0.01
      minPriceWarning = true
    }

    u.currentPrice = effectiveBest
  }

  // Determine aggregated source
  if (itemManualSavings > 0 && itemCampaignSavings > 0) {
    aggregatedSource = "hybrid"
  } else if (itemManualSavings > 0) {
    aggregatedSource = "manual"
  } else if (itemCampaignSavings > 0) {
    aggregatedSource = "campaign"
  }

  // promotionSavings = campaign-only portion (backward compat)
  const promotionSavings = round2(clampMin0(itemCampaignSavings))
  // promotionDiscountAmount = total campaign discounts (backward compat)
  const promotionDiscountAmount = round2(clampMin0(itemCampaignSavings))

  const subtotal = round2(clampMin0(units.reduce((sum, u) => sum + u.currentPrice, 0)))

  let currentTotal = subtotal

  // ── Step 3: Coupon (evaluated per-line) ─────────────────────────
  let couponDiscountAmount = 0
  let appliedCouponId: string | null = null
  let couponCode: string | null = null
  let couponReplacedCampaign = false
  let freeShippingApplied = freeShippingAppliedCampaign
  let finalPromotionIds = [...appliedPromotionIds]
  let finalGiftIds = [...appliedGiftProductIds]
  let finalPromotionDiscountAmount = promotionDiscountAmount
  let finalCampaignDiscountAmount = itemCampaignSavings
  let finalItemDiscountAmount = itemDiscountAmount
  let finalItemDiscountSource = aggregatedSource
  let finalSubtotal = subtotal
  let scenarioCouponTotal = currentTotal // total after coupon step (pre-manualDiscount)

  let eligibleSubtotal = subtotal
  let ineligibleSubtotal = 0
  let eligibleItemIds: string[] = []
  let ineligibleItemIds: string[] = []
  let eligibleItemsCount = items.length
  let ineligibleItemsCount = 0
  let couponApplicability: "full" | "partial" | "none" = "none"

  const lineUnitsMap = new Map<string, CartUnit[]>()
  for (const u of units) {
    const key = u.productId || u.serviceId || u.recurringPlanId || ""
    if (!lineUnitsMap.has(key)) lineUnitsMap.set(key, [])
    lineUnitsMap.get(key)!.push(u)
  }

  if (input.coupon) {
    const coupon = input.coupon
    const promoMap = getPromotionMap(input.promotions || [])

    // 1. Calculate Scenario A (Campaigns/Manual Promo are kept, Coupon applied to eligible items)
    let eligibleSubtotalScenarioA = 0
    let ineligibleSubtotalScenarioA = 0
    let eligibleItemIdsScenarioA: string[] = []
    let ineligibleItemIdsScenarioA: string[] = []
    let eligibleItemsCountScenarioA = 0
    let ineligibleItemsCountScenarioA = 0

    for (const item of items) {
      const key = item.productId || item.serviceId || item.recurringPlanId || ""
      const lineUnits = lineUnitsMap.get(key) || []
      const lineBestPriceTotal = lineUnits.reduce((sum, u) => sum + u.currentPrice, 0)

      let lineEligible = true

      // Scope eligibility
      let scopeEligible = true
      const applyScope = coupon.applyScope || "all"
      if (applyScope !== "all") {
        if (applyScope === "products") {
          scopeEligible = Boolean(item.productId && coupon.applicableProductIds?.includes(item.productId))
        } else if (applyScope === "services") {
          scopeEligible = Boolean(item.serviceId && coupon.applicableServiceIds?.includes(item.serviceId))
        } else if (applyScope === "categories") {
          scopeEligible = Boolean(item.categoryId && coupon.applicableCategoryIds?.includes(item.categoryId))
        } else if (applyScope === "subscriptions") {
          scopeEligible = Boolean(item.recurringPlanId && coupon.applicablePlanIds?.includes(item.recurringPlanId))
        } else {
          scopeEligible = false
        }
      }

      if (!scopeEligible) {
        lineEligible = false
      } else {
        // Combination eligibility
        const hasManualPromo = item.promotionalPrice != null && item.promotionalPrice >= 0 && item.promotionalPrice < item.unitPrice
        let hasCampaign = false
        let hasNonCombinableCampaign = false

        for (const promoId of appliedPromotionIds) {
          const promo = promoMap.get(promoId)
          if (promo && isItemInScope(item as any, promo)) {
            if (getCampaignCategory(promo.promotionType) === CampaignCategory.PRICE) {
              hasCampaign = true
              if (promo.allowCouponCombination === false) {
                hasNonCombinableCampaign = true
              }
            }
          }
        }

        if (coupon.allowCombination === false) {
          if (hasManualPromo || hasCampaign) {
            lineEligible = false
          }
        } else {
          if (hasNonCombinableCampaign) {
            lineEligible = false
          }
        }
      }

      if (lineEligible) {
        eligibleSubtotalScenarioA += lineBestPriceTotal
        eligibleItemIdsScenarioA.push(key)
        eligibleItemsCountScenarioA++
      } else {
        ineligibleSubtotalScenarioA += lineBestPriceTotal
        ineligibleItemIdsScenarioA.push(key)
        ineligibleItemsCountScenarioA++
      }
    }

    eligibleSubtotalScenarioA = round2(eligibleSubtotalScenarioA)
    ineligibleSubtotalScenarioA = round2(ineligibleSubtotalScenarioA)

    let couponDiscountScenarioA = 0
    if (eligibleItemsCountScenarioA > 0) {
      if (coupon.discountType === "percentage" && coupon.discountValue) {
        const pct = Math.min(100, Math.max(0, coupon.discountValue))
        couponDiscountScenarioA = round2(eligibleSubtotalScenarioA * (pct / 100))
      } else if (coupon.discountType === "fixed" && coupon.discountValue) {
        couponDiscountScenarioA = round2(Math.min(coupon.discountValue, eligibleSubtotalScenarioA))
      } else if (coupon.discountType === "free_shipping") {
        // handled via shippingCost zeroing
      }

      if (coupon.maxDiscountValue != null && coupon.maxDiscountValue > 0 && couponDiscountScenarioA > coupon.maxDiscountValue) {
        couponDiscountScenarioA = round2(coupon.maxDiscountValue)
      }
      couponDiscountScenarioA = round2(clampMin0(couponDiscountScenarioA))
    }

    const totalScenarioA = round2(clampMin0(currentTotal - couponDiscountScenarioA))

    // 2. Check if coupon combination is allowed globally
    const hasAppliedNonCombinablePromo = appliedPromotionIds.some(promoId => {
      const promo = promoMap.get(promoId)
      return promo && getCampaignCategory(promo.promotionType) === CampaignCategory.PRICE && promo.allowCouponCombination === false
    })
    const combinationAllowed = coupon.allowCombination === true && !hasAppliedNonCombinablePromo

    if (combinationAllowed) {
      // Scenario A wins
      eligibleSubtotal = eligibleSubtotalScenarioA
      ineligibleSubtotal = ineligibleSubtotalScenarioA
      eligibleItemIds = eligibleItemIdsScenarioA
      ineligibleItemIds = ineligibleItemIdsScenarioA
      eligibleItemsCount = eligibleItemsCountScenarioA
      ineligibleItemsCount = ineligibleItemsCountScenarioA
      couponApplicability = eligibleItemsCount > 0 ? (ineligibleItemsCount === 0 ? "full" : "partial") : "none"

      if (eligibleItemsCount > 0) {
        appliedCouponId = coupon.id
        couponCode = coupon.code || null
        couponDiscountAmount = couponDiscountScenarioA
        scenarioCouponTotal = totalScenarioA
      } else {
        couponDiscountAmount = 0
        appliedCouponId = null
        couponCode = null
        scenarioCouponTotal = currentTotal
      }
    } else {
      // 3. Calculate Scenario B (Coupon wins, campaigns and manual promos are reverted on coupon-eligible items)
      let eligibleSubtotalScenarioB = 0
      let ineligibleSubtotalScenarioB = 0
      let eligibleItemIdsScenarioB: string[] = []
      let ineligibleItemIdsScenarioB: string[] = []
      let eligibleItemsCountScenarioB = 0
      let ineligibleItemsCountScenarioB = 0

      for (const item of items) {
        const key = item.productId || item.serviceId || item.recurringPlanId || ""
        const lineUnits = lineUnitsMap.get(key) || []
        const lineOriginalTotal = lineUnits.reduce((sum, u) => sum + u.originalPrice, 0)

        let scopeEligible = true
        const applyScope = coupon.applyScope || "all"
        if (applyScope !== "all") {
          if (applyScope === "products") {
            scopeEligible = Boolean(item.productId && coupon.applicableProductIds?.includes(item.productId))
          } else if (applyScope === "services") {
            scopeEligible = Boolean(item.serviceId && coupon.applicableServiceIds?.includes(item.serviceId))
          } else if (applyScope === "categories") {
            scopeEligible = Boolean(item.categoryId && coupon.applicableCategoryIds?.includes(item.categoryId))
          } else if (applyScope === "subscriptions") {
            scopeEligible = Boolean(item.recurringPlanId && coupon.applicablePlanIds?.includes(item.recurringPlanId))
          } else {
            scopeEligible = false
          }
        }

        if (scopeEligible) {
          eligibleSubtotalScenarioB += lineOriginalTotal
          eligibleItemIdsScenarioB.push(key)
          eligibleItemsCountScenarioB++
        } else {
          ineligibleSubtotalScenarioB += lineOriginalTotal
          ineligibleItemIdsScenarioB.push(key)
          ineligibleItemsCountScenarioB++
        }
      }

      eligibleSubtotalScenarioB = round2(eligibleSubtotalScenarioB)
      ineligibleSubtotalScenarioB = round2(ineligibleSubtotalScenarioB)

      let couponDiscountScenarioB = 0
      if (eligibleItemsCountScenarioB > 0) {
        if (coupon.discountType === "percentage" && coupon.discountValue) {
          const pct = Math.min(100, Math.max(0, coupon.discountValue))
          couponDiscountScenarioB = round2(eligibleSubtotalScenarioB * (pct / 100))
        } else if (coupon.discountType === "fixed" && coupon.discountValue) {
          couponDiscountScenarioB = round2(Math.min(coupon.discountValue, eligibleSubtotalScenarioB))
        } else if (coupon.discountType === "free_shipping") {
          // handled via freeShippingApplied
        }

        if (coupon.maxDiscountValue != null && coupon.maxDiscountValue > 0 && couponDiscountScenarioB > coupon.maxDiscountValue) {
          couponDiscountScenarioB = round2(coupon.maxDiscountValue)
        }
        couponDiscountScenarioB = round2(clampMin0(couponDiscountScenarioB))
      }

      const totalScenarioB = round2(clampMin0(subtotalOriginal - couponDiscountScenarioB))

      if (totalScenarioB < totalScenarioA) {
        // Scenario B wins! Coupon replaces campaign
        couponReplacedCampaign = true
        couponDiscountAmount = couponDiscountScenarioB
        finalPromotionDiscountAmount = 0
        finalCampaignDiscountAmount = 0
        finalItemDiscountAmount = 0
        finalItemDiscountSource = "none"
        finalSubtotal = subtotalOriginal
        finalPromotionIds = []
        finalGiftIds = []
        freeShippingApplied = (coupon.freeShipping || coupon.discountType === "free_shipping")
          ? true
          : freeShippingAppliedCampaign

        eligibleSubtotal = eligibleSubtotalScenarioB
        ineligibleSubtotal = ineligibleSubtotalScenarioB
        eligibleItemIds = eligibleItemIdsScenarioB
        ineligibleItemIds = ineligibleItemIdsScenarioB
        eligibleItemsCount = eligibleItemsCountScenarioB
        ineligibleItemsCount = ineligibleItemsCountScenarioB
        couponApplicability = eligibleItemsCount > 0 ? (ineligibleItemsCount === 0 ? "full" : "partial") : "none"

        appliedCouponId = coupon.id
        couponCode = coupon.code || null
        scenarioCouponTotal = totalScenarioB
      } else {
        // Scenario A wins!
        if (coupon.allowCombination === true && eligibleItemsCountScenarioA > 0) {
          eligibleSubtotal = eligibleSubtotalScenarioA
          ineligibleSubtotal = ineligibleSubtotalScenarioA
          eligibleItemIds = eligibleItemIdsScenarioA
          ineligibleItemIds = ineligibleItemIdsScenarioA
          eligibleItemsCount = eligibleItemsCountScenarioA
          ineligibleItemsCount = ineligibleItemsCountScenarioA
          couponApplicability = eligibleItemsCount > 0 ? (ineligibleItemsCount === 0 ? "full" : "partial") : "none"

          appliedCouponId = coupon.id
          couponCode = coupon.code || null
          couponDiscountAmount = couponDiscountScenarioA
          scenarioCouponTotal = totalScenarioA
        } else {
          // Scenario A wins! Campaign is better, coupon is discarded
          eligibleSubtotal = eligibleSubtotalScenarioA
          ineligibleSubtotal = ineligibleSubtotalScenarioA
          eligibleItemIds = eligibleItemIdsScenarioA
          ineligibleItemIds = ineligibleItemIdsScenarioA
          eligibleItemsCount = eligibleItemsCountScenarioA
          ineligibleItemsCount = ineligibleItemsCountScenarioA
          couponApplicability = "none"
          couponDiscountAmount = 0
          appliedCouponId = null
          couponCode = null
          scenarioCouponTotal = currentTotal
        }
      }
    }
  } else {
    scenarioCouponTotal = currentTotal
  }

  // Free shipping from coupon
  if (appliedCouponId && (input.coupon?.freeShipping || input.coupon?.discountType === "free_shipping")) {
    freeShippingApplied = true
  }

  couponDiscountAmount = round2(clampMin0(couponDiscountAmount))

  // ── Step 4: ERP manual discount ───────────────────────────────────────
  let manualDiscountAmount = 0
  if (input.manualDiscount && input.manualDiscount.value > 0) {
    const { type, value } = input.manualDiscount
    if (type === "percentage") {
      const pct = Math.min(100, Math.max(0, value))
      manualDiscountAmount = round2(scenarioCouponTotal * (pct / 100))
    } else {
      manualDiscountAmount = round2(Math.min(value, scenarioCouponTotal))
    }
  }
  manualDiscountAmount = round2(clampMin0(manualDiscountAmount))
  currentTotal = round2(clampMin0(scenarioCouponTotal - manualDiscountAmount))

  // ── Step 5: Shipping ──────────────────────────────────────────────────
  const shipping = freeShippingApplied ? 0 : round2(rawShipping)

  // ── Step 6: Additional costs ──────────────────────────────────────────
  const additionalCosts = round2(rawAdditionalCosts)
  currentTotal = round2(clampMin0(currentTotal + shipping))
  currentTotal = round2(clampMin0(currentTotal + additionalCosts))

  // ── Step 7: Payment method discount / interest / fee ──────────────────
  let paymentMethodDiscountAmount = 0
  let paymentMethodInterestAmount = 0
  let paymentMethodFeeAmount = 0
  let paymentMethodFixedFeeAmount = 0
  let paymentMethodInstallmentCostAmount = 0
  let appliedPaymentDiscountPercent = 0
  let finalAmountWithPayment = currentTotal

  if (input.paymentMethod) {
    const pmt = input.paymentMethod
    const paymentCalc = calculatePaymentAmounts({
      originalAmount: currentTotal,
      installmentNumber: pmt.installmentNumber ?? 1,
      paymentMethod: {
        feePercent: pmt.feePercent ?? 0,
        feeFixed: pmt.feeFixed ?? 0,
        feeBearer: pmt.feeBearer ?? "merchant",
        installmentFeeBearer: pmt.installmentFeeBearer ?? "merchant",
        discountPercent: pmt.discountPercent ?? 0,
        maxInstallments: pmt.maxInstallments ?? 24,
        installmentFees: pmt.installmentFees ?? [],
        fixedInterestPercent: pmt.interestType === "fixed" ? (pmt.interestValue ?? 0) : 0,
      },
    })

    paymentMethodDiscountAmount = round2(clampMin0(paymentCalc.paymentMethodDiscountAmount))
    paymentMethodInterestAmount = round2(clampMin0(paymentCalc.interestAmount))
    paymentMethodInstallmentCostAmount = round2(clampMin0(paymentCalc.installmentCostAmount))
    paymentMethodFeeAmount = round2(clampMin0(paymentCalc.feeAmount))
    paymentMethodFixedFeeAmount = round2(clampMin0(paymentCalc.fixedFeeAmount))
    appliedPaymentDiscountPercent = paymentCalc.appliedDiscountPercent
    finalAmountWithPayment = round2(clampMin0(paymentCalc.finalAmount))
  }

  // ── Step 8: Final total ───────────────────────────────────────────────
  const totalDiscounts = round2(manualDiscountAmount + couponDiscountAmount + finalPromotionDiscountAmount)
  const finalTotal = round2(clampMin0(currentTotal))

  return {
    pricingVersion: PRICING_VERSION,
    // Existing backward-compat fields
    subtotal: finalSubtotal,
    promotionSavings,
    manualDiscountAmount,
    couponDiscountAmount,
    promotionDiscountAmount: finalPromotionDiscountAmount,
    totalDiscounts,
    shipping,
    additionalCosts,
    finalTotal,
    appliedCouponId,
    freeShippingApplied,
    appliedPromotionIds: finalPromotionIds,
    appliedGiftProductIds: finalGiftIds,
    minPriceWarning,

    // New breakdown fields
    subtotalOriginal,
    itemDiscountAmount: finalItemDiscountAmount,
    itemDiscountSource: finalItemDiscountSource,
    campaignDiscountAmount: finalCampaignDiscountAmount,
    couponCode,
    couponReplacedCampaign,
    paymentMethodDiscountAmount,
    paymentMethodInterestAmount,
    paymentMethodInstallmentCostAmount,
    paymentMethodFeeAmount,
    paymentMethodFixedFeeAmount,
    appliedPaymentDiscountPercent,
    finalAmountWithPayment,
    eligibleSubtotal,
    ineligibleSubtotal,
    eligibleItemIds,
    ineligibleItemIds,
    eligibleItemsCount,
    ineligibleItemsCount,
    couponApplicability,
  }
}

export type DiscountSource = "manual" | "campaign" | "none"

export interface ItemCampaignPricing {
  effectivePrice: number
  campaignDiscount: number
  bestPrice: number
  discountSource: DiscountSource
}

export function computeItemCampaignPricing(
  unitPrice: number,
  promotionalPrice: number | null,
  promotion: PricingPromotion | null,
  itemMeta?: { productId?: string | null; serviceId?: string | null; categoryId?: string | null },
): ItemCampaignPricing {
  if ((globalThis as any).__pricing_stats) (globalThis as any).__pricing_stats.campaignPricingCount++
  const manualPrice =
    promotionalPrice != null && promotionalPrice > 0 && promotionalPrice < unitPrice
      ? promotionalPrice
      : unitPrice

  if (!promotion) {
    return { effectivePrice: manualPrice, campaignDiscount: 0, bestPrice: manualPrice, discountSource: manualPrice < unitPrice ? "manual" : "none" }
  }

  let inScope = false
  if (promotion.applyScope === ApplyScope.ENTIRE_CART) {
    inScope = true
  } else if (promotion.applyScope === ApplyScope.SPECIFIC_PRODUCTS && itemMeta?.productId) {
    inScope = promotion.applicableProductIds?.includes(itemMeta.productId) ?? false
  } else if (promotion.applyScope === ApplyScope.SPECIFIC_SERVICES && itemMeta?.serviceId) {
    inScope = promotion.applicableServiceIds?.includes(itemMeta.serviceId) ?? false
  } else if (promotion.applyScope === ApplyScope.CATEGORY && itemMeta?.categoryId) {
    inScope = promotion.applicableCategoryIds?.includes(itemMeta.categoryId) ?? false
  }

  if (!inScope || promotion.promotionType !== PromotionType.DISCOUNT) {
    return { effectivePrice: manualPrice, campaignDiscount: 0, bestPrice: manualPrice, discountSource: manualPrice < unitPrice ? "manual" : "none" }
  }

  // Campaign discount calc on BASE price
  let discountAmt = 0
  if (promotion.discountType === DiscountType.PERCENTAGE && promotion.discountValue) {
    const pct = Math.min(100, Math.max(0, promotion.discountValue))
    discountAmt = unitPrice * (pct / 100)
  } else if (promotion.discountType === DiscountType.FIXED && promotion.discountValue) {
    if (promotion.discountValue <= unitPrice) {
      discountAmt = promotion.discountValue
    }
  }

  if (promotion.maxDiscountAmount != null && promotion.maxDiscountAmount > 0) {
    discountAmt = Math.min(discountAmt, promotion.maxDiscountAmount)
  }

  let campaignPrice = round2(unitPrice - discountAmt)
  if (unitPrice > 0 && campaignPrice < 0.01) campaignPrice = 0.01

  // Pick the best price
  const bestPrice = Math.min(unitPrice, manualPrice, campaignPrice)
  const discountSource: DiscountSource =
    bestPrice === manualPrice && manualPrice < unitPrice ? "manual"
      : bestPrice === campaignPrice && campaignPrice < unitPrice ? "campaign"
        : "none"

  return {
    effectivePrice: bestPrice,
    campaignDiscount: discountSource === "campaign" ? round2(unitPrice - campaignPrice) : 0,
    bestPrice,
    discountSource,
  }
}

export type BadgeVariant = "blue" | "orange" | null

export interface ItemDisplayPrice {
  bestPrice: number
  originalPrice: number
  referencePrice?: number
  discountSource: DiscountSource
  campaignDiscount: number
  discountPercent: number
  badgeVariant: BadgeVariant
  hasDiscount: boolean
  couponEligible: boolean
}

export interface BestItemPrice {
  bestPrice: number
  referencePrice?: number
  discountSource: DiscountSource
  campaignDiscount: number
  discountPercent: number
}

if (!(globalThis as any).__pricing_stats) {
  ; (globalThis as any).__pricing_stats = { computeCount: 0, findBestCount: 0, campaignPricingCount: 0 }
}

export function getPricingCallStats() {
  return (globalThis as any).__pricing_stats || { computeCount: 0, findBestCount: 0, campaignPricingCount: 0 }
}

export function resetPricingCallStats() {
  if ((globalThis as any).__pricing_stats) {
    ; (globalThis as any).__pricing_stats.computeCount = 0
      ; (globalThis as any).__pricing_stats.findBestCount = 0
      ; (globalThis as any).__pricing_stats.campaignPricingCount = 0
  }
}

export function computeItemDisplayPrice(
  unitPrice: number,
  individualPromo: number | null,
  promotions: PricingPromotion[],
  itemMeta?: { productId?: string | null; serviceId?: string | null; categoryId?: string | null },
): ItemDisplayPrice {
  if ((globalThis as any).__pricing_stats) (globalThis as any).__pricing_stats.computeCount++
  const raw = findBestItemPrice(unitPrice, individualPromo, promotions, itemMeta)
  const badgeVariant: BadgeVariant =
    raw.discountSource === "campaign" ? "blue"
      : raw.discountSource === "manual" ? "orange"
        : null
  const hasDiscount = raw.bestPrice < unitPrice
  const couponEligible = !hasDiscount
  return { ...raw, originalPrice: unitPrice, badgeVariant, hasDiscount, couponEligible }
}

export function findBestItemPrice(
  unitPrice: number,
  individualPromo: number | null,
  promotions: PricingPromotion[],
  itemMeta?: { productId?: string | null; serviceId?: string | null; categoryId?: string | null },
): BestItemPrice {
  if ((globalThis as any).__pricing_stats) (globalThis as any).__pricing_stats.findBestCount++
  // Non-product items: no campaign pricing, just manual promo
  if (!itemMeta?.productId && !itemMeta?.serviceId) {
    const bestPrice = individualPromo ?? unitPrice
    return {
      bestPrice,
      referencePrice: bestPrice < unitPrice ? unitPrice : undefined,
      discountSource: bestPrice < unitPrice ? "manual" : "none",
      campaignDiscount: 0,
      discountPercent: bestPrice < unitPrice ? Math.round((1 - bestPrice / unitPrice) * 100) : 0,
    }
  }

  // Find best campaign among ONLY applicable promotions
  const indexed = getIndexedPromotions(promotions)
  const candidates: PricingPromotion[] = []

  if (itemMeta?.productId) {
    const matched = indexed.byProduct.get(itemMeta.productId)
    if (matched) candidates.push(...matched)
  }
  if (itemMeta?.serviceId) {
    const matched = indexed.byService.get(itemMeta.serviceId)
    if (matched) candidates.push(...matched)
  }
  if (itemMeta?.categoryId) {
    const matched = indexed.byCategory.get(itemMeta.categoryId)
    if (matched) candidates.push(...matched)
  }
  candidates.push(...indexed.entireCart)

  // Filter candidates to only PRICE campaigns
  const priceCandidates = candidates.filter(
    (promo) => getCampaignCategory(promo.promotionType) === CampaignCategory.PRICE
  )

  let winningPromo: PricingPromotion | null = null
  let maxDiscount = -1
  let bestCampaignResult: ReturnType<typeof computeItemCampaignPricing> | null = null

  for (const promo of priceCandidates) {
    const result = computeItemCampaignPricing(unitPrice, individualPromo, promo, itemMeta)
    const discount = round2(unitPrice - result.bestPrice)
    if (discount > 0) {
      if (winningPromo === null) {
        winningPromo = promo
        maxDiscount = discount
        bestCampaignResult = result
      } else {
        if (promo.priority > winningPromo.priority) {
          winningPromo = promo
          maxDiscount = discount
          bestCampaignResult = result
        } else if (promo.priority === winningPromo.priority) {
          if (discount > maxDiscount) {
            winningPromo = promo
            maxDiscount = discount
            bestCampaignResult = result
          }
        }
      }
    }
  }

  const finalResult = bestCampaignResult || computeItemCampaignPricing(unitPrice, individualPromo, null, itemMeta)

  const bestPrice = finalResult.bestPrice
  const referencePrice = bestPrice < unitPrice ? unitPrice : undefined
  const discountPercent = referencePrice ? Math.round((1 - bestPrice / unitPrice) * 100) : 0
  return { bestPrice, referencePrice, discountSource: finalResult.discountSource, discountPercent, campaignDiscount: finalResult.campaignDiscount }
}

export function isCouponEligibleForItems(
  allowCombination: boolean,
  itemsDisplay: Array<{ couponEligible: boolean }>,
): boolean {
  if (allowCombination) return true
  return itemsDisplay.every((item) => item.couponEligible)
}
