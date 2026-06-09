import type { NotificationAudience, NotificationType } from "./types"

export function getNotificationHref(params: {
  type: NotificationType
  entityType: string | null
  entityId: string | null
  data?: Record<string, unknown>
  audience?: NotificationAudience
}): string {
  const { type, entityType, entityId, data, audience } = params

  if (type === "admin_announcement") {
    const url = data?.url
    return typeof url === "string" && url.startsWith("/") ? url : "/"
  }

  if (entityType === "order" && entityId) {
    if (audience === "seller" || audience === "admin") {
      return `/erp/orders?view=${encodeURIComponent(entityId)}`
    }
    const orderNumber = data?.order_number
    if (typeof orderNumber === "string" && orderNumber.length > 0) {
      return `/pedidos?tab=details&order_number=${encodeURIComponent(orderNumber)}`
    }
    return `/pedidos?tab=details&order_number=${encodeURIComponent(entityId)}`
  }

  if (entityType === "appointment" && entityId) {
    if (audience === "seller" || audience === "admin") {
      return `/erp/agendamentos?appointment=${entityId}`
    }
    return "/pedidos"
  }

  if (entityType === "subscription" && entityId) {
    if (audience === "seller" || audience === "admin") {
      return `/erp/recurring/subscriptions`
    }
    return "/assinaturas"
  }

  if (entityType === "message" && entityId) {
    return `/erp/integrations/whatsapp`
  }

  return "/"
}
