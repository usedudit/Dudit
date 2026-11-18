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

/**
 * Checks if a deposit (sinal) payment has expired and expires ONLY the deposit,
 * leaving the order available for paying the full amount or remaining balance.
 *
 * Returns { expired: true } when only the deposit expires (order NOT cancelled).
 * Returns { expired: false, reason } when the deposit should NOT be expired
 * (e.g., sinal already paid, or order has no deposit).
 */
export async function checkAndExpireDeposit(
  client: SupabaseClient,
  orderId: string,
  order?: any,
): Promise<{ expired: boolean; reason?: string }> {
  // Use provided order data or fetch from DB
  let orderData = order
  if (!orderData) {
    const { data: fetchedOrder, error: fetchError } = await client
      .from("orders")
      .select("id, situation, payment_expires_at, cancelled_at, paid_amount, amount_paid, total_amount, checkout_fulfillment, payment_breakdown, partner_id, order_number, buyer_id, customer_name, notes")
      .eq("id", orderId)
      .single()

    if (fetchError || !fetchedOrder) {
      return { expired: false, reason: "order_not_found" }
    }

    orderData = fetchedOrder
  }

  // Check if this order uses a deposit (sinal)
  const fulfillment = orderData.checkout_fulfillment || {}
  const depositMeta = fulfillment.depositCheckout
  if (!depositMeta || !depositMeta.usesDeposit) {
    return { expired: false, reason: "no_deposit" }
  }

  // If sinal was already paid, don't expire it
  if (depositMeta.sinalPaid || depositMeta.depositStatus === "paid" || depositMeta.depositStatus === "partially_paid") {
    return { expired: false, reason: "sinal_already_paid" }
  }

  // If paid amount > 0, the sinal might have been replaced by a full payment
  const paidAmount = Number(orderData.paid_amount || orderData.amount_paid || 0)
  if (paidAmount > 0.009) {
    return { expired: false, reason: "order_already_paid" }
  }

  // Check if payment_expires_at has passed
  if (!orderData.payment_expires_at) {
    return { expired: false, reason: "no_expiration_set" }
  }

  if (new Date() <= new Date(orderData.payment_expires_at)) {
    return { expired: false, reason: "not_yet_expired" }
  }

  // ═══ Sinal expired — expire ONLY the deposit ═══
  const now = new Date().toISOString()
  const depositHistory = Array.isArray(fulfillment.depositCheckoutHistory)
    ? [...fulfillment.depositCheckoutHistory]
    : []

  const updatedFulfillment = {
    ...fulfillment,
    depositCheckout: {
      ...depositMeta,
      depositStatus: "expired" as const,
      balanceStatus: "not_required" as const,
      paymentProvider: null,
      expiredAt: now,
      expiredBy: "system" as const,
      lastPaymentAt: depositMeta.lastPaymentAt || null,
    },
    depositCheckoutHistory: [
      ...depositHistory,
      {
        ...depositMeta,
        depositStatus: "expired",
        expiredAt: now,
        expiredBy: "system",
      },
    ],
  }

  // Clean up payment_breakdown to remove the deposit placeholder leg
  const currentBreakdown = Array.isArray(orderData.payment_breakdown)
    ? [...orderData.payment_breakdown]
    : []

  const cleanedBreakdown = currentBreakdown.filter((leg: any) => {
    // Keep legs that are NOT the deposit payment method (e.g., store_credit)
    if (leg?.method === "store_credit") return true
    // Remove legs that look like the deposit/placeholder MP leg (no received amount)
    const received = Number(leg?.amountReceived || 0)
    const isMp = String(leg?.provider || "").toLowerCase().includes("mercado pago")
    if (!received || received <= 0.009) return false
    if (isMp) return true
    return true
  })

  // Update order: clear deposit payment fields, keep order open
  const { error: updateError } = await client
    .from("orders")
    .update({
      // Clear the deposit MP payment fields so a new payment can be created
      mp_payment_id: null,
      payment_provider: null,
      payment_method: cleanedBreakdown.length > 0 ? undefined : "Não informado",
      // Clear expiration so a new payment can be created
      payment_expires_at: null,
      // Keep the order pending — do NOT cancel it
      checkout_fulfillment: updatedFulfillment,
      payment_breakdown: cleanedBreakdown.length > 0 ? cleanedBreakdown : undefined,
      updated_at: now,
    })
    .eq("id", orderId)
    .in("situation", ["pending", "in_process", "payment_failed"])

  if (updateError) {
    console.error("[order-expiration] Failed to expire deposit:", updateError.message)
    return { expired: false, reason: `update_failed: ${updateError.message}` }
  }

  // Log audit event
  try {
    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId: orderData.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "deposit_expired",
      changeLines: [
        "Sinal expirado automaticamente pelo sistema.",
        `Sinal: R$ ${Number(depositMeta.depositAmount || 0).toFixed(2)}`,
        "O prazo de pagamento do sinal expirou. O pedido permanece aberto para pagamento do saldo.",
      ],
      source: "system",
      metadata: {
        depositAmount: depositMeta.depositAmount,
        initialChargeAmount: depositMeta.initialChargeAmount,
        statusScope: "deposit",
      },
    })
  } catch (err) {
    console.error("[order-expiration] Error logging deposit expiration audit event:", err)
  }

  // Trigger system notification for customer and seller
  try {
    const { onOrderStatusChanged } = await import("@/lib/services/notification-automation.service")
    await onOrderStatusChanged(
      { ...orderData, situation: "pending", checkout_fulfillment: updatedFulfillment },
      "pending",
      undefined,
      "system",
      "O prazo de pagamento do sinal expirou. O pedido permanece aberto para pagamento do saldo restante."
    )
  } catch (err) {
    console.error("[order-expiration] Error triggering deposit expiration notification:", err)
  }

  // Revalidate marketplace
  try {
    const { revalidateMarketplace } = await import("@/lib/utils/revalidation")
    await revalidateMarketplace()
  } catch { }

  return { expired: true }
}

