import React from "react"
import {
  BlockedIcon,
  ClockIcon,
  DeliverySentIcon,
  CheckCircleIcon,
  DeliveryPickupIcon,
  DeliveryFailedIcon,
  TruckIcon,
} from "@/lib/icons"

export type PaymentStatusValue =
  | "paid"
  | "partially_paid"
  | "pending"
  | "unpaid"
  | "cancelled"
  | "in_process"
  | "shipped"
  | "delivered"
  | "awaiting_pickup_payment"

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

const DELIVERY_STATUS_ICONS: Record<string, React.ElementType> = {
  pending: BlockedIcon,
  not_sent: BlockedIcon,
  nao_enviado: BlockedIcon,
  preparing: ClockIcon,
  em_preparacao: ClockIcon,
  available: ClockIcon,
  requested: ClockIcon,
  assigned: ClockIcon,
  accepted: DeliveryPickupIcon,
  picked_up: DeliveryPickupIcon,
  sent: DeliverySentIcon,
  partially_delivered: DeliverySentIcon,
  in_transit: DeliverySentIcon,
  out_for_delivery: DeliverySentIcon,
  delivered: CheckCircleIcon,
  entregue: CheckCircleIcon,
  pickup_available: DeliveryPickupIcon,
  delivery_failed: DeliveryFailedIcon,
  cancelled: BlockedIcon,
  cancelada: BlockedIcon,
  cancelado: BlockedIcon,
}

export function getDeliveryStatusIcon(status?: string | null): React.ReactElement<{ className?: string }> {
  const key = status ? String(status).toLowerCase().trim() : ""
  const IconComp = (key && DELIVERY_STATUS_ICONS[key]) || TruckIcon
  return React.createElement(IconComp, { size: 12 })
}

const PAYMENT_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: "Pago", variant: "green" },
  pago: { label: "Pago", variant: "green" },
  approved: { label: "Aprovado", variant: "green" },
  aprovado: { label: "Aprovado", variant: "green" },
  concluido: { label: "Pago", variant: "green" },
  concluído: { label: "Pago", variant: "green" },
  partially_paid: { label: "Parcialmente Pago", variant: "orange" },
  parcialmente_pago: { label: "Parcialmente Pago", variant: "orange" },
  pending: { label: "Pendente", variant: "gray" },
  pendente: { label: "Pendente", variant: "gray" },
  unpaid: { label: "Pendente", variant: "gray" },
  cancelled: { label: "Cancelado", variant: "red" },
  cancelado: { label: "Cancelado", variant: "red" },
  in_process: { label: "Em análise", variant: "orange" },
  em_analise: { label: "Em análise", variant: "orange" },
  authorized: { label: "Autorizado", variant: "blue" },
  refunded: { label: "Reembolsado", variant: "red" },
  reembolsado: { label: "Reembolsado", variant: "red" },
  rejected: { label: "Recusado", variant: "red" },
  chargeback: { label: "Estornado", variant: "red" },
  shipped: { label: "Enviado", variant: "blue" },
  delivered: { label: "Entregue", variant: "green" },
  awaiting_pickup_payment: { label: "Aguardando pagamento na retirada", variant: "orange" },
}

const DELIVERY_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  // Basic delivery (canonical set)
  pending: { label: "Não enviado", variant: "gray" },
  preparing: { label: "Em preparação", variant: "orange" },
  sent: { label: "Enviado", variant: "blue" },
  partially_delivered: { label: "Parcialmente entregue", variant: "cyan" },
  delivered: { label: "Entregue", variant: "green" },
  cancelled: { label: "Cancelada", variant: "red" },

  // Backward compatibility / synonyms
  not_sent: { label: "Não enviado", variant: "gray" },
  nao_enviado: { label: "Não enviado", variant: "gray" },
  pickup_available: { label: "Pronto para retirada", variant: "cyan" },
  delivery_failed: { label: "Falha na entrega", variant: "red" },
  em_preparacao: { label: "Em preparação", variant: "orange" },
  entregue: { label: "Entregue", variant: "green" },
  cancelada: { label: "Cancelada", variant: "red" },
  cancelado: { label: "Cancelada", variant: "red" },

  // Dudit Delivery Driver / Logistics aliases (so they NEVER show raw English strings)
  available: { label: "Em preparação", variant: "orange" },
  requested: { label: "Em preparação", variant: "orange" },
  assigned: { label: "Em preparação", variant: "orange" },
  accepted: { label: "A caminho da retirada", variant: "blue" },
  picked_up: { label: "Retirado na loja", variant: "blue" },
  in_transit: { label: "Em trânsito", variant: "blue" },
  out_for_delivery: { label: "Em rota de entrega", variant: "blue" },
}

export function getPaymentStatusMeta(status?: string | null) {
  if (!status) return { label: "Não informado", variant: "gray" as const }
  const key = String(status).toLowerCase().trim()
  return PAYMENT_STATUS_META[key] || { label: status, variant: "gray" as const }
}

export function getDeliveryStatusMeta(status?: string | null) {
  if (!status) return { label: "Não informado", variant: "gray" as const }
  const key = String(status).toLowerCase().trim()
  return DELIVERY_STATUS_META[key] || { label: status, variant: "gray" as const }
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
  manual: "Agendamento manual",
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
      return "No estabelecimento"
    case "customer_location":
      return "No endereço do cliente"
    default:
      return mode ? mode.replace(/_/g, " ") : "Não informado"
  }
}

const DELIVERY_LABELS: Record<string, string> = {
  not_sent: "Não enviado",
  pending: "Não enviado",
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
  { value: "cancelled", label: "Cancelada" },
]

export const PICKUP_STATUS_OPTIONS = [
  { value: "not_sent", label: "Não preparado" },
  { value: "preparing", label: "Em preparação" },
  { value: "pickup_available", label: "Pronto para retirada" },
  { value: "delivered", label: "Retirado" },
  { value: "delivery_failed", label: "Não retirado" },
  { value: "cancelled", label: "Cancelada" },
]

export const MIXED_STATUS_OPTIONS = [
  { value: "not_sent", label: "Não enviado/Não preparado" },
  { value: "preparing", label: "Em preparação" },
  { value: "sent", label: "Enviado/Pronto para retirada" },
  { value: "delivered", label: "Entregue/Retirado" },
  { value: "delivery_failed", label: "Falha na entrega/Não retirado" },
  { value: "cancelled", label: "Cancelada" },
]

/**
 * Canonical delivery status used for filtering/grouping.
 * Maps legacy "pending" and empty values to "not_sent".
 */
export function canonicalDeliveryStatus(status?: string | null): string {
  const value = String(status || "").trim() || "not_sent"
  return value === "pending" ? "not_sent" : value
}

/** Delivery status options offered by the orders filter. */
export const DELIVERY_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "not_sent", label: "Não enviado" },
  { value: "preparing", label: "Em preparação" },
  { value: "sent", label: "Enviado" },
  { value: "pickup_available", label: "Pronto para retirada" },
  { value: "delivered", label: "Entregue" },
  { value: "delivery_failed", label: "Falha na entrega" },
  { value: "cancelled", label: "Cancelada" },
]
