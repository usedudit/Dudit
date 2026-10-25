/**
 * Pure helpers that decide whether a new recurring plan acquisition can be
 * completed through Dudit.
 *
 * Kept free of server-only imports so it can be unit tested and reused by
 * client-safe code. Existing subscriptions are intentionally NOT checked here:
 * they are contracts and must keep billing even when the seller disables a
 * resource.
 */

export type RecurringSaleBlockReason =
  | "recurring_disabled"
  | "products_disabled"
  | "services_disabled"
  | "appointments_disabled"
  | "deliveries_disabled"

export interface RecurringPlanItemLike {
  item_type: "product" | "service" | string
}

export interface RecurringSaleCapabilities {
  recurringEnabled: boolean
  productsEnabled: boolean
  servicesEnabled: boolean
  appointmentsViaDudit: boolean
  deliveriesEnabled: boolean
}

export function resolveRecurringPlanSaleBlock(
  capabilities: RecurringSaleCapabilities,
  items: RecurringPlanItemLike[],
  fulfillmentMode?: "delivery" | "pickup" | null,
): RecurringSaleBlockReason | null {
  if (!capabilities.recurringEnabled) return "recurring_disabled"

  const hasProduct = items.some((item) => item.item_type === "product")
  const hasService = items.some((item) => item.item_type === "service")

  if (hasProduct && !capabilities.productsEnabled) return "products_disabled"
  if (hasService && !capabilities.servicesEnabled) return "services_disabled"
  if (hasService && !capabilities.appointmentsViaDudit) return "appointments_disabled"
  if (fulfillmentMode === "delivery" && !capabilities.deliveriesEnabled) {
    return "deliveries_disabled"
  }

  return null
}
