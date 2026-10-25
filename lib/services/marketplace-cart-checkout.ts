/**
 * Shared server-side pricing for unified cart checkout (store + Mercado Pago).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing, type PricingInput } from "@/lib/services/pricing-engine"
import { cachedListActivePromotionsForMarketplaceAction } from "@/lib/cache/checkout-cache"
import {
  calculateServiceTravelFeeForOrder,
  quoteDeliveryFeeAction,
  resolveDeliverySettingsRow,
  resolveStoreFulfillmentCapabilities,
} from "@/app/actions/shared/delivery"
import {
  quoteCarrierFreightFee,
  extractPostalCodeFromAddress,
} from "@/lib/services/shipping/carrier-checkout"
import {
  allFlowLinesAllowLocalDelivery,
  buildFulfillmentPayload,
  deliverySelectionIssue,
  type ResolvedCartLine,
} from "@/lib/services/marketplace-cart-resolver"
import { resolveSubscriptionShipping } from "@/lib/services/recurring/shipping"
import type { RecurringShippingMode } from "@/lib/types/recurring"
import { resolveCheckoutCartLines } from "@/lib/services/marketplace-cart-resolver"
import type { CheckoutFulfillmentPayload } from "@/lib/types/marketplace-cart"
import { resolveMarketplaceCapabilities } from "@/lib/marketplace-capabilities"

export type MarketplaceCartCheckoutPricing = {
  partnerId: string
  hasProducts: boolean
  subtotal: number
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
  /** Valor final APÓS descontos/juros/taxa do método de pagamento */
  finalAmountWithPayment: number
}

