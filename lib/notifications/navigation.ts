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
      return `/erp/pedidos?view=${encodeURIComponent(entityId)}`
    }
    const orderNumber = data?.orderNumber as string | undefined ?? data?.order_number as string | undefined
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
      return `/erp/recorrentes/assinaturas`
    }
    return "/assinaturas"
  }

  if (entityType === "message" && entityId) {
    return `/erp/integracoes/whatsapp`
  }

  if (entityType === "product") {
    if (entityId) return `/erp/produtos?product=${encodeURIComponent(entityId)}`
    return "/erp/produtos"
  }

  if (entityType === "quote") {
    if (audience === "seller" || audience === "admin") {
      return entityId ? `/erp/orcamentos?quote=${encodeURIComponent(entityId)}` : `/erp/orcamentos`
    }
    const token = (data?.public_token as string) || (data?.token as string)
    if (token) {
      return `/quote/${encodeURIComponent(token)}`
    }
    return "/"
  }

  return "/"
}
