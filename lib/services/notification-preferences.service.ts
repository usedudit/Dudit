import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import type { NotificationType } from "@/lib/notifications/types"
import type { NotificationPreference, NotificationPreferenceInput } from "@/lib/notifications/preferences-types"
import type { WhatsappAutomationTrigger } from "@/lib/whatsapp/types"

export async function getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)

  if (error) {
    console.error("[notifications] get preferences error", error.message)
    return []
  }

  return (data || []) as NotificationPreference[]
}

export async function upsertNotificationPreference(
  userId: string,
  input: NotificationPreferenceInput,
): Promise<{ success: boolean; error?: string }> {
  const admin = getAdminClient()
  const { error } = await admin.from("notification_preferences").upsert(
    {
      user_id: userId,
      type: input.type,
      enabled: input.enabled,
      push_enabled: input.push_enabled,
      whatsapp_enabled: input.whatsapp_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,type" },
  )

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function upsertNotificationPreferences(
  userId: string,
  inputs: NotificationPreferenceInput[],
): Promise<{ success: boolean; error?: string }> {
  const admin = getAdminClient()

  const rows = inputs.map((input) => ({
    user_id: userId,
    type: input.type,
    enabled: input.enabled,
    push_enabled: input.push_enabled,
    whatsapp_enabled: input.whatsapp_enabled,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await admin.from("notification_preferences").upsert(rows, {
    onConflict: "user_id,type",
    ignoreDuplicates: false,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function seedDefaultPreferences(userId: string): Promise<void> {
  const admin = getAdminClient()
  const { data: existing } = await admin
    .from("notification_preferences")
    .select("id")
    .eq("user_id", userId)
    .limit(1)

  if (existing && existing.length > 0) return

  const { NOTIFICATION_TYPES } = await import("@/lib/notifications/types")
  const rows = NOTIFICATION_TYPES.map((type) => ({
    user_id: userId,
    type,
    enabled: true,
    push_enabled: true,
    whatsapp_enabled: true,
    updated_at: new Date().toISOString(),
  }))

  await admin.from("notification_preferences").upsert(rows, {
    onConflict: "user_id,type",
    ignoreDuplicates: true,
  })
}

export async function shouldDeliverPush(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notification_preferences")
    .select("enabled, push_enabled")
    .eq("user_id", userId)
    .eq("type", type)
    .maybeSingle()

  if (error || !data) return true
  return data.enabled && data.push_enabled
}

export async function shouldDeliverWhatsapp(
  userId: string,
  trigger: WhatsappAutomationTrigger,
): Promise<boolean> {
  const typeMap: Record<WhatsappAutomationTrigger, NotificationType | null> = {
    appointment_created: "appointment_created",
    appointment_confirmed: "appointment_confirmed",
    appointment_cancelled: "appointment_cancelled",
    appointment_rescheduled: "appointment_rescheduled",
    appointment_reminder_24h: "appointment_reminder",
    appointment_reminder_2h: "appointment_reminder",
    order_created: "order_created",
    order_payment_approved: "order_paid",
    order_preparing: "order_created",
    order_ready_pickup: "order_shipped",
    order_shipped: "order_shipped",
    order_out_for_delivery: "order_shipped",
    order_delivered: "order_delivered",
    order_cancelled: "order_cancelled",
    order_refunded: "order_refunded",
    delivery_route_started: "order_shipped",
    delivery_in_progress: "order_shipped",
    delivery_delivered: "order_delivered",
    delivery_failed: "order_shipped",
    quote_shared: "order_created",
    quote_reminder: "order_created",
    payment_reminder: "order_paid",
    service_return_reminder: "service_return_reminder",
    cart_abandoned: "cart_abandoned",
    test_message: null,
    manual_resend: null,
  }

  const type = typeMap[trigger]
  if (!type) return true

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notification_preferences")
    .select("enabled, whatsapp_enabled")
    .eq("user_id", userId)
    .eq("type", type)
    .maybeSingle()

  if (error || !data) return true
  return data.enabled && (data.whatsapp_enabled !== false)
}
