/**
 * Subscription Reconciliation Service
 *
 * Periodically checks Mercado Pago for the real status of active/past_due/pending
 * subscriptions and syncs with the database. Catches webhooks that were lost or
 * processed out of order.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { syncSubscriptionToBilling } from "./sync-subscription"
import { invalidatePartnerPlanCache } from "@/lib/services/subscription.service"

const DELAY_BETWEEN_BATCHES_MS = 1000
const MP_API_TIMEOUT_MS = 10_000
const BATCH_SIZE = 10

interface ReconcileResult {
  totalProcessed: number
  updated: number
  synced: number
  errors: number
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

export async function reconcileSubscriptions(): Promise<ReconcileResult> {
  const supabase = getAdminClient()
  const result: ReconcileResult = {
    totalProcessed: 0,
    updated: 0,
    synced: 0,
    errors: 0,
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
    .select("id, partner_id, status, mercado_pago_subscription_id, current_period_end")
    .in("status", ["active", "past_due", "pending"])
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
      batch.map(async (sub: { id: string; partner_id: string; status: string; mercado_pago_subscription_id: string | null; current_period_end: string | null }) => {
        result.totalProcessed++
        const mpId = sub.mercado_pago_subscription_id

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), MP_API_TIMEOUT_MS)

          const response = await fetch(
            `https://api.mercadopago.com/preapproval/${mpId}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: controller.signal,
            },
          )
          clearTimeout(timeoutId)

          if (!response.ok) {
            console.error(`[ReconcileSubs] MP API ${response.status} for ${mpId}`)
            result.errors++
            return
          }

          const mpData = await response.json()
          const mpStatus = mpData.status as string
          const internalStatus = mapMpStatusToInternal(mpStatus)

          if (!internalStatus) {
            console.log(`[ReconcileSubs] Unhandled MP status "${mpStatus}" for ${mpId}`)
            return
          }

          if (sub.status === internalStatus) {
            return
          }

          console.log(
            `[ReconcileSubs] Status diverges for ${sub.id}: DB="${sub.status}" MP="${mpStatus}" -> syncing`,
          )

          const mpNextPayment = mpData.next_payment_date
            ? new Date(mpData.next_payment_date)
            : undefined

          await syncSubscriptionToBilling(
            sub.id,
            "reconciliation",
            internalStatus,
            undefined,
            mpNextPayment,
          ).catch((err) => {
            console.error(`[ReconcileSubs] Sync failed for ${sub.id}:`, err.message)
          })

          try {
            invalidatePartnerPlanCache(sub.partner_id)
          } catch { /* non-critical */ }

          result.updated++
          result.details.push({
            subscriptionId: sub.id,
            mpId: mpId || "",
            previousStatus: sub.status,
            newStatus: internalStatus,
            action: "synced",
          })
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
    `[ReconcileSubs] Done: ${result.totalProcessed} processed, ${result.updated} updated, ${result.errors} errors`,
  )

  return result
}