export async function checkAndExpireOrder(
  client: SupabaseClient,
  orderId: string,
  options: { deadline?: number } = {},
): Promise<{ expired: boolean; reason?: string; depositExpired?: boolean }> {
  const { data: order, error } = await client
    .from("orders")
    .select(`
      id, order_number, situation, payment_expires_at, cancelled_at,
      partner_id, total_amount, buyer_id, customer_name, notes,
      paid_amount, amount_paid, payment_breakdown, checkout_fulfillment
    `)
    .eq("id", orderId)
    .single()

  if (error || !order) {
    return { expired: false, reason: "order_not_found" }
  }

  if (order.situation !== "pending" && order.situation !== "in_process" && order.situation !== "payment_failed") {
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

  // ── NEW: Check if this is a deposit (sinal) payment that expired ──
  // If the order has a deposit checkout and the deposit hasn't been paid yet,
  // expire ONLY the deposit (not the entire order). This allows the customer
  // to still pay the full amount or remaining balance.
  const depositResult = await checkAndExpireDeposit(client, orderId, order)
  if (depositResult.expired) {
    return { expired: true, reason: depositResult.reason, depositExpired: true }
  }

  const now = new Date().toISOString()

  // Format localized datetime using the partner's timezone
  const formatDateTime = async (date: Date) => {
    const { getPartnerTimezone } = await import("@/lib/date/server")
    const tz = await getPartnerTimezone(order.partner_id)
    return date.toLocaleString("pt-BR", { timeZone: tz })
  }
  const baseNotes = (order.notes || "").replace(/\n*Pedido cancelado por:[\s\S]*$/, "").trim()
  const cancelLine = `Pedido cancelado por: Sistema às ${await formatDateTime(new Date())} - O tempo limite de pagamento expirou.`
  const nextNotes = [baseNotes, cancelLine].filter(Boolean).join("\n")

  const { error: updateError } = await client
    .from("orders")
    .update({
      situation: "cancelled",
      cancelled_at: now,
      notes: nextNotes,
    })
    .eq("id", orderId)
    .in("situation", ["pending", "in_process", "payment_failed"])

  if (updateError) {
    return { expired: false, reason: `update_failed: ${updateError.message}` }
  }

  // Pedidos expirados podem ter etiqueta de transportadora gerada e não paga.
  // O cancelamento da etiqueta evita etiqueta órfã e devolve o valor.
  try {
    const { data: shipments } = await client
      .from("order_shipments")
      .select("id, external_label_id, status")
      .eq("order_id", orderId)
      .neq("kind", "return")

    for (const shipment of shipments || []) {
      if (!shipment?.external_label_id) continue
      const { cancelCarrierLabelForOrder } = await import("@/lib/services/shipping/superfrete-label-cancel")
      // Nunca deixar a chamada externa passar do orçamento do cron (cron-job.org
      // corta em 30s); o cancelamento da etiqueta é best-effort.
      const timeoutMs = options.deadline
        ? Math.max(1_000, Math.min(20_000, options.deadline - Date.now()))
        : undefined
      await cancelCarrierLabelForOrder({
        partnerId: order.partner_id,
        orderId,
        labelId: String(shipment.external_label_id),
        reason: "Pedido cancelado por expiração do prazo de pagamento",
        currentStatus: shipment.status,
        timeoutMs,
      })
    }
  } catch (labelErr) {
    console.error("[order-expiration] Error cancelling carrier label:", labelErr)
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

  // Sync cancellation to linked appointments and receivables
  try {
    const { syncCancelledOrderAppointmentsAndTransactions } = await import("@/lib/services/sync-cancellation")
    await syncCancelledOrderAppointmentsAndTransactions(client, orderId, { orderData: order })
  } catch (syncErr) {
    console.error("[order-expiration] Error syncing appointments for expired order:", syncErr)
  }

  // Sync cancellation to external ERP (Tiny) if order was exported
  try {
    const { updateTinyOrderStatus } = await import("@/lib/services/integrations/tiny/tiny-integration")
    await updateTinyOrderStatus({ orderId, situacao: "cancelado" })
  } catch (tinyErr) {
    console.error("[order-expiration] Error syncing cancellation to Tiny:", tinyErr)
  }

  try {
    const { revalidateMarketplace } = await import("@/lib/utils/revalidation")
    await revalidateMarketplace()
  } catch { }

  // Log audit event for timeline/history
  try {
    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "cancel",
      changeLines: ["Pedido cancelado pelo sistema.", "Motivo: O tempo limite para pagamento expirou."],
      source: "system",
      metadata: {
        oldStatus: "Pendente",
        newStatus: "Cancelado",
        statusScope: "payment",
      }
    })
  } catch (err) {
    console.error("[order-expiration] Error logging audit event:", err)
  }

  // Trigger system notification for customer and seller
  try {
    const { onOrderStatusChanged } = await import("@/lib/services/notification-automation.service")
    await onOrderStatusChanged(
      { ...order, situation: "cancelled" },
      "cancelled",
      undefined,
      "system",
      "O prazo de pagamento expirou"
    )
  } catch (err) {
    console.error("[order-expiration] Error triggering notifications:", err)
  }

  return { expired: true }
}

