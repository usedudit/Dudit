/**
 * Shared server-side pricing for unified cart checkout (store + Mercado Pago).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import {
  resolveCheckoutCartLines,
  buildFulfillmentPayload,
  type ResolvedCartLine,
} from "@/lib/services/marketplace-cart-resolver"
import type { CheckoutFulfillmentPayload } from "@/lib/types/marketplace-cart"

export type MarketplaceCartCheckoutPricing = {
  partnerId: string
  hasProducts: boolean
  resolvedLines: ResolvedCartLine[]
  orderItems: Record<string, unknown>[]
  fulfillmentPayload: CheckoutFulfillmentPayload
  totalAmount: number
  deliveryFee: number
  distanceKm: number | null
  deliveryBreakdown: Record<string, unknown> | null
  couponId: string | null
  couponDiscountAmount: number
  promotionsAppliedSnapshot: Array<Record<string, unknown>>
  pricingResult: ReturnType<typeof calculateOrderPricing>
  reserveItems: Array<{ product_id: string; variant_id: string | null; quantity: number }>
  productIds: string[]
  partialCouponWarning: boolean
}

export async function priceMarketplaceCartCheckout(
  adminClient: SupabaseClient,
  params: {
    userId: string
    cartItemIds: string[]
    deliveryType: "delivery" | "pickup"
    deliveryAddress: string
    couponCode?: string | null
  },
): Promise<{ success: true; data: MarketplaceCartCheckoutPricing } | { success: false; error: string }> {
  const resolved = await resolveCheckoutCartLines(adminClient, params.userId, params.cartItemIds)
  if (!resolved.success) return { success: false, error: resolved.error }

  const { lines: resolvedLines, partnerId, hasProducts } = resolved
  let subtotal = resolvedLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const orderItems = resolvedLines.map((line) => ({ ...line.orderItemRow }))
  const pricingItems = resolvedLines.map((line) => line.pricingItem)
  const couponItems = resolvedLines.map((line) => ({
    productId: line.productId,
    serviceId: line.serviceId,
    recurringPlanId: line.recurringPlanId,
  }))

  const fulfillmentPayload = buildFulfillmentPayload(
    params.userId,
    partnerId,
    resolvedLines,
    params.deliveryType,
    params.deliveryAddress,
  )

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null

  if (params.deliveryType === "delivery" && hasProducts) {
    const quote = await quoteDeliveryFeeAction({
      partnerId,
      destinationAddress: params.deliveryAddress,
      freeDeliveryCoupon: false,
    })
    if (!quote.success) return { success: false, error: quote.error || "Erro na cotação de entrega." }
    deliveryFee = Number(quote.fee || 0)
    distanceKm = Number(quote.distanceKm || 0)
    deliveryBreakdown = quote.breakdown
  }

  let couponId: string | null = null
  let couponDiscountAmount = 0
  let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null
  let partialCouponWarning = false

  if (params.couponCode?.trim()) {
    const couponResult = await validateCoupon(
      {
        partnerId,
        code: params.couponCode,
        customerId: params.userId,
        subtotal,
        shippingCost: deliveryFee,
        items: couponItems,
      },
      adminClient,
    )
    if (couponResult.valid) {
      couponId = couponResult.couponId || null
      couponDiscountAmount = couponResult.discountAmount
      couponPricingData = couponResult.pricingCoupon || null
      partialCouponWarning = Boolean(couponResult.partialApplicabilityWarning)
    }
  } else {
    const autoResult = await findBestAutomaticCoupon(
      {
        partnerId,
        customerId: params.userId,
        subtotal,
        shippingCost: deliveryFee,
        items: couponItems,
      },
      adminClient,
    )
    if (autoResult.valid) {
      couponId = autoResult.couponId || null
      couponDiscountAmount = autoResult.discountAmount
      couponPricingData = autoResult.pricingCoupon || null
      partialCouponWarning = Boolean(autoResult.partialApplicabilityWarning)
    }
  }

  const isFreeShippingCoupon = Boolean(
    couponPricingData?.freeShipping || couponPricingData?.discountType === "free_shipping",
  )
  if (params.deliveryType === "delivery" && isFreeShippingCoupon) {
    const quote = await quoteDeliveryFeeAction({
      partnerId,
      destinationAddress: params.deliveryAddress,
      freeDeliveryCoupon: true,
    })
    if (quote.success) {
      deliveryFee = Number(quote.fee || 0)
      deliveryBreakdown = quote.breakdown
    }
  }

  const promotionsData = await listActivePromotionsForMarketplaceAction(partnerId, params.userId)

  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: deliveryFee,
    coupon: couponPricingData,
    promotions: promotionsData,
  })

  const giftProductIds = pricingResult.appliedGiftProductIds || []
  if (giftProductIds.length > 0) {
    const { data: giftProducts } = await adminClient
      .from("products")
      .select("id, name, is_active, stock_available")
      .in("id", giftProductIds)

    for (const giftId of giftProductIds) {
      const giftProd = (giftProducts || []).find((p: any) => p.id === giftId)
      if (!giftProd || !giftProd.is_active || (giftProd.stock_available ?? 0) <= 0) continue
      const promo = promotionsData.find((p) => p.giftProductId === giftId)
      orderItems.push({
        product_id: giftProd.id,
        variant_id: null,
        product_name: `[BRINDE] ${giftProd.name}`,
        product_price: 0,
        quantity: 1,
        subtotal: 0,
        is_promotional: true,
        promotion_id: promo?.id || null,
      })
    }
  }

  const promotionsAppliedSnapshot = (pricingResult.appliedPromotionIds || []).map((id) => {
    const p = promotionsData.find((promo) => promo.id === id)
    return {
      id,
      name: p?.name || "Promoção",
      type: p?.promotionType,
      discount_amount:
        p?.promotionType === "discount" || p?.promotionType === "buy_x_pay_y"
          ? pricingResult.promotionDiscountAmount
          : 0,
    }
  })

  const reserveItems = [
    ...resolvedLines
      .filter((line) => line.requiresStock && line.stockProductId)
      .map((line) => ({
        product_id: line.stockProductId!,
        variant_id: line.stockVariantId || null,
        quantity: line.quantity,
      })),
    ...orderItems
      .filter((item: any) => item.is_promotional)
      .map((item: any) => ({
        product_id: item.product_id as string,
        variant_id: null,
        quantity: 1,
      })),
  ]

  const productIds = resolvedLines
    .filter((l) => l.productId)
    .map((l) => l.productId as string)

  return {
    success: true,
    data: {
      partnerId,
      hasProducts,
      resolvedLines,
      orderItems,
      fulfillmentPayload,
      totalAmount: pricingResult.finalTotal,
      deliveryFee,
      distanceKm,
      deliveryBreakdown,
      couponId,
      couponDiscountAmount: pricingResult.couponDiscountAmount,
      promotionsAppliedSnapshot,
      pricingResult,
      reserveItems,
      productIds,
      partialCouponWarning,
    },
  }
}

/** Map order_items rows for MP process-payment insert shape */
export function mapOrderItemsForPaymentInsert(
  orderId: string,
  orderItems: Record<string, unknown>[],
) {
  return orderItems.map((item) => ({
    order_id: orderId,
    product_id: item.product_id ?? null,
    variant_id: item.variant_id ?? null,
    product_name: item.product_name,
    product_price: item.product_price,
    quantity: item.quantity,
    subtotal: Number(item.product_price || 0) * Number(item.quantity || 0),
    is_promotional: item.is_promotional ?? false,
    promotion_id: item.promotion_id ?? null,
  }))
}

export function mapReserveItemsFromOrderRows(orderItems: Record<string, unknown>[]) {
  return orderItems
    .filter((item) => item.product_id)
    .map((item) => ({
      product_id: item.product_id as string,
      variant_id: (item.variant_id as string) || null,
      quantity: Number(item.quantity || 0),
    }))
}
