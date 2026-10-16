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
  /** "Entrega" tab exists (local delivery or national shipping). */
  showDeliverySection: boolean
  /** Local delivery (raio próprio) available for ALL product/subscription lines. */
  showLocalDeliveryOption: boolean
  /** National shipping via carrier available for ALL product/subscription lines. */
  showShippingOption: boolean
  showPickupOption: boolean
  showCustomerAddressSection: boolean
  showPartnerLocation: boolean
  showSchedulingSummary: boolean
  showRecurringDisclosure: boolean
  hasProductLines: boolean
  hasServiceLines: boolean
  hasSubscriptionLines: boolean
  /** Intersection of delivery/pickup/shipping across product and subscription lines. */
  commonProductFulfillmentModes: FulfillmentMode[]
  /** All product/subscription lines carry product fulfillment but have no mode in common. */
  hasIncompatibleFulfillmentMix: boolean
  /** Cash / pay on delivery - products only, no services/subscriptions in cart */
  allowPayOnDelivery: boolean
  hasPayOnService: boolean
  showDepositOption: boolean
  hasIncompatiblePaymentRestrictions: boolean
  lineFlags: Record<string, DerivedLineFlags>
}

export function aggregateCheckoutRequirements(
  lines: CheckoutLineContext[],
): CheckoutRequirements {
  const lineFlags: Record<string, DerivedLineFlags> = {}
  const productModeLists: FulfillmentMode[][] = []
  let showCustomerAddressSection = false
  let showSchedulingSummary = false
  let showPartnerLocation = false
  let hasProductLines = false
  let hasServiceLines = false
  let hasSubscriptionLines = false
  let hasPayOnService = false
  let showDepositOption = false

  const PRODUCT_FLOW_MODES: FulfillmentMode[] = ["delivery", "pickup", "shipping"]

  for (const line of lines) {
    const flags = deriveLineFlags(line.catalog, line.fulfillmentMode, {
      schedulingMetadataComplete: line.schedulingMetadataComplete,
    })
    lineFlags[line.lineId] = flags

    if (line.lineKind === "product") {
      hasProductLines = true
      productModeLists.push(
        line.catalog.fulfillmentModes.filter((m) => PRODUCT_FLOW_MODES.includes(m)),
      )
      if (flags.requiresCustomerAddress) showCustomerAddressSection = true
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
      productModeLists.push(
        line.catalog.fulfillmentModes.filter((m) => PRODUCT_FLOW_MODES.includes(m)),
      )
      if (flags.requiresCustomerAddress) showCustomerAddressSection = true
    }
  }

  const hasProductOrSubscriptionLines = hasProductLines || hasSubscriptionLines

  // Interseção de modos entre todas as linhas de produto/assinatura.
  const commonProductFulfillmentModes =
    productModeLists.length > 0
      ? productModeLists.reduce<FulfillmentMode[]>(
          (acc, list) => acc.filter((m) => list.includes(m)),
          [...PRODUCT_FLOW_MODES],
        )
      : []

  const showLocalDeliveryOption = commonProductFulfillmentModes.includes("delivery")
  const showShippingOption = commonProductFulfillmentModes.includes("shipping")
  const rawPickupOption = commonProductFulfillmentModes.includes("pickup")

  const showProductFulfillmentOptions =
    hasProductOrSubscriptionLines && commonProductFulfillmentModes.length > 0
  const hasIncompatibleFulfillmentMix =
    hasProductOrSubscriptionLines && commonProductFulfillmentModes.length === 0

  const showRecurringDisclosure = lines.some((l) => l.lineKind === "subscription")
  const allowPayOnDelivery =
    hasProductLines && !hasServiceLines && !hasSubscriptionLines && showLocalDeliveryOption
  const hasIncompatiblePaymentRestrictions = false

  return {
    showProductFulfillmentOptions,
    showDeliverySection:
      showProductFulfillmentOptions && (showLocalDeliveryOption || showShippingOption),
    showLocalDeliveryOption: showProductFulfillmentOptions && showLocalDeliveryOption,
    showShippingOption: showProductFulfillmentOptions && showShippingOption,
    showPickupOption: showProductFulfillmentOptions && rawPickupOption,
    showCustomerAddressSection,
    showPartnerLocation: hasServiceLines && showPartnerLocation,
    showSchedulingSummary,
    showRecurringDisclosure,
    hasProductLines,
    hasServiceLines,
    hasSubscriptionLines,
    commonProductFulfillmentModes,
    hasIncompatibleFulfillmentMix,
    allowPayOnDelivery,
    hasPayOnService,
    showDepositOption,
    hasIncompatiblePaymentRestrictions,
    lineFlags,
  }
}
