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

  // Compute the full price of all service lines (regardless of deposit state)
  let serviceFullTotal = 0
  for (const line of resolvedLines) {
    if (line.itemType === "service_booking") {
      const qty = Number(line.quantity || 1)
      const full = Number(line.fullPrice || line.unitPrice || 0)
      serviceFullTotal += full * qty
    }
  }

  // Compute deposit delta directly from the partner's deposit percentage.
  // We do NOT rely on line.depositAmount from the resolver because the resolver
  // skips computing it when the service's payment_requirement is "full_payment"
  // (or null, which defaults to "full_payment" in capabilities). The deposit
  // option is still valid for these services — the partner enabled it globally.
  const serviceDepositDelta = params.depositAvailable && serviceFullTotal > 0
    ? Math.round(serviceFullTotal * (1 - params.depositPercent / 100) * 100) / 100
    : 0

  const serviceDepositAmount = Math.max(0, serviceFullTotal - serviceDepositDelta)

  // Full order total based on pricing calculation
  const calculatedTotal = Number(priced.data.totalAmount || 0)

  // If the line items in cart currently had pay_deposit_only active in DB
  // AND the resolver actually computed a depositAmount (adjusting unitPrice),
  // calculatedTotal is the deposit amount. When depositAmount is null
  // (services with payment_requirement "full_payment" or null), the resolver
  // did NOT adjust unitPrice, so calculatedTotal is the full order total.
  const hasActiveDepositInLines = resolvedLines.some(
    (l) => l.itemType === "service_booking" && l.payDepositOnly && l.depositAmount != null,
  )

  let fullOrderTotal = calculatedTotal
  let depositChargeTotal = calculatedTotal

  if (params.depositAvailable && serviceDepositDelta > 0) {
    if (hasActiveDepositInLines) {
      // calculatedTotal already uses deposit-adjusted unitPrices from the resolver
      depositChargeTotal = calculatedTotal
      fullOrderTotal = Number((calculatedTotal + serviceDepositDelta).toFixed(2))
    } else {
      // calculatedTotal uses full prices — subtract delta to get deposit charge
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
