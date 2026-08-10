"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { releaseOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkoutCartAction, type MarketplaceCheckoutPricingSnapshot } from "@/app/actions/marketplace/cart"
import {
  prepareProductBuyNowCheckoutAction,
} from "@/app/actions/marketplace/cart-extensions"
import { addPurchasableServiceToCartAction } from "@/app/actions/marketplace/cart-extensions"
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { parseInTz } from "@/lib/date"

const revalidateOrdersCache = async () => await revalidateOrders("")

/**
 * @deprecated Prefer checkoutCartAction. Kept for buy-now session compatibility - delegates to unified cart checkout.
 */
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
  wantsChange?: boolean
  payWithAmount?: number
  payDepositOnly?: boolean
  checkoutPricingSnapshot?: MarketplaceCheckoutPricingSnapshot | null
}) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const fulfillmentMode = data.deliveryType === "delivery" ? "delivery" : "pickup"
  let cartItemId: string | undefined

  if (data.itemType === "product") {
    const admin = getAdminClient()
    const { data: variantRow } = await admin
      .from("product_variants")
      .select("product_id")
      .eq("id", data.itemId)
      .maybeSingle()
    const productId = variantRow?.product_id || data.itemId
    const variantId = variantRow ? data.itemId : undefined

    const prep = await prepareProductBuyNowCheckoutAction({
      productId,
      partnerId: data.partnerId,
      quantity: data.quantity,
      variantId,
      csrf_token: data.csrf_token,
    })
    if (prep.error) return { error: prep.error }
    cartItemId = prep.cartItemId
  } else if (data.itemType === "service") {
    const prep = await addPurchasableServiceToCartAction({
      serviceId: data.itemId,
      partnerId: data.partnerId,
      quantity: data.quantity,
      csrf_token: data.csrf_token,
    })
    if (prep.error) return { error: prep.error }
    cartItemId = (prep as any).cartItemId
  } else {
    return { error: "Tipo de item inválido." }
  }

  if (!cartItemId) return { error: "Não foi possível preparar o checkout." }

  return checkoutCartAction(
    [
      {
        cartItemId,
        productId: data.itemId,
        quantity: data.quantity,
        fulfillmentMode,
      },
    ],
    data.deliveryType,
    data.deliveryAddress,
    data.paymentMethod,
    data.installments,
    data.notes,
    data.couponCode,
    false,
    data.csrf_token,
    data.wantsChange,
    data.payWithAmount,
    data.payDepositOnly,
    data.checkoutPricingSnapshot,
  )
}

export async function cancelBuyerOrderAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, situation, buyer_id, mp_payment_id, partner_id, inventory_deducted, order_items(product_id, variant_id, quantity, service_id, line_type)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.buyer_id !== user.id) {
    return { error: "Sem permissão" }
  }

  const cancellableStates = ["pending", "unpaid", "in_process", "partially_paid"]
  if (!cancellableStates.includes(order.situation)) {
    return { error: "Apenas pedidos pendentes ou não pagos podem ser cancelados" }
  }

  if (order.mp_payment_id && order.partner_id) {
    try {
      const mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      })

      if (!mpResponse.ok) {
        console.error(
          `[ORDER CANCELLATION] Failed to cancel payment ${order.mp_payment_id} in Mercado Pago. Status:`,
          mpResponse.status,
        )
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
      client: supabase as any,
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
          .map((item: { product_id?: string | null }) => item.product_id)
          .filter((productId: string | null | undefined): productId is string => typeof productId === "string" && productId.length > 0),
      ),
    )

    for (const productId of productIds) {
      await invalidateProductCache(productId as string, order.partner_id, "update", { silent: true })
    }
  }

  // Call helper to sync appointments and transactions
  // The buyer has no partner_users membership, so the cancellation side
  // effects must run with admin only after this action has verified order
  // ownership and the order's canonical partner_id above.
  await syncCancelledOrderAppointmentsAndTransactions(getAdminClient(), orderId)

  // Log audit event for the cancelled order
  await logAuditEvent({
    partnerId: order.partner_id,
    actorUserId: user.id,
    entityType: "order",
    entityId: orderId,
    actionType: "cancelled",
    changeLines: ["Cliente cancelou o pedido."],
    source: "marketplace",
  })

  revalidateOrdersCache()
  return { success: true }
}

export async function getOrderHistoryForBuyerAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, partner_id")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.buyer_id !== user.id) {
    return { error: "Sem permissão" }
  }

  const { getOrderHistoryEntries } = await import("@/lib/services/order-history.service")
  try {
    const entries = await getOrderHistoryEntries(orderId, order.partner_id)
    return { success: true, data: entries }
  } catch (err: any) {
    console.error("[getOrderHistoryForBuyerAction] error:", err)
    return { error: err.message || "Erro ao buscar histórico" }
  }
}

export async function confirmOrderFulfillmentAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  // 1. Fetch order details with items
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, buyer_id, partner_id, delivery_status, situation, order_items(id, product_id, service_id, line_type, quantity)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (order.buyer_id !== user.id) {
    return { error: "Sem permissão" }
  }

  const orderItems = order.order_items || []
  const hasProducts = orderItems.some(
    (item: any) => !item.service_id && item.line_type !== "service_booking" && !item.recurring_plan_id && item.line_type !== "subscription"
  )
  const hasServices = orderItems.some(
    (item: any) => item.service_id || item.line_type === "service_booking"
  )

  // 2. Enforce product delivery verification
  if (hasProducts) {
    const validDeliveryStates = ["sent", "shipped", "out_for_delivery", "delivered"]
    if (!validDeliveryStates.includes(order.delivery_status || "")) {
      return { error: "Os produtos ainda não foram enviados para entrega." }
    }
  }

  // 3. Enforce service execution date verification
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, status, start_date, start_time, end_date, end_time")
    .eq("marketplace_order_id", orderId)

  if (hasServices && appointments && appointments.length > 0) {
    let latestCompletionTime = 0
    let latestAppt: any = null
    for (const appt of appointments) {
      const apptEnd = parseInTz(appt.end_date, appt.end_time)
      if (apptEnd.getTime() > latestCompletionTime) {
        latestCompletionTime = apptEnd.getTime()
        latestAppt = appt
      }
    }

    if (Date.now() < latestCompletionTime) {
      const apptDateStr = latestAppt.start_date
      const apptTimeStr = latestAppt.start_time.slice(0, 5)
      return {
        error: `A execução dos serviços só pode ser confirmada após o término do agendamento (${apptDateStr} às ${apptTimeStr}).`
      }
    }
  }

  // 4. Update order delivery status
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      delivery_status: "delivered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)

  if (updateError) {
    return { error: updateError.message }
  }

  // 5. Update active appointments status to 'Concluído' without touching financials
  if (appointments && appointments.length > 0) {
    const activeAppts = appointments.filter(
      (appt: any) => appt.status !== "Concluído" && appt.status !== "Cancelado"
    )
    if (activeAppts.length > 0) {
      const activeIds = activeAppts.map((appt: any) => appt.id)
      await supabase
        .from("appointments")
        .update({
          status: "Concluído",
          updated_at: new Date().toISOString(),
        })
        .in("id", activeIds)
    }
  }

  // 6. Log audit event with order history
  let logMessage = "Cliente confirmou a conclusão do pedido."
  if (hasProducts && hasServices) {
    logMessage = "Cliente confirmou o recebimento dos produtos e a execução dos serviços."
  } else if (hasProducts) {
    logMessage = "Cliente confirmou o recebimento dos produtos."
  } else if (hasServices) {
    logMessage = "Cliente confirmou a execução dos serviços."
  }

  await logAuditEvent({
    partnerId: order.partner_id,
    actorUserId: user.id,
    entityType: "order",
    entityId: orderId,
    actionType: "received",
    changeLines: [logMessage],
    source: "marketplace",
  })

  revalidateOrdersCache()
  return { success: true }
}
