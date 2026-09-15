/**
 * Server-side checkout amounts for marketplace (deposit vs integral).
 * Single source of truth - frontend must display these values as-is.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { priceMarketplaceCartCheckout } from "@/lib/services/marketplace-cart-checkout"

export type MarketplaceCheckoutAmounts = {
  fullOrderTotal: number
  depositChargeTotal: number
  /** Service deposit portion only (excludes products/subscriptions) */
  serviceDepositAmount: number
  depositPercent: number
  usesDeposit: boolean
  remainingAfterDeposit: number
  deliveryFee: number
  distanceKm: number | null
  deliveryBreakdown: Record<string, unknown> | null
  couponDiscountAmount: number
  /** Amount to charge based on payDepositOnly flag */
  chargeTotal: number
}

export async function computeMarketplaceCheckoutAmounts(
  adminClient: SupabaseClient,
  params: {
    userId: string
    cartItemIds: string[]
    deliveryType: "delivery" | "pickup"
    deliveryAddress: string
    destinationCoords?: { lat: number; lng: number } | null
    couponCode?: string | null
    payDepositOnly: boolean
    depositPercent: number
    depositAvailable: boolean
  },
): Promise<{ success: true; data: MarketplaceCheckoutAmounts } | { success: false; error: string }> {
  const serviceCartIds = params.cartItemIds

  // Single fast pricing run without modifying database rows
  const priced = await priceMarketplaceCartCheckout(adminClient, {
    userId: params.userId,
    cartItemIds: serviceCartIds,
    deliveryType: params.deliveryType,
    deliveryAddress: params.deliveryAddress,
    destinationCoords: params.destinationCoords,
    couponCode: params.couponCode,
    skipCartUpdate: true,
  })

  if (!priced.success) {
    return { success: false, error: priced.error }
  }

  const resolvedLines = priced.data.resolvedLines || []

  // Compute service deposit differences in-memory
  let serviceFullTotal = 0
  let serviceDepositAmount = 0

  for (const line of resolvedLines) {
    if (line.itemType === "service_booking") {
      const qty = Number(line.quantity || 1)
      const full = Number(line.fullPrice || line.unitPrice || 0)
      const dep = Number(line.depositAmount != null ? line.depositAmount : full)
      serviceFullTotal += full * qty
      serviceDepositAmount += dep * qty
    }
  }

  const serviceDepositDelta = Math.max(0, serviceFullTotal - serviceDepositAmount)

  // Full order total based on pricing calculation
  const calculatedTotal = Number(priced.data.totalAmount || 0)
  
  // If the line items in cart currently had pay_deposit_only active in DB,
  // calculatedTotal is the deposit amount. Otherwise, it is the full order total.
  const hasActiveDepositInLines = resolvedLines.some(
    (l) => l.itemType === "service_booking" && l.payDepositOnly,
  )

  let fullOrderTotal = calculatedTotal
  let depositChargeTotal = calculatedTotal

  if (params.depositAvailable && serviceDepositDelta > 0) {
    if (hasActiveDepositInLines) {
      depositChargeTotal = calculatedTotal
      fullOrderTotal = Number((calculatedTotal + serviceDepositDelta).toFixed(2))
    } else {
      fullOrderTotal = calculatedTotal
      depositChargeTotal = Math.max(0, Number((calculatedTotal - serviceDepositDelta).toFixed(2)))
    }
  }

  const usesDeposit = Boolean(params.depositAvailable && params.payDepositOnly)
  const chargeTotal = usesDeposit ? depositChargeTotal : fullOrderTotal
  const remainingAfterDeposit = Math.max(0, Number((fullOrderTotal - depositChargeTotal).toFixed(2)))

  return {
    success: true,
    data: {
      fullOrderTotal,
      depositChargeTotal,
      serviceDepositAmount,
      depositPercent: params.depositPercent,
      usesDeposit,
      remainingAfterDeposit,
      deliveryFee: priced.data.deliveryFee,
      distanceKm: priced.data.distanceKm,
      deliveryBreakdown: priced.data.deliveryBreakdown,
      couponDiscountAmount: priced.data.couponDiscountAmount,
      chargeTotal,
    },
  }
}

export { buildDepositCheckoutMeta } from "@/lib/services/marketplace-deposit-meta"
