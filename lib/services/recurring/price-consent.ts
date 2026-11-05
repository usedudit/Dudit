import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "@/lib/services/timeline.service"

/** Prazo que o cliente tem para aceitar/recusar uma mudanca de plano. */
export const PRICE_CHANGE_WINDOW_DAYS = 7

type ConsentClient = Pick<SupabaseClient, "rpc" | "from">

/**
 * Depois que os itens/preco do plano foram atualizados, abre (ou renova) a
 * janela de consentimento de cada assinatura ativa afetada e avisa o cliente.
 * Durante a janela a cobranca continua no valor antigo.
 */
export async function detectPlanPriceChange(
  client: ConsentClient,
  opts: { planId: string },
): Promise<{ affected: number }> {
  const { data, error } = await getAdminClient().rpc("mark_recurring_plan_price_change", {
    p_plan_id: opts.planId,
    p_window_days: PRICE_CHANGE_WINDOW_DAYS,
  })
  if (error) throw new Error(error.message)

  const rows = (data || []) as Array<{
    subscription_id: string
    customer_id: string
    old_amount: number | string | null
    new_amount: number | string | null
  }>
  if (rows.length === 0) return { affected: 0 }

  const { notifySubscriptionPriceChangeToCustomer } = await import(
    "@/lib/services/notification-automation.service"
  )

  for (const row of rows) {
    const { data: sub } = await client
      .from("recurring_subscriptions")
      .select(
        `id, partner_id, store_id, customer_id, price_change_expires_at,
         customers(user_id, marketplace_user_id, name),
         recurring_plans(name),
         stores(name)`,
      )
      .eq("id", row.subscription_id)
      .maybeSingle()

    if (!sub) continue

    const expiresAt = sub.price_change_expires_at ? String(sub.price_change_expires_at) : null
    const cust = sub.customers as { user_id?: string | null; marketplace_user_id?: string | null } | null
    const customerUserId = cust?.marketplace_user_id || cust?.user_id

    if (customerUserId && expiresAt) {
      try {
        await notifySubscriptionPriceChangeToCustomer({
          subscriptionId: String(sub.id),
          partnerId: String(sub.partner_id),
          storeId: sub.store_id ? String(sub.store_id) : null,
          customerId: String(sub.customer_id),
          customerUserId,
          planName: (sub.recurring_plans as { name?: string } | null)?.name || "plano",
          storeName: (sub.stores as { name?: string } | null)?.name || null,
          oldAmount: Number(row.old_amount || 0),
          newAmount: Number(row.new_amount || 0),
          deadline: expiresAt.slice(0, 10),
          windowExpiresAt: expiresAt,
        })
      } catch (e) {
        console.error("[price-consent] Falha ao notificar cliente:", e)
      }
    }

    try {
      await logAuditEvent({
        partnerId: String(sub.partner_id),
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: String(sub.id),
        actionType: "updated",
        changeLines: [
          `abriu janela de consentimento de mudança de plano (vence em ${expiresAt ? expiresAt.slice(0, 10) : "7 dias"}).`,
        ],
        source: "system",
      })
    } catch (e) {
      console.error("[price-consent] Falha ao registrar auditoria:", e)
    }
  }

  return { affected: rows.length }
}

/**
 * Varre janelas vencidas: congela a cobrança (status
 * 'awaiting_customer_decision'), pausa o preapproval do MP quando houver e
 * avisa a loja. O cliente ainda pode responder depois do prazo.
 */
export async function expirePriceChangeWindows(
  client: ConsentClient,
  opts: { limit?: number } = {},
): Promise<{ frozen: number }> {
  const now = new Date().toISOString()
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)

  const { data: due, error } = await client
    .from("recurring_subscriptions")
    .select(
      `id, partner_id, store_id, mp_preapproval_id, price_change_expires_at,
       recurring_plans(name)`,
    )
    .eq("status", "active")
    .not("price_change_expires_at", "is", null)
    .lt("price_change_expires_at", now)
    .is("price_change_decision", null)
    .limit(limit)
  if (error) throw new Error(error.message)

  if (!due || due.length === 0) return { frozen: 0 }

  const { notifySubscriptionPriceChangeExpired } = await import(
    "@/lib/services/notification-automation.service"
  )

  let frozen = 0
  for (const sub of due as Array<Record<string, unknown>>) {
    const { data: updated } = await client
      .from("recurring_subscriptions")
      .update({ status: "awaiting_customer_decision", updated_at: new Date().toISOString() })
      .eq("id", String(sub.id))
      .eq("status", "active")
      .select("id")
      .maybeSingle()
    if (!updated) continue
    frozen++

    if (sub.mp_preapproval_id) {
      try {
        const { pauseMpPreapproval } = await import("@/lib/services/mercadopago/partner-preapproval")
        await pauseMpPreapproval(String(sub.partner_id), String(sub.mp_preapproval_id))
      } catch (e) {
        console.error("[price-consent] Falha ao pausar preapproval do MP:", e)
      }
    }

    try {
      await notifySubscriptionPriceChangeExpired({
        subscriptionId: String(sub.id),
        partnerId: String(sub.partner_id),
        storeId: sub.store_id ? String(sub.store_id) : null,
        planName: (sub.recurring_plans as { name?: string } | null)?.name || "plano",
        windowExpiresAt: String(sub.price_change_expires_at),
      })
    } catch (e) {
      console.error("[price-consent] Falha ao notificar loja:", e)
    }

    try {
      await logAuditEvent({
        partnerId: String(sub.partner_id),
        actorUserId: null,
        entityType: "recurring_subscription",
        entityId: String(sub.id),
        actionType: "updated",
        changeLines: ["prazo de resposta da mudança de plano venceu; cobrança congelada."],
        source: "system",
      })
    } catch (e) {
      console.error("[price-consent] Falha ao registrar auditoria:", e)
    }
  }

  return { frozen }
}
