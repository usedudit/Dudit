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
  not_sent: { label: "Não enviado", variant: "gray" },
  preparing: { label: "Preparando", variant: "orange" },
  sent: { label: "Enviado", variant: "blue" },
  delivered: { label: "Entregue", variant: "green" },
  pickup_available: { label: "Pronto retirada", variant: "cyan" },
  delivery_failed: { label: "Falha na entrega", variant: "red" },
  cancelled: { label: "Cancelado", variant: "red" },
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
