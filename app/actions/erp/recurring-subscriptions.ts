"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requirePermission } from "@/lib/permissions/access"
import { requireAuthorizedPartnerContext } from "@/lib/services/authorized-customer-access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { revalidateTag } from "next/cache"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { processDueRecurringExecutions } from "@/lib/services/recurring-execution.service"
import type {
  RecurringListCursor,
  RecurringSubscriptionStatus,
  RecurringSubscriptionStatusFilter,
} from "@/lib/types/recurring"
import { mapSubscriptionRow } from "@/lib/types/recurring"

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
        customers:customer_id(id, name, email)
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
    const supabase = await getSupabaseServerClient()

    const { data: plan } = await supabase
      .from("recurring_plans")
      .select("id, name, status, start_date")
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
        customer_id: input.customerId,
        recurring_plan_id: input.planId,
        status: "active",
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

export async function runDueRecurringSubscriptionsAction(limit = 100) {
  try {
    const result = await processDueRecurringExecutions(limit)
    return { success: true, data: result }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro no processamento" }
  }
}

export async function getRecurringSubscriptionStatsAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const admin = getAdminClient()
    const { data } = await admin
      .from("recurring_subscriptions")
      .select("status")
      .eq("partner_id", partnerId)

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

export async function getSubscriptionBillingPanelAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "recurring_subscriptions", "view")
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, total_amount, situation, created_at, recurring_subscription_id, recurring_execution_id")
      .eq("partner_id", partnerId)
      .not("recurring_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar faturamentos" }
  }
}

export async function getSubscriptionForecastAction(partnerId: string) {
  try {
    const access = await requireAuthorizedPartnerContext(partnerId, "recurring_subscriptions", "view")
    partnerId = access.partnerId
    const supabase = access.admin

    // Get active subscriptions and calculate their upcoming executions in the next 30 days
    const { data: subs, error } = await supabase
      .from("recurring_subscriptions")
      .select(`
        id, customer_id, next_execution_at,
        customers(name),
        recurring_plans(name, frequency_type, frequency_interval)
      `)
      .eq("partner_id", partnerId)
      .eq("status", "active")

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
        customerName: sub.customers?.name || "Cliente",
        planName: sub.recurring_plans?.name || "Plano",
        scheduledFor: sub.next_execution_at
      }))
      .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())

    return { success: true, data: forecast }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar previsão de ciclos" }
  }
}

export async function getSubscriptionCreditsAction(partnerId: string, search: string = "") {
  try {
    const access = await requireAuthorizedPartnerContext(partnerId, "recurring_subscriptions", "view")
    partnerId = access.partnerId
    const supabase = access.admin

    let query = supabase
      .from("subscription_item_credits")
      .select(`
        id, customer_id, service_id, quantity, consumed, expires_at, created_at,
        customers(name),
        services(name)
      `)
      .eq("partner_id", partnerId)

    const { data, error } = await query

    if (error) throw error

    // Filter by customer name in memory if search is present
    let filtered = ((data || []) as any[]).map(row => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customers?.name || "Cliente",
      serviceName: row.services?.name || "Serviço",
      quantity: row.quantity,
      consumed: row.consumed,
      remaining: row.quantity - row.consumed,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }))

    if (search.trim()) {
      const term = search.toLowerCase()
      filtered = filtered.filter((f: any) => f.customerName.toLowerCase().includes(term))
    }

    return { success: true, data: filtered }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar créditos" }
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
    return await syncSubscriptionWithMpAction(partnerId, subscriptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao sincronizar" }
  }
}

