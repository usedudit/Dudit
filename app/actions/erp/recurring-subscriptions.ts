"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requirePermission } from "@/lib/permissions/access"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { requireAuthorizedPartnerContext } from "@/lib/services/authorized-customer-access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { revalidateTag } from "next/cache"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { processDueRecurringExecutions } from "@/lib/services/recurring-execution.service"
import type {
  RecurringListCursor,
  RecurringPlanItemType,
  RecurringSubscriptionDetail,
  RecurringSubscriptionDetailItem,
  RecurringSubscriptionStatus,
  RecurringSubscriptionStatusFilter,
} from "@/lib/types/recurring"
import { mapPlanRow, mapSubscriptionRow } from "@/lib/types/recurring"

const PAGE_SIZE = 20

const DELINQUENT_STATUSES = ["past_due", "payment_failed"]

function encodeCursor(cursor: RecurringListCursor | null): string | null {
  if (!cursor) return null
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(raw: string | null | undefined): RecurringListCursor | null {
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as RecurringListCursor
  } catch {
    return null
  }
}

export async function listRecurringSubscriptionsAction(
  partnerId: string,
  options?: {
    cursor?: string | null
    status?: RecurringSubscriptionStatusFilter
    customerId?: string | null
    planId?: string | null
    search?: string
    storeId?: string | null
  },
) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const supabase = await getSupabaseServerClient()
    const cursor = decodeCursor(options?.cursor)
    const search = String(options?.search || "").trim()

    let query = supabase
      .from("recurring_subscriptions")
      .select(`
        *,
        recurring_plans(id, name, frequency_type, frequency_interval, status),
        customers:customer_id(id, name, email, image_url)
      `)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (options?.status && options.status !== "all") {
      if (options.status === "delinquent") {
        query = query.in("status", DELINQUENT_STATUSES)
      } else {
        query = query.eq("status", options.status)
      }
    }
    if (options?.customerId) query = query.eq("customer_id", options.customerId)
    if (options?.planId) query = query.eq("recurring_plan_id", options.planId)
    if (options?.storeId) query = query.eq("store_id", options.storeId)
    if (search) {
      query = query.or(`notes.ilike.%${search.replace(/[%_]/g, "")}%`)
    }
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > PAGE_SIZE
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const last = items[items.length - 1]

    return {
      success: true,
      data: {
        items: items.map((row: any) => ({
          ...mapSubscriptionRow(row as Record<string, unknown>),
          plan: row.recurring_plans || null,
          customer: row.customers || null,
        })),
        nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
        hasMore,
      },
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao listar assinaturas" }
  }
}

export async function createRecurringSubscriptionAction(input: {
  partnerId: string
  customerId: string
  planId: string
  nextExecutionAt?: string
  deliveryType?: "pickup" | "delivery"
  deliveryAddress?: string | null
  financeAccountId?: string | null
  notes?: string | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(input.partnerId, "recurring_subscriptions", "manage")
    await requireMinimumPlan(input.partnerId, "escalar")

    // Limite de assinaturas nao terminais (0 fora do Escalar)
    const { checkActiveSubscriptionCreateLimit } = await import("@/lib/services/recurring/limits")
    const subLimitCheck = await checkActiveSubscriptionCreateLimit(input.partnerId)
    if (!subLimitCheck.allowed) {
      return { success: false, error: subLimitCheck.message || "Seu plano não permite criar mais assinaturas." }
    }

    const supabase = await getSupabaseServerClient()

    const { data: plan } = await supabase
      .from("recurring_plans")
      .select("id, name, status, start_date, store_id")
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!plan?.id || plan.status !== "active") {
      return { success: false, error: "Plano recorrente inválido ou inativo." }
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name")
      .eq("id", input.customerId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!customer?.id) return { success: false, error: "Cliente inválido." }

    const nextExecutionAt = input.nextExecutionAt || plan.start_date || new Date().toISOString()

    const { data, error } = await supabase
      .from("recurring_subscriptions")
      .insert({
        partner_id: input.partnerId,
        store_id: plan.store_id || null,
        customer_id: input.customerId,
        recurring_plan_id: input.planId,
        status: "active",
        // Criada no ERP sem preapproval do Mercado Pago: renovação manual evita
        // que o ciclo trave em "awaiting_payment" esperando um webhook que nunca chega.
        billing_mode: "manual",
        next_execution_at: nextExecutionAt,
        delivery_type: input.deliveryType || "pickup",
        delivery_address: input.deliveryAddress || null,
        finance_account_id: input.financeAccountId || null,
        notes: sanitizeNotes(input.notes),
      })
      .select("*")
      .single()

    if (error) throw error

    // @ts-ignore
    revalidateTag(`partner-stats-${input.partnerId}`, "max")

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: null,
      entityType: "recurring_subscription",
      entityId: data.id,
      actionType: "created",
      changeLines: [`criou assinatura do plano "${plan.name}" para ${customer.name}.`],
      source: "manual",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao criar assinatura" }
  }
}

