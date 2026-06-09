import type { NotificationType } from "./types"

export interface NotificationPreference {
  id: string
  user_id: string
  type: NotificationType
  enabled: boolean
  push_enabled: boolean
  created_at: string
  updated_at: string
}

export interface NotificationPreferenceInput {
  type: NotificationType
  enabled: boolean
  push_enabled: boolean
}

export const NOTIFICATION_CATEGORIES = {
  customer: {
    label: "Cliente",
    types: [
      "order_created",
      "order_delivered",
      "order_paid",
      "order_refunded",
      "appointment_created",
      "appointment_reminder",
      "subscription_created",
    ] as NotificationType[],
  },
  seller: {
    label: "Vendedor",
    types: [
      "order_created",
      "order_paid",
      "order_cancelled",
      "appointment_created",
      "appointment_cancelled",
      "subscription_created",
      "subscription_renewed",
    ] as NotificationType[],
  },
  system: {
    label: "Sistema",
    types: [
      "admin_announcement",
      "message_received",
      "order_shipped",
      "appointment_confirmed",
      "appointment_reminder",
    ] as NotificationType[],
  },
} as const

export type NotificationCategoryKey = keyof typeof NOTIFICATION_CATEGORIES

export const CATEGORY_LABELS: Record<NotificationCategoryKey, string> = {
  customer: "Cliente",
  seller: "Vendedor",
  system: "Sistema",
}

export const CATEGORY_DESCRIPTIONS: Record<NotificationCategoryKey, string> = {
  customer: "Notificações que você recebe como comprador",
  seller: "Notificações que você recebe como vendedor",
  system: "Avisos importantes da plataforma",
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  order_created: "Novo pedido",
  order_paid: "Pagamento aprovado",
  order_shipped: "Pedido enviado",
  order_delivered: "Pedido entregue",
  order_cancelled: "Pedido cancelado",
  order_refunded: "Reembolso realizado",
  appointment_created: "Novo agendamento",
  appointment_confirmed: "Agendamento confirmado",
  appointment_reminder: "Lembrete de agendamento",
  appointment_cancelled: "Agendamento cancelado",
  subscription_created: "Nova assinatura",
  subscription_renewed: "Assinatura renovada",
  message_received: "Nova mensagem",
  admin_announcement: "Comunicados",
}
