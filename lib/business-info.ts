export type BusinessMode = "desapego" | "quick" | "showcase" | "erp"

export type PartnerBusinessInfo = {
  mode?: BusinessMode
  activeResources?: string[]
  resourcesVersion?: number
  salesSettings?: Record<string, unknown>
  /**
   * Marca que o parceiro já concluiu o "Guia de Configuração" (onboarding).
   * Uma vez concluído, o guia não deve voltar a ser exibido.
   */
  onboardingCompleted?: boolean
  onboardingGoals?: string[]
  onboardingCompletedAt?: string
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

/**
 * Converte `business_info` (JSONB, JSON em string ou objeto) em um objeto plano.
 *
 * `normalizeBusinessInfo` reconstrói o objeto do zero e conhece apenas um
 * subconjunto das chaves. Os fluxos de escrita (salvar recursos, trocar o modo
 * de negócio, editar o perfil) usam o objeto normalizado como base do update e
 * portanto apagavam chaves desconhecidas — inclusive as flags de onboarding.
 * Esse helper devolve o registro cru para que nada seja perdido na escrita.
 */
export function toBusinessInfoRecord(input: unknown): Record<string, unknown> {
  if (!input) return {}
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}

export function normalizeBusinessInfo(input: unknown): Required<Pick<PartnerBusinessInfo, "mode" | "activeResources">> & PartnerBusinessInfo {
  const raw = toBusinessInfoRecord(input)

  const rawMode = typeof raw.mode === "string" ? raw.mode.toLowerCase() : ""
  const mode: BusinessMode =
    rawMode === "desapego" || rawMode === "quick" || rawMode === "showcase" || rawMode === "erp"
      ? (rawMode as BusinessMode)
      : DEFAULT_BUSINESS_INFO.mode

  const activeResources = Array.isArray(raw.activeResources)
    ? raw.activeResources.filter((v: any) => typeof v === "string")
    : DEFAULT_BUSINESS_INFO.activeResources

  return {
    mode,
    activeResources: activeResources.length ? activeResources : DEFAULT_BUSINESS_INFO.activeResources,
    ...(typeof raw.resourcesVersion === "number" && Number.isFinite(raw.resourcesVersion)
      ? { resourcesVersion: raw.resourcesVersion }
      : {}),
    ...(raw.salesSettings ? { salesSettings: raw.salesSettings as Record<string, unknown> } : {}),
    // Flags do "Guia de Configuração": preservadas aqui para que qualquer fluxo
    // que use `normalizeBusinessInfo` como base de escrita mantenha o estado do
    // onboarding já concluído.
    ...(typeof raw.onboardingCompleted === "boolean"
      ? { onboardingCompleted: raw.onboardingCompleted }
      : {}),
    ...(Array.isArray(raw.onboardingGoals)
      ? { onboardingGoals: raw.onboardingGoals.filter((v: any) => typeof v === "string") }
      : {}),
    ...(typeof raw.onboardingCompletedAt === "string"
      ? { onboardingCompletedAt: raw.onboardingCompletedAt }
      : {}),
  }
}

/**
 * Estado persistido do "Guia de Configuração" (onboarding).
 *
 * O wizard grava essas flags em `partners.business_info` (e em
 * `stores.business_info`). Elas são a fonte de verdade para decidir se o guia
 * pode ser exibido novamente.
 */
export function readOnboardingState(businessInfo: unknown): {
  completed: boolean
  goals: string[]
  completedAt?: string
} {
  const raw = toBusinessInfoRecord(businessInfo)

  return {
    completed: raw.onboardingCompleted === true,
    goals: Array.isArray(raw.onboardingGoals)
      ? raw.onboardingGoals.filter((v: any): v is string => typeof v === "string")
      : [],
    ...(typeof raw.onboardingCompletedAt === "string"
      ? { completedAt: raw.onboardingCompletedAt }
      : {}),
  }
}

export function isQuickMode(info: unknown): boolean {
  const mode = normalizeBusinessInfo(info).mode
  return mode === "quick" || mode === "desapego" || mode === "showcase"
}
