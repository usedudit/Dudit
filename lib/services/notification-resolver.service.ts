import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import type { NotificationType } from "@/lib/notifications/types"
import { getChannelPriorityForType, getNotificationUrgency, type NotificationChannel } from "@/lib/notifications/config"
import { sendPushToUser } from "./fcm.service"
import { getActiveWhatsappConnection } from "./whatsapp-connection.service"
import { normalizePhoneToE164 } from "@/lib/whatsapp/phone"
import { dispatchWhatsappAutomation } from "./whatsapp-automation.service"
import type { WhatsappAutomationTrigger } from "@/lib/whatsapp/types"

export interface DeliveryResolverInput {
  userId: string
  notificationId: string
  type: NotificationType
  title: string
  body: string
  href: string
  entityType: string | null
  entityId: string | null
  partnerId?: string | null
  storeId?: string | null
  customerId?: string | null
  phone?: string | null
  data?: Record<string, unknown>
}

export interface DeliveryResolverResult {
  deliveredChannel: NotificationChannel | null
  skippedChannels: { channel: NotificationChannel; reason: string }[]
  errors: { channel: NotificationChannel; error: string }[]
}

const NOTIFICATION_TYPE_TO_WHATSAPP_TRIGGER: Partial<Record<NotificationType, WhatsappAutomationTrigger>> = {
  appointment_created: "appointment_created",
  appointment_confirmed: "appointment_confirmed",
  appointment_cancelled: "appointment_cancelled",
  appointment_rescheduled: "appointment_rescheduled",
  appointment_reminder: "appointment_reminder_24h",
  order_created: "order_created",
  order_paid: "order_payment_approved",
  order_shipped: "order_shipped",
  order_delivered: "order_delivered",
  order_cancelled: "order_cancelled",
}

async function resolvePhone(partnerId?: string | null, customerId?: string | null, fallbackPhone?: string | null): Promise<string | null> {
  if (fallbackPhone) {
    const n = normalizePhoneToE164(fallbackPhone)
    if (n) return n
  }
  if (!partnerId || !customerId) return null
  const admin = getAdminClient()
  const { data } = await admin
    .from("customers")
    .select("phone")
    .eq("id", customerId)
    .eq("partner_id", partnerId)
    .maybeSingle()

  return normalizePhoneToE164(data?.phone || null)
}

