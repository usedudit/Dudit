export type BusinessMode = "quick" | "erp"

export type PartnerBusinessInfo = {
  sells?: Array<"products" | "services" | string>
  mode?: BusinessMode | string
  activeResources?: string[]
}

export const DEFAULT_BUSINESS_INFO: Required<Pick<PartnerBusinessInfo, "sells" | "mode" | "activeResources">> = {
  sells: ["products"],
  mode: "erp",
  activeResources: ["orders", "products"],
}

export function normalizeBusinessInfo(input: unknown): Required<Pick<PartnerBusinessInfo, "sells" | "mode" | "activeResources">> {
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

  const sells = Array.isArray(raw?.sells)
    ? (raw.sells.filter((v: any) => v === "products" || v === "services") as Array<"products" | "services">)
    : DEFAULT_BUSINESS_INFO.sells

  const mode = raw?.mode === "quick" || raw?.mode === "erp" ? (raw.mode as BusinessMode) : DEFAULT_BUSINESS_INFO.mode
  const activeResources = Array.isArray(raw?.activeResources)
    ? raw.activeResources.filter((v: any) => typeof v === "string")
    : [
      "orders",
      ...(sells.includes("products") ? ["products"] : []),
      ...(sells.includes("services") ? ["services"] : []),
    ]

  return {
    sells: sells.length ? sells : DEFAULT_BUSINESS_INFO.sells,
    mode,
    activeResources,
  }
}

export function isQuickMode(info: unknown): boolean {
  return normalizeBusinessInfo(info).mode === "quick"
}

