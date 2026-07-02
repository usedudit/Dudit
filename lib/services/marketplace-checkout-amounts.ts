/**
 * Server-side checkout amounts for marketplace (deposit vs integral).
 * Single source of truth — frontend must display these values as-is.
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
    couponCode?: string | null
    payDepositOnly: boolean
    depositPercent: number
    depositAvailable: boolean
  },
): Promise<{ success: true; data: MarketplaceCheckoutAmounts } | { success: false; error: string }> {
  const serviceCartIds = params.cartItemIds

  // Ensure cart reflects payDepositOnly for deposit pricing
  if (params.depositAvailable) {
    await adminClient
      .from("cart_items")
      .update({
        pay_deposit_only: Boolean(params.payDepositOnly),
        updated_at: new Date().toISOString(),
      })
      .in("id", serviceCartIds)
      .eq("user_id", params.userId)
      .eq("item_type", "service_booking")
  }

  const depositPriced = await priceMarketplaceCartCheckout(adminClient, {
    userId: params.userId,
    cartItemIds: serviceCartIds,
    deliveryType: params.deliveryType,
    deliveryAddress: params.deliveryAddress,
    couponCode: params.couponCode,
  })

  if (!depositPriced.success) {
    return { success: false, error: depositPriced.error }
  }

  // Full order pricing (all services at full price)
  await adminClient
    .from("cart_items")
    .update({ pay_deposit_only: false, updated_at: new Date().toISOString() })
    .in("id", serviceCartIds)
    .eq("user_id", params.userId)
    .eq("item_type", "service_booking")

  const fullPriced = await priceMarketplaceCartCheckout(adminClient, {
    userId: params.userId,
    cartItemIds: serviceCartIds,
    deliveryType: params.deliveryType,
    deliveryAddress: params.deliveryAddress,
    couponCode: params.couponCode,
  })

  // Restore cart pay_deposit_only state
  if (params.depositAvailable) {
    await adminClient
      .from("cart_items")
      .update({
        pay_deposit_only: Boolean(params.payDepositOnly),
        updated_at: new Date().toISOString(),
      })
      .in("id", serviceCartIds)
      .eq("user_id", params.userId)
      .eq("item_type", "service_booking")
  }

  if (!fullPriced.success) {
    return { success: false, error: fullPriced.error }
  }

  const fullOrderTotal = fullPriced.data.totalAmount
  const depositChargeTotal = depositPriced.data.totalAmount

  const serviceDepositAmount = (depositPriced.data.resolvedLines || [])
    .filter((line) => line.itemType === "service_booking" && line.depositAmount != null)
    .reduce((sum, line) => sum + Number(line.depositAmount || 0) * Number(line.quantity || 1), 0)

  const usesDeposit = params.depositAvailable && params.payDepositOnly
  const chargeTotal = usesDeposit ? depositChargeTotal : fullOrderTotal
  const remainingAfterDeposit = Math.max(0, fullOrderTotal - depositChargeTotal)

  return {
    success: true,
    data: {
      fullOrderTotal,
      depositChargeTotal,
      serviceDepositAmount,
      depositPercent: params.depositPercent,
      usesDeposit,
      remainingAfterDeposit,
      deliveryFee: fullPriced.data.deliveryFee,
      couponDiscountAmount: fullPriced.data.couponDiscountAmount,
      chargeTotal,
    },
  }
}

export function buildDepositCheckoutMeta(params: {
  payDepositOnly: boolean
  depositPercent: number
  serviceDepositAmount: number
  fullOrderTotal: number
  initialChargeAmount: number
  paymentProvider?: string
}) {
  const remainingAfterDeposit = Math.max(0, params.fullOrderTotal - params.initialChargeAmount)
  return {
    usesDeposit: params.payDepositOnly,
    payDepositOnly: params.payDepositOnly,
    depositPercent: params.depositPercent,
    depositAmount: params.serviceDepositAmount,
    serviceDepositAmount: params.serviceDepositAmount,
    fullOrderTotal: params.fullOrderTotal,
    initialChargeAmount: params.initialChargeAmount,
    remainingAfterDeposit,
    remainingBalance: remainingAfterDeposit,
    depositStatus: "pending" as const,
    paymentProvider: params.paymentProvider || "Mercado Pago",
    mpInitialPayment: true,
  }
}