export async function expireAllExpiredOrders(
  client: SupabaseClient,
  options: { deadline?: number } = {},
): Promise<{ expiredCount: number; deferred: number }> {
  const now = new Date().toISOString()

  const { data: expiredOrders } = await client
    .from("orders")
    .select("id, payment_provider")
    .in("situation", ["pending", "in_process", "payment_failed"])
    .is("cancelled_at", null)
    .lt("payment_expires_at", now)

  if (!expiredOrders || expiredOrders.length === 0) {
    return { expiredCount: 0, deferred: 0 }
  }

  let expiredCount = 0
  let deferred = 0

  for (let i = 0; i < expiredOrders.length; i++) {
    if (options.deadline && Date.now() >= options.deadline) {
      deferred = expiredOrders.length - i
      break
    }

    const order = expiredOrders[i]
    // Only auto-cancel expired orders that are paid via Mercado Pago.
    // Manual payment orders should NOT be auto-cancelled by the cron job;
    // they are handled separately by `autoCancelManualOrdersHours` setting
    // which sets payment_expires_at only when explicitly configured by the partner.
    if (order.payment_provider !== "Mercado Pago") {
      continue
    }
    const result = await checkAndExpireOrder(client, order.id, { deadline: options.deadline })
    if (result.expired) expiredCount++
  }

  return { expiredCount, deferred }
}