export async function priceMarketplaceCartCheckout(
  adminClient: SupabaseClient,
  params: {
    userId: string
    cartItemIds: string[]
    deliveryType: "delivery" | "pickup"
    deliveryAddress: string
    destinationCoords?: { lat: number; lng: number } | null
    couponCode?: string | null
    /** Payment method configuration for discount/interest/fee computation */
    paymentMethod?: PricingInput["paymentMethod"]
    skipCartUpdate?: boolean
    /** Selected carrier freight service (SuperFrete) when own delivery has no coverage */
    carrierServiceId?: number | null
    destinationPostalCode?: string | null
  },
): Promise<{ success: true; data: MarketplaceCartCheckoutPricing } | { success: false; error: string }> {
  // Ensure cart fulfillment mode for products matches the requested deliveryType
  if (!params.skipCartUpdate) {
    const targetFulfillmentMode = params.deliveryType === "delivery" ? "delivery" : "pickup"
    await adminClient
      .from("cart_items")
      .update({ fulfillment_mode: targetFulfillmentMode, updated_at: new Date().toISOString() })
      .in("id", params.cartItemIds)
      .eq("user_id", params.userId)
      .or("item_type.eq.product,item_type.is.null,product_id.not.is.null")
  }

  const { data: cartMeta } = await adminClient
    .from("cart_items")
    .select("partner_id, store_id")
    .in("id", params.cartItemIds)
    .eq("user_id", params.userId)
    .limit(1)
    .maybeSingle()
  const storeCaps = cartMeta?.partner_id
    ? await resolveStoreFulfillmentCapabilities(cartMeta.partner_id, cartMeta.store_id || null)
    : undefined
  const marketplaceCapabilities = cartMeta?.partner_id
    ? await resolveMarketplaceCapabilities(cartMeta.partner_id, { storeId: cartMeta.store_id || null })
    : null
  const couponsEnabled = marketplaceCapabilities?.couponsEnabled ?? true

  const resolved = await resolveCheckoutCartLines(
    adminClient,
    params.userId,
    params.cartItemIds,
    storeCaps,
  )
  if (!resolved.success) return { success: false, error: resolved.error }

  const { lines: resolvedLines, partnerId, hasProducts, hasDeliveryLines } = resolved

  // Autoritativo: bloqueia escolha incompatível com os modos efetivos dos itens.
  const selectionIssue = deliverySelectionIssue(resolvedLines, params.deliveryType)
  if (selectionIssue) return { success: false, error: selectionIssue }

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
    params.deliveryAddress,
    params.deliveryType,
  )

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null
  let carrierApplied = false

  const targetStoreId = resolvedLines.find((l) => l.storeId)?.storeId || null

  // Carrinho só com serviços não cota frete (nem próprio nem transportadora):
  // serviços não têm envio físico e a cotação gerava "raio" indevido.
  const hasOnlyServiceLines = resolvedLines.every((l) => l.itemType === "service_booking")

  // Assinaturas seguem a política de frete do PRÓPRIO PLANO (pickup/included =
  // 0, flat = valor fixo, quote = cotação única no cadastro). Cotar o frete
  // próprio do vendedor para um carrinho só de assinatura inflava o total do
  // checkout (ex.: plano com frete incluso virando preço + frete).
  const hasOnlySubscriptionLines =
    resolvedLines.length > 0 && resolvedLines.every((l) => l.itemType === "subscription")
  let subscriptionShippingFee = 0
  let subscriptionShippingNeedsQuote = false

  if (hasOnlySubscriptionLines && params.deliveryType === "delivery") {
    const planIds = Array.from(
      new Set(resolvedLines.map((l) => l.recurringPlanId).filter((id): id is string => Boolean(id))),
    )
    if (planIds.length > 0) {
      const { data: planRows } = await adminClient
        .from("recurring_plans")
        .select("id, shipping_mode, shipping_flat_amount")
        .in("id", planIds)

      for (const row of planRows || []) {
        const shipping = resolveSubscriptionShipping({
          deliveryType: params.deliveryType,
          shippingMode: ((row as any).shipping_mode as RecurringShippingMode) || "included",
          shippingFlatAmount: Number((row as any).shipping_flat_amount || 0),
        })
        if (!shipping.resolved) subscriptionShippingNeedsQuote = true
        else subscriptionShippingFee += shipping.amount
      }
    }
  }

  const shouldQuoteDelivery = hasOnlySubscriptionLines
    ? subscriptionShippingNeedsQuote &&
    Boolean(params.deliveryAddress) &&
    params.deliveryType === "delivery"
    : !hasOnlyServiceLines &&
    (hasDeliveryLines || (hasProducts && params.deliveryType === "delivery")) &&
    Boolean(params.deliveryAddress) &&
    params.deliveryType === "delivery"

  if (shouldQuoteDelivery) {
    // Transportadora selecionada (SuperFrete) é a fonte autoritativa do frete -
    // pula a cotação do frete próprio (geocoding + raio) que tornava o checkout
    // lento: cada recálculo de totais re-cotava o frete próprio mesmo com o
    // carrier já escolhido. Fallback para o frete próprio só se o carrier falhar.
    if (params.carrierServiceId) {
      const cep =
        String(params.destinationPostalCode || "").replace(/\D/g, "") ||
        extractPostalCodeFromAddress(params.deliveryAddress)
      const carrier = await quoteCarrierFreightFee(adminClient, {
        partnerId,
        toPostalCode: cep,
        serviceId: params.carrierServiceId,
      })
      if (carrier.success) {
        deliveryFee = carrier.fee
        distanceKm = null
        deliveryBreakdown = carrier.breakdown
        carrierApplied = true
      } else {
        const own = await quoteDeliveryFeeAction({
          partnerId,
          storeId: targetStoreId,
          destinationAddress: params.deliveryAddress,
          destinationCoords: params.destinationCoords,
          freeDeliveryCoupon: false,
          orderSubtotal: subtotal,
        })
        if (own.success) {
          deliveryFee = Number(own.fee || 0)
          distanceKm = Number(own.distanceKm || 0)
          deliveryBreakdown = own.breakdown
        } else {
          return { success: false, error: carrier.error || own.error || "Erro na cotação de entrega." }
        }
      }
    } else {
      // Itens que não aceitam entrega própria exigem escolha de envio nacional.
      if (!allFlowLinesAllowLocalDelivery(resolvedLines)) {
        return { success: false, error: "Selecione uma opção de envio para concluir o pedido." }
      }
      const quote = await quoteDeliveryFeeAction({
        partnerId,
        storeId: targetStoreId,
        destinationAddress: params.deliveryAddress,
        destinationCoords: params.destinationCoords,
        freeDeliveryCoupon: false,
        orderSubtotal: subtotal,
      })
      if (quote.success) {
        deliveryFee = Number(quote.fee || 0)
        distanceKm = Number(quote.distanceKm || 0)
        deliveryBreakdown = quote.breakdown
      } else {
        return { success: false, error: quote.error || "Erro na cotação de entrega." }
      }
    }
  }

  // Frete fixo do plano (shipping_mode = flat) entra no total junto da
  // cotação quando houver. Modos pickup/included zeram aqui mesmo.
  deliveryFee += subscriptionShippingFee

  let couponId: string | null = null
  let couponDiscountAmount = 0
  let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null
  let partialCouponWarning = false

  if (couponsEnabled && params.couponCode?.trim()) {
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
  } else if (couponsEnabled) {
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
  // Assinatura com frete fixo (flat) ou cotação pendente também entra no
  // frete grátis; modo included já nasce zerado.
  const freeShippingApplies = hasOnlySubscriptionLines
    ? subscriptionShippingNeedsQuote || subscriptionShippingFee > 0 || carrierApplied
    : ((!hasOnlyServiceLines && hasDeliveryLines) || carrierApplied)

  if (freeShippingApplies && isFreeShippingCoupon) {
    if (hasOnlySubscriptionLines && !subscriptionShippingNeedsQuote) {
      // Frete fixo do plano - não precisa (nem pode) re-cotar o frete próprio.
      deliveryFee = 0
      if (deliveryBreakdown) {
        deliveryBreakdown = { ...deliveryBreakdown, freeShippingApplied: true }
      }
    } else if (carrierApplied) {
      // Frete do carrier já resolvido - não re-cotar o frete próprio só pra zerar.
      deliveryFee = 0
      if (deliveryBreakdown) {
        deliveryBreakdown = { ...deliveryBreakdown, freeShippingApplied: true }
      }
    } else {
      const quote = await quoteDeliveryFeeAction({
        partnerId,
        storeId: targetStoreId,
        destinationAddress: params.deliveryAddress,
        destinationCoords: params.destinationCoords,
        freeDeliveryCoupon: true,
        orderSubtotal: subtotal,
      })
      if (quote.success) {
        deliveryFee = Number(quote.fee || 0)
        deliveryBreakdown = quote.breakdown
      }
    }
  }

  // Frete grátis por valor mínimo também vale para a transportadora: acima do
  // limite, a loja absorve o frete (valor original riscado + "Grátis" na UI).
  // O frete próprio já aplica o threshold dentro de quoteDeliveryFeeAction.
  if (carrierApplied && deliveryFee > 0) {
    const settingsRow = await resolveDeliverySettingsRow(adminClient, partnerId, targetStoreId)
    const rawThreshold = settingsRow?.free_delivery_threshold == null ? null : Number(settingsRow.free_delivery_threshold)
    const freeDeliveryThreshold = rawThreshold != null && !Number.isNaN(rawThreshold) && rawThreshold > 0 ? rawThreshold : null
    if (freeDeliveryThreshold !== null && subtotal >= freeDeliveryThreshold) {
      const originalFee = deliveryFee
      deliveryFee = 0
      deliveryBreakdown = {
        ...(deliveryBreakdown || {}),
        originalFee,
        deliverySubsidy: originalFee,
        deliveryPayer: "seller",
        isFreeByThreshold: true,
        freeDeliveryThreshold,
        freeDeliveryReason: "threshold",
      }
    }
  }

  // Taxa de deslocamento de serviços a domicílio (customer_location). Precisa
  // entrar no mesmo total do checkout e bloquear quando o endereço está fora do
  // raio máximo de atendimento configurado pela loja. Sem isso o fluxo de
  // pagamento (Mercado Pago) finalizava ignorando raio e taxa.
  const serviceLinesForTravel = resolvedLines.filter(
    (l) => l.itemType === "service_booking" && (l.fulfillmentMode === "customer_location" || l.lineRequiresDelivery),
  )
  if (serviceLinesForTravel.length > 0 && params.deliveryAddress) {
    const serviceLineForTravel = serviceLinesForTravel.find((l) => l.storeId) || serviceLinesForTravel[0]
    const serviceTravel = await calculateServiceTravelFeeForOrder({
      supabase: adminClient,
      partnerId,
      storeId: serviceLineForTravel.storeId || targetStoreId,
      serviceId: serviceLineForTravel.serviceId || null,
      deliveryAddress: params.deliveryAddress,
      destinationCoords: params.destinationCoords ?? null,
      orderSubtotal: subtotal,
    })
    if (!serviceTravel.success) {
      return { success: false, error: serviceTravel.error || "Endereço fora do raio de atendimento deste serviço." }
    }
    if (serviceTravel.fee > 0) {
      deliveryFee = Math.round((deliveryFee + serviceTravel.fee) * 100) / 100
      deliveryBreakdown = {
        ...(deliveryBreakdown || {}),
        serviceTravelFee: serviceTravel.fee,
        serviceTravelDistanceKm: serviceTravel.distanceKm,
        serviceTravelOutOfRadius: serviceTravel.outOfRadius,
        travelFee: serviceTravel.fee,
      }
    }
  }

  const promotionsData = await cachedListActivePromotionsForMarketplaceAction(partnerId, params.userId)

  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: deliveryFee,
    coupon: couponPricingData,
    promotions: promotionsData,
    paymentMethod: params.paymentMethod ?? undefined,
  })

  // Zero out delivery fee when free shipping comes from a campaign promotion
  // (coupon-driven free shipping is already handled above)
  if (pricingResult.freeShippingApplied && !isFreeShippingCoupon) {
    deliveryFee = 0
    if (deliveryBreakdown) {
      deliveryBreakdown = { ...deliveryBreakdown, freeShippingApplied: true }
    }
  }

  const giftProductIds = pricingResult.appliedGiftProductIds || []
  if (giftProductIds.length > 0) {
    const { buildGiftOrderItems } = await import("@/app/actions/shared/promotions")
    const giftOrderItems = await buildGiftOrderItems(adminClient, giftProductIds, promotionsData)
    orderItems.push(...giftOrderItems)
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
      .filter((item: any) => item.is_promotional && item.product_id)
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
      subtotal: pricingResult.subtotal,
      resolvedLines,
      orderItems,
      fulfillmentPayload,
      totalAmount: pricingResult.finalAmountWithPayment,
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
      finalAmountWithPayment: pricingResult.finalAmountWithPayment,
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
    subtotal: item.subtotal ?? Number(item.product_price || 0) * Number(item.quantity || 0),
    line_type: item.line_type ?? null,
    fulfillment_mode: item.fulfillment_mode ?? null,
    service_id: item.service_id ?? null,
    recurring_plan_id: item.recurring_plan_id ?? null,
    is_promotional: item.is_promotional ?? false,
    promotion_id: item.promotion_id ?? null,
    is_gift: item.is_gift ?? false,
    original_price: item.original_price ?? null,
    unit_cost: item.unit_cost ?? null,
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
