import type { NotificationType } from "./types"

export interface NotificationPreference {
  id: string
  user_id: string
  type: NotificationType
  enabled: boolean
  push_enabled: boolean
  whatsapp_enabled: boolean
  created_at: string
  updated_at: string
}

export interface NotificationPreferenceInput {
  type: NotificationType
  enabled: boolean
  push_enabled: boolean
  whatsapp_enabled: boolean
}

export interface NotificationCategory {
  label: string
  description: string
  types: NotificationType[]
}

export const NOTIFICATION_CATEGORIES: Record<string, NotificationCategory> = {
    customer: {
        label: "Atualizações dos Pedidos",
        description: "Novo pedido, pagamento aprovado, pedido entregue, reembolso realizado, carrinho abandonado e lembretes de agendamento",
        types: [
            "order_created",
            "order_delivered",
            "order_paid",
            "order_refunded",
            "cart_abandoned",
            "appointment_created",
            "appointment_reminder",
            "appointment_rescheduled",
            "service_return_reminder",
        ],
    },
  seller: {
    label: "Vendedor",
    description: "Notificações sobre vendas, agendamentos, estoque baixo e sugestões de reposição",
    types: [
      "order_created",
      "order_paid",
      "order_cancelled",
      "appointment_created",
      "appointment_cancelled",
      "appointment_rescheduled",
      "low_stock",
      "replenishment_suggested",
    ],
  },
  system: {
    label: "Sistema",
    description: "Comunicados da plataforma, mensagens e outras notificações",
    types: [
      "admin_announcement",
      "message_received",
      "order_shipped",
      "appointment_confirmed",
      "subscription_created",
      "subscription_renewed",
    ],
  },
}

export type NotificationCategoryKey = keyof typeof NOTIFICATION_CATEGORIES

export const CATEGORY_LABELS: Record<NotificationCategoryKey, string> = {
  customer: "Atualizações dos Pedidos",
  seller: "Vendedor",
  system: "Sistema",
}

export const CATEGORY_DESCRIPTIONS: Record<NotificationCategoryKey, string> = {
  customer: "Novo pedido, pagamento aprovado, pedido entregue, reembolso realizado, carrinho abandonado e lembretes de agendamento",
  seller: "Notificações sobre vendas, agendamentos, estoque baixo e sugestões de reposição",
  system: "Comunicados da plataforma, mensagens e outras notificações",
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
  appointment_rescheduled: "Agendamento remarcado",
  subscription_created: "Nova assinatura",
  subscription_renewed: "Assinatura renovada",
  message_received: "Nova mensagem",
  admin_announcement: "Comunicados",
  low_stock: "Estoque baixo",
  replenishment_suggested: "Sugestões de reposição",
  service_return_reminder: "Lembrete de retorno",
  cart_abandoned: "Carrinho abandonado",
}
