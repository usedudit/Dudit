"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { redirect } from 'next/navigation'
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
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"

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
  notes: string
  partnerId: string
  csrf_token?: string
  couponCode?: string | null
}) {
  await requireRateLimit(RateLimitCategory.ORDER_CREATE)

  // 0. Check subscription limits
  const limitName = data.itemType === "product" ? "orders_per_month" : "appointments_per_month"
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

  if (data.itemType === "product") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("price, promotional_price, name, is_active, stock_available")
      .eq("id", data.itemId)
      .single()

    if (productError || !product) {
      return { error: "Produto não encontrado" }
    }
    if (!product.is_active) {
      return { error: "Este produto não está mais disponível" }
    }

    // Use promotional price if it exists and is lower
    serverPrice = (product.promotional_price && product.promotional_price < product.price)
      ? product.promotional_price
      : product.price
    itemName = product.name || "Produto"

    if ((product.stock_available ?? 0) < data.quantity) {
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
      items: data.itemType === "product" ? [{ productId: data.itemId }] : [{ serviceId: data.itemId }],
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
      items: data.itemType === "product" ? [{ productId: data.itemId }] : [{ serviceId: data.itemId }],
    })
    if (autoResult.valid) {
      couponIdToSave = autoResult.couponId || null
      couponDiscountAmount = autoResult.discountAmount
      couponPricingData = autoResult.pricingCoupon || null
    }
  }

  // Run through pricing engine for consistent calculation
  const pricingResult = calculateOrderPricing({
    items: [{
      productId: data.itemType === "product" ? data.itemId : null,
      serviceId: data.itemType === "service" ? data.itemId : null,
      unitPrice: serverPrice,
      quantity: data.quantity,
    }],
    shippingCost: 0,
    coupon: couponPricingData,
  })

  const finalTotal = pricingResult.finalTotal
  couponDiscountAmount = pricingResult.couponDiscountAmount

  const { data: buyerProfile } = await supabase.from("user_profiles").select("full_name").eq("user_id", buyerId).single()

  const paymentIsMp = String(data.paymentMethod || "").toLowerCase().includes("mercado pago")
  let financeAccountId: string | null = null
  if (paymentIsMp) {
    financeAccountId = await resolveMarketplaceOrderFinanceAccountId(
      getAdminClient(),
      data.partnerId,
      true,
    )
  } else {
    const bestMethod = await pickBestPaymentMethod(
      supabase as any,
      toCanonicalPaymentType(data.paymentMethod),
      data.partnerId,
      { preferDefault: true },
    )
    financeAccountId = bestMethod?.default_finance_account_id || null
  }

  if (!financeAccountId) {
    return {
      error: paymentIsMp
        ? "Esta loja não possui conta Mercado Pago cadastrada no financeiro."
        : "Esta loja não possui conta bancária ou caixa ativa para registrar o pedido.",
    }
  }

  const orderData: any = {
    buyer_id: buyerId,
    customer_name: buyerProfile?.full_name || null,
    partner_id: data.partnerId,
    total_amount: finalTotal,
    delivery_type: data.deliveryType,
    delivery_address: data.deliveryAddress,
    payment_method: data.paymentMethod,
    payment_provider: data.paymentMethod,
    situation: "pending",
    notes: data.notes || null,
    coupon_id: couponIdToSave,
    discount_amount: couponDiscountAmount,
    finance_account_id: financeAccountId,
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
    product_id: data.itemId,
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
        product_id: data.itemId,
        quantity: data.quantity,
      }],
    })

    if ("error" in reserveResult) {
      await supabase.from("order_items").delete().eq("order_id", order.id)
      await supabase.from("orders").delete().eq("id", order.id)
      return { error: reserveResult.error }
    }

    await invalidateProductCache(data.itemId, data.partnerId, "update", { silent: true })
  }

  revalidateOrdersCache()

  return {
    success: true,
    orderNumber: order.order_number,
    orderId: order.id,
    couponApplied: couponIdToSave ? true : false,
    couponDiscount: couponDiscountAmount,
    finalTotal,
  }
}

export async function updateOrderAction(
  orderId: string,
  data: {
    situation: string
    internal_notes?: string
    csrf_token?: string
  },
) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const access = await requireOrderAccess(orderId)

  if (access.role !== "seller") {
    return { error: "Apenas o vendedor pode atualizar o status do pedido" }
  }

  const validSituations = ["pending", "in_process", "paid", "shipped", "delivered", "cancelled"]
  if (!validSituations.includes(data.situation)) {
    return { error: "Situação inválida" }
  }

  const supabase = await getSupabaseServerClient()

  // Buscar status atual para validar transição
  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("situation")
    .eq("id", orderId)
    .single()

  if (fetchError || !currentOrder) {
    return { error: "Pedido não encontrado" }
  }

  // Validar transições permitidas (nunca regredir)
  const allowedTransitions: Record<string, string[]> = {
    pending: ["in_process", "paid", "shipped", "delivered", "cancelled"],
    in_process: ["paid", "shipped", "delivered", "cancelled"],
    paid: ["shipped", "delivered", "cancelled"],
    shipped: ["delivered", "cancelled"],
    delivered: ["cancelled"],
    cancelled: [], // status final - não pode ser alterado
  }

  const allowed = allowedTransitions[currentOrder.situation] || []
  if (!allowed.includes(data.situation)) {
    return { error: `Não é possível mudar de "${currentOrder.situation}" para "${data.situation}"` }
  }

  const { error } = await supabase
    .from("orders")
    .update({
      situation: data.situation,
      internal_notes: data.internal_notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)

  if (error) {
    return { error: error.message }
  }

  // Se marcou como pago, criar transaction de receita
  if (data.situation === "paid") {
    try {
      const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
      const { data: fullOrder } = await supabase
        .from("orders")
        .select("order_number, partner_id, total_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name")
        .eq("id", orderId)
        .single()

      if (fullOrder) {
        await createTransactionFromOrder(supabase, {
          order_number: fullOrder.order_number,
          partner_id: fullOrder.partner_id,
          total_amount: fullOrder.total_amount,
          payment_method: fullOrder.payment_method,
          payment_provider: fullOrder.payment_provider,
          payment_breakdown: fullOrder.payment_breakdown,
          customer_contact_id: fullOrder.buyer_id,
          customer_name: fullOrder.customer_name,
        })
      }
    } catch (txErr: any) {
      console.error("[ORDER] Erro ao criar transaction:", txErr.message)
    }
  }

  revalidateOrdersCache()

  redirect("/erp/orders")
}

export async function deleteOrderAction(orderId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const access = await requireOrderAccess(orderId)

  if (access.role !== "seller") {
    return { error: "Apenas o vendedor pode excluir pedidos" }
  }

  const supabase = await getSupabaseServerClient()

  // SECURITY: Delete parent FIRST - if this fails, children stay intact.
  // Previously children were deleted first, causing orphaned data if parent delete failed.
  const { error } = await supabase.from("orders").delete().eq("id", orderId)

  if (error) {
    return { error: error.message }
  }

  // Children cleanup (order_items, stock_movements) - safe because parent is already gone.
  // If these fail, the data is orphaned but not a security risk.
  await supabase.from("order_items").delete().eq("order_id", orderId)
  await supabase.from("stock_movements").delete().eq("order_id", orderId)

  revalidateOrdersCache()

  redirect("/erp/orders")
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
