"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { mapPlanRow, mapSubscriptionRow, getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { isUuid } from "@/lib/utils/short-id"
import { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } from "@/lib/commerce/store-showcase"
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration"
import { computeNextExecutionAt } from "@/lib/services/recurring/frequency"
import { resolveSubscriptionShipping } from "@/lib/services/recurring/shipping"
import { updateMpPreapprovalAmount } from "@/lib/services/mercadopago/partner-preapproval"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"


export async function listMarketplaceRecurringPlansAction(partnerId: string) {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("recurring_plans")
      .select(`
        *,
        recurring_plan_items(
          id, item_type, product_id, variant_id, service_id, quantity, unit_price,
          products:product_id(id, short_id, name, price, images),
          services:service_id(id, short_id, name, price, duration_minutes)
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

    const acceptance = await canStoreAcceptOrders(admin, { partnerId: input.partnerId })
    if (!acceptance.allowed) {
      return { success: false, error: acceptance.message || INACTIVE_SHOWCASE_ERROR }
    }

    // Block owner or team member from subscribing
    const { data: partner } = await admin
      .from("partners")
      .select("user_id")
      .eq("id", input.partnerId)
      .single()

    if (partner?.user_id === user.id) {
      return { success: false, error: "Você é dono ou faz parte da equipe deste parceiro e não pode assinar este plano." }
    }

    const { data: team } = await admin
      .from("partner_users")
      .select("id")
      .eq("partner_id", input.partnerId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (team) {
      return { success: false, error: "Você é dono ou faz parte da equipe deste parceiro e não pode assinar este plano." }
    }

    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle()

    const customerId = await ensureMarketplaceCustomer({
      partnerId: input.partnerId,
      name: profile?.full_name || user.email || "Cliente",
      email: user.email || null,
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
      .select(
        "id, name, status, start_date, show_in_marketplace, frequency_type, frequency_interval, weekdays, day_of_month, use_last_day, year_month, year_day",
      )
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

    const nextExecutionAt = await computeNextExecutionAt(admin, plan, new Date())

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
        recurring_plans(id, short_id, name, description, frequency_type, frequency_interval, status),
        partners:partner_id(id),
        stores(id, short_id, name, slug, logo_url, addresses!store_id!left(city, state))
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
        partner: row.stores ? {
          ...row.stores,
          id: row.stores.id || row.partners?.id,
          short_id: row.stores.short_id,
          slug: row.stores.slug,
          name: row.stores.name,
          store_name: row.stores.name,
          city: row.stores.addresses?.[0]?.city || null,
          state: row.stores.addresses?.[0]?.state || null,
        } : row.partners,
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

export async function getMarketplaceRecurringPlanAction(planId: string) {
  try {
    const admin = getAdminClient()
    let query = admin
      .from("recurring_plans")
      .select(`
        *,
        partners!partner_id (
          id,
          user_id,
          partner_integrations(provider_slug, status, account_id, connected_at, config, metadata),
          is_showcase_active,
          created_at,
          addresses (id, street, number, neighborhood, city, state, zip_code),
          payment_methods (*)
        ),
        stores(id, short_id, name, slug, logo_url, banner_url, rating, vendas_totais, is_showcase_active),
        recurring_plan_items(
          id, item_type, product_id, variant_id, service_id, quantity, unit_price,
          products:product_id(id, short_id, name, price, images),
          services:service_id(id, short_id, name, price, duration_minutes)
        )
      `)

    if (isUuid(planId)) {
      query = query.eq("id", planId)
    } else {
      query = query.eq("short_id", planId)
    }

    const { data, error } = await query
      .eq("status", "active")
      .eq("show_in_marketplace", true)
      .maybeSingle()


    if (error) throw error

    if (!data) return null

    let computedPrice = 0
    let firstImage: string | null = null

    if (data.recurring_plan_items && Array.isArray(data.recurring_plan_items)) {
      for (const planItem of data.recurring_plan_items) {
        const qty = Number(planItem.quantity || 1)
        let itemPrice = Number(planItem.unit_price || 0)

        if (itemPrice <= 0) {
          if (planItem.item_type === 'product' && planItem.products) {
            itemPrice = Number((planItem.products as any).price || 0)
          } else if (planItem.item_type === 'service' && planItem.services) {
            itemPrice = Number((planItem.services as any).price || 0)
          }
        }
        computedPrice += qty * itemPrice

        if (!firstImage && planItem.item_type === 'product' && (planItem.products as any)?.images) {
          const imgs = (planItem.products as any).images
          if (Array.isArray(imgs) && imgs.length > 0) {
            firstImage = imgs[0]
          }
        }
      }
    }

    const rawPartner = data.partners || {}
    // mp_* status fields are sourced from partner_integrations.
    if (rawPartner && !Array.isArray(rawPartner)) {
      Object.assign(rawPartner, withMpPartnerFields(rawPartner))
    }
    const rawStore = Array.isArray(data.stores) ? data.stores[0] : data.stores
    const isShowcaseActive = (rawStore?.is_showcase_active ?? rawPartner?.is_showcase_active ?? true) !== false
    const partner = rawPartner ? {
      ...rawPartner,
      is_showcase_active: isShowcaseActive,
      store_id: rawStore?.id,
      store_name: rawStore?.name,
      store_image_url: rawStore?.logo_url,
      banner_url: rawStore?.banner_url,
      store_avatar: rawStore?.logo_url || "https://img.dudit.com.br/static/Placeholder.png",
      rating: rawStore?.rating ?? rawPartner?.rating ?? 0,
      vendas_totais: rawStore?.vendas_totais ?? rawPartner?.vendas_totais ?? 0,
    } : {}
    const planImages = Array.isArray(data.images) && data.images.length > 0
      ? data.images
      : (firstImage ? [firstImage] : [partner.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"]);

    return {
      ...mapPlanRow(data as Record<string, unknown>),
      is_showcase_active: isShowcaseActive,
      frequencyLabel: getRecurringFrequencyLabel(data.frequency_type, data.frequency_interval),
      items: data.recurring_plan_items || [],
      partners: partner,
      stores: rawStore,
      price: Number(data.price ?? 0) > 0 ? Number(data.price) : computedPrice,
      images: planImages,
    }
  } catch (e: unknown) {
    console.error("[getMarketplaceRecurringPlanAction] Error:", e)
    return null
  }
}

export async function skipMySubscriptionCycleAction(subscriptionId: string) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    // 1. Fetch subscription details & plan frequency
    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, next_execution_at, mp_preapproval_id,
        customers!inner(user_id),
        recurring_plans(frequency_type, frequency_interval)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    // 2. Calculate next execution date by adding plan frequency interval
    const currentNext = new Date(sub.next_execution_at)
    const type = (sub.recurring_plans as any).frequency_type
    const interval = Number((sub.recurring_plans as any).frequency_interval || 1)

    if (type === "daily" || type === "day") {
      currentNext.setDate(currentNext.getDate() + interval)
    } else if (type === "weekly" || type === "week") {
      currentNext.setDate(currentNext.getDate() + interval * 7)
    } else if (type === "monthly" || type === "month") {
      currentNext.setMonth(currentNext.getMonth() + interval)
    } else if (type === "yearly" || type === "year") {
      currentNext.setFullYear(currentNext.getFullYear() + interval)
    } else {
      currentNext.setDate(currentNext.getDate() + 30) // Fallback
    }

    const newNextStr = currentNext.toISOString()

    // 3. Reschedule in Mercado Pago if automatic Preapproval exists
    if (sub.mp_preapproval_id) {
      const { updateMpPreapprovalNextPaymentDate } = await import(
        "@/lib/services/mercadopago/partner-preapproval"
      )
      await updateMpPreapprovalNextPaymentDate(sub.partner_id, sub.mp_preapproval_id, newNextStr)
    }

    // 4. Update locally
    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update({
        next_execution_at: newNextStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [`cliente pulou um ciclo. Nova data: ${newNextStr.slice(0, 10)}.`],
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    console.error("skipMySubscriptionCycleAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao pular ciclo" }
  }
}

export async function postponeMySubscriptionCycleAction(subscriptionId: string, days: number) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    if (days <= 0 || days > 90) {
      return { success: false, error: "Quantidade de dias inválida (máximo 90 dias)." }
    }

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, next_execution_at, mp_preapproval_id,
        customers!inner(user_id)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    const currentNext = new Date(sub.next_execution_at)
    currentNext.setDate(currentNext.getDate() + days)
    const newNextStr = currentNext.toISOString()

    if (sub.mp_preapproval_id) {
      const { updateMpPreapprovalNextPaymentDate } = await import(
        "@/lib/services/mercadopago/partner-preapproval"
      )
      await updateMpPreapprovalNextPaymentDate(sub.partner_id, sub.mp_preapproval_id, newNextStr)
    }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update({
        next_execution_at: newNextStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [`cliente adiou o ciclo por ${days} dias. Nova data: ${newNextStr.slice(0, 10)}.`],
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    console.error("postponeMySubscriptionCycleAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao adiar ciclo" }
  }
}

export async function anticipateMySubscriptionCycleAction(subscriptionId: string) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, next_execution_at, mp_preapproval_id,
        customers!inner(user_id)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    // Anticipating executes today (or in 2 minutes to allow system batching)
    const newNextStr = new Date(Date.now() + 2 * 60 * 1000).toISOString()

    if (sub.mp_preapproval_id) {
      const { updateMpPreapprovalNextPaymentDate } = await import(
        "@/lib/services/mercadopago/partner-preapproval"
      )
      await updateMpPreapprovalNextPaymentDate(sub.partner_id, sub.mp_preapproval_id, newNextStr)
    }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update({
        next_execution_at: newNextStr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [`cliente antecipou o ciclo para execução imediata.`],
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    console.error("anticipateMySubscriptionCycleAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao antecipar ciclo" }
  }
}

/**
 * Resolve the freight for a new delivery address against the plan's shipping
 * policy. Never called for repeated billing: freight is frozen at signup.
 */
async function quoteSubscriptionShippingForAddress(
  partnerId: string,
  address: string,
  plan: { shipping_mode?: string | null; shipping_flat_amount?: number | null },
): Promise<
  | { ok: true; shipping: ReturnType<typeof resolveSubscriptionShipping> }
  | { ok: false; error: string }
> {
  const mode = plan.shipping_mode || "included"

  // Included/flat do not depend on the address, so there is nothing to quote.
  if (mode !== "quote") {
    return {
      ok: true,
      shipping: resolveSubscriptionShipping({
        deliveryType: "delivery",
        shippingMode: mode as any,
        shippingFlatAmount: plan.shipping_flat_amount,
      }),
    }
  }

  const quote = await quoteDeliveryFeeAction({
    partnerId,
    destinationAddress: address,
    freeDeliveryCoupon: false,
  })
  if (!quote.success) return { ok: false, error: quote.error }

  const shipping = resolveSubscriptionShipping({
    deliveryType: "delivery",
    shippingMode: "quote",
    shippingFlatAmount: plan.shipping_flat_amount,
    deliveryFee: Number(quote.fee || 0),
    deliveryBreakdown: (quote as { breakdown?: Record<string, unknown> }).breakdown ?? null,
  })
  if (!shipping.resolved) return { ok: false, error: "Endereço fora da área de entrega." }

  return { ok: true, shipping }
}

/**
 * Keeps the Mercado Pago preapproval in sync when the frozen freight changes.
 * Returns an error when the amount could not be updated, so the caller can
 * abort instead of leaving local state and the MP charge out of sync.
 */
async function syncMpPreapprovalAmountForShipping(opts: {
  partnerId: string
  preapprovalId: string | null
  subscriptionStatus: string
  planPrice: number
  previousShipping: number
  nextShipping: number
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.preapprovalId) return { ok: true }
  if (opts.subscriptionStatus === "cancelled" || opts.subscriptionStatus === "expired") {
    return { ok: true }
  }

  const before = Math.round((opts.planPrice + opts.previousShipping) * 100) / 100
  const after = Math.round((opts.planPrice + opts.nextShipping) * 100) / 100
  if (before === after) return { ok: true }

  try {
    await updateMpPreapprovalAmount(opts.partnerId, opts.preapprovalId, after)
    return { ok: true }
  } catch (e) {
    console.error("syncMpPreapprovalAmountForShipping error:", e)
    return {
      ok: false,
      error: "Não foi possível atualizar a cobrança no Mercado Pago. Tente novamente.",
    }
  }
}

export async function updateMySubscriptionDetailsAction(
  subscriptionId: string,
  input: { deliveryAddress?: string | null; notes?: string | null }
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, delivery_type, delivery_address, status,
        shipping_amount, shipping_source, mp_preapproval_id,
        customers!inner(user_id),
        recurring_plans(price, shipping_mode, shipping_flat_amount)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    const plan = (sub as any).recurring_plans || {}
    const planPrice = Number(plan.price || 0)
    const previousShipping = Number(sub.shipping_amount || 0)

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    const changes: string[] = []
    let requiresConfirmation = false
    let pendingShippingAmount: number | null = null

    if (input.deliveryAddress !== undefined && sub.delivery_type === "delivery") {
      const newAddress = String(input.deliveryAddress || "").trim()
      if (!newAddress) {
        return { success: false, error: "Informe o endereço de entrega." }
      }

      const previousAddress = String(sub.delivery_address || "").trim()
      if (newAddress !== previousAddress) {
        const quoted = await quoteSubscriptionShippingForAddress(
          sub.partner_id,
          newAddress,
          plan,
        )
        if (!quoted.ok) return { success: false, error: quoted.error }

        if (quoted.shipping.amount > previousShipping + 0.001) {
          // Freight goes up: nothing is applied without the customer's consent.
          requiresConfirmation = true
          pendingShippingAmount = quoted.shipping.amount
          updatePayload.pending_address = newAddress
          updatePayload.pending_shipping_amount = quoted.shipping.amount
          changes.push(
            `solicitou mudança de endereço para "${newAddress}" (frete de R$ ${previousShipping.toFixed(2)} para R$ ${quoted.shipping.amount.toFixed(2)}), aguardando confirmação do cliente.`,
          )
        } else {
          const mp = await syncMpPreapprovalAmountForShipping({
            partnerId: sub.partner_id,
            preapprovalId: sub.mp_preapproval_id || null,
            subscriptionStatus: sub.status,
            planPrice,
            previousShipping,
            nextShipping: quoted.shipping.amount,
          })
          if (!mp.ok) return { success: false, error: mp.error }

          updatePayload.delivery_address = newAddress
          updatePayload.shipping_amount = quoted.shipping.amount
          updatePayload.shipping_source = quoted.shipping.source
          updatePayload.shipping_quoted_at = new Date().toISOString()
          updatePayload.carrier_service_id = quoted.shipping.carrierServiceId
          updatePayload.pending_address = null
          updatePayload.pending_shipping_amount = null
          changes.push(`endereço de entrega alterado para "${newAddress}".`)
        }
      }
    }

    if (input.notes !== undefined) {
      updatePayload.notes = sanitizeNotes(input.notes)
      changes.push(`observações alteradas para "${input.notes || ""}".`)
    }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update(updatePayload)
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    if (changes.length > 0) {
      await logAuditEvent({
        partnerId: sub.partner_id,
        actorUserId: user.id,
        entityType: "recurring_subscription",
        entityId: subscriptionId,
        actionType: "updated",
        changeLines: changes,
        source: "marketplace",
      })
    }

    return {
      success: true,
      data: mapSubscriptionRow(data as Record<string, unknown>),
      requiresConfirmation,
      pendingAddress: requiresConfirmation ? updatePayload.pending_address : null,
      pendingShippingAmount,
      previousShippingAmount: previousShipping,
    }
  } catch (e: unknown) {
    console.error("updateMySubscriptionDetailsAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao atualizar dados" }
  }
}

/**
 * Applies or discards a pending address change that would raise the freight.
 */
export async function confirmMySubscriptionAddressChangeAction(
  subscriptionId: string,
  decision: "accept" | "discard",
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, status, pending_address, pending_shipping_amount,
        shipping_amount, mp_preapproval_id,
        customers!inner(user_id),
        recurring_plans(price, shipping_mode, shipping_flat_amount)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    if (!sub.pending_address || sub.pending_shipping_amount == null) {
      return { success: false, error: "Não há mudança de endereço pendente." }
    }

    const updatePayload: Record<string, any> = {
      pending_address: null,
      pending_shipping_amount: null,
      updated_at: new Date().toISOString(),
    }
    const changes: string[] = []

    if (decision === "accept") {
      const plan = (sub as any).recurring_plans || {}
      const previousShipping = Number(sub.shipping_amount || 0)
      const nextShipping = Math.max(Number(sub.pending_shipping_amount || 0), 0)

      const mp = await syncMpPreapprovalAmountForShipping({
        partnerId: sub.partner_id,
        preapprovalId: sub.mp_preapproval_id || null,
        subscriptionStatus: sub.status,
        planPrice: Number(plan.price || 0),
        previousShipping,
        nextShipping,
      })
      if (!mp.ok) return { success: false, error: mp.error }

      const quoted = await quoteSubscriptionShippingForAddress(
        sub.partner_id,
        sub.pending_address,
        plan,
      )
      if (!quoted.ok) return { success: false, error: quoted.error }

      updatePayload.delivery_address = sub.pending_address
      updatePayload.shipping_amount = quoted.shipping.amount
      updatePayload.shipping_source = quoted.shipping.source
      updatePayload.shipping_quoted_at = new Date().toISOString()
      updatePayload.carrier_service_id = quoted.shipping.carrierServiceId
      changes.push(
        `confirmou mudança de endereço para "${sub.pending_address}" com frete de R$ ${quoted.shipping.amount.toFixed(2)}.`,
      )
    } else {
      changes.push("recusou a mudança de endereço com frete superior.")
    }

    const { data, error } = await admin
      .from("recurring_subscriptions")
      .update(updatePayload)
      .eq("id", subscriptionId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId: sub.partner_id,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: changes,
      source: "marketplace",
    })

    return { success: true, data: mapSubscriptionRow(data as Record<string, unknown>) }
  } catch (e: unknown) {
    console.error("confirmMySubscriptionAddressChangeAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao confirmar endereço" }
  }
}

export async function getMySubscriptionCreditsAction() {
  try {
    const user = await requireUser()
    const admin = getAdminClient()

    // 1. Get all customer IDs for the current user
    const { data: customers } = await admin
      .from("customers")
      .select("id")
      .eq("user_id", user.id)

    const customerIds = (customers || []).map((c: any) => c.id)
    if (customerIds.length === 0) return { success: true, data: [] }

    // 2. Fetch credits
    const { data, error } = await admin
      .from("subscription_item_credits")
      .select(`
        id, subscription_id, quantity, consumed, expires_at, created_at,
        recurring_subscriptions(recurring_plans(name), stores(name)),
        services(name),
        products(name)
      `)
      .in("customer_id", customerIds)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false })

    if (error) throw error

    return {
      success: true,
      data: (data || []).map((row: any) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        planName: row.recurring_subscriptions?.recurring_plans?.name || "Plano",
        storeName: row.recurring_subscriptions?.stores?.name || "Vendedor",
        itemName: row.services?.name || row.products?.name || "Item",
        totalCredits: row.quantity,
        consumedCredits: row.consumed,
        remainingCredits: Math.max(0, row.quantity - row.consumed),
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })),
    }
  } catch (e: unknown) {
    console.error("getMySubscriptionCreditsAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar créditos" }
  }
}

