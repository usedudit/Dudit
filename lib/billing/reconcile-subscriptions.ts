/**
 * Subscription Reconciliation Service
 *
 * Periodically checks Mercado Pago for the real state of active/past_due/pending
 * subscriptions and syncs the database. It looks at the preapproval AND at the
 * authorized payments (real charge attempts), because a preapproval can be
 * "authorized" while the current cycle payment is still recycling/rejected.
 *
 * Catches webhooks that were lost or processed out of order, enforces the
 * 3-day grace period (cancelling the MP preapproval on expiry) and sends the
 * day-by-day reminder while the partner is still in grace.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { syncSubscriptionToBilling } from "./sync-subscription"
import {
  chargeFromAuthorizedPayment,
  authorizedPaymentCycleDate,
  mapMpPaymentStatus,
} from "./record-charge"
import { computeSubscriptionPeriods } from "./subscription-period"
import {
  invalidatePartnerPlanCache,
  expirePastDueSubscription,
  PAST_DUE_GRACE_PERIOD_DAYS,
} from "@/lib/services/subscription.service"

const DELAY_BETWEEN_BATCHES_MS = 1000
const MP_API_TIMEOUT_MS = 10_000
const BATCH_SIZE = 10

interface ReconcileResult {
  totalProcessed: number
  updated: number
  synced: number
  errors: number
  cancelledForNonPayment: number
  details: Array<{
    subscriptionId: string
    mpId: string
    previousStatus: string
    newStatus: string
    action: string
  }>
}

function mapMpStatusToInternal(
  mpStatus: string,
): "active" | "past_due" | "paused" | "cancelled" | "pending" | null {
  switch (mpStatus) {
    case "authorized": return "active"
    case "paused": return "paused"
    case "cancelled": return "cancelled"
    case "pending": return "pending"
    case "not_authorized": return "past_due"
    case "expired": return "cancelled"
    default: return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchMpJson(url: string, accessToken: string): Promise<any | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MP_API_TIMEOUT_MS)
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function isCyclePayment(cycleStart: Date, authPay: any): boolean {
  const date = authorizedPaymentCycleDate(authPay)
  if (!date) return false
  return date.getTime() >= cycleStart.getTime()
}

export async function reconcileSubscriptions(): Promise<ReconcileResult> {
  const supabase = getAdminClient()
  const result: ReconcileResult = {
    totalProcessed: 0,
    updated: 0,
    synced: 0,
    errors: 0,
    cancelledForNonPayment: 0,
    details: [],
  }

  let accessToken: string
  try {
    accessToken = await getMpPlatformAccessToken()
  } catch (err: any) {
    console.error("[ReconcileSubs] Failed to get MP access token:", err.message)
    return result
  }

  const { data: subscriptions, error: fetchError } = await supabase
    .from("subscriptions")
    .select("id, partner_id, status, mercado_pago_subscription_id, current_period_start, current_period_end, created_at, past_due_at, billing_anchor_day")
    .in("status", ["active", "past_due", "pending", "paused"])
    .not("mercado_pago_subscription_id", "is", null)
    .order("created_at", { ascending: true })

  if (fetchError || !subscriptions || subscriptions.length === 0) {
    console.log("[ReconcileSubs] No subscriptions to reconcile:", fetchError?.message || "none found")
    return result
  }

  console.log(`[ReconcileSubs] Reconciling ${subscriptions.length} subscriptions`)

  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (sub: any) => {
        result.totalProcessed++
        const mpId = sub.mercado_pago_subscription_id

        try {
          const mpData = await fetchMpJson(`https://api.mercadopago.com/preapproval/${mpId}`, accessToken)
          if (!mpData) {
            console.error(`[ReconcileSubs] MP preapproval unavailable for ${mpId}`)
            result.errors++
            return
          }

          const mpStatus = mpData.status as string
          let internalStatus = mapMpStatusToInternal(mpStatus)
          if (!internalStatus) {
            console.log(`[ReconcileSubs] Unhandled MP status "${mpStatus}" for ${mpId}`)
            return
          }

          // ── Real charge attempts of this preapproval ──
          const authPaymentsData = await fetchMpJson(
            `https://api.mercadopago.com/authorized_payments/search?preapproval_id=${mpId}&limit=12`,
            accessToken,
          )
          const authPayments: any[] = (authPaymentsData?.results || []).slice().sort((a: any, b: any) => {
            const da = new Date(a.debit_date || a.date_created || 0).getTime()
            const db = new Date(b.debit_date || b.date_created || 0).getTime()
            return db - da
          })

          const periods = computeSubscriptionPeriods(sub)
          const currentCycleStart = periods.periodStart

          const currentCyclePayment = authPayments.find((p) => isCyclePayment(currentCycleStart, p)) || null
          const latestPayment = authPayments[0] || null
          const effectivePayment = currentCyclePayment || latestPayment

          // A payment attempt in the current cycle that did not settle means
          // the subscription is past due even if the preapproval is authorized.
          // Refund/chargeback of the current cycle also revokes access.
          if (internalStatus === "active" && currentCyclePayment) {
            const localPaymentStatus = mapMpPaymentStatus(currentCyclePayment.status)
            if (
              !["approved", "refunded", "cancelled"].includes(localPaymentStatus) ||
              ["refunded", "chargeback"].includes(localPaymentStatus)
            ) {
              internalStatus = "past_due"
            }
          }

          // An "authorized" preapproval with no charge attempt for a cycle that
          // started more than a day ago is not a paid cycle: never keep free
          // access based on the preapproval status alone.
          if (internalStatus === "active" && !currentCyclePayment) {
            const msIntoCycle = Date.now() - currentCycleStart.getTime()
            if (msIntoCycle > 24 * 60 * 60 * 1000) {
              internalStatus = "past_due"
            }
          }

          // ── Record the cycle charge (purchase/payment/invoice) ──
          let recorded = false
          if (effectivePayment) {
            const charge = chargeFromAuthorizedPayment(effectivePayment)
            const cycleDate = authorizedPaymentCycleDate(effectivePayment) || currentCycleStart

            // Enrich the method from the real payment when MP settled it.
            if (charge.status === "approved" && charge.gatewayPaymentId && /^\d+$/.test(charge.gatewayPaymentId)) {
              const paymentData = await fetchMpJson(
                `https://api.mercadopago.com/v1/payments/${charge.gatewayPaymentId}`,
                accessToken,
              )
              if (paymentData) {
                const enriched = chargeFromAuthorizedPayment({ ...effectivePayment, payment: paymentData })
                Object.assign(charge, enriched, { gatewayPaymentId: charge.gatewayPaymentId })
              }
            }

            await syncSubscriptionToBilling(sub.id, "reconciliation", {
              status: internalStatus,
              cycleStart: internalStatus === "active" || internalStatus === "past_due" ? cycleDate : undefined,
              cycleEnd: undefined,
              charge,
              chargeCycleStart: cycleDate,
              cancellationReason: internalStatus === "cancelled" ? "expired" : undefined,
            })
            recorded = true
            result.synced++
          } else {
            await syncSubscriptionToBilling(sub.id, "reconciliation", {
              status: internalStatus,
              cancellationReason: internalStatus === "cancelled" ? "expired" : undefined,
            })
          }

          // ── Grace period enforcement ──
          if (internalStatus === "past_due") {
            const { data: fresh } = await supabase
              .from("subscriptions")
              .select("id, partner_id, status, past_due_at, created_at, mercado_pago_subscription_id, plan:plan_id(name, price)")
              .eq("id", sub.id)
              .maybeSingle()

            if (fresh) {
              const anchor = fresh.past_due_at ? new Date(fresh.past_due_at) : new Date(fresh.created_at)
              const graceDeadline = new Date(
                anchor.getTime() + PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
              )

              if (Date.now() >= graceDeadline.getTime()) {
                await expirePastDueSubscription(fresh)
                result.cancelledForNonPayment++
                result.updated++
                result.details.push({
                  subscriptionId: sub.id,
                  mpId: mpId || "",
                  previousStatus: sub.status,
                  newStatus: "cancelled",
                  action: "grace_expired",
                })
                invalidatePartnerPlanCache(sub.partner_id)
                return
              }

              // Reminder once per day, only after the first 24h of grace.
              const elapsedMs = Date.now() - anchor.getTime()
              if (elapsedMs >= 24 * 60 * 60 * 1000) {
                const daysLeft = Math.max(
                  1,
                  Math.ceil((graceDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
                )
                try {
                  const { sendBillingNotification } = await import("@/lib/billing/notifications")
                  const { data: partner } = await supabase
                    .from("partners")
                    .select("user_id")
                    .eq("id", sub.partner_id)
                    .single()

                  if (partner?.user_id) {
                    await sendBillingNotification("billing.payment_reminder", partner.user_id, sub.partner_id, {
                      message: `O pagamento da assinatura do plano ${(fresh as any).plan?.name || "contratado"} continua pendente. Restam ${daysLeft} dia(s) antes da suspensão dos recursos.`,
                      subscription_id: sub.id,
                      mp_subscription_id: mpId,
                      plan_name: (fresh as any).plan?.name || null,
                      plan_price: Number((fresh as any).plan?.price || 0),
                      is_paid: Number((fresh as any).plan?.price || 0) > 0,
                      idempotency_bucket: new Date().toISOString().slice(0, 10),
                    })
                  }
                } catch (notifyErr: any) {
                  console.error("[ReconcileSubs] Grace reminder failed:", notifyErr?.message)
                }
              }
            }
          }

          if (sub.status !== internalStatus || recorded) {
            result.updated++
            result.details.push({
              subscriptionId: sub.id,
              mpId: mpId || "",
              previousStatus: sub.status,
              newStatus: internalStatus,
              action: recorded ? "charge_recorded" : "status_synced",
            })
          }

          invalidatePartnerPlanCache(sub.partner_id)
        } catch (err: any) {
          console.error(`[ReconcileSubs] Error processing ${sub.id}:`, err.message)
          result.errors++
        }
      }),
    )

    if (i + BATCH_SIZE < subscriptions.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS)
    }
  }

  console.log(
    `[ReconcileSubs] Done: ${result.totalProcessed} processed, ${result.updated} updated, ${result.errors} errors, ${result.cancelledForNonPayment} cancelled for non-payment`,
  )

  return result
}
