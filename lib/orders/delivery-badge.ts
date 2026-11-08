import { getDeliveryStatusLabelForType, getDeliveryStatusMeta } from "./status"
import { getCarrierStatusLabel, getCarrierStatusVariant } from "./carrier-status"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"

export type DeliveryBadgeVariant = "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"

export interface OrderDeliveryBadgeMeta {
    /** Whether the delivery badge should be rendered at all. */
    show: boolean
    /** Text shown inside the badge. */
    label: string
    /** Badge color, matching the ERP orders page. */
    variant: DeliveryBadgeVariant
    /** Carrier brand image (Superfrete/Correios/Jadlog/...) when the order ships via a carrier. */
    carrierBrandIcon: string | null
    /** True when the fulfillment mode is store pickup (uses StoreIcon instead of TruckIcon). */
    isPickup: boolean
    isCarrierDelivery: boolean
    carrierStatus: string | null
    hasOnlyServices: boolean
}

/**
 * Resolves the delivery badge shown on the orders list.
 *
 * Mirrors exactly the logic used by the ERP orders page (OrdersPage > filteredOrders),
 * so the admin panel renders the same label, color and carrier icon.
 */
export function getOrderDeliveryBadgeMeta(order: any): OrderDeliveryBadgeMeta {
    const orderItems = Array.isArray(order?.order_items) ? order.order_items : []

    const hasOnlyServices =
        order?.order_source === "admin_service_order" ||
        order?.order_source === "Ordem de Serviço" ||
        (orderItems.length > 0 &&
            orderItems.every((item: any) => item?.service_id || item?.line_type === "service_booking"))

    const deliveryType = order?.delivery_type || "delivery"

    const shipments = Array.isArray(order?.order_shipments)
        ? order.order_shipments.filter((s: any) => s?.kind !== "return")
        : []
    shipments.sort(
        (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    )

    const carrierBreakdown = order?.delivery_breakdown?.source === "superfrete" ? order.delivery_breakdown : null
    const isCarrierDelivery = Boolean(carrierBreakdown) || shipments.length > 0
    const latestShipment = shipments[0] || null
    const carrierStatus = isCarrierDelivery ? latestShipment?.status || "awaiting_label" : null

    const deliveryInfo = getDeliveryStatusMeta(order?.delivery_status)

    return {
        show: !hasOnlyServices && order?.situation !== "cancelled",
        label: carrierStatus
            ? getCarrierStatusLabel(carrierStatus)
            : getDeliveryStatusLabelForType(order?.delivery_status, deliveryType),
        variant: carrierStatus ? getCarrierStatusVariant(carrierStatus) : deliveryInfo.variant,
        carrierBrandIcon: isCarrierDelivery
            ? getCarrierBrandIcon(
                carrierBreakdown?.companyName,
                carrierBreakdown?.serviceName,
                shipments[0]?.carrier,
                carrierBreakdown?.carrier,
            )
            : null,
        isPickup: deliveryType === "pickup",
        isCarrierDelivery,
        carrierStatus,
        hasOnlyServices,
    }
}
