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
  | "customers"
  | "reports"
  | "marketing"
  | "showcase"

export type SystemResourceModule = "sales" | "catalog" | "services" | "operations" | "management" | "marketing"

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
  services: "Serviços",
  operations: "Operação",
  management: "Gestão",
  marketing: "Marketing",
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
    label: "Orçamentos",
    description: "Criação e acompanhamento de propostas.",
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
    description: "Catálogo, estoque e cadastros de produtos.",
    module: "catalog",
  },
  {
    id: "showcase",
    label: "Minha Vitrine",
    description: "Vitrine online para divulgação de produtos e serviços.",
    module: "catalog",
  },
  {
    id: "services",
    label: "Serviços",
    description: "Catálogo e cadastros de serviços.",
    module: "services",
  },
  {
    id: "appointments",
    label: "Agendamentos",
    description: "Agenda de serviços e atendimentos.",
    module: "services",
  },
  {
    id: "deliveries",
    label: "Entregas",
    description: "Expedição, rotas e entregadores.",
    module: "operations",
    minimumPlan: "crescer",
  },
  {
    id: "financial",
    label: "Financeiro",
    description: "Resumo financeiro, contas, caixa e movimentações.",
    module: "management",
    minimumPlan: "crescer",
  },
  {
    id: "team",
    label: "Equipe",
    description: "Convites, usuários e acessos da equipe.",
    module: "management",
    minimumPlan: "crescer",
  },
  {
    id: "customers",
    label: "Clientes",
    description: "Cadastro e gestão de clientes do negócio.",
    module: "management",
  },
  {
    id: "reports",
    label: "Relatórios",
    description: "Relatórios de vendas, estoque, serviços e financeiro.",
    module: "management",
    minimumPlan: "crescer",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Campanhas, cupons de desconto e assinaturas/planos recorrentes.",
    module: "marketing",
  },
]

export const SYSTEM_RESOURCE_IDS = SYSTEM_RESOURCES.map((resource) => resource.id)

export function normalizeActiveResources(value: unknown): SystemResourceId[] {
  if (!Array.isArray(value)) {
    return [
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
    ]
  }
  const allowed = new Set<SystemResourceId>(SYSTEM_RESOURCE_IDS)
  const normalized = value.filter((item): item is SystemResourceId => allowed.has(item as SystemResourceId))
  return Array.from(new Set(normalized))
}

export function defaultActiveResourcesForBusinessInfo(businessInfo: { sells?: string[] }): SystemResourceId[] {
  const sells = businessInfo.sells || []
  const defaults: SystemResourceId[] = [
    "orders",
    "quotes",
    "pos",
    "deliveries",
    "financial",
    "team",
    "customers",
    "reports",
    "marketing",
    "showcase",
  ]
  if (sells.includes("products")) {
    defaults.push("products")
  }
  if (sells.includes("services")) {
    defaults.push("services")
    defaults.push("appointments")
  }
  return defaults
}

export function resolveActiveResources(businessInfo: { sells?: string[]; activeResources?: unknown; resourcesVersion?: number }): SystemResourceId[] {
  if (Array.isArray(businessInfo.activeResources)) {
    const current = normalizeActiveResources(businessInfo.activeResources)
    
    // Automatically migrate older schemas to include new resources
    const version = (businessInfo as any).resourcesVersion || 0
    if (version < 2) {
      const newResources: SystemResourceId[] = ["customers", "reports", "marketing", "showcase"]
      for (const r of newResources) {
        if (!current.includes(r)) {
          current.push(r)
        }
      }
    }
    return current
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
