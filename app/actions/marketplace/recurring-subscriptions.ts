"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { mapPlanRow, mapSubscriptionRow, getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"

export async function listMarketplaceRecurringPlansAction(partnerId: string) {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("recurring_plans")
      .select(`
        *,
        recurring_plan_items(
          id, item_type, product_id, variant_id, service_id, quantity, unit_price,
          products:product_id(id, name, price, images),
          services:service_id(id, name, price, duration_minutes)
        )
      `)
      .eq("partner_id", partnerId)
      .eq("status", "active")
      .eq("show_in_marketplace", true)
      .order("name")

    if (error) throw error

    return {
      success: true,
      data: (data || []).map((row: any) => ({
        ...mapPlanRow(row as Record<string, unknown>),
        frequencyLabel: getRecurringFrequencyLabel(row.frequency_type, row.frequency_interval),
        items: row.recurring_plan_items || [],
      })),
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar planos" }
  }
}

export async function subscribeToRecurringPlanAction(input: {
  partnerId: string
  planId: string
  deliveryType?: "pickup" | "delivery"
  deliveryAddress?: string | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("user_id", user.id)
      .maybeSingle()

    const customerId = await ensureMarketplaceCustomer({
      partnerId: input.partnerId,
      name: profile?.full_name || user.email || "Cliente",
      email: profile?.email || user.email,
      phone: profile?.phone || null,
      userId: user.id,
    })

    if (!customerId) return { success: false, error: "Não foi possível vincular seu cadastro de cliente." }

    await admin
      .from("customers")
      .update({ user_id: user.id })
      .eq("id", customerId)
      .is("user_id", null)

    const { data: plan } = await admin
      .from("recurring_plans")
      .select("id, name, status, start_date, show_in_marketplace")
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!plan?.id || plan.status !== "active" || !plan.show_in_marketplace) {
      return { success: false, error: "Plano indisponível para assinatura." }
    }

    const { data: existing } = await admin
      .from("recurring_subscriptions")
      .select("id, status")
      .eq("partner_id", input.partnerId)
      .eq("customer_id", customerId)
      .eq("recurring_plan_id", input.planId)
      .in("status", ["active", "paused"])
      .maybeSingle()

    if (existing?.id) {
      return { success: false, error: "Você já possui uma assinatura ativa deste plano." }
    }

    const nextExecutionAt = new Date(Math.max(Date.now(), new Date(plan.start_date).getTime())).toISOString()

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .insert({
        partner_id: input.partnerId,
        customer_id: customerId,
        recurring_plan_id: input.planId,
        status: "active",
        next_execution_at: nextExecutionAt,
        delivery_type: input.deliveryType || "pickup",
        delivery_address: input.deliveryAddress || null,
      })
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: data.id,
      actionType: "created",
      changeLines: [`cliente assinou o plano "${plan.name}" via marketplace.`],
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao assinar plano" }
  }
}

export async function getMyRecurringSubscriptionsAction() {
  try {
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: customers } = await admin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)

    const customerIds = (customers || []).map((c: any) => c.id)
    if (customerIds.length === 0) return { success: true, data: [] }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .select(`
        *,
        recurring_plans(id, name, description, frequency_type, frequency_interval, status),
        partners:partner_id(id, store_name, store_image_url)
      `)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error

    return {
      success: true,
      data: (data || []).map((row: any) => ({
        ...mapSubscriptionRow(row as Record<string, unknown>),
        statusLabel: getRecurringStatusLabel(row.status),
        frequencyLabel: row.recurring_plans
          ? getRecurringFrequencyLabel(row.recurring_plans.frequency_type, row.recurring_plans.frequency_interval)
          : "",
        plan: row.recurring_plans,
        partner: row.partners,
      })),
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar assinaturas" }
  }
}

export async function getMyRecurringSubscriptionExecutionsAction(subscriptionId: string) {
  try {
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select("id, customer_id, customers!inner(user_id)")
      .eq("id", subscriptionId)
      .maybeSingle()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    const { data, error } = await admin
      .from("recurring_executions")
      .select(`
        id, scheduled_for, status, order_id, appointment_ids, error_message, completed_at,
        orders:order_id(id, order_number, total_amount, situation)
      `)
      .eq("subscription_id", subscriptionId)
      .order("scheduled_for", { ascending: false })
      .limit(50)

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar histórico" }
  }
}

export async function pauseMyRecurringSubscriptionAction(subscriptionId: string) {
  return updateMySubscriptionStatus(subscriptionId, "paused", { paused_at: new Date().toISOString() }, "pausou assinatura.")
}

export async function resumeMyRecurringSubscriptionAction(subscriptionId: string) {
  return updateMySubscriptionStatus(subscriptionId, "active", { paused_at: null }, "reativou assinatura.")
}

export async function cancelMyRecurringSubscriptionAction(subscriptionId: string) {
  return updateMySubscriptionStatus(
    subscriptionId,
    "cancelled",
    { cancelled_at: new Date().toISOString() },
    "cancelou assinatura.",
  )
}

async function updateMySubscriptionStatus(
  subscriptionId: string,
  status: "active" | "paused" | "cancelled",
  extra: Record<string, unknown>,
  auditLine: string,
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select("id, partner_id, customer_id, customers!inner(user_id)")
      .eq("id", subscriptionId)
      .maybeSingle()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update({ status, ...extra, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: status === "paused" ? "paused" : status === "cancelled" ? "cancelled" : "updated",
      changeLines: [`cliente ${auditLine}`],
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao atualizar assinatura" }
  }
}
