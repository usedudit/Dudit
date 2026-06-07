export type PaymentStatusValue =
  | "paid"
  | "partially_paid"
  | "pending"
  | "unpaid"
  | "cancelled"
  | "in_process"
  | "shipped"
  | "delivered"

export type DeliveryStatusValue =
  | "pending"
  | "not_sent"
  | "preparing"
  | "sent"
  | "delivered"
  | "pickup_available"
  | "delivery_failed"
  | "cancelled"

type BadgeVariant = "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"

const PAYMENT_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: "Pago", variant: "green" },
  partially_paid: { label: "Parcialmente Pago", variant: "orange" },
  pending: { label: "Pendente", variant: "gray" },
  unpaid: { label: "Não pago", variant: "gray" },
  cancelled: { label: "Cancelado", variant: "red" },
  in_process: { label: "Em análise", variant: "orange" },
  shipped: { label: "Enviado", variant: "blue" },
  delivered: { label: "Entregue", variant: "green" },
}

const DELIVERY_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  // Basic delivery (new canonical set)
  pending: { label: "Pendente", variant: "gray" },
  preparing: { label: "Em preparação", variant: "orange" },
  sent: { label: "Saiu para entrega", variant: "blue" },
  delivered: { label: "Concluída", variant: "green" },
  cancelled: { label: "Cancelada", variant: "red" },

  // Backward compatibility (older status values still exist in DB/UI)
  not_sent: { label: "Pendente", variant: "gray" },
  pickup_available: { label: "Pronto retirada", variant: "cyan" },
  delivery_failed: { label: "Falha na entrega", variant: "red" },
}

export function getPaymentStatusMeta(status?: string | null) {
  if (!status) return { label: "Não informado", variant: "gray" as const }
  return PAYMENT_STATUS_META[status] || { label: status, variant: "gray" as const }
}

export function getDeliveryStatusMeta(status?: string | null) {
  if (!status) return { label: "Não informado", variant: "gray" as const }
  return DELIVERY_STATUS_META[status] || { label: status, variant: "gray" as const }
}

export function getPaymentStatusLabel(status?: string | null) {
  return getPaymentStatusMeta(status).label
}

export function getDeliveryStatusLabel(status?: string | null) {
  return getDeliveryStatusMeta(status).label
}

const SALES_CHANNEL_LABELS: Record<string, string> = {
  booking: "Agendamento online",
  agendamento: "Agendamento",
  manual: "Manual",
  online_storefront: "Loja online",
  "loja online": "Loja online",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  presencial: "Presencial",
}

export function getSalesChannelLabel(channel?: string | null) {
  if (!channel) return "Não informado"
  const key = channel.trim().toLowerCase()
  return SALES_CHANNEL_LABELS[key] || channel
}

export function getFulfillmentModeLabel(mode?: string | null) {
  switch (mode) {
    case "delivery":
      return "Entrega"
    case "pickup":
      return "Retirada"
    case "on_site":
      return "Na loja"
    case "customer_location":
      return "No endereço do cliente"
    default:
      return mode ? mode.replace(/_/g, " ") : "Não informado"
  }
}
