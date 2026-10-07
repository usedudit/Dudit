"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { ensureMarketplaceCustomer } from "@/lib/services/marketplace-customer"
import {
  createMpPreapproval,
  getMpPreapprovalDetails,
} from "@/lib/services/mercadopago/partner-preapproval"
import { MERCADOPAGO_PROVIDER } from "@/lib/services/payments/mercadopago-integration"
import { computeNextExecutionAt, toMpFrequency } from "@/lib/services/recurring/frequency"
import { resolveSubscriptionShipping } from "@/lib/services/recurring/shipping"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"

interface CreatePreapprovalInput {
  partnerId: string
  planId: string
  deliveryType?: "pickup" | "delivery"
  deliveryAddress?: string | null
  notes?: string | null
}

/**
 * Creates a pending subscription in local DB, then generates MP preapproval redirect URL.
 */
export async function createSubscriptionPreapprovalAction(input: CreatePreapprovalInput) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    const admin = getAdminClient()

    // 1. Fetch partner OAuth to confirm ownership before executing API requests
    const { data: partner, error: partnerErr } = await admin
      .from("partners")
      .select("id, user_id, partner_integrations(provider_slug, access_token_encrypted)")
      .eq("id", input.partnerId)
      .single()

    if (partnerErr || !partner) {
      return { success: false, error: "Parceiro não encontrado ou sem credenciais Mercado Pago." }
    }

    const mpIntegration = ((partner as any).partner_integrations || []).find(
      (row: { provider_slug: string }) => row.provider_slug === MERCADOPAGO_PROVIDER,
    )

    if (!mpIntegration?.access_token_encrypted) {
      return { success: false, error: "Parceiro não possui integração ativa com Mercado Pago." }
    }

    // Block owner or team member from subscribing
    if (partner.user_id === user.id) {
      return { success: false, error: "Você é dono deste parceiro e não pode assinar este plano." }
    }

    const { data: team } = await admin
      .from("partner_users")
      .select("id")
      .eq("partner_id", input.partnerId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (team) {
      return { success: false, error: "Você faz parte da equipe deste parceiro e não pode assinar este plano." }
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

    // 2. Fetch the plan details
    const { data: plan } = await admin
      .from("recurring_plans")
      .select(
        "id, name, status, price, frequency_type, frequency_interval, start_date, weekdays, day_of_month, use_last_day, year_month, year_day, billing_mode, shipping_mode, shipping_flat_amount, fulfillment_modes, store_id",
      )
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!plan?.id || plan.status !== "active") {
      return { success: false, error: "Plano indisponível para assinatura." }
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

    const billingMode = plan.billing_mode || "manual"
    if (billingMode !== "auto_mercado_pago") {
      return { success: false, error: "Este plano não suporta pagamento automático via Mercado Pago." }
    }

    // Frete: resolvido UMA vez aqui e congelado na assinatura.
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
    let deliveryFee: number | null = 0
    let deliveryBreakdown: Record<string, unknown> | null = null

    if (deliveryType === "delivery" && plan.shipping_mode === "quote") {
      if (!input.deliveryAddress) {
        return { success: false, error: "Informe o endereço de entrega para calcular o frete." }
      }
      const quote = await quoteDeliveryFeeAction({
        partnerId: input.partnerId,
        destinationAddress: input.deliveryAddress,
        freeDeliveryCoupon: false,
      })
      if (!quote.success) {
        return { success: false, error: quote.error }
      }
      deliveryFee = Number(quote.fee || 0)
      deliveryBreakdown = (quote as { breakdown?: Record<string, unknown> }).breakdown ?? null
    }

    const shipping = resolveSubscriptionShipping({
      deliveryType,
      shippingMode: plan.shipping_mode,
      shippingFlatAmount: plan.shipping_flat_amount,
      deliveryFee,
      deliveryBreakdown,
    })

    if (!shipping.resolved) {
      return { success: false, error: "Endereço fora da área de entrega." }
    }

    const now = new Date()
    const nextExecutionAt = await computeNextExecutionAt(admin, plan, now)

    // 3. Insert local subscription record as 'pending' (Awaiting approval from webhook/server)
    const { data: sub, error: subErr } = await admin
      .from("recurring_subscriptions")
      .insert({
        partner_id: input.partnerId,
        store_id: plan.store_id || null,
        customer_id: customerId,
        recurring_plan_id: input.planId,
        status: "pending",
        billing_mode: "auto_mercado_pago",
        next_execution_at: nextExecutionAt,
        delivery_type: deliveryType,
        delivery_address: input.deliveryAddress || null,
        shipping_amount: shipping.amount,
        shipping_source: shipping.source,
        shipping_quoted_at: shipping.resolved ? new Date().toISOString() : null,
        carrier_service_id: shipping.carrierServiceId,
        notes: sanitizeNotes(input.notes),
      })
      .select("*")
      .single()

    if (subErr) throw subErr

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "recurring_subscription",
      entityId: sub.id,
      actionType: "created",
      changeLines: [`iniciou contratação da assinatura automática do plano "${plan.name}".`],
      source: "marketplace",
    })

    // 4. Request preapproval from Mercado Pago
    const { frequency, frequency_type: frequencyType } = toMpFrequency(plan)

    const mpPreapproval = await createMpPreapproval({
      partnerId: input.partnerId,
      payerEmail: user.email || "cliente@dudit.com.br",
      planName: plan.name,
      amount: Number(plan.price || 0) + shipping.amount,
      frequency,
      frequencyType,
      externalReference: sub.id,
      startDate: nextExecutionAt,
    })

    // Update the pending subscription record with the MP Preapproval ID
    await admin
      .from("recurring_subscriptions")
      .update({
        mp_preapproval_id: mpPreapproval.id,
      })
      .eq("id", sub.id)

    return {
      success: true,
      data: {
        subscriptionId: sub.id,
        initPoint: mpPreapproval.initPoint,
      },
    }
  } catch (e: unknown) {
    console.error("createSubscriptionPreapprovalAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao preparar assinatura" }
  }
}

