import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"

export type SystemResourceId =
  | "orders"
  | "products"
  | "services"
  | "quotes"
  | "pos"
  | "deliveries"
  | "financial"
  | "team"
  | "appointments"

export type SystemResourceModule = "sales" | "catalog" | "services" | "operations" | "management"

export interface SystemResourceDefinition {
  id: SystemResourceId
  label: string
  description: string
  module: SystemResourceModule
  minimumPlan?: Exclude<PlanTierSlug, "free">
}

export const SYSTEM_RESOURCE_MODULE_LABELS: Record<SystemResourceModule, string> = {
  sales: "Vendas",
  catalog: "Produtos",
  services: "Servicos",
  operations: "Operacao",
  management: "Gestao",
}

export const SYSTEM_RESOURCES: SystemResourceDefinition[] = [
  {
    id: "orders",
    label: "Pedidos",
    description: "Pedidos e vendas do dia a dia.",
    module: "sales",
  },
  {
    id: "quotes",
    label: "Orcamentos",
    description: "Criacao e acompanhamento de propostas.",
    module: "sales",
  },
  {
    id: "pos",
    label: "PDV",
    description: "Frente de caixa para vendas presenciais.",
    module: "sales",
  },
  {
    id: "products",
    label: "Produtos",
    description: "Catalogo, estoque e cadastros de produtos.",
    module: "catalog",
  },
  {
    id: "services",
    label: "Servicos",
    description: "Catalogo e cadastros de servicos.",
    module: "services",
  },
  {
    id: "appointments",
    label: "Agendamentos",
    description: "Agenda de servicos e atendimentos.",
    module: "services",
  },
  {
    id: "deliveries",
    label: "Entregas",
    description: "Expedicao, rotas e entregadores.",
    module: "operations",
    minimumPlan: "crescer",
  },
  {
    id: "financial",
    label: "Financeiro",
    description: "Resumo financeiro, contas, caixa e movimentacoes.",
    module: "management",
    minimumPlan: "crescer",
  },
  {
    id: "team",
    label: "Equipe",
    description: "Convites, usuarios e acessos da equipe.",
    module: "management",
    minimumPlan: "crescer",
  },
]

export const SYSTEM_RESOURCE_IDS = SYSTEM_RESOURCES.map((resource) => resource.id)

export function normalizeActiveResources(value: unknown): SystemResourceId[] {
  if (!Array.isArray(value)) return ["orders", "products"]
  const allowed = new Set<SystemResourceId>(SYSTEM_RESOURCE_IDS)
  const normalized = value.filter((item): item is SystemResourceId => allowed.has(item as SystemResourceId))
  return Array.from(new Set(normalized))
}

export function defaultActiveResourcesForBusinessInfo(businessInfo: { sells?: string[] }): SystemResourceId[] {
  const sells = businessInfo.sells || []
  const defaults: SystemResourceId[] = ["orders"]
  if (sells.includes("products")) defaults.push("products")
  if (sells.includes("services")) defaults.push("services")
  return defaults
}

export function resolveActiveResources(businessInfo: { sells?: string[]; activeResources?: unknown }): SystemResourceId[] {
  if (Array.isArray(businessInfo.activeResources)) {
    return normalizeActiveResources(businessInfo.activeResources)
  }
  return defaultActiveResourcesForBusinessInfo(businessInfo)
}

export function isSystemResourceActive(
  businessInfo: { sells?: string[]; activeResources?: unknown },
  resourceId: SystemResourceId,
): boolean {
  return resolveActiveResources(businessInfo).includes(resourceId)
}

export function isSystemResourceAvailableForPlan(resource: SystemResourceDefinition, planSlug: string): boolean {
  return !resource.minimumPlan || hasMinimumPlan(planSlug, resource.minimumPlan)
}
