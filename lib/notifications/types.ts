export const NOTIFICATION_TYPES = [
  "order_created",
  "order_paid",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
  "appointment_created",
  "appointment_confirmed",
  "appointment_reminder",
  "appointment_cancelled",
  "appointment_rescheduled",
  "subscription_created",
  "subscription_renewed",
  "message_received",
  "admin_announcement",
  "low_stock",
  "replenishment_suggested",
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationEntityType =
  | "order"
  | "appointment"
  | "subscription"
  | "message"
  | "announcement"
  | "product"
  | "quote"
  | null

export interface NotificationRecord {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  data: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  entityType?: NotificationEntityType
  entityId?: string | null
  data?: Record<string, unknown>
  idempotencyKey: string
  origin?: "manual" | "automation" | "system"
}

export interface NotificationPageCursor {
  createdAt: string
  id: string
}

export interface NotificationsPageResult {
  items: NotificationRecord[]
  nextCursor: NotificationPageCursor | null
  hasMore: boolean
}

export type NotificationAudience = "customer" | "seller" | "admin"
