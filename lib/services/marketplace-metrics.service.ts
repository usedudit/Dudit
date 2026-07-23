import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidateTag } from "next/cache"

const PARTNER_STATS_TAG = "partner-stats"
const STORE_STATS_TAG = "store-stats"

/**
 * Central entry point when a marketplace order becomes paid.
 * Idempotent via DB ledger (marketplace_metrics_events).
 */
export async function recordMarketplaceOrderMetrics(
  supabase: SupabaseClient,
  orderId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("record_marketplace_order_metrics", {
      p_order_id: orderId,
    })
    if (error) {
      console.error("[marketplace-metrics] recordMarketplaceOrderMetrics:", error.message)
      return false
    }
    if (data === true) {
      await invalidatePartnerStatsForOrder(supabase, orderId)
    }
    return data === true
  } catch (e) {
    console.error("[marketplace-metrics] recordMarketplaceOrderMetrics unexpected:", e)
    return false
  }
}

/** Record service booking when appointment reaches a successful status. */
export async function recordAppointmentBookingMetrics(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("record_appointment_booking_metrics", {
      p_appointment_id: appointmentId,
    })
    if (error) {
      console.error("[marketplace-metrics] recordAppointmentBookingMetrics:", error.message)
      return false
    }
    if (data === true) {
      // Revalidation handled by caller (server action)
    }
    return data === true
  } catch (e) {
    console.error("[marketplace-metrics] recordAppointmentBookingMetrics unexpected:", e)
    return false
  }
}

/** Record plan signup when a recurring subscription is created. */
export async function recordSubscriptionSignupMetrics(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("record_subscription_signup_metrics", {
      p_subscription_id: subscriptionId,
    })
    if (error) {
      console.error("[marketplace-metrics] recordSubscriptionSignupMetrics:", error.message)
      return false
    }
    if (data === true) {
      // Revalidation handled by caller (server action)
    }
    return data === true
  } catch (e) {
    console.error("[marketplace-metrics] recordSubscriptionSignupMetrics unexpected:", e)
    return false
  }
}

/** Fire-and-forget view tracking for PDP pages. */
export async function incrementMarketplaceView(
  supabase: SupabaseClient,
  entityType: "produto" | "servico" | "plano",
  entityId: string,
): Promise<void> {
  try {
    await supabase.rpc("increment_marketplace_view", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    })
  } catch {
    // Non-critical
  }
}

/**
 * Called after order is paid and fulfillment completes (or in parallel).
 * Safe to call from webhook, sync, ERP - DB ensures idempotency.
 */
export async function onMarketplaceOrderPaid(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  await recordMarketplaceOrderMetrics(supabase, orderId)
}

async function invalidatePartnerStatsForOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("partner_id, store_id")
    .eq("id", orderId)
    .maybeSingle()
  if (order?.partner_id) {
    revalidateTag(`${PARTNER_STATS_TAG}-${order.partner_id}`, "max")
  }
  if (order?.store_id) {
    revalidateTag(`${STORE_STATS_TAG}-${order.store_id}`, "max")
  }
}

/** Successful appointment statuses that count toward popularity. */
export function isSuccessfulAppointmentStatus(status: string | null | undefined): boolean {
  return ["Concluído", "Pago", "Pago Parcialmente", "Confirmado"].includes(status || "")
}
