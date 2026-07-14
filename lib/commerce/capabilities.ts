/**
 * Minimal commerce capability model.
 * Catalog fields: fulfillment_modes, payment_requirement (services).
 * Checkout behavior is derived - avoid item_type branching outside resolution.
 */

export const FULFILLMENT_MODES = [
  "delivery",
  "pickup",
  "on_site",
  "customer_location",
] as const

export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number]

export const PAYMENT_REQUIREMENTS = [
  "full_payment",
  "deposit_only",
  "pay_on_service",
] as const

export type PaymentRequirement = (typeof PAYMENT_REQUIREMENTS)[number]

export type CatalogCapabilities = {
  fulfillmentModes: FulfillmentMode[]
  paymentRequirement: PaymentRequirement
  schedulingEnabled: boolean
}

const MODE_SET = new Set<string>(FULFILLMENT_MODES)

export function normalizeFulfillmentModes(
  modes: string[] | null | undefined,
  fallback: FulfillmentMode[] = ["pickup"],
): FulfillmentMode[] {
  if (!modes?.length) return [...fallback]
  const normalized = modes.filter((m): m is FulfillmentMode => MODE_SET.has(m))
  return normalized.length ? normalized : [...fallback]
}

export function defaultProductFulfillmentModes(productType?: string | null): FulfillmentMode[] {
  if (productType === "Digital") return ["pickup"]
  return ["delivery", "pickup"]
}

export function defaultServiceFulfillmentModes(): FulfillmentMode[] {
  return ["on_site"]
}

export function serviceCatalogCapabilities(row: {
  fulfillment_modes?: string[] | null
  payment_requirement?: string | null
}): CatalogCapabilities {
  return {
    fulfillmentModes: normalizeFulfillmentModes(
      row.fulfillment_modes,
      defaultServiceFulfillmentModes(),
    ),
    paymentRequirement: PAYMENT_REQUIREMENTS.includes(
      row.payment_requirement as PaymentRequirement,
    )
      ? (row.payment_requirement as PaymentRequirement)
      : "full_payment",
    schedulingEnabled: true,
  }
}

export function productCatalogCapabilities(row: {
  fulfillment_modes?: string[] | null
  product_type?: string | null
}): CatalogCapabilities {
  return {
    fulfillmentModes: normalizeFulfillmentModes(
      row.fulfillment_modes,
      defaultProductFulfillmentModes(row.product_type),
    ),
    paymentRequirement: "full_payment",
    schedulingEnabled: false,
  }
}

/** Union fulfillment modes from recurring plan catalog items (products + services). */
export function mergePlanItemFulfillmentModes(
  productModes: FulfillmentMode[][],
  serviceModes: FulfillmentMode[][],
): FulfillmentMode[] {
  const merged = new Set<FulfillmentMode>()
  for (const list of [...productModes, ...serviceModes]) {
    for (const mode of list) merged.add(mode)
  }
  if (merged.size === 0) return ["pickup"]
  return [...merged]
}

export function pickDefaultFulfillmentMode(modes: FulfillmentMode[]): FulfillmentMode {
  if (modes.includes("pickup")) return "pickup"
  if (modes.includes("on_site")) return "on_site"
  return modes[0]
}

export function isFulfillmentModeAllowed(
  modes: FulfillmentMode[],
  selected: FulfillmentMode | null | undefined,
): boolean {
  if (!selected) return false
  return modes.includes(selected)
}

export type DerivedLineFlags = {
  requiresDelivery: boolean
  requiresCustomerAddress: boolean
  requiresScheduling: boolean
  supportsDeposit: boolean
  expectsAppointment: boolean
}

export function deriveLineFlags(
  caps: CatalogCapabilities,
  selectedMode: FulfillmentMode | null | undefined,
  opts?: { schedulingMetadataComplete?: boolean },
): DerivedLineFlags {
  const mode = selectedMode ?? pickDefaultFulfillmentMode(caps.fulfillmentModes)
  const requiresScheduling =
    caps.schedulingEnabled && !opts?.schedulingMetadataComplete

  return {
    requiresDelivery: mode === "delivery",
    requiresCustomerAddress: mode === "delivery" || mode === "customer_location",
    requiresScheduling,
    supportsDeposit: caps.paymentRequirement === "deposit_only",
    expectsAppointment: caps.schedulingEnabled,
  }
}
