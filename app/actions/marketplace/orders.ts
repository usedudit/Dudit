"use server"

import { requireUser } from "@/lib/auth/authorization"
import { userOwnsBuyerOrder } from "@/lib/orders/buyer-access"
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
  useMercadoPago?: boolean
  useStoreCredit?: boolean
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
    if ("error" in prep) return prep
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
    data.useMercadoPago ?? (data.paymentMethod === "mercadopago"),
    data.csrf_token,
    data.wantsChange,
    data.payWithAmount,
    data.payDepositOnly,
    data.checkoutPricingSnapshot,
    undefined,
    undefined,
    Boolean(data.useStoreCredit),
  )
}

export async function cancelBuyerOrderAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = getAdminClient()

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, situation, buyer_id, customer_id, mp_payment_id, partner_id, paid_amount, amount_paid, updated_at, inventory_deducted, order_items(product_id, variant_id, quantity, service_id, line_type)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (!(await userOwnsBuyerOrder(order, user.id))) {
    return { error: "Sem permissão" }
  }

  const cancellableStates = ["pending", "unpaid", "in_process", "partially_paid", "payment_failed", "awaiting_pickup_payment", "awaiting_payment"]
  if (!cancellableStates.includes(order.situation)) {
    return { error: "Apenas pedidos pendentes ou não pagos podem ser cancelados" }
  }
  if (Number(order.paid_amount ?? order.amount_paid ?? 0) > 0.009) {
    return { error: "Este pedido já recebeu um pagamento. Solicite o estorno antes de cancelar." }
  }
  if (!order.updated_at) {
    return { error: "Não foi possível verificar a versão atual do pedido. Atualize e tente novamente." }
  }

  if (order.mp_payment_id && order.partner_id) {
    try {
      const mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
      const paymentUrl = `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(order.mp_payment_id))}`
      const mpResponse = await fetch(paymentUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
        signal: AbortSignal.timeout(10000),
      })
      const cancelResult = await mpResponse.json().catch(() => null)
      let providerStatus = typeof cancelResult?.status === "string" ? cancelResult.status : null

      if (!mpResponse.ok || providerStatus !== "cancelled") {
        const statusResponse = await fetch(paymentUrl, {
          headers: { Authorization: `Bearer ${mpAccessToken}` },
          signal: AbortSignal.timeout(10000),
        })
        const statusResult = await statusResponse.json().catch(() => null)
        if (!statusResponse.ok || typeof statusResult?.status !== "string") {
          console.error("[ORDER CANCELLATION] Could not confirm Mercado Pago status", {
            partnerId: order.partner_id,
            paymentId: order.mp_payment_id,
            cancelStatus: mpResponse.status,
            statusStatus: statusResponse.status,
          })
          return { error: "Não foi possível confirmar o cancelamento do pagamento. O pedido continua ativo." }
        }
        providerStatus = statusResult.status
      }

      if (providerStatus === "approved") {
        return { error: "O pagamento já foi aprovado. Solicite o estorno antes de cancelar o pedido." }
      }
      if (!["cancelled", "rejected", "expired"].includes(String(providerStatus))) {
        return { error: "O Mercado Pago não confirmou o cancelamento do pagamento. O pedido continua ativo." }
      }
    } catch (mpError) {
      console.error("[ORDER CANCELLATION] Error communicating with Mercado Pago for cancellation:", mpError)
      return { error: "Não foi possível confirmar o cancelamento no Mercado Pago. O pedido continua ativo." }
    }
  }

  const { data: cancelledOrder, error } = await supabase
    .from("orders")
    .update({
      situation: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("situation", order.situation)
    .eq("updated_at", order.updated_at)
    .select("id")
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }
  if (!cancelledOrder) {
    return { error: "O pedido foi atualizado durante o cancelamento. Atualize e tente novamente." }
  }

  // Etiqueta de transportadora (quando houver) é cancelada junto: evita
  // etiqueta órfã e devolve o valor para a carteira da transportadora.
  try {
    const { data: shipments } = await supabase
      .from("order_shipments")
      .select("id, external_label_id, status")
      .eq("order_id", orderId)
      .neq("kind", "return")

    for (const shipment of shipments || []) {
      if (!shipment?.external_label_id) continue
      const { cancelCarrierLabelForOrder } = await import("@/lib/services/shipping/superfrete-label-cancel")
      await cancelCarrierLabelForOrder({
        partnerId: order.partner_id,
        orderId,
        labelId: String(shipment.external_label_id),
        reason: "Pedido cancelado pelo cliente",
        currentStatus: shipment.status,
      })
    }
  } catch (labelErr) {
    console.error("[ORDER CANCELLATION] Error cancelling carrier label:", labelErr)
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

  // Sync cancellation to external ERP (Tiny) if order was exported
  try {
    const { updateTinyOrderStatus } = await import("@/lib/services/integrations/tiny/tiny-integration")
    await updateTinyOrderStatus({ orderId, situacao: "cancelado" })
  } catch (tinyErr) {
    console.error("[cancelMarketplaceOrderAction] Error syncing cancellation to Tiny:", tinyErr)
  }

  revalidateOrdersCache()
  return { success: true }
}

export async function getOrderHistoryForBuyerAction(orderId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const supabase = getAdminClient()
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, customer_id, partner_id, customer_name, stores(name)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (!(await userOwnsBuyerOrder(order, user.id))) {
    return { error: "Sem permissão" }
  }

  const { getOrderHistoryEntries } = await import("@/lib/services/order-history.service")
  const { resolveTimelineActorName, humanizeTimelineChangeLine } = await import("@/lib/utils/formatters")
  try {
    const rawEntries = await getOrderHistoryEntries(orderId, order.partner_id)
    const storeName = (order.stores as any)?.name || null
    const entries = rawEntries
      .map((e) => {
        const actorName = resolveTimelineActorName({
          entry: e,
          viewer: "customer",
          orderCustomerName: order.customer_name,
          storeName,
          buyerId: order.buyer_id,
        })

        let changeLines = (e.change_lines || []).map((l) => humanizeTimelineChangeLine(l)).filter(Boolean)

        // Filter out internal seller notes edits from buyer view
        changeLines = changeLines.filter(
          (l) =>
            !l.toLowerCase().includes("observações do pedido atualizadas") &&
            !l.toLowerCase().includes("alterou as observações do pedido"),
        )

        // Filter false refund/credit lines on rejected returns
        const isRejected =
          e.metadata?.to_status === "REJECTED" ||
          e.entry_type === "return_rejected" ||
          changeLines.some((l) => l.toLowerCase().includes("recusad") || l.toLowerCase().includes("rejeitad"))

        if (isRejected) {
          changeLines = changeLines.filter(
            (l) =>
              !l.startsWith("Valor do reembolso:") &&
              !l.startsWith("Status do reembolso:") &&
              !l.startsWith("Saldo da troca enviado para:") &&
              !l.startsWith("Vale-compra gerado:") &&
              !l.startsWith("Pedido de troca criado:"),
          )
        }

        return {
          ...e,
          actor_name: actorName,
          change_lines: changeLines,
        }
      })
      .filter((e) => e.change_lines.length > 0)

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

  const supabase = getAdminClient()

  // 1. Fetch order details with items
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, buyer_id, customer_id, partner_id, delivery_status, situation, order_items(id, product_id, service_id, line_type, quantity)")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { error: "Pedido não encontrado" }
  }

  if (!(await userOwnsBuyerOrder(order, user.id))) {
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

    const { doesOrderRequireDeliveryOtp } = await import("@/lib/services/delivery-otp.service")
    const requirement = await doesOrderRequireDeliveryOtp(orderId, { adminClient: supabase, orderData: order })
    if (requirement.requiresOtp && order.delivery_status !== "delivered") {
      return {
        error: "Este pedido exige validação pelo entregador através do código de confirmação de entrega. Forneça o código de 6 dígitos diretamente ao entregador.",
      }
    }
  }

  // 3. Enforce service execution date verification
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, status, start_date, start_time, end_date, end_time")
    .eq("marketplace_order_id", orderId)

  if (!hasProducts && hasServices && appointments && appointments.length > 0) {
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
