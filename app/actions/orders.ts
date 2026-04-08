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
  // Fetch the actual price from the database — NEVER trust client totalAmount
  // ========================================================================
  let serverPrice: number
  let itemName: string = "Item"

  if (data.itemType === "product") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("price, promotional_price, name, is_active")
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

    // ========================================================================
    // SECURITY FIX: Atomic stock decrement with stock >= quantity guard
    // Prevents overselling under concurrent requests
    // ========================================================================
    const { data: stockResult, error: stockError } = await supabase.rpc(
      "decrement_stock_atomic", {
      p_product_id: data.itemId,
      p_quantity: data.quantity,
    }
    )

    if (stockError || !stockResult) {
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

  // Verify client total matches server calculation (tolerance for floating point)
  const expectedTotal = serverPrice * data.quantity
  if (Math.abs(expectedTotal - data.totalAmount) > 0.01) {
    console.warn(`[SECURITY] Price manipulation attempt: user=${buyerId}, expected=${expectedTotal}, claimed=${data.totalAmount}`)
    return { error: "O valor do pedido não corresponde ao preço atual do item" }
  }

  const { data: buyerProfile } = await supabase.from("user_profiles").select("full_name").eq("user_id", buyerId).single()

  const orderData: any = {
    buyer_id: buyerId,
    customer_name: buyerProfile?.full_name || null,
    partner_id: data.partnerId,
    total_amount: expectedTotal, // SECURITY: Use server-calculated total, not client value
    delivery_type: data.deliveryType,
    delivery_address: data.deliveryAddress,
    payment_method: data.paymentMethod,
    payment_provider: data.paymentMethod,
    situation: "pending",
    notes: data.notes || null,
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
    product_price: serverPrice, // SECURITY: Use server price
    quantity: data.quantity,
    subtotal: expectedTotal,
  })

  revalidateOrdersCache()

  return { success: true, orderNumber: order.order_number, orderId: order.id }
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
    cancelled: [], // status final — não pode ser alterado
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
        .select("order_number, partner_id, total_amount, payment_method, notes, customer_name")
        .eq("id", orderId)
        .single()

      if (fullOrder) {
        await createTransactionFromOrder(supabase, {
          order_number: fullOrder.order_number,
          partner_id: fullOrder.partner_id,
          total_amount: fullOrder.total_amount,
          payment_method: fullOrder.payment_method,
          notes: fullOrder.notes,
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

  // SECURITY: Delete parent FIRST — if this fails, children stay intact.
  // Previously children were deleted first, causing orphaned data if parent delete failed.
  const { error } = await supabase.from("orders").delete().eq("id", orderId)

  if (error) {
    return { error: error.message }
  }

  // Children cleanup (order_items, stock_movements) — safe because parent is already gone.
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
    .select("situation, buyer_id, mp_payment_id, partner_id")
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

  revalidateOrdersCache()
  return { success: true }
}