async function updateSubscriptionStatus(
  partnerId: string,
  subscriptionId: string,
  status: RecurringSubscriptionStatus,
  auditLine: string,
  extra: Record<string, unknown> = {},
) {
  const supabase = await getSupabaseServerClient()

  // Get existing subscription to check if it has mp_preapproval_id
  const { data: sub } = await supabase
    .from("recurring_subscriptions")
    .select("mp_preapproval_id")
    .eq("id", subscriptionId)
    .eq("partner_id", partnerId)
    .single()

  if (sub?.mp_preapproval_id) {
    const { pauseMpPreapproval, resumeMpPreapproval, cancelMpPreapproval } = await import(
      "@/lib/services/mercadopago/partner-preapproval"
    )
    if (status === "paused") {
      await pauseMpPreapproval(partnerId, sub.mp_preapproval_id)
    } else if (status === "active") {
      await resumeMpPreapproval(partnerId, sub.mp_preapproval_id)
    } else if (status === "cancelled") {
      await cancelMpPreapproval(partnerId, sub.mp_preapproval_id)
    }
  }

  const { data, error } = await supabase
    .from("recurring_subscriptions")
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("partner_id", partnerId)
    .select("*")
    .single()

  if (error) throw error

  await logAuditEvent({
    partnerId,
    actorUserId: null,
    entityType: "recurring_subscription",
    entityId: subscriptionId,
    actionType: status === "paused" ? "paused" : status === "cancelled" ? "cancelled" : "updated",
    changeLines: [auditLine],
    source: "manual",
  })

  return data
}

export async function pauseRecurringSubscriptionAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "manage")
    const data = await updateSubscriptionStatus(
      partnerId,
      subscriptionId,
      "paused",
      "pausou assinatura recorrente.",
      { paused_at: new Date().toISOString() },
    )
    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao pausar assinatura" }
  }
}

export async function resumeRecurringSubscriptionAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "manage")
    const data = await updateSubscriptionStatus(
      partnerId,
      subscriptionId,
      "active",
      "reativou assinatura recorrente.",
      { paused_at: null },
    )
    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao reativar assinatura" }
  }
}

export async function cancelRecurringSubscriptionAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "manage")
    const data = await updateSubscriptionStatus(
      partnerId,
      subscriptionId,
      "cancelled",
      "cancelou assinatura recorrente.",
      { cancelled_at: new Date().toISOString() },
    )
    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao cancelar assinatura" }
  }
}

export async function getRecurringSubscriptionExecutionsAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("recurring_executions")
      .select(`
        id, subscription_id, partner_id, scheduled_for, status, order_id, appointment_ids,
        error_message, created_at, completed_at,
        orders:order_id(id, order_number, total_amount, situation)
      `)
      .eq("partner_id", partnerId)
      .eq("subscription_id", subscriptionId)
      .order("scheduled_for", { ascending: false })
      .limit(50)

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar histórico" }
  }
}

export async function getRecurringSubscriptionDetailAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const supabase = await getSupabaseServerClient()

    const [mainResult, creditsResult] = await Promise.all([
      supabase
        .from("recurring_subscriptions")
        .select(`
        *,
        recurring_plans(
          id, short_id, partner_id, name, description, price, images, status, frequency_type,
          frequency_interval, weekdays, day_of_month, use_last_day, year_month, year_day,
          start_date, end_date, show_in_marketplace, billing_mode, credit_expiration_policy,
          credit_expiration_days, shipping_mode, shipping_flat_amount, created_at, updated_at,
          recurring_plan_items(
            id, item_type, product_id, variant_id, service_id, quantity, unit_price,
            staff_partner_user_id, preferred_time, duration_minutes, sort_order,
            products:product_id(id, name, price),
            services:service_id(id, name, price, duration_minutes)
          )
        ),
        customers:customer_id(id, name, email, phone, image_url),
        recurring_subscription_items(
          id, item_type, product_id, service_id, quantity, unit_price,
          preferred_time, duration_minutes, sort_order,
          products:product_id(id, name, images),
          services:service_id(id, name, images)
        )
      `)
        .eq("id", subscriptionId)
        .eq("partner_id", partnerId)
        .maybeSingle(),
      supabase
        .from("subscription_item_credits")
        .select(`
          id, service_id, product_id, quantity, consumed, expires_at,
          recurring_subscription_items(staff_partner_user_id, duration_minutes),
          services(name),
          products(name)
        `)
        .eq("partner_id", partnerId)
        .eq("subscription_id", subscriptionId)
        .order("expires_at", { ascending: true, nullsFirst: false }),
    ])

    const { data, error } = mainResult

    if (error) throw error
    if (!data) throw new Error("Assinatura não encontrada")

    const row = data as Record<string, any>
    const planRow = row.recurring_plans as Record<string, any> | null

    const { data: creditRows, error: creditsError } = creditsResult

    if (creditsError) throw creditsError

    const plan: RecurringSubscriptionDetail["plan"] = planRow
      ? {
        ...mapPlanRow(planRow as Record<string, unknown>),
        items: ((planRow.recurring_plan_items || []) as Record<string, any>[]).map((item) => ({
          id: String(item.id),
          planId: String(planRow.id),
          itemType: item.item_type as RecurringPlanItemType,
          productId: item.product_id ?? null,
          variantId: item.variant_id ?? null,
          serviceId: item.service_id ?? null,
          quantity: Number(item.quantity || 0),
          unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
          staffPartnerUserId: item.staff_partner_user_id ?? null,
          preferredTime: item.preferred_time ?? null,
          durationMinutes: item.duration_minutes != null ? Number(item.duration_minutes) : null,
          sortOrder: Number(item.sort_order || 0),
          product: item.products || null,
          service: item.services || null,
        })),
      }
      : null

    const items: RecurringSubscriptionDetailItem[] = (
      (row.recurring_subscription_items || []) as Record<string, any>[]
    )
      .map((item) => ({
        id: String(item.id),
        itemType: item.item_type as RecurringPlanItemType,
        quantity: Number(item.quantity || 0),
        unitPrice: item.unit_price != null ? Number(item.unit_price) : 0,
        sortOrder: Number(item.sort_order || 0),
        preferredTime: item.preferred_time ?? null,
        durationMinutes: item.duration_minutes != null ? Number(item.duration_minutes) : null,
        product: item.products || null,
        service: item.services || null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const credits: RecurringSubscriptionDetail["credits"] = (
      (creditRows || []) as Record<string, any>[]
    ).map((credit) => ({
      id: String(credit.id),
      itemName: credit.services?.name || credit.products?.name || "Item",
      itemType: credit.service_id ? "service" : "product",
      serviceId: credit.service_id ?? null,
      productId: credit.product_id ?? null,
      quantity: Number(credit.quantity || 0),
      consumed: Number(credit.consumed || 0),
      remaining: Math.max(Number(credit.quantity || 0) - Number(credit.consumed || 0), 0),
      expiresAt: credit.expires_at != null ? String(credit.expires_at) : null,
      staffPartnerUserId: credit.recurring_subscription_items?.staff_partner_user_id ?? null,
      durationMinutes: credit.recurring_subscription_items?.duration_minutes != null
        ? Number(credit.recurring_subscription_items.duration_minutes)
        : null,
    }))

    const detail: RecurringSubscriptionDetail = {
      subscription: mapSubscriptionRow(row),
      plan,
      customer: row.customers || null,
      items,
      credits,
    }

    return { success: true, data: detail }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar assinatura" }
  }
}

export async function runDueRecurringSubscriptionsAction(
  limit = 100,
  options: { deadline?: number } = {},
) {
  try {
    const result = await processDueRecurringExecutions(limit, options)
    return { success: true, data: result }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro no processamento" }
  }
}

export async function getRecurringSubscriptionStatsAction(partnerId: string, options?: { storeId?: string | null }) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const admin = getAdminClient()
    let query = admin
      .from("recurring_subscriptions")
      .select("status")
      .eq("partner_id", partnerId)
    if (options?.storeId) query = query.eq("store_id", options.storeId)
    const { data } = await query

    const stats = {
      active: 0,
      paused: 0,
      cancelled: 0,
      expired: 0,
      awaiting_restock: 0,
      pending: 0,
      past_due: 0,
      payment_failed: 0,
      delinquent: 0,
      total: 0,
    }
    for (const row of data || []) {
      stats.total++
      const key = row.status as keyof typeof stats
      if (key in stats && key !== "total" && key !== "delinquent") stats[key]++
      if (DELINQUENT_STATUSES.includes(row.status)) stats.delinquent++
    }
    return { success: true, data: stats }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar estatísticas" }
  }
}

