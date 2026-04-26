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
  if (normalized === "vendedor") {
    return { planSlug: normalized, deliveryEnabled: true, advancedEnabled: false }
  }
  return { planSlug: normalized, deliveryEnabled: true, advancedEnabled: true }
}
