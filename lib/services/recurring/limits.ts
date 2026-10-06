import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { checkLimit, getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { logAuditEvent } from "@/lib/services/timeline.service"

/** Status que representam uma assinatura "viva" (conta no limite ativo). */
const NON_TERMINAL_STATUSES = ["active", "pending", "paused", "awaiting_restock", "awaiting_customer_decision", "past_due", "payment_failed"]

/**
 * Status que serao pausados quando o parceiro cai abaixo do Escalar.
 * `pending` fica de fora: e' um checkout em andamento (aguardando webhook).
 */
const DOWNGRADE_PAUSABLE_STATUSES = ["active", "awaiting_customer_decision", "past_due", "payment_failed", "awaiting_restock"]

export async function countActiveRecurringPlans(partnerId: string): Promise<number> {
  const admin = getAdminClient()
  const { count, error } = await admin
    .from("recurring_plans")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .eq("status", "active")
  if (error) {
    console.error("[RECURRING_LIMITS] Falha ao contar planos recorrentes:", error.message)
    return 0
  }
  return count || 0
}

export async function countActiveRecurringSubscriptions(partnerId: string): Promise<number> {
  const admin = getAdminClient()
  const { count, error } = await admin
    .from("recurring_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .in("status", NON_TERMINAL_STATUSES)
  if (error) {
    console.error("[RECURRING_LIMITS] Falha ao contar assinaturas:", error.message)
    return 0
  }
  return count || 0
}

/** Limite de planos recorrentes ativos (valor proposto = atual + 1). */
export async function checkRecurringPlanCreateLimit(partnerId: string) {
  const current = await countActiveRecurringPlans(partnerId)
  return checkLimit(partnerId, "recurring_plans", current + 1)
}

/** Limite de assinaturas nao terminais (valor proposto = atual + 1). */
export async function checkActiveSubscriptionCreateLimit(partnerId: string) {
  const current = await countActiveRecurringSubscriptions(partnerId)
  return checkLimit(partnerId, "active_subscriptions", current + 1)
}

/**
 * Check de tier do modulo sem throw (para acoes de marketplace, que retornam
 * { error } com mensagem amigavel ao comprador).
 */
export async function getRecurringModuleAccess(
  partnerId: string,
): Promise<{ allowed: boolean; planSlug: string }> {
  const plan = await getPartnerPlan(partnerId)
  return { allowed: hasMinimumPlan(plan.slug, "escalar"), planSlug: plan.slug }
}

/**
 * Pausa uma assinatura (e o preapproval do MP, quando houver) por downgrade
 * de plano. Pausa e' reversivel: se o parceiro voltar ao Escalar, basta
 * reativar. Nunca cancela - cliente final nao pode perder o vinculo de
 * cobranca por problema do lojista.
 */
export async function pauseSubscriptionForPlanDowngrade(
  partnerId: string,
  sub: { id: string; mp_preapproval_id?: string | null },
): Promise<boolean> {
  const admin = getAdminClient()

  if (sub.mp_preapproval_id) {
    try {
      const { pauseMpPreapproval } = await import("@/lib/services/mercadopago/partner-preapproval")
      await pauseMpPreapproval(partnerId, String(sub.mp_preapproval_id))
    } catch (e) {
      console.error("[RECURRING_LIMITS] Falha ao pausar preapproval do MP:", e)
    }
  }

  const { data: updated, error } = await admin
    .from("recurring_subscriptions")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .in("status", DOWNGRADE_PAUSABLE_STATUSES)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[RECURRING_LIMITS] Falha ao pausar assinatura:", error.message)
    return false
  }
  if (!updated) return false

  try {
    await logAuditEvent({
      partnerId,
      actorUserId: null,
      entityType: "recurring_subscription",
      entityId: sub.id,
      actionType: "paused",
      changeLines: ["assinatura pausada automaticamente: parceiro está abaixo do plano Escalar."],
      source: "system",
    })
  } catch (e) {
    console.error("[RECURRING_LIMITS] Falha ao registrar auditoria:", e)
  }

  return true
}

/**
 * Pausa todas as assinaturas vivas de um parceiro que caiu abaixo do Escalar.
 * Chamado pelo hook de downgrade do archiver (e como backstop no claim).
 */
export async function pauseRecurringForPlanDowngrade(partnerId: string): Promise<{ paused: number }> {
  const admin = getAdminClient()

  const { data: subs, error } = await admin
    .from("recurring_subscriptions")
    .select("id, mp_preapproval_id")
    .eq("partner_id", partnerId)
    .in("status", DOWNGRADE_PAUSABLE_STATUSES)

  if (error) {
    console.error("[RECURRING_LIMITS] Falha ao buscar assinaturas para pausar:", error.message)
    return { paused: 0 }
  }
  if (!subs || subs.length === 0) return { paused: 0 }

  let paused = 0
  for (const sub of subs) {
    const ok = await pauseSubscriptionForPlanDowngrade(partnerId, sub as { id: string; mp_preapproval_id?: string | null })
    if (ok) paused++
  }
  return { paused }
}
