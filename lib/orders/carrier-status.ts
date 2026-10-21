export const CARRIER_STATUS_LABELS: Record<string, string> = {
    pending: "Aguardando pagamento da etiqueta",
    released: "Aguardando postagem",
    posted: "Postado",
    in_transit: "Em trânsito",
    delivered: "Entregue",
    cancelled: "Envio cancelado",
    failed: "Falha no envio",
}

export const CARRIER_STATUS_VARIANTS: Record<string, "gray" | "orange" | "blue" | "green" | "red" | "cyan"> = {
    pending: "orange",
    released: "orange",
    posted: "blue",
    in_transit: "blue",
    delivered: "green",
    cancelled: "red",
    failed: "red",
}

export const CARRIER_STATUS_AWAITING_LABEL = "awaiting_label"

export function getCarrierStatusLabel(status?: string | null): string {
    if (!status) return "Aguardando etiqueta"
    if (status === CARRIER_STATUS_AWAITING_LABEL) return "Aguardando etiqueta"
    return CARRIER_STATUS_LABELS[status] || status
}

export function getCarrierStatusVariant(status?: string | null): "gray" | "orange" | "blue" | "green" | "red" | "cyan" {
    if (!status) return "gray"
    if (status === CARRIER_STATUS_AWAITING_LABEL) return "gray"
    return CARRIER_STATUS_VARIANTS[status] || "gray"
}

export function isCarrierClosedStatus(status?: string | null): boolean {
    return status === "cancelled" || status === "failed"
}

/**
 * Status do envio (transportadora) → status canônico de entrega do pedido.
 * Mantém o filtro por status de entrega coerente com o badge exibido.
 */
export const CARRIER_STATUS_TO_DELIVERY_STATUS: Record<string, string> = {
    awaiting_label: "not_sent",
    pending: "not_sent",
    released: "preparing",
    posted: "sent",
    in_transit: "sent",
    delivered: "delivered",
    cancelled: "cancelled",
    failed: "delivery_failed",
}

export function getDeliveryStatusForCarrier(status?: string | null): string {
    if (!status) return "not_sent"
    return CARRIER_STATUS_TO_DELIVERY_STATUS[status] || "not_sent"
}
