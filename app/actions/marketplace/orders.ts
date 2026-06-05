"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { releaseOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkoutCartAction } from "@/app/actions/marketplace/cart"
import {
  prepareProductBuyNowCheckoutAction,
} from "@/app/actions/marketplace/cart-extensions"
import { addPurchasableServiceToCartAction } from "@/app/actions/marketplace/cart-extensions"

const revalidateOrdersCache = async () => await revalidateOrders("")

/**
 * @deprecated Prefer checkoutCartAction. Kept for buy-now session compatibility — delegates to unified cart checkout.
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
    cartItemId = prep.cartItemId
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
    .select("situation, buyer_id, mp_payment_id, partner_id, inventory_deducted, order_items(product_id, variant_id, quantity)")
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
          .map((item: { product_id?: string | null }) => item.product_id)
          .filter((productId: string | null | undefined): productId is string => typeof productId === "string" && productId.length > 0),
      ),
    )

    for (const productId of productIds) {
      await invalidateProductCache(productId as string, order.partner_id, "update", { silent: true })
    }
  }

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
