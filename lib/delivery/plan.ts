export type DeliveryPlanCapability = {
  planSlug: string
  deliveryEnabled: boolean
  advancedEnabled: boolean
}

export function resolveDeliveryPlanCapability(planSlug: string): DeliveryPlanCapability {
  const normalized = String(planSlug || "free").toLowerCase()
  if (normalized === "free") {
    return { planSlug: normalized, deliveryEnabled: false, advancedEnabled: false }
  }
  if (normalized === "crescer") {
    return { planSlug: normalized, deliveryEnabled: true, advancedEnabled: false }
  }
  if (normalized === "escalar") {
    return { planSlug: normalized, deliveryEnabled: true, advancedEnabled: true }
  }
  // Default to free if unknown
  return { planSlug: "free", deliveryEnabled: false, advancedEnabled: false }
}
