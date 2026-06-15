type SupabaseClient = any

export const EXPIRATION_TIMES = {
  pix: 30 * 60,
  card: 30 * 60,
  mercado_pago_wallet: 30 * 60,
  boleto: 3 * 24 * 60 * 60,
  pickup_payment: 24 * 60 * 60,
} as const

export function computePaymentExpiresAt(paymentMethod: string, now = new Date()): Date {
  const method = paymentMethod.toLowerCase()

  if (method === "pix" || method === "pix (mercado pago)") {
    return new Date(now.getTime() + EXPIRATION_TIMES.pix * 1000)
  }
  if (method === "bolbradesco" || method === "boleto" || method === "boleto (mercado pago)") {
    return new Date(now.getTime() + EXPIRATION_TIMES.boleto * 1000)
  }
  if (method === "account_money" || method === "mercado_pago_wallet" || method === "saldo mercado pago") {
    return new Date(now.getTime() + EXPIRATION_TIMES.mercado_pago_wallet * 1000)
  }
  if (
    method.includes("credit") ||
    method.includes("debit") ||
    method.includes("card") ||
    method === "cartão de crédito" ||
    method === "cartão de débito" ||
    method === "crédito" ||
    method === "cartão (mercado pago)"
  ) {
    return new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
  }

  return new Date(now.getTime() + EXPIRATION_TIMES.card * 1000)
}

export function computePickupPaymentExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + EXPIRATION_TIMES.pickup_payment * 1000)
}

export async function checkAndExpireOrder(
  client: SupabaseClient,
  orderId: string,
): Promise<{ expired: boolean; reason?: string }> {
  const { data: order, error } = await client
    .from("orders")
    .select("id, situation, payment_expires_at, cancelled_at, partner_id, total_amount")
    .eq("id", orderId)
    .single()

  if (error || !order) {
    return { expired: false, reason: "order_not_found" }
  }

  if (order.situation !== "pending" && order.situation !== "in_process") {
    return { expired: false, reason: `not_pending: ${order.situation}` }
  }

  if (order.cancelled_at) {
    return { expired: false, reason: "already_cancelled" }
  }

  if (!order.payment_expires_at) {
    return { expired: false, reason: "no_expiration_set" }
  }

  if (new Date() <= new Date(order.payment_expires_at)) {
    return { expired: false, reason: "not_yet_expired" }
  }

  const now = new Date().toISOString()

  const { error: updateError } = await client
    .from("orders")
    .update({
      situation: "cancelled",
      cancelled_at: now,
    })
    .eq("id", orderId)
    .in("situation", ["pending", "in_process"])

  if (updateError) {
    return { expired: false, reason: `update_failed: ${updateError.message}` }
  }

  const { data: orderItems } = await client
    .from("order_items")
    .select("product_id, variant_id, quantity")
    .eq("order_id", orderId)

  if (orderItems && orderItems.length > 0) {
    const items = orderItems.map((i: any) => ({
      product_id: i.product_id,
      variant_id: i.variant_id || null,
      quantity: i.quantity,
    }))

    const { releaseOrderInventory } = await import("@/lib/stock/reservations")
    await releaseOrderInventory({
      client,
      partnerId: order.partner_id,
      orderId,
      items,
    })
  }

  await client
    .from("orders")
    .update({ stock_released_at: now })
    .eq("id", orderId)

  try {
    const { revalidateMarketplace } = await import("@/lib/utils/revalidation")
    await revalidateMarketplace()
  } catch {}

  return { expired: true }
}

export async function expireAllExpiredOrders(
  client: SupabaseClient,
): Promise<{ expiredCount: number }> {
  const now = new Date().toISOString()

  const { data: expiredOrders } = await client
    .from("orders")
    .select("id")
    .in("situation", ["pending", "in_process"])
    .is("cancelled_at", null)
    .lt("payment_expires_at", now)

  if (!expiredOrders || expiredOrders.length === 0) {
    return { expiredCount: 0 }
  }

  let expiredCount = 0
  for (const order of expiredOrders) {
    const result = await checkAndExpireOrder(client, order.id)
    if (result.expired) expiredCount++
  }

  return { expiredCount }
}
