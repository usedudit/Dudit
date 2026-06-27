/**
 * Backfill marketplace metrics from historical orders, appointments, and subscriptions.
 *
 * Usage: npx tsx scripts/backfill-marketplace-metrics.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  console.log("[backfill] Starting marketplace metrics backfill...")

  // 1. Clear idempotency ledger for full replay
  const { error: clearError } = await supabase
    .from("marketplace_metrics_events")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")

  if (clearError) {
    console.warn("[backfill] Could not clear events (table may not exist yet):", clearError.message)
  }

  // 2. Reset counters
  const { error: resetError } = await supabase.rpc("backfill_reset_marketplace_counters")
  if (resetError) {
    console.log("[backfill] Run migration 20260608 first -", resetError.message)
  }

  // 3. Replay paid marketplace orders (buyer_id = vitrine orders)
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .in("situation", ["paid", "approved"])
    .not("buyer_id", "is", null)
    .order("created_at", { ascending: true })

  let orderCount = 0
  for (const order of orders || []) {
    const { data } = await supabase.rpc("record_marketplace_order_metrics", {
      p_order_id: order.id,
    })
    if (data) orderCount++
  }
  console.log(`[backfill] Processed ${orderCount} paid marketplace orders`)

  // 4. Replay completed appointments not linked to counted orders
  const { data: appointments } = await supabase
    .from("appointments")
    .select("id")
    .in("status", ["Concluído", "Pago", "Pago Parcialmente", "Confirmado"])
    .order("created_at", { ascending: true })

  let apptCount = 0
  for (const appt of appointments || []) {
    const { data } = await supabase.rpc("record_appointment_booking_metrics", {
      p_appointment_id: appt.id,
    })
    if (data) apptCount++
  }
  console.log(`[backfill] Processed ${apptCount} completed appointments`)

  // 5. Replay active subscriptions (ERP-created, not via order)
  const { data: subs } = await supabase
    .from("recurring_subscriptions")
    .select("id")
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: true })

  let subCount = 0
  for (const sub of subs || []) {
    const { data } = await supabase.rpc("record_subscription_signup_metrics", {
      p_subscription_id: sub.id,
    })
    if (data) subCount++
  }
  console.log(`[backfill] Processed ${subCount} active subscriptions`)

  // 6. Recalculate rolling windows from source
  const { error: rollingError } = await supabase.rpc("recalculate_marketplace_rolling_windows")
  if (rollingError) {
    console.warn("[backfill] Rolling window recalc:", rollingError.message)
  }

  console.log("[backfill] Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
