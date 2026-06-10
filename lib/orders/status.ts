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

const DELIVERY_LABELS: Record<string, string> = {
  not_sent: "Não enviado",
  pending: "Pendente",
  preparing: "Em preparação",
  sent: "Enviado",
  delivered: "Entregue",
  pickup_available: "Pronto para retirada",
  delivery_failed: "Falha na entrega",
  cancelled: "Cancelada",
}

const PICKUP_LABELS: Record<string, string> = {
  not_sent: "Não preparado",
  pending: "Pendente",
  preparing: "Em preparação",
  sent: "Pronto para retirada",
  delivered: "Retirado",
  pickup_available: "Pronto para retirada",
  delivery_failed: "Não retirado",
  cancelled: "Cancelada",
}

export function getDeliveryStatusLabelForType(status?: string | null, deliveryType?: string | null) {
  if (!status) return "Não informado"
  const map = deliveryType === "pickup" ? PICKUP_LABELS : DELIVERY_LABELS
  return map[status] || status
}

export const DELIVERY_STATUS_OPTIONS = [
  { value: "not_sent", label: "Não enviado" },
  { value: "preparing", label: "Em preparação" },
  { value: "sent", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "delivery_failed", label: "Falha na entrega" },
]

export const PICKUP_STATUS_OPTIONS = [
  { value: "not_sent", label: "Não preparado" },
  { value: "preparing", label: "Em preparação" },
  { value: "pickup_available", label: "Pronto para retirada" },
  { value: "delivered", label: "Retirado" },
  { value: "delivery_failed", label: "Não retirado" },
]

export const MIXED_STATUS_OPTIONS = [
  { value: "not_sent", label: "Não enviado/Não preparado" },
  { value: "preparing", label: "Em preparação" },
  { value: "sent", label: "Enviado/Pronto para retirada" },
  { value: "delivered", label: "Entregue/Retirado" },
  { value: "delivery_failed", label: "Falha na entrega/Não retirado" },
]
