import type { NotificationType } from "./types"

export type NotificationChannel = "whatsapp" | "push" | "in_app"
export type NotificationUrgency = "high" | "medium" | "low"

/**
 * Clean, configurable channel priority lists by urgency level.
 * Rule:
 * - High: WhatsApp > Push > Dudit (In-App)
 * - Medium: Push > WhatsApp > Dudit (In-App)
 * - Low / Informational: Dudit (In-App) > Push
 */
export const URGENCY_CHANNEL_PRIORITIES: Record<NotificationUrgency, NotificationChannel[]> = {
  high: ["whatsapp", "push", "in_app"],
  medium: ["push", "whatsapp", "in_app"],
  low: ["in_app", "push"],
}

/**
 * Mapping of NotificationType to default urgency level.
 * Easily modifiable in one central place.
 */
export const NOTIFICATION_TYPE_URGENCY_MAP: Record<NotificationType, NotificationUrgency> = {
  // High Urgency
  appointment_reminder: "high",
  appointment_cancelled: "high",
  order_cancelled: "high",
  order_refunded: "high",

  // Medium Urgency
  order_created: "medium",
  order_paid: "medium",
  order_shipped: "medium",
  order_delivered: "medium",
  appointment_created: "medium",
  appointment_confirmed: "medium",
  appointment_rescheduled: "medium",

  // Low / Informational Urgency
  subscription_created: "low",
  subscription_renewed: "low",
  message_received: "low",
  admin_announcement: "low",
  low_stock: "low",
  replenishment_suggested: "low",
}

export function getNotificationUrgency(type: NotificationType): NotificationUrgency {
  return NOTIFICATION_TYPE_URGENCY_MAP[type] || "medium"
}

export function getChannelPriorityForType(type: NotificationType): NotificationChannel[] {
  const urgency = getNotificationUrgency(type)
  return URGENCY_CHANNEL_PRIORITIES[urgency] || URGENCY_CHANNEL_PRIORITIES.medium
}