/**
 * Admin action to fetch official preapproval state from Mercado Pago and synchronize local status.
 */
export async function syncSubscriptionWithMpAction(partnerId: string, subscriptionId: string) {
  try {
    const admin = getAdminClient()

    const { data: sub, error: subErr } = await admin
      .from("recurring_subscriptions")
      .select("id, status, mp_preapproval_id, partner_id, pending_cancellation_reason")
      .eq("id", subscriptionId)
      .eq("partner_id", partnerId)
      .single()

    if (subErr || !sub) {
      return { success: false, error: "Assinatura não encontrada." }
    }

    if (!sub.mp_preapproval_id) {
      return { success: false, error: "Assinatura não possui vínculo automático com o Mercado Pago." }
    }

    // Call Mercado Pago API
    const mpDetails = await getMpPreapprovalDetails(partnerId, sub.mp_preapproval_id)
    const mpStatus = String(mpDetails.status).toLowerCase()

    let newStatus: typeof sub.status = sub.status
    if (mpStatus === "authorized") {
      newStatus = "active"
    } else if (mpStatus === "paused") {
      newStatus = "paused"
    } else if (mpStatus === "cancelled") {
      newStatus = "cancelled"
    }

    // Guardas iguais as do webhook: cancelamento local e' definitivo; janela de
    // consentimento vencida mantem a cobranca congelada; recusa da mudanca de
    // plano so encerra a assinatura no fim do ciclo vigente.
    if (sub.status === "cancelled" && newStatus !== "cancelled") newStatus = sub.status
    if (sub.status === "awaiting_customer_decision" && newStatus !== "cancelled") newStatus = sub.status
    if (newStatus === "cancelled" && sub.pending_cancellation_reason) newStatus = sub.status

    if (newStatus !== sub.status) {
      await admin
        .from("recurring_subscriptions")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id)

      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: sub.id,
        actionType: "updated",
        changeLines: [`sincronizou estado com Mercado Pago: local mudou de "${sub.status}" para "${newStatus}" (MP: "${mpStatus}").`],
        source: "manual",
      })
    }

    return { success: true, status: newStatus, mpStatus }
  } catch (e: unknown) {
    console.error("syncSubscriptionWithMpAction error:", e)
    return { success: false, error: e instanceof Error ? e.message : "Erro ao sincronizar assinatura" }
  }
}