/**
 * Cron: janelas de consentimento de mudança de plano que venceram sem
 * resposta congelam a cobrança e aviso a loja.
 */
export async function sweepExpiredPriceChangeWindowsAction(limit = 100) {
  try {
    const admin = getAdminClient()
    const { expirePriceChangeWindows } = await import("@/lib/services/recurring/price-consent")
    const result = await expirePriceChangeWindows(admin, { limit })
    return { success: true, data: result }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao vencer janelas de mudança" }
  }
}

export async function getSubscriptionBillingPanelAction(
  partnerId: string,
  options?: { storeId?: string | null },
) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("orders")
      .select("id, order_number, customer_name, total_amount, paid_amount, situation, created_at, payment_method, recurring_subscription_id, recurring_execution_id, store_id")
      .eq("partner_id", partnerId)
      .not("recurring_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
    if (options?.storeId) query = query.eq("store_id", options.storeId)

    const { data, error } = await query

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar faturamentos" }
  }
}

export async function getSubscriptionForecastAction(
  partnerId: string,
  options?: { storeId?: string | null },
) {
  try {
    const access = await requireAuthorizedPartnerContext(partnerId, "recurring_subscriptions", "view")
    partnerId = access.partnerId
    const supabase = access.admin

    // Get active subscriptions and calculate their upcoming executions in the next 30 days
    let query = supabase
      .from("recurring_subscriptions")
      .select(`
        id, customer_id, next_execution_at, status, delivery_type, delivery_address,
        shipping_amount, contracted_amount, billing_mode, mp_preapproval_id, store_id,
        customers:customer_id(id, name, email, image_url),
        recurring_plans(id, name, price, frequency_type, frequency_interval),
        recurring_subscription_items(
          id, item_type, product_id, variant_id, quantity,
          products:product_id(id, name, unit, stock_available, min_stock)
        )
      `)
      .eq("partner_id", partnerId)
      .eq("status", "active")
    if (options?.storeId) query = query.eq("store_id", options.storeId)

    const { data: subs, error } = await query

    if (error) throw error

    const next30Days = new Date()
    next30Days.setDate(next30Days.getDate() + 30)

    const forecast = ((subs || []) as any[])
      .filter(sub => {
        const nextRun = new Date(sub.next_execution_at)
        return nextRun >= new Date() && nextRun <= next30Days
      })
      .map(sub => ({
        id: sub.id,
        customerId: sub.customer_id,
        customerName: sub.customers?.name || "Cliente",
        customerEmail: sub.customers?.email || null,
        customerImage: sub.customers?.image_url || null,
        planId: sub.recurring_plans?.id || null,
        planName: sub.recurring_plans?.name || "Plano",
        frequencyType: sub.recurring_plans?.frequency_type || null,
        frequencyInterval: sub.recurring_plans?.frequency_interval ?? null,
        status: sub.status,
        deliveryType: sub.delivery_type || "pickup",
        deliveryAddress: sub.delivery_address || null,
        shippingAmount: Number(sub.shipping_amount || 0),
        billingMode: sub.billing_mode || "manual",
        mpPreapprovalId: sub.mp_preapproval_id || null,
        amount:
          sub.contracted_amount != null
            ? Number(sub.contracted_amount)
            : Number(sub.recurring_plans?.price || 0) + Number(sub.shipping_amount || 0),
        scheduledFor: sub.next_execution_at,
        // Itens do snapshot para a previsão de demanda (próximo ciclo)
        items: ((sub.recurring_subscription_items || []) as any[])
          .filter((item: any) => item.item_type === "product" && item.product_id)
          .map((item: any) => ({
            productId: item.product_id as string,
            variantId: item.variant_id || null,
            quantity: Number(item.quantity || 1),
            name: item.products?.name || "Produto",
            unit: item.products?.unit || null,
            stockAvailable: Number(item.products?.stock_available ?? 0),
            minStock: Number(item.products?.min_stock ?? 0),
          })),
      }))
      .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())

    return { success: true, data: forecast }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar previsão de ciclos" }
  }
}

export async function updateSubscriptionStockShortageResolvedAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "manage")
    const supabase = await getSupabaseServerClient()

    // 1. Fetch the failed execution for this subscription
    const { data: exec } = await supabase
      .from("recurring_executions")
      .select("id, scheduled_for")
      .eq("subscription_id", subscriptionId)
      .eq("partner_id", partnerId)
      .eq("status", "failed")
      .order("scheduled_for", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!exec) {
      // If no failed execution, check if the subscription is in awaiting_restock and just set it to active
      await supabase
        .from("recurring_subscriptions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", subscriptionId)

      return { success: true, message: "Assinatura ativada com sucesso." }
    }

    // 2. Fetch subscription details
    const { data: sub } = await supabase
      .from("recurring_subscriptions")
      .select("customer_id, recurring_plan_id, delivery_type, delivery_address, finance_account_id")
      .eq("id", subscriptionId)
      .single()

    if (!sub) throw new Error("Assinatura não encontrada.")

    // 3. Try to process the claimed execution again
    const { executeRecurringClaim } = await import("@/lib/services/recurring-execution.service")

    await executeRecurringClaim({
      executionId: exec.id,
      subscriptionId,
      partnerId,
      customerId: sub.customer_id,
      recurringPlanId: sub.recurring_plan_id,
      scheduledFor: exec.scheduled_for,
      deliveryType: sub.delivery_type as any || "pickup",
      deliveryAddress: sub.delivery_address,
      financeAccountId: sub.finance_account_id
    })

    // 4. Update subscription status back to active
    await supabase
      .from("recurring_subscriptions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)

    return { success: true, message: "Estoque reposicionado! Ciclo processado e assinatura ativada com sucesso." }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

export async function syncSubscriptionWithMpErpAction(partnerId: string, subscriptionId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "manage")
    const { syncSubscriptionWithMpAction } = await import("@/app/actions/marketplace/preapproval")
    const { createCheckoutFulfillmentToken } = await import("@/lib/security/checkout-fulfillment-token")
    const checkoutToken = createCheckoutFulfillmentToken(subscriptionId)
    if (!checkoutToken) return { success: false, error: "Configuração de segurança ausente." }
    return await syncSubscriptionWithMpAction(subscriptionId, checkoutToken)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao sincronizar" }
  }
}

/**
 * Vendedor agenda um serviço da assinatura usando os créditos do cliente.
 * Espelho do bookServiceWithCreditAction (marketplace), escopado por partner.
 */
