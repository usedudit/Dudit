export type BusinessMode = "desapego" | "quick" | "showcase" | "erp"

export type PartnerBusinessInfo = {
  mode?: BusinessMode
  activeResources?: string[]
  resourcesVersion?: number
  salesSettings?: Record<string, unknown>
}

export const DEFAULT_BUSINESS_INFO: Required<Pick<PartnerBusinessInfo, "mode" | "activeResources">> = {
  mode: "erp",
  activeResources: [
    "orders",
    "products",
    "services",
    "quotes",
    "pos",
    "deliveries",
    "financial",
    "team",
    "appointments",
    "customers",
    "reports",
    "marketing",
    "showcase",
    "goals",
    "returns",
    "stockMovements",
    "productCadastros",
    "serviceOrders",
    "serviceCadastros",
    "coupons",
    "campaigns",
    "productivity",
    "communityVideos",
  ],
}

export function normalizeBusinessInfo(input: unknown): Required<Pick<PartnerBusinessInfo, "mode" | "activeResources">> & { resourcesVersion?: number; salesSettings?: Record<string, unknown> } {
  const raw = (() => {
    if (!input) return null
    if (typeof input === "string") {
      try {
        return JSON.parse(input)
      } catch {
        return null
      }
    }
    if (typeof input === "object") return input as any
    return null
  })()

  const rawMode = typeof raw?.mode === "string" ? raw.mode.toLowerCase() : ""
  const mode: BusinessMode =
    rawMode === "desapego" || rawMode === "quick" || rawMode === "showcase" || rawMode === "erp"
      ? (rawMode as BusinessMode)
      : DEFAULT_BUSINESS_INFO.mode

  const activeResources = Array.isArray(raw?.activeResources)
    ? raw.activeResources.filter((v: any) => typeof v === "string")
    : DEFAULT_BUSINESS_INFO.activeResources

  return {
    mode,
    activeResources: activeResources.length ? activeResources : DEFAULT_BUSINESS_INFO.activeResources,
    ...(typeof raw?.resourcesVersion === "number" && Number.isFinite(raw.resourcesVersion)
      ? { resourcesVersion: raw.resourcesVersion }
      : {}),
    ...(raw?.salesSettings ? { salesSettings: raw.salesSettings } : {}),
  }
}

export function isQuickMode(info: unknown): boolean {
  const mode = normalizeBusinessInfo(info).mode
  return mode === "quick" || mode === "desapego" || mode === "showcase"
}


