/**
 * Canonical status normalization and aggregation for ERP own deliveries.
 *
 * Rules:
 * - Own deliveries never display carrier-only aliases like "in_transit" or "out_for_delivery";
 *   those normalize to "sent" ("Enviado").
 * - Single-order delivery: mirrors the linked order's real delivery status.
 * - Multi-order delivery:
 *   - All orders with the same status -> that status.
 *   - All orders finished (delivered / delivery_failed / cancelled) -> "delivered" if any delivered, else "delivery_failed" / "cancelled".
 *   - Mixed in-flight with at least one delivered -> "partially_delivered".
 *   - Mixed in-flight with at least one sent -> "sent".
 *   - Mixed pre-dispatch with at least one preparing -> "preparing".
 *   - Otherwise -> "not_sent".
 */

export function normalizeOwnDeliveryStatus(status?: string | null): string {
  const raw = String(status || "").trim().toLowerCase()
  if (!raw || raw === "pending" || raw === "not_sent" || raw === "nao_enviado") {
    return "not_sent"
  }
  if (raw === "preparing" || raw === "em_preparacao" || raw === "em preparação" || raw === "available" || raw === "requested" || raw === "assigned") {
    return "preparing"
  }
  if (
    raw === "sent" ||
    raw === "in_transit" ||
    raw === "out_for_delivery" ||
    raw === "picked_up" ||
    raw === "accepted" ||
    raw === "saiu para entrega"
  ) {
    return "sent"
  }
  if (raw === "delivered" || raw === "entregue" || raw === "concluída" || raw === "concluida") {
    return "delivered"
  }
  if (raw === "delivery_failed" || raw === "failed") {
    return "delivery_failed"
  }
  if (raw === "cancelled" || raw === "cancelada" || raw === "cancelado") {
    return "cancelled"
  }
  if (raw === "pickup_available") {
    return "pickup_available"
  }
  if (raw === "partially_delivered") {
    return "partially_delivered"
  }
  return raw
}

export function resolveLinkDeliveryStatus(
  link: { status?: string | null; orders?: { delivery_status?: string | null; situation?: string | null } | null } | null | undefined,
  fallbackDeliveryStatus?: string | null,
): string {
  if (!link) return normalizeOwnDeliveryStatus(fallbackDeliveryStatus)

  const orderStatusRaw = link.orders?.delivery_status
  const linkStatusRaw = link.status

  const normOrder = orderStatusRaw ? normalizeOwnDeliveryStatus(orderStatusRaw) : null
  const normLink = linkStatusRaw ? normalizeOwnDeliveryStatus(linkStatusRaw) : null

  // If the order itself is already in a terminal delivery state, trust it over a stale link status.
  if (normOrder && ["delivered", "delivery_failed", "cancelled"].includes(normOrder)) {
    return normOrder
  }

  // Legacy links saved "pending" even when the order/delivery was "preparing" or "sent".
  if ((!normLink || normLink === "not_sent") && normOrder && normOrder !== "not_sent") {
    return normOrder
  }

  // If link status is explicit and non-default, prefer it; otherwise fall back to order or delivery status.
  if (normLink && normLink !== "not_sent") {
    return normLink
  }
  if (normOrder) {
    return normOrder
  }
  return normalizeOwnDeliveryStatus(fallbackDeliveryStatus)
}

export function resolveEffectiveDeliveryStatus(
  deliveryStatus: string | null | undefined,
  links: Array<{ status?: string | null; orders?: { delivery_status?: string | null; situation?: string | null } | null }> | null | undefined,
): string {
  const normalizedDelivery = normalizeOwnDeliveryStatus(deliveryStatus)
  if (normalizedDelivery === "cancelled") {
    return "cancelled"
  }

  const allLinks = Array.isArray(links) ? links : []
  const activeLinks = allLinks.filter((l) => l?.orders?.situation !== "cancelled")
  const relevantLinks = activeLinks.length > 0 ? activeLinks : allLinks

  if (relevantLinks.length === 0) {
    return normalizedDelivery
  }

  const statuses = relevantLinks.map((link) => resolveLinkDeliveryStatus(link, normalizedDelivery))

  if (statuses.length === 1) {
    return statuses[0]
  }

  const unique = new Set(statuses)
  if (unique.size === 1) {
    return statuses[0]
  }

  const terminalSet = new Set(["delivered", "delivery_failed", "cancelled"])
  const allFinished = statuses.every((s) => terminalSet.has(s))
  if (allFinished) {
    if (statuses.includes("delivered")) return "delivered"
    if (statuses.includes("delivery_failed")) return "delivery_failed"
    return "cancelled"
  }

  if (statuses.includes("delivered")) {
    return "partially_delivered"
  }

  if (statuses.includes("sent") || statuses.includes("pickup_available")) {
    return "sent"
  }

  if (statuses.includes("preparing")) {
    return "preparing"
  }

  return "not_sent"
}
