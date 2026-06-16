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
  | "goals"
  | "returns"

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
    description: "Pedidos, vendas, metas e devoluções do dia a dia.",
    module: "sales",
  },
  {
    id: "quotes",
    label: "Orçamentos",
    description: "Criação e acompanhamento de propostas.",
    module: "sales",
  },
  {
    id: "goals",
    label: "Metas",
    description: "Metas de vendas e acompanhamento de resultados.",
    module: "sales",
  },
  {
    id: "returns",
    label: "Devoluções",
    description: "Devoluções de pedidos e estorno de valores.",
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
    description: "Catálogo, movimentação de estoque, fornecedores e cadastros de produtos.",
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
    description: "Catálogo, cadastros e ordens de serviço.",
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
    description: "Expedição, rotas, entregadores e dashboard de entregas.",
    module: "operations",
    minimumPlan: "crescer",
  },
  {
    id: "financial",
    label: "Financeiro",
    description: "Resumo financeiro, contas a pagar/receber, caixa e cadastros financeiros.",
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
    id: "team",
    label: "Equipe",
    description: "Convites, usuários e acessos da equipe.",
    module: "management",
    minimumPlan: "crescer",
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
    description: "Cupons de desconto, campanhas e promoções, planos recorrentes e assinaturas.",
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
      "goals",
      "returns",
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
    "goals",
    "returns",
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
      const v2Resources: SystemResourceId[] = ["customers", "reports", "marketing", "showcase"]
      for (const r of v2Resources) {
        if (!current.includes(r)) {
          current.push(r)
        }
      }
    }
    if (version < 3) {
      const v3Resources: SystemResourceId[] = ["goals", "returns"]
      for (const r of v3Resources) {
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
