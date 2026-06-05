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
  /** Product lines: show delivery vs pickup selector */
  showProductFulfillmentOptions: boolean
  showDeliverySection: boolean
  showPickupOption: boolean
  showCustomerAddressSection: boolean
  showPartnerLocation: boolean
  showSchedulingSummary: boolean
  showRecurringDisclosure: boolean
  hasProductLines: boolean
  hasServiceLines: boolean
  hasSubscriptionLines: boolean
  /** Cash / pay on delivery — products only, no services/subscriptions in cart */
  allowPayOnDelivery: boolean
  hasPayOnService: boolean
  showDepositOption: boolean
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
  let showPartnerLocation = false
  let hasProductLines = false
  let hasServiceLines = false
  let hasSubscriptionLines = false
  let hasPayOnService = false
  let showDepositOption = false

  for (const line of lines) {
    const flags = deriveLineFlags(line.catalog, line.fulfillmentMode, {
      schedulingMetadataComplete: line.schedulingMetadataComplete,
    })
    lineFlags[line.lineId] = flags

    if (line.lineKind === "product") {
      hasProductLines = true
      if (line.catalog.fulfillmentModes.includes("delivery")) showDeliverySection = true
      if (line.catalog.fulfillmentModes.includes("pickup")) showPickupOption = true
      if (line.fulfillmentMode === "delivery" || flags.requiresDelivery) {
        showCustomerAddressSection = true
      }
    } else if (line.lineKind === "service_booking") {
      hasServiceLines = true
      if (line.catalog.paymentRequirement === "pay_on_service") hasPayOnService = true
      if (line.catalog.paymentRequirement === "deposit_only") showDepositOption = true
      if (flags.requiresCustomerAddress) showCustomerAddressSection = true
      const mode = line.fulfillmentMode ?? "on_site"
      if (mode === "on_site" || line.catalog.fulfillmentModes.includes("on_site")) {
        showPartnerLocation = true
      }
      if (line.catalog.schedulingEnabled && line.schedulingMetadataComplete) {
        showSchedulingSummary = true
      }
    } else {
      hasSubscriptionLines = true
      if (line.fulfillmentMode === "delivery" || flags.requiresCustomerAddress) {
        showCustomerAddressSection = true
      }
      if (line.fulfillmentMode === "delivery") showDeliverySection = true
      if (line.catalog.fulfillmentModes.includes("pickup")) showPickupOption = true
    }
  }

  const showProductFulfillmentOptions =
    hasProductLines && (showDeliverySection || showPickupOption)
  const showRecurringDisclosure = lines.some((l) => l.lineKind === "subscription")
  const allowPayOnDelivery =
    hasProductLines && !hasServiceLines && !hasSubscriptionLines && showDeliverySection

  return {
    showProductFulfillmentOptions,
    showDeliverySection: showProductFulfillmentOptions && showDeliverySection,
    showPickupOption: showProductFulfillmentOptions && showPickupOption,
    showCustomerAddressSection,
    showPartnerLocation: hasServiceLines && showPartnerLocation,
    showSchedulingSummary,
    showRecurringDisclosure,
    hasProductLines,
    hasServiceLines,
    hasSubscriptionLines,
    allowPayOnDelivery,
    hasPayOnService,
    showDepositOption,
    lineFlags,
  }
}
