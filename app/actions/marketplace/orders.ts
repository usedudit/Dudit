"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { OrderSchema } from "@/lib/validation/schemas"
import { requireUser, requireOrderAccess } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { releaseOrderInventory, reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { toCanonicalPaymentType, formatPaymentMethodLabel } from "@/lib/payments/payment-method"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"

// Single revalidation to minimize cache calls
const revalidateOrdersCache = async () => await revalidateOrders("")

export async function createOrderAction(data: {
  itemId: string
  itemType: "product" | "service"
  quantity: number
  totalAmount: number
  deliveryType: "delivery" | "pickup"
  deliveryAddress: string
  paymentMethod: string
  installments?: number
  notes: string
  partnerId: string
  csrf_token?: string
  couponCode?: string | null
}) {
  await requireRateLimit(RateLimitCategory.ORDER_CREATE)

  // 0. Check subscription limits
  const limitName = data.itemType === "product" ? "monthly_orders" : "monthly_appointments"
  const limitCheck = await checkLimit(data.partnerId, limitName)
  if (!limitCheck.allowed) {
    return { error: limitCheck.message || "Limite mensal atingido para este plano." }
  }

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  // SECURITY FIX (CRIT-02): buyerId derived from session, NEVER from client
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }
  const buyerId = user.id

  const validation = OrderSchema.safeParse({
    itemId: data.itemId,
    itemType: data.itemType,
    quantity: data.quantity,
    totalAmount: data.totalAmount,
    deliveryType: data.deliveryType,
    deliveryAddress: data.deliveryAddress,
    paymentMethod: data.paymentMethod,
    notes: data.notes,
    partnerId: data.partnerId,
    buyerId: buyerId,
  })

  if (!validation.success) {
    return { error: validation.error.issues[0].message }
  }

  const supabase = await getSupabaseServerClient()

  // ========================================================================
  // SECURITY FIX (CRIT-02): Server-side price verification
  // Fetch the actual price from the database - NEVER trust client totalAmount
  // ========================================================================
  let serverPrice: number
  let itemName: string = "Item"
  let preparationProducts: Array<{ availability_value?: number | null; availability_unit?: string | null }> = []
  let parentProductId = data.itemId
  let resolvedVariantId: string | null = null

  if (data.itemType === "product") {
    const { data: variantData } = await supabase
      .from("product_variants")
      .select("id, product_id, price_adjustment, stock_available, variant_name")
      .eq("id", data.itemId)
      .maybeSingle()

    let productQueryId = data.itemId
    if (variantData) {
      parentProductId = variantData.product_id
      resolvedVariantId = variantData.id
      productQueryId = variantData.product_id
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("price, promotional_price, name, is_active, stock_available, availability_value, availability_unit")
      .eq("id", productQueryId)
      .single()

    if (productError || !product) {
      return { error: "Produto não encontrado" }
    }
    if (!product.is_active) {
      return { error: "Este produto não está mais disponível" }
    }

    let basePrice = (product.promotional_price && product.promotional_price < product.price)
      ? product.promotional_price
      : product.price

    if (variantData) {
      basePrice = basePrice + Number(variantData.price_adjustment || 0)
    }

    serverPrice = basePrice
    itemName = variantData
      ? `${product.name} - ${variantData.variant_name}`
      : (product.name || "Produto")

    preparationProducts = [{
      availability_value: Number(product.availability_value || 0),
      availability_unit: product.availability_unit || "Minutos",
    }]

    const stockAvailable = variantData ? (variantData.stock_available ?? 0) : (product.stock_available ?? 0)
    if (stockAvailable < data.quantity) {
      return { error: "Estoque insuficiente para este produto" }
    }

  } else if (data.itemType === "service") {
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("price, name, is_active")
      .eq("id", data.itemId)
      .single()

    if (serviceError || !service) {
      return { error: "Serviço não encontrado" }
    }
    if (!service.is_active) {
      return { error: "Este serviço não está mais disponível" }
    }

    serverPrice = service.price
    itemName = service.name || "Serviço"
  } else {
    return { error: "Tipo de item inválido" }
  }

  const expectedTotal = serverPrice * data.quantity

  // ========================================================================
  // COUPON VALIDATION & PRICING ENGINE
  // ========================================================================
  let couponIdToSave: string | null = null
  let couponDiscountAmount = 0
  let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null

  // Try manual coupon code first, then auto-detect
  if (data.couponCode?.trim()) {
    const couponResult = await validateCoupon({
      partnerId: data.partnerId,
      code: data.couponCode,
      customerId: buyerId,
      subtotal: expectedTotal,
      items: data.itemType === "product" ? [{ productId: parentProductId }] : [{ serviceId: data.itemId }],
    })
    if (couponResult.valid) {
      couponIdToSave = couponResult.couponId || null
      couponDiscountAmount = couponResult.discountAmount
      couponPricingData = couponResult.pricingCoupon || null
    }
    // If invalid, proceed without coupon (don't block the order)
  } else {
    // Auto-detect best automatic coupon
    const autoResult = await findBestAutomaticCoupon({
      partnerId: data.partnerId,
      customerId: buyerId,
      subtotal: expectedTotal,
      items: data.itemType === "product" ? [{ productId: parentProductId }] : [{ serviceId: data.itemId }],
    })
    if (autoResult.valid) {
      couponIdToSave = autoResult.couponId || null
      couponDiscountAmount = autoResult.discountAmount
      couponPricingData = autoResult.pricingCoupon || null
    }
  }

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null
  if (data.deliveryType === "delivery") {
    const quote = await quoteDeliveryFeeAction({
      partnerId: data.partnerId,
      destinationAddress: data.deliveryAddress,
      freeDeliveryCoupon: Boolean(couponPricingData?.freeShipping || couponPricingData?.discountType === "free_shipping"),
    })
    if (!quote.success) return { error: quote.error }
    deliveryFee = Number(quote.fee || 0)
    distanceKm = Number(quote.distanceKm || 0)
    deliveryBreakdown = quote.breakdown
  }

  // Run through pricing engine for consistent calculation
  const pricingResult = calculateOrderPricing({
    items: [{
      productId: data.itemType === "product" ? parentProductId : null,
      serviceId: data.itemType === "service" ? data.itemId : null,
      unitPrice: serverPrice,
      quantity: data.quantity,
    }],
    shippingCost: deliveryFee,
    coupon: couponPricingData,
  })

  const finalTotal = pricingResult.finalTotal
  couponDiscountAmount = pricingResult.couponDiscountAmount

  const { data: buyerProfile } = await supabase.from("user_profiles").select("full_name").eq("user_id", buyerId).single()

  const paymentIsMp = String(data.paymentMethod || "").toLowerCase().includes("mercado pago")
  let financeAccountId: string | null = null
  
  let bestMethod: any = null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.paymentMethod)
  if (isUuid && !paymentIsMp) {
    const { data: methodData } = await supabase.from("payment_methods").select("*").eq("id", data.paymentMethod).single()
    bestMethod = methodData
  }
  
  const chosenType = toCanonicalPaymentType(bestMethod?.type || bestMethod?.payment_type || data.paymentMethod)

  if (!bestMethod && !paymentIsMp) {
    bestMethod = await pickBestPaymentMethod(
      supabase as any,
      chosenType,
      data.partnerId,
      { preferDefault: true },
    )
  }

  if (paymentIsMp) {
    financeAccountId = await resolveMarketplaceOrderFinanceAccountId(
      getAdminClient(),
      data.partnerId,
      true,
    )
  } else {
    financeAccountId = bestMethod?.default_finance_account_id || null
  }

  let paymentAwareTotal = finalTotal

  if (bestMethod?.id && !paymentIsMp) {
    const { data: fees } = await supabase
      .from("payment_method_installment_fees")
      .select("installment_number, fee_percent")
      .eq("payment_method_id", bestMethod.id)
    const calc = calculatePaymentAmounts({
      originalAmount: finalTotal,
      installmentNumber: Math.max(1, Number(data.installments || 1)),
      paymentMethod: {
        feePercent: Number(bestMethod.fee_percent || bestMethod.percentage_rate || 0),
        feeFixed: Number(bestMethod.fee_fixed || bestMethod.fixed_amount || 0),
        feeBearer: (bestMethod.fee_bearer || "merchant") as "merchant" | "customer",
        discountPercent: Number(bestMethod.discount_percent || 0),
        maxInstallments: Number(bestMethod.max_installments || 1),
        installmentFees: (fees || []).map((row: any) => ({
          installmentNumber: Number(row.installment_number || 1),
          feePercent: Number(row.fee_percent || 0),
        })),
      },
    })
    paymentAwareTotal = Number(calc.finalAmount || finalTotal)
  }

  if (!financeAccountId) {
    return {
      error: paymentIsMp
        ? "Esta loja não possui conta Mercado Pago cadastrada no financeiro."
        : "Esta loja não possui conta bancária ou caixa ativa para registrar o pedido.",
    }
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("opening_hours")
    .eq("id", data.partnerId)
    .maybeSingle()

  const orderPreparation = computeOrderPreparationEstimate({
    products: preparationProducts,
    openingHours: (partner as any)?.opening_hours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  })

  let paymentMethodName = data.paymentMethod
  if (bestMethod?.name) {
    paymentMethodName = bestMethod.name
  } else {
    paymentMethodName = formatPaymentMethodLabel(data.paymentMethod)
  }

  const orderData: any = {
    buyer_id: buyerId,
    customer_name: buyerProfile?.full_name || null,
    partner_id: data.partnerId,
    product_id: data.itemType === "product" ? parentProductId : null,
    service_id: data.itemType === "service" ? data.itemId : null,
    total_amount: paymentAwareTotal,
    delivery_fee: deliveryFee,
    distance_km: distanceKm,
    delivery_breakdown: deliveryBreakdown,
    delivery_type: data.deliveryType,
    delivery_address: data.deliveryAddress,
    payment_method: paymentMethodName,
    payment_breakdown: paymentIsMp || !bestMethod?.id
      ? []
      : [{
        method: chosenType,
        amount: paymentAwareTotal,
        paymentMethodId: bestMethod.id,
        installmentNumber: Math.max(1, Number(data.installments || 1)),
      }],
    payment_provider: paymentIsMp ? "Mercado Pago" : null,
    situation: "pending",
    notes: data.notes || null,
    coupon_id: couponIdToSave,
    discount_amount: couponDiscountAmount,
    finance_account_id: financeAccountId,
    ...(orderPreparation ? {
      preparation_time_minutes: orderPreparation.preparationTimeMinutes,
      estimated_ready_at: orderPreparation.readyAt.toISOString(),
      pickup_window_start: orderPreparation.pickupWindowStart.toISOString(),
      pickup_window_end: orderPreparation.pickupWindowEnd.toISOString(),
      estimated_delivery_at: data.deliveryType === "delivery" ? orderPreparation.estimatedDeliveryAt.toISOString() : null,
    } : {}),
  }

  const { data: order, error } = await supabase.from("orders").insert(orderData).select().single()

  if (error) {
    return { error: error.message }
  }

  // Increment usage counter
  const counterName = data.itemType === "product" ? "orders_month_count" : "appointments_month_count"
  increment_usage_counter(data.partnerId, counterName).catch(console.error)

  await supabase.from("order_items").insert({
    order_id: order.id,
    product_id: data.itemType === "product" ? parentProductId : null,
    variant_id: resolvedVariantId,
    product_name: itemName,
    product_price: serverPrice,
    quantity: data.quantity,
    subtotal: expectedTotal,
  })

  // Record coupon usage
  if (couponIdToSave) {
    await supabase.from("coupon_usages").upsert(
      {
        coupon_id: couponIdToSave,
        customer_id: buyerId,
        order_id: order.id,
      },
      { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
    )
  }

  if (data.itemType === "product") {
    const reserveResult = await reserveOrderInventory({
      client: supabase,
      partnerId: data.partnerId,
      orderId: order.id,
      items: [{
        product_id: parentProductId,
        variant_id: resolvedVariantId,
        quantity: data.quantity,
      }],
    })

    if ("error" in reserveResult) {
      await supabase.from("order_items").delete().eq("order_id", order.id)
      await supabase.from("orders").delete().eq("id", order.id)
      return { error: reserveResult.error }
    }

    await invalidateProductCache(parentProductId, data.partnerId, "update", { silent: true })
  }

  revalidateOrdersCache()

  return {
    success: true,
    orderNumber: order.order_number,
    orderId: order.id,
    couponApplied: couponIdToSave ? true : false,
    couponDiscount: couponDiscountAmount,
    finalTotal: paymentAwareTotal,
  }
}

export async function cancelBuyerOrderAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("situation, buyer_id, mp_payment_id, partner_id, inventory_deducted, order_items(product_id, variant_id, quantity)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.buyer_id !== user.id) {
    return { error: "Sem permissão" }
  }

  if (order.situation !== "pending") {
    return { error: "Apenas pedidos pendentes podem ser cancelados" }
  }

  if (order.mp_payment_id && order.partner_id) {
    try {
      const mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      })

      if (!mpResponse.ok) {
        console.error(`[ORDER CANCELLATION] Failed to cancel payment ${order.mp_payment_id} in Mercado Pago. Status:`, mpResponse.status)
      }
    } catch (mpError) {
      console.error("[ORDER CANCELLATION] Error communicating with Mercado Pago for cancellation:", mpError)
    }
  }

  const { error } = await supabase
    .from("orders")
    .update({
      situation: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)

  if (error) {
    return { error: error.message }
  }

  if (!order.inventory_deducted) {
    const releaseResult = await releaseOrderInventory({
      client: supabase,
      partnerId: order.partner_id,
      orderId,
      items: order.order_items || [],
    })

    if ("error" in releaseResult) {
      return { error: releaseResult.error }
    }

    const productIds = Array.from(
      new Set(
        (order.order_items || [])
          .map((item: any) => item.product_id)
          .filter((productId: unknown): productId is string => typeof productId === "string" && productId.length > 0),
      ),
    ) as string[]

    for (const productId of productIds) {
      await invalidateProductCache(productId, order.partner_id, "update", { silent: true })
    }
  }

  revalidateOrdersCache()
  return { success: true }
}