export async function scheduleSubscriptionServiceAction(input: {
  partnerId: string
  subscriptionId: string
  serviceId: string
  date: string
  time: string
  staffPartnerUserId?: string | null
  notes?: string
}) {
  try {
    await requirePermission(input.partnerId, "recurring_subscriptions", "manage")
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const { partnerId, subscriptionId, serviceId, date, time } = input
    if (!subscriptionId || !serviceId || !date || !time) {
      return { success: false, error: "Parâmetros inválidos." }
    }

    const supabase = await getSupabaseServerClient()

    const { data: sub } = await supabase
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, store_id, status, delivery_address, next_execution_at,
        customers(id, name, user_id)
      `)
      .eq("id", subscriptionId)
      .eq("partner_id", partnerId)
      .single()

    if (!sub) return { success: false, error: "Assinatura não encontrada." }
    if (!["active", "awaiting_restock"].includes(sub.status)) {
      return { success: false, error: "Esta assinatura não está ativa." }
    }

    const customerId = (sub as any).customers?.id as string | undefined
    if (!customerId) return { success: false, error: "Assinatura sem cliente vinculado." }

    // Item de serviço (staff/duração preferidos)
    const { data: subItem } = await supabase
      .from("recurring_subscription_items")
      .select("staff_partner_user_id, duration_minutes")
      .eq("subscription_id", subscriptionId)
      .eq("service_id", serviceId)
      .eq("item_type", "service")
      .maybeSingle()

    // Crédito disponível
    const nowIso = new Date().toISOString()
    const { data: creditRows } = await supabase
      .from("subscription_item_credits")
      .select("quantity, consumed, expires_at")
      .eq("partner_id", partnerId)
      .eq("customer_id", customerId)
      .eq("service_id", serviceId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)

    const remaining = (creditRows || []).reduce(
      (acc, c) => acc + Math.max(0, Number(c.quantity) - Number(c.consumed)),
      0,
    )
    if (remaining < 1) {
      return { success: false, error: "O cliente não tem créditos para este serviço." }
    }

    const earliestExpiry = (creditRows || [])
      .map((c) => c.expires_at)
      .filter(Boolean)
      .sort()[0] as string | undefined
    if (earliestExpiry && date > earliestExpiry.slice(0, 10)) {
      return { success: false, error: "A data escolhida é posterior à validade dos créditos." }
    }

    // Serviço + staff
    const { data: service } = await supabase
      .from("services")
      .select("id, name, duration_minutes, store_id")
      .eq("id", serviceId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!service) return { success: false, error: "Serviço indisponível." }

    const staffId = input.staffPartnerUserId || subItem?.staff_partner_user_id || null
    if (!staffId) return { success: false, error: "Serviço sem profissional definido." }

    const durationMinutes = Number(subItem?.duration_minutes || service.duration_minutes || 60)
    const storeId = (sub.store_id as string | null) || (service.store_id as string | null) || null

    const { isStaffSlotAvailable } = await import("@/lib/commerce/scheduling-availability")
    let openingHours: any = null
    if (storeId) {
      const { data: storeRow } = await supabase
        .from("stores")
        .select("opening_hours")
        .eq("id", storeId)
        .maybeSingle()
      openingHours = storeRow?.opening_hours || null
    }

    const slotOk = await isStaffSlotAvailable(supabase as any, {
      partnerId,
      staffId,
      date,
      startTime: time,
      durationMinutes,
      openingHours,
      storeId,
    })
    if (!slotOk) return { success: false, error: "Este horário não está disponível." }

    let staffName = "Profissional"
    const { data: puRow } = await supabase
      .from("partner_users")
      .select("user_id")
      .eq("id", staffId)
      .maybeSingle()
    if (puRow?.user_id) {
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", puRow.user_id)
        .maybeSingle()
      if (prof?.full_name) staffName = prof.full_name
    }

    const user = await import("@/lib/auth/authorization").then((m) => m.requireUser())

    // Pedido R$0 de registro
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        partner_id: partnerId,
        store_id: storeId,
        customer_id: customerId,
        buyer_id: (sub as any).customers?.user_id || null,
        customer_name: (sub as any).customers?.name || "Cliente",
        order_source: "Assinatura",
        delivery_type: "pickup",
        situation: "paid",
        delivery_status: "delivered",
        total_amount: 0,
        paid_amount: 0,
        discount_value: 0,
        discount_type: "fixed",
        discount_amount: 0,
        delivery_fee: 0,
        additional_costs: 0,
        notes: sanitizeNotes(input.notes),
        payment_method: "Assinatura (Créditos)",
        payment_breakdown: [],
        recurring_subscription_id: subscriptionId,
        created_by: user?.id || null,
      })
      .select("id, order_number")
      .single()

    if (orderErr || !order) throw orderErr || new Error("Falha ao criar pedido.")

    await supabase.from("order_items").insert({
      order_id: order.id,
      product_id: null,
      variant_id: null,
      product_name: service.name,
      product_price: 0,
      quantity: 1,
      subtotal: 0,
      service_id: serviceId,
      line_type: "service_booking",
    })

    // Agendamento
    const [h, m] = time.split(":").map(Number)
    const endMinutes = h * 60 + m + durationMinutes
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`

    const { data: appointment, error: aptErr } = await supabase
      .from("appointments")
      .insert({
        partner_id: partnerId,
        store_id: storeId,
        customer_id: customerId,
        customer_name: (sub as any).customers?.name || "Cliente",
        service_id: serviceId,
        service_name: service.name,
        start_date: date,
        start_time: time,
        end_date: date,
        end_time: endTime,
        duration_minutes: durationMinutes,
        staff_partner_user_id: staffId,
        staff_name: staffName,
        price: 0,
        pricing_unit: "Por Serviço",
        notes: sanitizeNotes(input.notes),
        status: "Reservado",
        source: "appointment",
        sales_channel: "online_storefront",
        payment_status: "paid",
        marketplace_order_id: order.id,
        recurring_subscription_id: subscriptionId,
      })
      .select("id")
      .single()

    if (aptErr || !appointment) {
      await supabase.from("orders").delete().eq("id", order.id)
      throw aptErr || new Error("Falha ao criar agendamento.")
    }

    // Débito de créditos
    const { consumeSubscriptionCredits } = await import("@/lib/services/credit.service")
    const consumeResult = await consumeSubscriptionCredits(supabase as any, {
      partnerId,
      customerId,
      serviceId,
      quantity: 1,
      orderId: order.id,
      appointmentId: appointment.id,
      idempotencyKey: `sub-credit-book:${order.id}`,
    })

    if (!consumeResult.success) {
      await supabase.from("appointments").delete().eq("id", appointment.id)
      await supabase.from("orders").delete().eq("id", order.id)
      return { success: false, error: consumeResult.error || "Falha ao consumir créditos." }
    }

    await logAuditEvent({
      partnerId,
      actorUserId: user?.id || null,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [`vendedor agendou "${service.name}" para ${date} às ${time} usando créditos do cliente.`],
      source: "erp",
      metadata: { order_id: order.id, appointment_id: appointment.id, service_id: serviceId },
    })

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      appointmentId: appointment.id,
    }
  } catch (e: unknown) {
    console.error("scheduleSubscriptionServiceAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao agendar com créditos" }
  }
}

