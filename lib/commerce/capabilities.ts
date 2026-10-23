/**
 * Minimal commerce capability model.
 * Catalog fields: fulfillment_modes, payment_requirement (services).
 * Checkout behavior is derived - avoid item_type branching outside resolution.
 */

export const FULFILLMENT_MODES = [
  "delivery",
  "pickup",
  "shipping",
  "on_site",
  "customer_location",
] as const

export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number]

/**
 * Capacidades de fulfillment da LOJA (o que a loja pode oferecer).
 * O modo efetivo de cada item é a interseção entre os modos do catálogo
 * (produto/serviço) e estas capacidades.
 */
export type StoreFulfillmentCapabilities = {
  /** Entrega local (raio próprio + rede de entregadores). Requer plano + is_delivery_enabled. */
  delivery: boolean
  /** Retirada no local. Requer is_pickup_enabled. */
  pickup: boolean
  /** Envio nacional via transportadora (SuperFrete). Requer plano + integração conectada. */
  shipping: boolean
}

export const DEFAULT_STORE_FULFILLMENT_CAPABILITIES: StoreFulfillmentCapabilities = {
  delivery: true,
  pickup: true,
  shipping: false,
}

/** Modos que dependem de entregar/enviar - exigem endereço do cliente. */
export const ADDRESS_REQUIRED_MODES: readonly FulfillmentMode[] = [
  "delivery",
  "customer_location",
  "shipping",
]

export function isAddressRequiredMode(mode: FulfillmentMode | null | undefined): boolean {
  return Boolean(mode && (ADDRESS_REQUIRED_MODES as readonly string[]).includes(mode))
}

export function isModeSupportedByStore(
  mode: FulfillmentMode,
  caps: StoreFulfillmentCapabilities,
): boolean {
  switch (mode) {
    case "delivery":
      return caps.delivery
    case "pickup":
      return caps.pickup
    case "shipping":
      return caps.shipping
    // Serviços não dependem das capacidades de entrega da loja.
    case "on_site":
    case "customer_location":
      return true
    default:
      return false
  }
}

/**
 * Retorna os modos efetivos de um item = modos do catálogo filtrados pelas
 * capacidades da loja. Se a interseção for vazia, cai no melhor fallback
 * disponível na loja (nunca retorna vazio).
 */
export function resolveEffectiveFulfillmentModes(
  catalogModes: FulfillmentMode[],
  storeCaps: StoreFulfillmentCapabilities,
  kind: "product" | "service" = "product",
): FulfillmentMode[] {
  const supported = catalogModes.filter((m) => isModeSupportedByStore(m, storeCaps))
  if (supported.length > 0) return supported

  if (kind === "service") {
    return catalogModes.includes("customer_location") ? ["customer_location"] : ["on_site"]
  }

  const fallback: FulfillmentMode[] = []
  if (storeCaps.pickup) fallback.push("pickup")
  if (storeCaps.delivery) fallback.push("delivery")
  if (storeCaps.shipping) fallback.push("shipping")
  return fallback.length ? fallback : ["pickup"]
}

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

export function serviceCatalogCapabilities(
  row: {
    fulfillment_modes?: string[] | null
    payment_requirement?: string | null
  },
  storeCaps?: StoreFulfillmentCapabilities,
): CatalogCapabilities {
  const catalogModes = normalizeFulfillmentModes(
    row.fulfillment_modes,
    defaultServiceFulfillmentModes(),
  )
  return {
    fulfillmentModes: storeCaps
      ? resolveEffectiveFulfillmentModes(catalogModes, storeCaps, "service")
      : catalogModes,
    paymentRequirement: PAYMENT_REQUIREMENTS.includes(
      row.payment_requirement as PaymentRequirement,
    )
      ? (row.payment_requirement as PaymentRequirement)
      : "full_payment",
    schedulingEnabled: true,
  }
}

export function productCatalogCapabilities(
  row: {
    fulfillment_modes?: string[] | null
    product_type?: string | null
  },
  storeCaps?: StoreFulfillmentCapabilities,
): CatalogCapabilities {
  const catalogModes = normalizeFulfillmentModes(
    row.fulfillment_modes,
    defaultProductFulfillmentModes(row.product_type),
  )
  return {
    fulfillmentModes: storeCaps
      ? resolveEffectiveFulfillmentModes(catalogModes, storeCaps, "product")
      : catalogModes,
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
  if (modes.includes("delivery")) return "delivery"
  if (modes.includes("shipping")) return "shipping"
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
  requiresShipping: boolean
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
    requiresShipping: mode === "shipping",
    requiresCustomerAddress: isAddressRequiredMode(mode),
    requiresScheduling,
    supportsDeposit: caps.paymentRequirement === "deposit_only",
    expectsAppointment: caps.schedulingEnabled,
  }
}
