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
      .select("id, user_id, store_name, mp_access_token_encrypted")
      .eq("id", input.partnerId)
      .single()

    if (partnerErr || !partner) {
      return { success: false, error: "Parceiro não encontrado ou sem credenciais Mercado Pago." }
    }

    if (!partner.mp_access_token_encrypted) {
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
      .select("id, name, status, price, frequency_type, frequency_interval, billing_mode")
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (!plan?.id || plan.status !== "active") {
      return { success: false, error: "Plano indisponível para assinatura." }
    }

    const billingMode = plan.billing_mode || "manual"
    if (billingMode !== "auto_mercado_pago") {
      return { success: false, error: "Este plano não suporta pagamento automático via Mercado Pago." }
    }

    const nextExecutionAt = new Date().toISOString()

    // 3. Insert local subscription record as 'pending' (Awaiting approval from webhook/server)
    const { data: sub, error: subErr } = await admin
      .from("recurring_subscriptions")
      .insert({
        partner_id: input.partnerId,
        customer_id: customerId,
        recurring_plan_id: input.planId,
        status: "pending",
        billing_mode: "auto_mercado_pago",
        next_execution_at: nextExecutionAt,
        delivery_type: input.deliveryType || "pickup",
        delivery_address: input.deliveryAddress || null,
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
    // Convert frequency_type: 'month'/'week'/'day' to days/months for MP
    const frequencyType: "days" | "months" =
      plan.frequency_type === "month" ? "months" : "days"
    const frequency =
      plan.frequency_type === "week"
        ? plan.frequency_interval * 7
        : plan.frequency_interval

    const mpPreapproval = await createMpPreapproval({
      partnerId: input.partnerId,
      payerEmail: user.email || "cliente@dudit.com.br",
      planName: plan.name,
      amount: plan.price,
      frequency,
      frequencyType,
      externalReference: sub.id,
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
      .select("id, status, mp_preapproval_id, partner_id")
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
