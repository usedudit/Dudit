export type BusinessMode = "quick" | "erp"

export type PartnerBusinessInfo = {
  mode?: BusinessMode | string
  activeResources?: string[]
}

export const DEFAULT_BUSINESS_INFO: Required<Pick<PartnerBusinessInfo, "mode" | "activeResources">> = {
  mode: "erp",
  activeResources: ["orders", "products", "services"],
}

export function normalizeBusinessInfo(input: unknown): Required<Pick<PartnerBusinessInfo, "mode" | "activeResources">> {
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

  const mode = raw?.mode === "quick" || raw?.mode === "erp" ? (raw.mode as BusinessMode) : DEFAULT_BUSINESS_INFO.mode
  const activeResources = Array.isArray(raw?.activeResources)
    ? raw.activeResources.filter((v: any) => typeof v === "string")
    : DEFAULT_BUSINESS_INFO.activeResources

  return {
    mode,
    activeResources: activeResources.length ? activeResources : DEFAULT_BUSINESS_INFO.activeResources,
  }
}

export function isQuickMode(info: unknown): boolean {
  return normalizeBusinessInfo(info).mode === "quick"
}


