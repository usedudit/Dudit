import type { DerivedLineFlags, FulfillmentMode } from "@/lib/commerce/capabilities"
import { deriveLineFlags, type CatalogCapabilities } from "@/lib/commerce/capabilities"

export type CheckoutLineKind = "product" | "service_booking" | "subscription"

export type CheckoutLineContext = {
  lineId: string
  lineKind: CheckoutLineKind
  catalog: CatalogCapabilities
  fulfillmentMode: FulfillmentMode | null
  schedulingMetadataComplete?: boolean
}

export type CheckoutRequirements = {
  showDeliverySection: boolean
  showPickupOption: boolean
  showCustomerAddressSection: boolean
  showSchedulingSummary: boolean
  showRecurringDisclosure: boolean
  hasProductLines: boolean
  hasServiceLines: boolean
  hasSubscriptionLines: boolean
  lineFlags: Record<string, DerivedLineFlags>
}

export function aggregateCheckoutRequirements(
  lines: CheckoutLineContext[],
): CheckoutRequirements {
  const lineFlags: Record<string, DerivedLineFlags> = {}
  let showDeliverySection = false
  let showPickupOption = false
  let showCustomerAddressSection = false
  let showSchedulingSummary = false
  let hasProductLines = false
  let hasServiceLines = false
  let hasSubscriptionLines = false

  for (const line of lines) {
    const flags = deriveLineFlags(line.catalog, line.fulfillmentMode, {
      schedulingMetadataComplete: line.schedulingMetadataComplete,
    })
    lineFlags[line.lineId] = flags

    if (line.lineKind === "product") hasProductLines = true
    else if (line.lineKind === "service_booking") hasServiceLines = true
    else hasSubscriptionLines = true

    if (flags.requiresDelivery) showDeliverySection = true
    if (line.fulfillmentMode === "pickup" || line.catalog.fulfillmentModes.includes("pickup")) {
      showPickupOption = true
    }
    if (flags.requiresCustomerAddress) showCustomerAddressSection = true
    if (line.catalog.schedulingEnabled && line.schedulingMetadataComplete) {
      showSchedulingSummary = true
    }
  }

  const showRecurringDisclosure = lines.some((l) => l.lineKind === "subscription")

  return {
    showDeliverySection,
    showPickupOption,
    showCustomerAddressSection,
    showSchedulingSummary,
    showRecurringDisclosure,
    hasProductLines,
    hasServiceLines,
    hasSubscriptionLines,
    lineFlags,
  }
}