export async function resolveAndDeliverNotification(input: DeliveryResolverInput): Promise<DeliveryResolverResult> {
  const adminDb = getAdminClient()
  const result: DeliveryResolverResult = {
    deliveredChannel: null,
    skippedChannels: [],
    errors: [],
  }

  const urgency = getNotificationUrgency(input.type)
  const audience = (input.data?.audience as string | undefined) || "customer"

  // 1. Check user global & channel preferences
  const { data: pref } = await adminDb
    .from("notification_preferences")
    .select("enabled, push_enabled, whatsapp_enabled")
    .eq("user_id", input.userId)
    .eq("type", input.type)
    .maybeSingle()

  if (pref && pref.enabled === false) {
    await adminDb.from("notification_delivery_log").insert({
      notification_id: input.notificationId,
      channel: "push",
      status: "skipped",
      error_message: null,
      metadata: {
        channel_selected: "none",
        reason: "disabled_by_user",
        user_preferences_checked: true,
        urgency,
        audience,
        user_id: input.userId,
        type: input.type,
      },
    })
    result.skippedChannels.push({ channel: "push", reason: "disabled_by_user" })
    result.skippedChannels.push({ channel: "whatsapp", reason: "disabled_by_user" })
    return result
  }

  const pushEnabled = pref ? pref.push_enabled !== false : true
  const whatsappEnabled = pref ? pref.whatsapp_enabled !== false : true

  // 2. Get priority channels list based on urgency
  const priorities = getChannelPriorityForType(input.type)

  // Filter external channels in priority order (only whatsapp & push)
  const externalChannels = priorities.filter((c): c is "whatsapp" | "push" => c === "whatsapp" || c === "push")
  const checkedAlternatives: string[] = []

  for (const channel of externalChannels) {
    checkedAlternatives.push(channel)

    if (channel === "whatsapp") {
      // WhatsApp is for customer communications, not internal seller/admin alerts
      if (audience === "seller" || audience === "admin") {
        result.skippedChannels.push({ channel: "whatsapp", reason: "whatsapp_reserved_for_customers" })
        continue
      }

      if (!whatsappEnabled) {
        result.skippedChannels.push({ channel: "whatsapp", reason: "disabled_by_user_preference" })
        continue
      }

      const trigger = NOTIFICATION_TYPE_TO_WHATSAPP_TRIGGER[input.type]
      if (!trigger) {
        result.skippedChannels.push({ channel: "whatsapp", reason: "no_whatsapp_trigger_mapping" })
        continue
      }

      const partnerId = input.partnerId || (input.data?.partner_id as string | undefined)
      if (!partnerId) {
        result.skippedChannels.push({ channel: "whatsapp", reason: "no_partner_id_context" })
        continue
      }

      // Check active WhatsApp connection for partner/store
      const connection = await getActiveWhatsappConnection(partnerId, input.storeId)
      if (!connection) {
        await adminDb.from("notification_delivery_log").insert({
          notification_id: input.notificationId,
          channel: "whatsapp",
          status: "skipped",
          metadata: {
            reason: "no_active_whatsapp_connection",
            partnerId,
            user_preferences_checked: true,
            urgency,
            audience,
          },
        })
        result.skippedChannels.push({ channel: "whatsapp", reason: "no_active_whatsapp_connection" })
        continue
      }

      // Check resolved phone number
      const phone = await resolvePhone(partnerId, input.customerId || (input.data?.customerId as string | undefined), input.phone)
      if (!phone) {
        await adminDb.from("notification_delivery_log").insert({
          notification_id: input.notificationId,
          channel: "whatsapp",
          status: "skipped",
          metadata: {
            reason: "customer_phone_not_found",
            partnerId,
            user_preferences_checked: true,
            urgency,
            audience,
          },
        })
        result.skippedChannels.push({ channel: "whatsapp", reason: "customer_phone_not_found" })
        continue
      }

      try {
        const waRes = await dispatchWhatsappAutomation({
          partnerId,
          storeId: input.storeId,
          trigger,
          entityType: input.entityType || "notification",
          entityId: input.entityId || input.notificationId,
          customerId: input.customerId,
          phone,
          orderId: input.entityType === "order" ? input.entityId : null,
          appointmentId: input.entityType === "appointment" ? input.entityId : null,
          templateVariables: {
            customer_name: (input.data?.customerName as string) || "Cliente",
            service_name: (input.data?.serviceName as string) || "",
            order_number: (input.data?.orderNumber as string) || "",
            store_name: (input.data?.storeName as string) || "",
            date: (input.data?.date as string) || "",
            time: (input.data?.time as string) || "",
            amount: (input.data?.amount as string) || "",
          },
        })

        if (waRes.success) {
          await adminDb.from("notification_delivery_log").insert({
            notification_id: input.notificationId,
            channel: "whatsapp",
            status: "sent",
            metadata: {
              channel_selected: "whatsapp",
              alternatives_checked: checkedAlternatives,
              reason: "whatsapp_sent_as_primary_channel",
              user_preferences_checked: true,
              urgency,
              audience,
              trigger,
              resultStatus: waRes.resultStatus,
              messageId: waRes.messageId,
            },
          })
          result.deliveredChannel = "whatsapp"
          return result // ONE external channel sent -> Stop!
        } else {
          await adminDb.from("notification_delivery_log").insert({
            notification_id: input.notificationId,
            channel: "whatsapp",
            status: waRes.resultStatus.startsWith("skipped") ? "skipped" : "failed",
            error_message: waRes.reason || "WhatsApp send failed",
            metadata: {
              trigger,
              resultStatus: waRes.resultStatus,
              user_preferences_checked: true,
              urgency,
              audience,
            },
          })
          result.errors.push({ channel: "whatsapp", error: waRes.reason || "WhatsApp failed" })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "WhatsApp dispatch error"
        await adminDb.from("notification_delivery_log").insert({
          notification_id: input.notificationId,
          channel: "whatsapp",
          status: "failed",
          error_message: errorMsg,
          metadata: { trigger, urgency, audience },
        })
        result.errors.push({ channel: "whatsapp", error: errorMsg })
      }
    } else if (channel === "push") {
      if (!pushEnabled) {
        result.skippedChannels.push({ channel: "push", reason: "disabled_by_user_preference" })
        continue
      }

      const pushRes = await sendPushToUser({
        userId: input.userId,
        notificationId: input.notificationId,
        title: input.title,
        body: input.body,
        href: input.href,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
      })

      if (pushRes.sent > 0) {
        await adminDb.from("notification_delivery_log").insert({
          notification_id: input.notificationId,
          channel: "push",
          status: "sent",
          metadata: {
            channel_selected: "push",
            alternatives_checked: checkedAlternatives,
            reason: "push_sent_as_primary_channel",
            user_preferences_checked: true,
            urgency,
            audience,
          },
        })
        result.deliveredChannel = "push"
        return result // ONE external channel sent -> Stop!
      } else if (pushRes.skipped) {
        result.skippedChannels.push({ channel: "push", reason: pushRes.reason || "push_skipped" })
      } else {
        result.errors.push({ channel: "push", error: "Push FCM delivery failed" })
      }
    }
  }

  // If no external channel delivered
  await adminDb.from("notification_delivery_log").insert({
    notification_id: input.notificationId,
    channel: "push",
    status: "skipped",
    metadata: {
      channel_selected: "none",
      alternatives_checked: checkedAlternatives,
      reason: "no_external_channel_delivered",
      user_preferences_checked: true,
      urgency,
      audience,
    },
  })

  return result
}