/**
 * Vendedor registra a entrega parcial de produtos da assinatura.
 * Cria pedido R$0 (preços reais, total/paid 0), debita créditos de produto e
 * move o estoque (reserve + finalize) - o pedido do ciclo não baixa estoque.
 */
export async function createSubscriptionDeliveryOrderAction(input: {
  partnerId: string
  subscriptionId: string
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>
  deliveryType?: "delivery" | "pickup"
  notes?: string
}) {
  try {
    await requirePermission(input.partnerId, "recurring_subscriptions", "manage")
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const { partnerId, subscriptionId } = input
    const items = (input.items || []).filter(
      (i) => i && i.productId && Number(i.quantity || 0) > 0,
    )
    if (items.length === 0 || items.length > 20) {
      return { success: false, error: "Informe de 1 a 20 itens para entrega." }
    }
    if (items.some((i) => Number(i.quantity) > 999)) {
      return { success: false, error: "Quantidade inválida em um dos itens." }
    }

    const supabase = await getSupabaseServerClient()
    const user = await import("@/lib/auth/authorization").then((m) => m.requireUser())

    const { data: sub } = await supabase
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, store_id, status, delivery_type, delivery_address,
        finance_account_id, customers(id, name, user_id)
      `)
      .eq("id", subscriptionId)
      .eq("partner_id", partnerId)
      .single()

    if (!sub) return { success: false, error: "Assinatura não encontrada." }
    if (!["active", "awaiting_restock"].includes(sub.status)) {
      return { success: false, error: "Esta assinatura não está ativa." }
    }

    const customerId = (sub as any).customers?.id as string | undefined
    if (!customerId) return { success: false, error: "Assinatura sem cliente vinculado." }

    const deliveryType =
      input.deliveryType === "delivery" || input.deliveryType === "pickup"
        ? input.deliveryType
        : sub.delivery_type === "delivery"
          ? "delivery"
          : "pickup"

    const productIds = Array.from(new Set(items.map((i) => i.productId)))
    const variantIds = Array.from(new Set(items.map((i) => i.variantId).filter(Boolean))) as string[]

    const [{ data: products }, { data: variants }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, cost_price")
        .in("id", productIds)
        .eq("partner_id", partnerId),
      variantIds.length
        ? supabase
          .from("product_variants")
          .select("id, product_id, variant_name, price, cost_price")
          .in("id", variantIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const productsMap = new Map((products || []).map((p: any) => [p.id, p]))
    const variantsMap = new Map((variants || []).map((v: any) => [v.id, v]))

    for (const item of items) {
      const product = productsMap.get(item.productId)
      if (!product) return { success: false, error: "Produto indisponível para esta assinatura." }
      if (item.variantId && !variantsMap.get(item.variantId)) {
        return { success: false, error: "Variante de produto indisponível." }
      }
    }

    // Créditos de produto disponíveis
    const nowIso = new Date().toISOString()
    const { data: creditRows } = await supabase
      .from("subscription_item_credits")
      .select("product_id, quantity, consumed")
      .eq("partner_id", partnerId)
      .eq("customer_id", customerId)
      .in("product_id", productIds)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)

    const creditRemaining = new Map<string, number>()
    for (const c of creditRows || []) {
      if (!c.product_id) continue
      creditRemaining.set(
        c.product_id,
        (creditRemaining.get(c.product_id) || 0) + Math.max(0, Number(c.quantity) - Number(c.consumed)),
      )
    }

    const requestedByProduct = new Map<string, number>()
    for (const item of items) {
      requestedByProduct.set(
        item.productId,
        (requestedByProduct.get(item.productId) || 0) + Number(item.quantity),
      )
    }
    for (const [productId, qty] of requestedByProduct) {
      const available = creditRemaining.get(productId) || 0
      const product = productsMap.get(productId) as any
      if (qty > available) {
        return {
          success: false,
          error: `Créditos insuficientes para "${product?.name || "produto"}" (disponível: ${available}, solicitado: ${qty}).`,
        }
      }
    }

    // Linhas com preços reais (total/paid ficam 0; desconto = soma das linhas)
    let linesSubtotal = 0
    const orderItemsPayload = items.map((item, index) => {
      const product = productsMap.get(item.productId) as any
      const variant = item.variantId ? (variantsMap.get(item.variantId) as any) : null
      const unitPrice = variant ? Number(variant.price || 0) : Number(product.price || 0)
      const unitCost = variant
        ? Number(variant.cost_price || product.cost_price || 0)
        : Number(product.cost_price || 0)
      const qty = Number(item.quantity)
      const subtotal = unitPrice * qty
      linesSubtotal += subtotal
      return {
        product_id: item.productId,
        variant_id: item.variantId || null,
        product_name: variant ? `${product.name} - ${variant.variant_name}` : product.name,
        product_price: unitPrice,
        quantity: qty,
        subtotal,
        sort_order: index,
        unit_cost: unitCost,
        line_type: "product",
      }
    })

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        partner_id: partnerId,
        store_id: sub.store_id || null,
        customer_id: customerId,
        buyer_id: (sub as any).customers?.user_id || null,
        customer_name: (sub as any).customers?.name || "Cliente",
        order_source: "Assinatura",
        delivery_type: deliveryType,
        situation: "paid",
        delivery_status: deliveryType === "pickup" ? "delivered" : "not_sent",
        total_amount: 0,
        paid_amount: 0,
        discount_value: linesSubtotal,
        discount_type: "fixed",
        discount_amount: 0,
        delivery_fee: 0,
        additional_costs: 0,
        notes: sanitizeNotes(input.notes),
        payment_method: "Assinatura (Créditos)",
        payment_breakdown: [],
        delivery_address: deliveryType === "delivery" ? sub.delivery_address : null,
        finance_account_id: sub.finance_account_id || null,
        recurring_subscription_id: subscriptionId,
        created_by: user?.id || null,
      })
      .select("id, order_number")
      .single()

    if (orderErr || !order) throw orderErr || new Error("Falha ao criar pedido de entrega.")

    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(orderItemsPayload.map((item) => ({ ...item, order_id: order.id })))

    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id)
      throw itemsErr
    }

    const stockItems = items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId || null,
      quantity: Number(item.quantity),
    }))
    const storeId = (sub.store_id as string | null) || null

    const { reserveOrderInventory, finalizeOrderInventory } = await import("@/lib/stock/reservations")

    const reserveResult = await reserveOrderInventory({
      client: supabase as any,
      partnerId,
      orderId: order.id,
      items: stockItems,
      storeId,
    })
    if ("error" in reserveResult) {
      await supabase.from("order_items").delete().eq("order_id", order.id)
      await supabase.from("orders").delete().eq("id", order.id)
      return { success: false, error: reserveResult.error || "Falha ao reservar estoque." }
    }

    // Débito de créditos de produto (idempotente por pedido)
    let consumedAny = false
    for (const [productId, qty] of requestedByProduct) {
      const { consumeSubscriptionCredits } = await import("@/lib/services/credit.service")
      const consumeResult = await consumeSubscriptionCredits(supabase as any, {
        partnerId,
        customerId,
        productId,
        quantity: qty,
        orderId: order.id,
        idempotencyKey: `sub-credit-delivery:${order.id}:${productId}`,
      })
      if (!consumeResult.success) {
        const { releaseOrderInventory } = await import("@/lib/stock/reservations")
        await releaseOrderInventory({
          client: supabase as any,
          partnerId,
          orderId: order.id,
          items: stockItems,
          storeId,
        })
        await supabase.from("order_items").delete().eq("order_id", order.id)
        await supabase.from("orders").delete().eq("id", order.id)
        return { success: false, error: consumeResult.error || "Falha ao consumir créditos." }
      }
      consumedAny = true
    }
    if (!consumedAny) {
      return { success: false, error: "Nenhum crédito consumido." }
    }

    const finalizeResult = await finalizeOrderInventory({
      client: supabase as any,
      partnerId,
      orderId: order.id,
      createdBy: (user?.id || null) as any,
      reason: "Venda de Produtos",
      notes: "Entrega de assinatura registrada com créditos.",
      items: stockItems,
      storeId,
    })
    if ("error" in finalizeResult) {
      console.error("[SUB-DELIVERY] Falha ao baixar estoque da entrega:", finalizeResult.error)
    } else {
      await supabase.from("orders").update({ inventory_deducted: true }).eq("id", order.id)
    }

    await logAuditEvent({
      partnerId,
      actorUserId: user?.id || null,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [
        `vendedor registrou entrega de ${items.length} item(ns) usando créditos da assinatura (pedido #${order.order_number}).`,
      ],
      source: "erp",
      metadata: { order_id: order.id, items: orderItemsPayload.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) },
    })

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
    }
  } catch (e: unknown) {
    console.error("createSubscriptionDeliveryOrderAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao registrar entrega" }
  }
}

