import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { increment_usage_counter } from "@/lib/services/subscription.service"
import { logAuditEvent } from "@/lib/services/timeline.service"

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

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:00`
}

function scheduledDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return { date: `${y}-${mo}-${day}`, time: `${h}:${mi}:00` }
}

async function syncAppointmentReceivable(params: {
  supabase: SupabaseClient
  partnerId: string
  appointment: Record<string, unknown>
}) {
  const price = Number(params.appointment.price || 0)
  if (price <= 0.009) return null

  const ref = `appointment:${params.appointment.id}:receivable`
  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(
    params.supabase,
    params.partnerId,
    false,
  )

  const { data: existing } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", ref)
    .limit(1)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await params.supabase
    .from("transactions")
    .insert({
      partner_id: params.partnerId,
      description: String(params.appointment.service_name || "Serviço"),
      category: "Vendas",
      customer_id: params.appointment.customer_id || null,
      contact_type: "customer",
      amount: price,
      due_date: params.appointment.start_date,
      payment_date: null,
      transaction_date: `${params.appointment.start_date}T12:00:00.000Z`,
      status: "pending",
      payment_type: "Agendamento",
      original_amount: price,
      interest_amount: null,
      fee_amount: 0,
      transaction_type: "income",
      origin: "system",
      reference_note: ref,
      account_id: financeAccountId || null,
      created_by_user_id: null,
    })
    .select("id")
    .single()

  if (error) throw error
  return data?.id || null
}

async function createRecurringOrder(params: {
  supabase: SupabaseClient
  claim: ClaimedRecurringExecution
  productItems: PlanItemRow[]
  customer: { id: string; name: string; user_id?: string | null }
  financeAccountId: string
}) {
  const { supabase, claim, productItems, customer, financeAccountId } = params

  const productIds = productItems.map((i) => i.product_id).filter(Boolean) as string[]

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price")
    .in("id", productIds)
    .eq("partner_id", claim.partnerId)

  const variantIds = productItems.map((i) => i.variant_id).filter(Boolean) as string[]
  const variantsMap = new Map<string, { name: string; price: number }>()
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, variant_name, price")
      .in("id", variantIds)
    for (const v of variants || []) {
      variantsMap.set(v.id, { name: v.variant_name || "Variante", price: Number(v.price || 0) })
    }
  }

  const productsMap = new Map((products || []).map((p) => [p.id, p]))

  let subtotal = 0
  const orderItemsPayload: Array<Record<string, unknown>> = []

  for (const item of productItems) {
    const product = productsMap.get(item.product_id!)
    if (!product) throw new Error(`Produto ${item.product_id} indisponível`)

    const variant = item.variant_id ? variantsMap.get(item.variant_id) : null
    const unitPrice = item.unit_price != null
      ? Number(item.unit_price)
      : variant?.price ?? Number(product.price || 0)
    const qty = Number(item.quantity || 1)
    const lineSubtotal = unitPrice * qty
    subtotal += lineSubtotal

    orderItemsPayload.push({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      product_name: variant ? `${product.name} - ${variant.name}` : product.name,
      product_price: unitPrice,
      quantity: qty,
      subtotal: lineSubtotal,
      sort_order: item.sort_order ?? 0,
    })
  }

  const totalAmount = subtotal

  const orderPayload: Record<string, unknown> = {
    partner_id: claim.partnerId,
    buyer_id: customer.user_id || null,
    customer_name: customer.name,
    order_source: "Assinatura",
    delivery_type: claim.deliveryType,
    situation: "pending",
    delivery_status: claim.deliveryType === "pickup" ? "delivered" : "not_sent",
    total_amount: totalAmount,
    paid_amount: 0,
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

  const stockItems = productItems.map((item) => ({
    product_id: item.product_id!,
    variant_id: item.variant_id || null,
    quantity: Number(item.quantity || 1),
  }))

  const reserveResult = await reserveOrderInventory({
    client: supabase,
    partnerId: claim.partnerId,
    orderId: order.id,
    items: stockItems,
  })

  if ("error" in reserveResult) {
    await supabase.from("order_items").delete().eq("order_id", order.id)
    await supabase.from("orders").delete().eq("id", order.id)
    throw new Error(reserveResult.error)
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

async function createRecurringAppointments(params: {
  supabase: SupabaseClient
  claim: ClaimedRecurringExecution
  serviceItems: PlanItemRow[]
  customer: { id: string; name: string }
}) {
  const { supabase, claim, serviceItems, customer } = params
  const { date, time } = scheduledDateParts(claim.scheduledFor)
  const appointmentIds: string[] = []

  const serviceIds = serviceItems.map((i) => i.service_id).filter(Boolean) as string[]
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .in("id", serviceIds)
    .eq("partner_id", claim.partnerId)

  const servicesMap = new Map((services || []).map((s) => [s.id, s]))

  for (const item of serviceItems) {
    const service = servicesMap.get(item.service_id!)
    if (!service) throw new Error(`Serviço ${item.service_id} indisponível`)

    if (!item.staff_partner_user_id) {
      throw new Error(`Profissional não configurado para o serviço ${service.name}`)
    }

    const { data: staff } = await supabase
      .from("partner_users")
      .select("id, user_id")
      .eq("id", item.staff_partner_user_id)
      .eq("partner_id", claim.partnerId)
      .maybeSingle()

    if (!staff?.id) throw new Error("Profissional da assinatura inválido")

    let staffName = "Profissional"
    if (staff.user_id) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", staff.user_id)
        .maybeSingle()
      if (profile?.full_name) staffName = profile.full_name
    }

    const duration = item.duration_minutes ?? Number(service.duration_minutes || 60)
    const startTime = item.preferred_time || time
    const endTime = addMinutesToTime(startTime, duration)
    const price = item.unit_price != null ? Number(item.unit_price) : Number(service.price || 0)

    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert({
        partner_id: claim.partnerId,
        customer_id: customer.id,
        customer_name: customer.name,
        service_name: service.name,
        start_date: date,
        start_time: startTime,
        end_date: date,
        end_time: endTime,
        duration_minutes: duration,
        staff_partner_user_id: staff.id,
        staff_name: staffName,
        status: "Reservado",
        price,
        pricing_unit: "Por Serviço",
        notes: "Agendamento gerado automaticamente por assinatura recorrente.",
        source: "appointment",
        recurring_subscription_id: claim.subscriptionId,
        recurring_execution_id: claim.executionId,
      })
      .select("*")
      .single()

    if (error) throw error

    if (price > 0.009) {
      const receivableId = await syncAppointmentReceivable({
        supabase,
        partnerId: claim.partnerId,
        appointment,
      })
      if (receivableId) {
        await supabase
          .from("appointments")
          .update({ receivable_transaction_id: receivableId })
          .eq("id", appointment.id)
      }
    }

    await logAuditEvent({
      partnerId: claim.partnerId,
      actorUserId: null,
      entityType: "appointment",
      entityId: appointment.id,
      actionType: "created",
      changeLines: [`agendamento recorrente gerado automaticamente para ${customer.name}.`],
      source: "system",
      metadata: { recurring_subscription_id: claim.subscriptionId, recurring_execution_id: claim.executionId },
    })

    appointmentIds.push(appointment.id)
  }

  if (appointmentIds.length > 0) {
    increment_usage_counter(claim.partnerId, "appointments_month_count", appointmentIds.length).catch(console.error)
  }

  return appointmentIds
}

export async function executeRecurringClaim(claim: ClaimedRecurringExecution): Promise<void> {
  const supabase = getAdminClient()

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

  const { data: planItems, error: itemsError } = await supabase
    .from("recurring_plan_items")
    .select("*")
    .eq("plan_id", claim.recurringPlanId)
    .order("sort_order", { ascending: true })

  if (itemsError) throw itemsError
  if (!planItems?.length) throw new Error("Plano sem itens configurados")

  const productItems = planItems.filter((i) => i.item_type === "product") as PlanItemRow[]
  const serviceItems = planItems.filter((i) => i.item_type === "service") as PlanItemRow[]

  let financeAccountId = claim.financeAccountId
  if (!financeAccountId) {
    financeAccountId = await resolveMarketplaceOrderFinanceAccountId(supabase, claim.partnerId, false)
  }
  if (productItems.length > 0 && !financeAccountId) {
    throw new Error("Conta financeira padrão não configurada para pedidos recorrentes")
  }

  let orderId: string | null = null
  let appointmentIds: string[] | null = null

  if (productItems.length > 0) {
    orderId = await createRecurringOrder({
      supabase,
      claim,
      productItems,
      customer,
      financeAccountId: financeAccountId!,
    })
  }

  if (serviceItems.length > 0) {
    appointmentIds = await createRecurringAppointments({
      supabase,
      claim,
      serviceItems,
      customer,
    })
  }

  const { error: completeError } = await supabase.rpc("complete_recurring_execution", {
    p_execution_id: claim.executionId,
    p_order_id: orderId,
    p_appointment_ids: appointmentIds,
  })

  if (completeError) throw completeError

  await logAuditEvent({
    partnerId: claim.partnerId,
    actorUserId: null,
    entityType: "recurring_subscription",
    entityId: claim.subscriptionId,
    actionType: "recurring_executed",
    changeLines: ["execução automática de assinatura concluída."],
    source: "system",
    metadata: {
      execution_id: claim.executionId,
      order_id: orderId,
      appointment_ids: appointmentIds,
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
