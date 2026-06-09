"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { processDueRecurringExecutions } from "@/lib/services/recurring-execution.service"
import type { RecurringListCursor, RecurringSubscriptionStatus } from "@/lib/types/recurring"
import { mapSubscriptionRow } from "@/lib/types/recurring"

const PAGE_SIZE = 20

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
    status?: RecurringSubscriptionStatus | "all"
    customerId?: string | null
    planId?: string | null
    search?: string
  },
) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "view")
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

    if (options?.status && options.status !== "all") query = query.eq("status", options.status)
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

    await requirePartnerAccessWithPermission(input.partnerId, "recurring_subscriptions", "manage")
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
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single()

    if (error) throw error

    import("@/lib/services/marketplace-metrics.service")
      .then(({ recordSubscriptionSignupMetrics }) =>
        recordSubscriptionSignupMetrics(supabase, data.id as string),
      )
      .catch(console.error)

    import("@/lib/services/notification-automation.service")
      .then(({ onSubscriptionCreated }) =>
        onSubscriptionCreated({
          partnerId: input.partnerId,
          subscriptionId: data.id as string,
          customerId: input.customerId,
          customerName: customer.name,
          planName: plan.name,
        }),
      )
      .catch(console.error)

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
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "manage")
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
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "manage")
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
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "manage")
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
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "view")
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
    await requirePartnerAccessWithPermission(partnerId, "recurring_subscriptions", "view")
    const admin = getAdminClient()
    const { data } = await admin
      .from("recurring_subscriptions")
      .select("status")
      .eq("partner_id", partnerId)

    const stats = { active: 0, paused: 0, cancelled: 0, expired: 0, total: 0 }
    for (const row of data || []) {
      stats.total++
      const key = row.status as keyof typeof stats
      if (key in stats && key !== "total") stats[key]++
    }
    return { success: true, data: stats }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar estatísticas" }
  }
}
