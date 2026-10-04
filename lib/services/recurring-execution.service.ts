import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { increment_usage_counter } from "@/lib/services/subscription.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { getDateComponents, getDefaultTimezone } from "@/lib/date"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"

/** Tentativas de cobranca do MP antes de considerar a assinatura inadimplente. */
const MAX_PAYMENT_ATTEMPTS = 3

export type ClaimedRecurringExecution = {
  executionId: string
  subscriptionId: string
  partnerId: string
  customerId: string
  recurringPlanId: string
  scheduledFor: string
  deliveryType: "pickup" | "delivery"
  deliveryAddress: string | null
  financeAccountId: string | null
}

type PlanItemRow = {
  id: string
  item_type: "product" | "service"
  product_id: string | null
  variant_id: string | null
  service_id: string | null
  quantity: number
  unit_price: number | null
  staff_partner_user_id: string | null
  preferred_time: string | null
  duration_minutes: number | null
  sort_order: number
}

/**
 * Checks stock availability for all products in the items list.
 * Returns deficit details if stock is insufficient.
 */
export async function checkStockAvailability(
  supabase: SupabaseClient,
  partnerId: string,
  items: PlanItemRow[]
): Promise<{ available: boolean; deficit: Array<{ product_id: string; variant_id: string | null; name: string; quantity_demanded: number; quantity_available: number; quantity_missing: number }> }> {
  const deficit: Array<{
    product_id: string
    variant_id: string | null
    name: string
    quantity_demanded: number
    quantity_available: number
    quantity_missing: number
  }> = []

  const productItems = items.filter(i => i.item_type === "product")
  const productIds = productItems.map(i => i.product_id).filter(Boolean) as string[]
  const variantIds = productItems.map(i => i.variant_id).filter(Boolean) as string[]

  if (productIds.length === 0) {
    return { available: true, deficit: [] }
  }

  // Fetch products
  const { data: products } = await scopeActiveOnly(supabase
    .from("products")
    .select("id, name, stock_available")
    .in("id", productIds)
    .eq("partner_id", partnerId))

  const productsMap = new Map((products || []).map(p => [p.id, p]))

  // Fetch variants
  const variantsMap = new Map<string, any>()
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, variant_name, stock_available")
      .in("id", variantIds)
    for (const v of variants || []) {
      variantsMap.set(v.id, v)
    }
  }

  for (const item of productItems) {
    const qtyDemanded = Number(item.quantity || 1)
    let qtyAvailable = 0
    let name = "Produto"

    if (item.variant_id) {
      const v = variantsMap.get(item.variant_id)
      const p = productsMap.get(item.product_id!)
      qtyAvailable = Number(v?.stock_available || 0)
      name = p ? `${p.name} - ${v?.variant_name || "Variante"}` : "Variante"
    } else {
      const p = productsMap.get(item.product_id!)
      qtyAvailable = Number(p?.stock_available || 0)
      name = p?.name || "Produto"
    }

    if (qtyAvailable < qtyDemanded) {
      deficit.push({
        product_id: item.product_id!,
        variant_id: item.variant_id || null,
        name,
        quantity_demanded: qtyDemanded,
        quantity_available: qtyAvailable,
        quantity_missing: qtyDemanded - qtyAvailable
      })
    }
  }

  return {
    available: deficit.length === 0,
    deficit
  }
}

/**
 * Creates the order for a recurring execution cycle containing products and services.
 */
