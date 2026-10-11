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
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"


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
        "id, name, status, start_date, show_in_marketplace, frequency_type, frequency_interval, weekdays, day_of_month, use_last_day, year_month, year_day, fulfillment_modes, store_id",
      )
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!plan?.id || plan.status !== "active" || !plan.show_in_marketplace) {
      return { success: false, error: "Plano indisponível para assinatura." }
    }

    const deliveryType = input.deliveryType || "pickup"
    const planModes = normalizeFulfillmentModes(plan.fulfillment_modes, ["delivery", "pickup"])
    if (!planModes.includes(deliveryType)) {
      return {
        success: false,
        error: deliveryType === "delivery"
          ? "Este plano é somente para retirada no local."
          : "Este plano é somente para entrega e não aceita retirada.",
      }
    }

    // Modulo recorrente exclusivo do Escalar: recusa amigavel ao comprador
    const { getRecurringModuleAccess, checkActiveSubscriptionCreateLimit } = await import("@/lib/services/recurring/limits")
    const access = await getRecurringModuleAccess(input.partnerId)
    if (!access.allowed) {
      return { success: false, error: "Este lojista não possui assinaturas recorrentes disponíveis no momento." }
    }
    const subLimit = await checkActiveSubscriptionCreateLimit(input.partnerId)
    if (!subLimit.allowed) {
      return { success: false, error: "Este lojista atingiu o limite de assinaturas ativas no momento." }
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
        store_id: plan.store_id || null,
        customer_id: customerId,
        recurring_plan_id: input.planId,
        status: "active",
        next_execution_at: nextExecutionAt,
        delivery_type: deliveryType,
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
        recurring_plans(
          id, short_id, name, description, price, frequency_type, frequency_interval, status,
          recurring_plan_items(
            id, item_type, product_id, service_id, quantity, unit_price, sort_order,
            products:product_id(id, short_id, name, images),
            services:service_id(id, short_id, name, images)
          )
        ),
        recurring_subscription_items(
          id, item_type, product_id, service_id, quantity, unit_price, sort_order,
          products:product_id(id, short_id, name, images),
          services:service_id(id, short_id, name, images)
        ),
        partners:partner_id(id),
        stores(id, short_id, name, slug, logo_url, addresses!store_id!left(city, state))
      `)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) throw error

    return {
      success: true,
      data: (data || []).map((row: any) => {
        const snapshotItems = row.recurring_subscription_items || []
        const planItems = row.recurring_plans?.recurring_plan_items || []
        const items = (snapshotItems.length ? snapshotItems : planItems)
          .slice()
          .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map((item: any) => ({
            id: item.id,
            itemType: item.item_type,
            quantity: Number(item.quantity || 1),
            unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
            product: item.products || null,
            service: item.services || null,
          }))

        return {
          ...mapSubscriptionRow(row as Record<string, unknown>),
          statusLabel: getRecurringStatusLabel(row.status),
          frequencyLabel: row.recurring_plans
            ? getRecurringFrequencyLabel(row.recurring_plans.frequency_type, row.recurring_plans.frequency_interval)
            : "",
          plan: row.recurring_plans,
          items,
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
        }
      }),
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
        stores(id, short_id, name, slug, logo_url, banner_url, rating, vendas_totais, is_showcase_active, addresses!store_id!left(id, street, number, neighborhood, city, state, zip_code, latitude, longitude)),
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
      // Cidade/estado da LOJA (paridade com produtos/servicos): alimenta a URL
      // canonica e o breadcrumb da pagina do plano.
      city: rawStore?.addresses?.[0]?.city || rawPartner?.addresses?.[0]?.city || null,
      state: rawStore?.addresses?.[0]?.state || rawPartner?.addresses?.[0]?.state || null,
      neighborhood: rawStore?.addresses?.[0]?.neighborhood || rawPartner?.addresses?.[0]?.neighborhood || null,
      latitude: rawStore?.addresses?.[0]?.latitude ?? rawPartner?.addresses?.[0]?.latitude ?? null,
      longitude: rawStore?.addresses?.[0]?.longitude ?? rawPartner?.addresses?.[0]?.longitude ?? null,
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
        customers!inner(user_id),
        recurring_plans(frequency_type)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    // Ciclos longos não permitem adiar por dias (só pular ou antecipar).
    const frequencyType = (sub as any)?.recurring_plans?.frequency_type
    if (frequencyType === "monthly" || frequencyType === "yearly") {
      return {
        success: false,
        error: "Planos mensais e anuais não permitem adiar o ciclo. Use pular ou antecipar.",
      }
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

export async function getMySubscriptionCreditsAction(subscriptionId?: string) {
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
    let query = admin
      .from("subscription_item_credits")
      .select(`
        id, subscription_id, service_id, product_id, quantity, consumed, expires_at, created_at,
        recurring_subscriptions(recurring_plans(name), stores(name)),
        recurring_subscription_items(staff_partner_user_id, duration_minutes, preferred_time),
        services(name, price),
        products(name)
      `)
      .in("customer_id", customerIds)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("expires_at", { ascending: true, nullsFirst: false })

    if (subscriptionId) {
      query = query.eq("subscription_id", subscriptionId)
    }

    const { data, error } = await query

    if (error) throw error

    return {
      success: true,
      data: (data || []).map((row: any) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        serviceId: row.service_id || null,
        productId: row.product_id || null,
        itemType: row.service_id ? "service" : row.product_id ? "product" : "unknown",
        planName: row.recurring_subscriptions?.recurring_plans?.name || "Plano",
        storeName: row.recurring_subscriptions?.stores?.name || "Vendedor",
        itemName: row.services?.name || row.products?.name || "Item",
        durationMinutes: row.recurring_subscription_items?.duration_minutes || null,
        preferredTime: row.recurring_subscription_items?.preferred_time || null,
        price: row.services?.price != null ? Number(row.services.price) : null,
        staffPartnerUserId: row.recurring_subscription_items?.staff_partner_user_id || null,
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

/**
 * Resposta do cliente a uma mudanca de preco/itens do plano.
 *  - accept: aplica os novos itens/valor (snapshot + baseline) e atualiza o
 *    valor cobrado no Mercado Pago; destrava a cobranca se estava congelada.
 *  - reject: usa o ciclo vigente e encerra a assinatura no fim dele (o
 *    preapproval do MP e' cancelado agora para nao gerar nova cobranca).
 */
export async function respondToMySubscriptionPriceChangeAction(
  subscriptionId: string,
  decision: "accept" | "reject",
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    if (decision !== "accept" && decision !== "reject") {
      return { success: false, error: "Resposta inválida." }
    }

    const user = await requireUser()
    const admin = getAdminClient()

    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, store_id, status, billing_mode, mp_preapproval_id,
        shipping_amount, price_change_decision, price_change_expires_at,
        pending_cancellation_reason,
        customers!inner(user_id, name),
        recurring_plans(name, price)
      `)
      .eq("id", subscriptionId)
      .single()

    const customerUserId = (sub as any)?.customers?.user_id
    if (!sub?.id || customerUserId !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }
    if (sub.price_change_decision || !sub.price_change_expires_at) {
      return { success: false, error: "Não há mudança de plano pendente." }
    }

    const wasFrozen = sub.status === "awaiting_customer_decision"

    if (decision === "accept") {
      // Mercado Pago primeiro: se falhar, nada muda localmente e o cliente
      // pode tentar de novo.
      if (sub.mp_preapproval_id && sub.status !== "cancelled" && sub.status !== "expired") {
        const planPrice = Number((sub as any).recurring_plans?.price || 0)
        const nextAmount = Math.round((planPrice + Number(sub.shipping_amount || 0)) * 100) / 100
        const { updateMpPreapprovalAmount, resumeMpPreapproval } = await import(
          "@/lib/services/mercadopago/partner-preapproval"
        )
        try {
          if (nextAmount > 0) {
            await updateMpPreapprovalAmount(sub.partner_id, sub.mp_preapproval_id, nextAmount)
          }
          if (wasFrozen) {
            await resumeMpPreapproval(sub.partner_id, sub.mp_preapproval_id)
          }
        } catch (e) {
          console.error("respondToMySubscriptionPriceChangeAction (MP) error:", e)
          return {
            success: false,
            error: "Não foi possível atualizar a cobrança no Mercado Pago. Tente novamente.",
          }
        }
      }

      const { data: applied, error: applyErr } = await admin.rpc("apply_recurring_plan_change", {
        p_subscription_id: subscriptionId,
      })
      if (applyErr) throw applyErr
      if (!applied || (applied as any[]).length === 0) {
        return { success: false, error: "Não foi possível aplicar a mudança. Tente novamente." }
      }

      await logAuditEvent({
        partnerId: sub.partner_id,
        actorUserId: user.id,
        entityType: "recurring_subscription",
        entityId: subscriptionId,
        actionType: "updated",
        changeLines: ["cliente aceitou a mudança de preço/itens do plano."],
        source: "marketplace",
        metadata: {
          new_amount: Number((applied as any)[0]?.new_amount || 0),
          was_frozen: wasFrozen,
        },
      })
    } else {
      if (sub.pending_cancellation_reason) {
        return { success: false, error: "A recusa já foi registrada." }
      }

      if (sub.mp_preapproval_id) {
        const { cancelMpPreapproval } = await import(
          "@/lib/services/mercadopago/partner-preapproval"
        )
        try {
          await cancelMpPreapproval(sub.partner_id, sub.mp_preapproval_id)
        } catch (e) {
          console.error("respondToMySubscriptionPriceChangeAction (cancel MP) error:", e)
          return {
            success: false,
            error: "Não foi possível interromper a cobrança no Mercado Pago. Tente novamente.",
          }
        }
      }

      const { data: updated, error: rejectErr } = await admin
        .from("recurring_subscriptions")
        .update({
          price_change_decision: "rejected",
          price_change_requested_at: null,
          price_change_expires_at: null,
          pending_cancellation_reason: "price_change_rejected",
          // Congelada: volta a ficar ativa (sem cobranca, o MP ja foi
          // cancelado) para o cliente usar o ciclo vigente.
          status: wasFrozen ? "active" : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .is("price_change_decision", null)
        .select("*")
        .single()
      if (rejectErr) throw rejectErr
      if (!updated) {
        return { success: false, error: "Não há mudança de plano pendente." }
      }

      await logAuditEvent({
        partnerId: sub.partner_id,
        actorUserId: user.id,
        entityType: "recurring_subscription",
        entityId: subscriptionId,
        actionType: "updated",
        changeLines: [
          "cliente recusou a mudança de plano; assinatura será encerrada ao final do ciclo vigente.",
        ],
        source: "marketplace",
      })

      return { success: true, data: mapSubscriptionRow(updated as Record<string, unknown>) }
    }

    const { data: finalRow } = await admin
      .from("recurring_subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .maybeSingle()

    return { success: true, data: mapSubscriptionRow((finalRow || sub) as Record<string, unknown>) }
  } catch (e: unknown) {
    console.error("respondToMySubscriptionPriceChangeAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao responder mudança" }
  }
}

/**
 * Cliente agenda um serviço usando créditos da assinatura.
 * Cria pedido R$0 ("Assinatura (Créditos)") + agendamento e debita o saldo via
 * consume_credits_fifo (idempotente por pedido).
 */
export async function bookServiceWithCreditAction(input: {
  subscriptionId: string
  serviceId: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  staffPartnerUserId?: string | null
  notes?: string
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.API_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const { subscriptionId, serviceId, date, time } = input
    if (!isUuid(subscriptionId) || !isUuid(serviceId) || !date || !time) {
      return { success: false, error: "Parâmetros inválidos." }
    }

    const user = await requireUser()
    const admin = getAdminClient()

    // 1. Assinatura ativa e do usuário logado
    const { data: sub } = await admin
      .from("recurring_subscriptions")
      .select(`
        id, partner_id, store_id, status, delivery_address, next_execution_at,
        customers!inner(user_id, id, name),
        recurring_plans(credit_expiration_policy)
      `)
      .eq("id", subscriptionId)
      .single()

    if (!sub || (sub as any).customers?.user_id !== user.id) {
      return { success: false, error: "Assinatura não encontrada." }
    }
    if (!["active", "awaiting_restock"].includes(sub.status)) {
      return { success: false, error: "Esta assinatura não está ativa." }
    }

    const customerId = (sub as any).customers.id as string
    const partnerId = sub.partner_id as string

    // 2. Item de serviço desta assinatura (staff/duração preferidos do snapshot)
    const { data: subItem } = await admin
      .from("recurring_subscription_items")
      .select("id, staff_partner_user_id, duration_minutes, preferred_time")
      .eq("subscription_id", subscriptionId)
      .eq("service_id", serviceId)
      .eq("item_type", "service")
      .maybeSingle()

    // 3. Crédito disponível e validade
    const nowIso = new Date().toISOString()
    const { data: creditRows } = await admin
      .from("subscription_item_credits")
      .select("id, quantity, consumed, expires_at")
      .eq("customer_id", customerId)
      .eq("service_id", serviceId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)

    const remaining = (creditRows || []).reduce(
      (acc: number, c: { quantity: number; consumed: number }) => acc + Math.max(0, Number(c.quantity) - Number(c.consumed)),
      0,
    )
    if (remaining < 1) {
      return { success: false, error: "Você não tem créditos disponíveis para este serviço." }
    }

    const earliestExpiry = (creditRows || [])
      .map((c: { expires_at: string | null }) => c.expires_at)
      .filter(Boolean)
      .sort()[0] as string | undefined

    if (earliestExpiry && date > earliestExpiry.slice(0, 10)) {
      return { success: false, error: "A data escolhida é posterior à validade dos créditos." }
    }
    if (!earliestExpiry && sub.next_execution_at && date > String(sub.next_execution_at).slice(0, 10)) {
      // Política end_of_cycle com expires_at ainda null: trava no fim do ciclo vigente.
      return { success: false, error: "A data escolhida é posterior ao fim do ciclo atual da assinatura." }
    }

    // 4. Serviço + staff
    const { data: service } = await admin
      .from("services")
      .select("id, name, duration_minutes, store_id")
      .eq("id", serviceId)
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (!service) return { success: false, error: "Serviço indisponível." }

    const staffId = input.staffPartnerUserId || subItem?.staff_partner_user_id || null
    if (!staffId) return { success: false, error: "Serviço sem profissional definido." }

    const durationMinutes = Number(subItem?.duration_minutes || service.duration_minutes || 60)

    // 5. Slot disponível
    const { isStaffSlotAvailable } = await import("@/lib/commerce/scheduling-availability")
    const storeId = (sub.store_id as string | null) || (service.store_id as string | null) || null

    let openingHours: any = null
    if (storeId) {
      const { data: storeRow } = await admin
        .from("stores")
        .select("opening_hours")
        .eq("id", storeId)
        .maybeSingle()
      openingHours = storeRow?.opening_hours || null
    }

    const slotOk = await isStaffSlotAvailable(admin as any, {
      partnerId,
      staffId,
      date,
      startTime: time,
      durationMinutes,
      openingHours,
      storeId,
    })
    if (!slotOk) {
      return { success: false, error: "Este horário não está mais disponível." }
    }

    // 6. Nome do profissional (partner_users → user_profiles)
    let staffName = "Profissional"
    const { data: puRow } = await admin
      .from("partner_users")
      .select("user_id")
      .eq("id", staffId)
      .maybeSingle()
    if (puRow?.user_id) {
      const { data: prof } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", puRow.user_id)
        .maybeSingle()
      if (prof?.full_name) staffName = prof.full_name
    }

    // 7. Pedido R$0 de registro (sem cobrança; F108 não gera transação)
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        partner_id: partnerId,
        store_id: storeId,
        buyer_id: user.id,
        customer_name: (sub as any).customers?.name || user.email?.split("@")[0] || "Cliente",
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
        notes: `Agendamento com créditos da assinatura. ${input.notes || ""}`.trim(),
        payment_method: "Assinatura (Créditos)",
        payment_breakdown: [],
        recurring_subscription_id: subscriptionId,
        finance_account_id: null,
      })
      .select("id, order_number")
      .single()

    if (orderErr || !order) throw orderErr || new Error("Falha ao criar pedido.")

    // Linha do pedido (registro do serviço com preço real, total continua 0)
    await admin.from("order_items").insert({
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

    // 8. Agendamento (service_id preenchido, preço 0, vinculado ao pedido)
    const [h, m] = time.split(":").map(Number)
    const endMinutes = h * 60 + m + durationMinutes
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`

    const { data: appointment, error: aptErr } = await admin
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
        notes: ["Agendado com créditos da assinatura.", sanitizeNotes(input.notes)].filter(Boolean).join(" "),
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
      // Rollback do pedido
      await admin.from("orders").delete().eq("id", order.id)
      throw aptErr || new Error("Falha ao criar agendamento.")
    }

    // 9. Débito de crédito (idempotente por pedido)
    const { consumeSubscriptionCredits } = await import("@/lib/services/credit.service")
    const consumeResult = await consumeSubscriptionCredits(admin as any, {
      partnerId,
      customerId,
      serviceId,
      quantity: 1,
      orderId: order.id,
      appointmentId: appointment.id,
      idempotencyKey: `sub-credit-book:${order.id}`,
    })

    if (!consumeResult.success) {
      await admin.from("appointments").delete().eq("id", appointment.id)
      await admin.from("orders").delete().eq("id", order.id)
      return { success: false, error: consumeResult.error || "Falha ao consumir créditos." }
    }

    const { increment_usage_counter } = await import("@/lib/services/subscription.service")
    increment_usage_counter(partnerId, "appointments_month_count").catch(console.error)

    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: subscriptionId,
      actionType: "updated",
      changeLines: [`cliente agendou "${service.name}" para ${date} às ${time} usando créditos da assinatura.`],
      source: "marketplace",
      metadata: { order_id: order.id, appointment_id: appointment.id, service_id: serviceId },
    })

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      appointmentId: appointment.id,
    }
  } catch (e: unknown) {
    console.error("bookServiceWithCreditAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao agendar com créditos" }
  }
}