async function createRecurringOrder(params: {
  supabase: SupabaseClient
  claim: ClaimedRecurringExecution
  items: PlanItemRow[]
  customer: { id: string; name: string; user_id?: string | null }
  financeAccountId: string
  situation?: "pending" | "paid"
}) {
  const { supabase, claim, items, customer, financeAccountId, situation = "pending" } = params

  const productItems = items.filter(i => i.item_type === "product")
  const serviceItems = items.filter(i => i.item_type === "service")

  const productIds = productItems.map((i) => i.product_id).filter(Boolean) as string[]
  const variantIds = productItems.map((i) => i.variant_id).filter(Boolean) as string[]
  const serviceIds = serviceItems.map((i) => i.service_id).filter(Boolean) as string[]

  // 1. Fetch products data
  const { data: products } = await scopeActiveOnly(supabase
    .from("products")
    .select("id, name, price, cost_price")
    .in("id", productIds)
    .eq("partner_id", claim.partnerId))

  const productsMap = new Map((products || []).map((p) => [p.id, p]))
  const productCostMap = new Map((products || []).map((p) => [p.id, Number(p.cost_price || 0)]))

  // 2. Fetch variants data
  const variantsMap = new Map<string, { name: string; price: number }>()
  const variantCostMap = new Map<string, number>()
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, variant_name, price, cost_price")
      .in("id", variantIds)
    for (const v of variants || []) {
      variantsMap.set(v.id, { name: v.variant_name || "Variante", price: Number(v.price || 0) })
      variantCostMap.set(v.id, Number(v.cost_price || 0))
    }
  }

  // 3. Fetch services data
  const { data: services } = await scopeActiveOnly(supabase
    .from("services")
    .select("id, name, price")
    .in("id", serviceIds)
    .eq("partner_id", claim.partnerId))

  const servicesMap = new Map((services || []).map((s) => [s.id, s]))

  const orderItemsPayload: Array<Record<string, unknown>> = []
  const pricingItems: import("@/lib/services/pricing-engine").PricingItem[] = []

  // Process Products
  for (const item of productItems) {
    const product = productsMap.get(item.product_id!)
    if (!product) throw new Error(`Produto ${item.product_id} indisponível`)

    const variant = item.variant_id ? variantsMap.get(item.variant_id) : null
    const unitPrice = item.unit_price != null
      ? Number(item.unit_price)
      : variant?.price ?? Number(product.price || 0)
    const qty = Number(item.quantity || 1)
    const lineSubtotal = unitPrice * qty

    pricingItems.push({
      productId: item.product_id,
      unitPrice,
      quantity: qty,
      basePrice: unitPrice,
    })

    const unitCost = item.variant_id
      ? variantCostMap.get(item.variant_id) || 0
      : productCostMap.get(item.product_id) || 0

    orderItemsPayload.push({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product_name: variant ? `${product.name} - ${variant.name}` : product.name,
      product_price: unitPrice,
      quantity: qty,
      subtotal: lineSubtotal,
      sort_order: item.sort_order ?? 0,
      unit_cost: unitCost,
      line_type: "product"
    })
  }

  // Process Services
  for (const item of serviceItems) {
    const service = servicesMap.get(item.service_id!)
    if (!service) throw new Error(`Serviço ${item.service_id} indisponível`)

    const unitPrice = item.unit_price != null
      ? Number(item.unit_price)
      : Number(service.price || 0)
    const qty = Number(item.quantity || 1)
    const lineSubtotal = unitPrice * qty

    pricingItems.push({
      serviceId: item.service_id,
      unitPrice,
      quantity: qty,
      basePrice: unitPrice,
    })

    orderItemsPayload.push({
      product_id: null,
      variant_id: null,
      product_name: service.name,
      product_price: unitPrice,
      quantity: qty,
      subtotal: lineSubtotal,
      sort_order: item.sort_order ?? 0,
      unit_cost: 0,
      service_id: item.service_id,
      line_type: "service_booking"
    })
  }

  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: 0,
  })
  const totalAmount = pricingResult.finalTotal

  // Fetch delivery settings
  const { data: deliverySettings } = await supabase
    .from("delivery_settings")
    .select("delivery_payer")
    .eq("partner_id", claim.partnerId)
    .maybeSingle()

  const deliveryPayer: "customer" | "seller" = deliverySettings?.delivery_payer === "seller" ? "seller" : "customer"

  const orderPayload: Record<string, unknown> = {
    partner_id: claim.partnerId,
    buyer_id: customer.user_id || null,
    customer_name: customer.name,
    order_source: "Assinatura",
    delivery_type: claim.deliveryType,
    situation: situation,
    delivery_status: claim.deliveryType === "pickup" ? "delivered" : "not_sent",
    total_amount: totalAmount,
    paid_amount: situation === "paid" ? totalAmount : 0,
    discount_value: 0,
    discount_type: "fixed",
    discount_amount: 0,
    delivery_fee: 0,
    additional_costs: 0,
    notes: "Pedido gerado automaticamente por assinatura recorrente.",
    payment_method: "A combinar",
    payment_breakdown: [],
    delivery_address: claim.deliveryAddress,
    finance_account_id: financeAccountId,
    recurring_subscription_id: claim.subscriptionId,
    recurring_execution_id: claim.executionId,
    pricing_version: pricingResult.pricingVersion,
    delivery_payer: deliveryPayer,
    seller_commission_amount: 0,
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select("id, order_number, total_amount")
    .single()

  if (orderError) throw orderError

  const itemsToInsert = orderItemsPayload.map((item) => ({
    ...item,
    order_id: order.id,
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id)
    throw itemsError
  }

  // Reserve stock for products if stock is sufficient and order is not immediately finalized
  if (productItems.length > 0 && situation !== "paid") {
    const stockItems = productItems.map((item) => ({
      product_id: item.product_id!,
      variant_id: item.variant_id || null,
      quantity: Number(item.quantity || 1),
    }))

    const reserveResult = await reserveOrderInventory({
      client: supabase as any,
      partnerId: claim.partnerId,
      orderId: order.id,
      items: stockItems,
    })

    if ("error" in reserveResult) {
      await supabase.from("order_items").delete().eq("order_id", order.id)
      await supabase.from("orders").delete().eq("id", order.id)
      throw new Error(reserveResult.error)
    }
  }

  await logAuditEvent({
    partnerId: claim.partnerId,
    actorUserId: null,
    entityType: "order",
    entityId: order.id,
    actionType: "created",
    changeLines: [`pedido recorrente gerado automaticamente (#${order.order_number || order.id}).`],
    source: "system",
    metadata: { recurring_subscription_id: claim.subscriptionId, recurring_execution_id: claim.executionId },
  })

  increment_usage_counter(claim.partnerId, "orders_month_count").catch(console.error)

  return order.id as string
}

export async function executeRecurringClaim(claim: ClaimedRecurringExecution): Promise<void> {
  const supabase = getAdminClient()

  // Get subscription details to verify billing_mode
  const { data: subDetails } = await supabase
    .from("recurring_subscriptions")
    .select(`
      id, billing_mode,
      recurring_plans(billing_mode)
    `)
    .eq("id", claim.subscriptionId)
    .single()

  const billingMode = subDetails?.billing_mode || (subDetails?.recurring_plans as any)?.billing_mode || "manual"
  if (billingMode === "auto_mercado_pago") {
    // For auto_mercado_pago, we do NOT execute and create orders in the background.
    // Instead, we wait for the webhook, so we transition the execution to awaiting_payment.
    await supabase
      .from("recurring_executions")
      .update({ status: "awaiting_payment" })
      .eq("id", claim.executionId)
      .in("status", ["pending", "failed"])
    return
  }

  await supabase
    .from("recurring_executions")
    .update({ status: "processing" })
    .eq("id", claim.executionId)
    .in("status", ["pending", "failed"])

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name, user_id")
    .eq("id", claim.customerId)
    .eq("partner_id", claim.partnerId)
    .maybeSingle()

  if (customerError || !customer?.id) {
    throw new Error("Cliente da assinatura não encontrado")
  }

  // Fetch from the versioned snapshot table recurring_subscription_items
  let { data: items, error: itemsError } = await supabase
    .from("recurring_subscription_items")
    .select("*")
    .eq("subscription_id", claim.subscriptionId)
    .order("sort_order", { ascending: true })

  // Fallback for pre-existing subscriptions without snapshot items
  if (!items || items.length === 0) {
    const { data: planItems, error: fallbackErr } = await supabase
      .from("recurring_plan_items")
      .select("*")
      .eq("plan_id", claim.recurringPlanId)
      .order("sort_order", { ascending: true })

    if (fallbackErr) throw fallbackErr
    items = (planItems || []) as any[]
  }

  if (!items?.length) throw new Error("Assinatura sem itens configurados")

  const productItems = items.filter((i: any) => i.item_type === "product") as PlanItemRow[]
  const serviceItems = items.filter((i: any) => i.item_type === "service") as PlanItemRow[]

  let financeAccountId = claim.financeAccountId
  if (!financeAccountId) {
    financeAccountId = await resolveMarketplaceOrderFinanceAccountId(supabase, claim.partnerId, false)
  }
  if ((productItems.length > 0 || serviceItems.length > 0) && !financeAccountId) {
    throw new Error("Conta financeira padrão não configurada para faturamento de assinaturas")
  }

  // --- CHECK STOCK AVAILABILITY FIRST (Out of stock handling) ---
  if (productItems.length > 0) {
    const stockStatus = await checkStockAvailability(supabase, claim.partnerId, productItems)
    if (!stockStatus.available) {
      // 1. Put subscription in awaiting_restock status
      await supabase
        .from("recurring_subscriptions")
        .update({ status: "awaiting_restock", updated_at: new Date().toISOString() })
        .eq("id", claim.subscriptionId)

      // 2. Set execution status as failed with deficit log
      await supabase
        .from("recurring_executions")
        .update({
          status: "failed",
          error_message: "Falta de estoque para itens físicos da assinatura.",
          restock_deficit: stockStatus.deficit,
          completed_at: new Date().toISOString()
        })
        .eq("id", claim.executionId)

      await logAuditEvent({
        partnerId: claim.partnerId,
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: claim.subscriptionId,
        actionType: "stock_shortage",
        changeLines: ["assinatura bloqueada por falta de estoque. Aguardando reposição."],
        source: "system",
        metadata: {
          execution_id: claim.executionId,
          deficit: stockStatus.deficit
        }
      })

      throw new Error(`Falta de estoque detectada. Assinatura colocada em "Aguardando reposição".`)
    }
  }

  let orderId: string | null = null

  // Mixed or Product / Service plans generate a billing order
  if (items.length > 0) {
    orderId = await createRecurringOrder({
      supabase,
      claim,
      items: items as PlanItemRow[],
      customer,
      financeAccountId: financeAccountId!,
    })
  }

  // Complete execution
  const { error: completeError } = await supabase.rpc("complete_recurring_execution", {
    p_execution_id: claim.executionId,
    p_order_id: orderId,
    p_appointment_ids: null, // Appointments are created when client books using credits
  })

  if (completeError) throw completeError

  await logAuditEvent({
    partnerId: claim.partnerId,
    actorUserId: null,
    entityType: "recurring_subscription",
    entityId: claim.subscriptionId,
    actionType: "recurring_executed",
    changeLines: ["execução automática de assinatura concluída com sucesso."],
    source: "system",
    metadata: {
      execution_id: claim.executionId,
      order_id: orderId,
    },
  })
}

export async function failRecurringClaim(executionId: string, errorMessage: string): Promise<void> {
  const supabase = getAdminClient()
  await supabase.rpc("fail_recurring_execution", {
    p_execution_id: executionId,
    p_error_message: errorMessage,
  })
}

export async function claimDueRecurringExecutions(limit = 100): Promise<ClaimedRecurringExecution[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc("claim_due_recurring_executions", { p_limit: limit })
  if (error) throw error

  return (data || []).map((row: Record<string, unknown>) => ({
    executionId: String(row.execution_id),
    subscriptionId: String(row.subscription_id),
    partnerId: String(row.partner_id),
    customerId: String(row.customer_id),
    recurringPlanId: String(row.recurring_plan_id),
    scheduledFor: String(row.scheduled_for),
    deliveryType: (row.delivery_type as "pickup" | "delivery") || "pickup",
    deliveryAddress: row.delivery_address != null ? String(row.delivery_address) : null,
    financeAccountId: row.finance_account_id != null ? String(row.finance_account_id) : null,
  }))
}

export async function processDueRecurringExecutions(limit = 100): Promise<{
  claimed: number
  completed: number
  failed: number
}> {
  const supabase = getAdminClient()
  try {
    const { expireObsoleteCreditsGlobally } = await import("@/lib/services/credit.service")
    await expireObsoleteCreditsGlobally(supabase)
  } catch (sweepErr) {
    console.error("[recurring] Failed to sweep expired credits:", sweepErr)
  }

  const claims = await claimDueRecurringExecutions(limit)
  let completed = 0
  let failed = 0

  for (const claim of claims) {
    try {
      await executeRecurringClaim(claim)
      completed++
    } catch (err: unknown) {
      failed++
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      console.error("[recurring] execution_failed", { executionId: claim.executionId, message })
      await failRecurringClaim(claim.executionId, message).catch(console.error)
    }
  }

  return { claimed: claims.length, completed, failed }
}

/**
 * Handle approved preapproval payments (webhook/sync) inside a transaction.
 */
export async function processPreapprovalPaymentWebhook(params: {
  subscriptionId: string
  paymentId: string
  paymentInfo: any
  partnerId: string
}): Promise<{ success: boolean; message: string }> {
  const supabase = getAdminClient()

  // 1. Idempotency Check: search if there is already an order for this payment
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, situation")
    .eq("mp_payment_id", params.paymentId)
    .maybeSingle()

  if (existingOrder) {
    console.log(`[preapproval-webhook] Payment ${params.paymentId} already processed (order: ${existingOrder.id}), skipping.`)
    return { success: true, message: "Já processado" }
  }

  // 2. Lock the subscription row to prevent race conditions
  const { data: sub, error: subErr } = await supabase
    .from("recurring_subscriptions")
    .select(`
      id, partner_id, customer_id, recurring_plan_id, status, billing_mode, next_execution_at, delivery_type, delivery_address,
      customers(id, name, user_id),
      recurring_plans(id, name, billing_mode)
    `)
    .eq("id", params.subscriptionId)
    .single()

  if (subErr || !sub) {
    throw new Error(`Subscription ${params.subscriptionId} not found`)
  }

  await supabase.rpc("lock_subscription_row", { p_subscription_id: sub.id })

  // 3. Find or create the execution cycle
  let { data: exec } = await supabase
    .from("recurring_executions")
    .select("id, status, scheduled_for, order_id")
    .eq("subscription_id", sub.id)
    .in("status", ["pending", "failed", "awaiting_payment", "processing"])
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!exec) {
    // Create new execution for next_execution_at
    const { data: newExec, error: execErr } = await supabase
      .from("recurring_executions")
      .insert({
        subscription_id: sub.id,
        partner_id: sub.partner_id,
        scheduled_for: sub.next_execution_at || new Date().toISOString(),
        status: "processing"
      })
      .select("id, status, scheduled_for, order_id")
      .single()
    if (execErr) throw execErr
    exec = newExec
  }

  // Mark execution as processing
  await supabase
    .from("recurring_executions")
    .update({ status: "processing" })
    .eq("id", exec.id)

  try {
    // 4. Fetch versioned items snapshot
    let { data: items } = await supabase
      .from("recurring_subscription_items")
      .select("*")
      .eq("subscription_id", sub.id)
      .order("sort_order", { ascending: true })

    if (!items || items.length === 0) {
      const { data: planItems } = await supabase
        .from("recurring_plan_items")
        .select("*")
        .eq("plan_id", sub.recurring_plan_id)
        .order("sort_order", { ascending: true })
      items = (planItems || []) as any[]
    }

    if (!items?.length) throw new Error("Assinatura sem itens")

    // 5. Stock check
    const productItems = items.filter((i: any) => i.item_type === "product") as PlanItemRow[]
    const stockStatus = await checkStockAvailability(supabase, sub.partner_id, productItems)
    
    let targetSubscriptionStatus: "active" | "awaiting_restock" = "active"
    let shortageDeficit: any = null

    if (!stockStatus.available) {
      targetSubscriptionStatus = "awaiting_restock"
      shortageDeficit = stockStatus.deficit
    }

    // 6. Resolve default finance account
    const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(supabase, sub.partner_id, false)
    if (!financeAccountId) throw new Error("Conta financeira padrão não configurada")

    const claimMock: ClaimedRecurringExecution = {
      executionId: exec.id,
      subscriptionId: sub.id,
      partnerId: sub.partner_id,
      customerId: sub.customer_id,
      recurringPlanId: sub.recurring_plan_id,
      scheduledFor: exec.scheduled_for,
      deliveryType: (sub as any).delivery_type || "pickup",
      deliveryAddress: (sub as any).delivery_address || null,
      financeAccountId,
    }

    // 7. Create paid order
    const orderId = await createRecurringOrder({
      supabase,
      claim: claimMock,
      items: items as PlanItemRow[],
      customer: {
        id: sub.customer_id,
        name: (sub.customers as any)?.name || "Cliente",
        user_id: (sub.customers as any)?.user_id || null,
      },
      financeAccountId,
      situation: "paid",
    })

    // Update payment method & breakdown references
    await supabase
      .from("orders")
      .update({
        mp_payment_id: params.paymentId,
        payment_method: "Cartão de Crédito",
        payment_provider: "Mercado Pago",
        payment_breakdown: [{
          method: "Cartão de Crédito",
          amount: Number(params.paymentInfo.transaction_amount || 0),
          provider: "Mercado Pago",
          paymentStatus: "approved",
          preapprovalId: params.paymentInfo.preapproval_id || null,
          paymentId: params.paymentId,
        }]
      })
      .eq("id", orderId)

    // 8. Complete cycle execution
    const { error: completeError } = await supabase.rpc("complete_recurring_execution", {
      p_execution_id: exec.id,
      p_order_id: orderId,
      p_appointment_ids: null,
    })
    if (completeError) throw completeError

    // 9. Update state based on stock shortage
    if (!stockStatus.available) {
      await supabase
        .from("recurring_executions")
        .update({
          error_message: "Falta de estoque para itens físicos da assinatura.",
          restock_deficit: shortageDeficit
        })
        .eq("id", exec.id)

      await supabase
        .from("recurring_subscriptions")
        .update({ status: "awaiting_restock", updated_at: new Date().toISOString() })
        .eq("id", sub.id)

      await logAuditEvent({
        partnerId: sub.partner_id,
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: sub.id,
        actionType: "stock_shortage",
        changeLines: ["assinatura bloqueada por falta de estoque. Aguardando reposição."],
        source: "webhook",
        metadata: { execution_id: exec.id, deficit: shortageDeficit }
      })
    } else {
      await supabase
        .from("recurring_subscriptions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", sub.id)
    }

    // Timeline logs
    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: null,
      entityType: "recurring_subscription",
      entityId: sub.id,
      actionType: "paid",
      changeLines: [
        `cobrança aprovada no Mercado Pago (Preapproval: ${params.paymentInfo.preapproval_id}, Pagamento: #${params.paymentId}).`,
        `benefícios liberados e pedido gerado.`
      ],
      source: "webhook",
      metadata: {
        payment_id: params.paymentId,
        preapproval_id: params.paymentInfo.preapproval_id,
        order_id: orderId,
      }
    })

    return { success: true, message: "Pagamento processado com sucesso" }

  } catch (err: any) {
    console.error("[preapproval-webhook] Error processing preapproval webhook:", err.message)
    await supabase
      .from("recurring_executions")
      .update({ status: "failed", error_message: err.message })
      .eq("id", exec.id)
    throw err
  }
}

/**
 * Handle failed preapproval payments (webhook/sync).
 */
export async function processPreapprovalPaymentFailed(params: {
  subscriptionId: string
  paymentId: string
  paymentInfo: any
  partnerId: string
}): Promise<{ success: boolean; message: string }> {
  const supabase = getAdminClient()

  const { data: sub } = await supabase
    .from("recurring_subscriptions")
    .select("id, partner_id")
    .eq("id", params.subscriptionId)
    .single()

  if (!sub) return { success: false, message: "Subscription not found" }

  const { data: exec } = await supabase
    .from("recurring_executions")
    .select("id, payment_attempts")
    .eq("subscription_id", sub.id)
    .in("status", ["pending", "awaiting_payment", "processing"])
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle()

  const attempts = Number(exec?.payment_attempts || 0) + 1
  const exhausted = attempts >= MAX_PAYMENT_ATTEMPTS
  const statusDetail = `Status: ${params.paymentInfo?.status}, Detalhe: ${params.paymentInfo?.status_detail}`

  if (exec) {
    await supabase
      .from("recurring_executions")
      .update({
        // Dunning: ate esgotar as tentativas o ciclo continua aberto, porque o
        // Mercado Pago renova o cartao sozinho.
        status: exhausted ? "failed" : "awaiting_payment",
        payment_attempts: attempts,
        last_payment_failed_at: new Date().toISOString(),
        error_message: exhausted
          ? `Pagamento recusado no Mercado Pago apos ${MAX_PAYMENT_ATTEMPTS} tentativas (${statusDetail})`
          : `Pagamento recusado no Mercado Pago - tentativa ${attempts} de ${MAX_PAYMENT_ATTEMPTS} (${statusDetail})`,
        ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", exec.id)
  }

  await supabase
    .from("recurring_subscriptions")
    .update({
      status: exhausted ? "payment_failed" : "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .neq("status", "cancelled")

  await logAuditEvent({
    partnerId: sub.partner_id,
    actorUserId: null,
    entityType: "recurring_subscription",
    entityId: sub.id,
    actionType: "payment_failed",
    changeLines: [
      `cobrança recusada no Mercado Pago (${statusDetail}, Pagamento: #${params.paymentId}).`,
      exhausted
        ? `assinatura marcada como "Falha no Pagamento" após ${MAX_PAYMENT_ATTEMPTS} tentativas.`
        : `tentativa ${attempts} de ${MAX_PAYMENT_ATTEMPTS}: assinatura marcada como "Pagamento Pendente".`,
    ],
    source: "webhook",
    metadata: {
      payment_id: params.paymentId,
      status: params.paymentInfo?.status,
      status_detail: params.paymentInfo?.status_detail,
      payment_attempts: attempts,
    },
  })

  return {
    success: true,
    message: exhausted
      ? "Tentativas de pagamento esgotadas"
      : "Falha de pagamento registrada (nova tentativa pendente)",
  }
}
