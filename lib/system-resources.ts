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
  | "stockMovements"
  | "productCadastros"
  | "serviceOrders"
  | "serviceCadastros"
  | "coupons"
  | "campaigns"
  | "productivity"
  | "communityVideos"

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
    id: "pos",
    label: "PDV",
    description: "Frente de caixa para vendas presenciais.",
    module: "sales",
  },
  {
    id: "returns",
    label: "Devoluções",
    description: "Devoluções de pedidos e estorno de valores.",
    module: "sales",
    minimumPlan: "crescer",
  },
  {
    id: "products",
    label: "Produtos",
    description: "Catálogo de produtos.",
    module: "catalog",
  },
  {
    id: "stockMovements",
    label: "Movimentação de Estoque",
    description: "Controle de entrada e saída de estoque.",
    module: "catalog",
  },
  {
    id: "productCadastros",
    label: "Cadastros de Produtos",
    description: "Categorias, marcas, localizações e atributos.",
    module: "catalog",
    minimumPlan: "crescer",
  },

  {
    id: "services",
    label: "Serviços",
    description: "Catálogo de serviços.",
    module: "services",
  },
  {
    id: "appointments",
    label: "Agendamentos",
    description: "Agenda de serviços e atendimentos.",
    module: "services",
  },
  {
    id: "serviceOrders",
    label: "Ordens de Serviço",
    description: "Ordens de serviço e acompanhamento.",
    module: "services",
    minimumPlan: "crescer",
  },
  {
    id: "serviceCadastros",
    label: "Cadastros de Serviços",
    description: "Categorias e atributos de serviços.",
    module: "services",
    minimumPlan: "crescer",
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
    id: "coupons",
    label: "Cupons de Desconto",
    description: "Criação e gerenciamento de cupons promocionais.",
    module: "marketing",
    minimumPlan: "crescer",
  },
  {
    id: "campaigns",
    label: "Campanhas e Promoções",
    description: "Campanhas promocionais e descontos sazonais.",
    module: "marketing",
    minimumPlan: "escalar",
  },
  {
    id: "productivity",
    label: "Produtividade",
    description: "Dashboard de produtividade, metas e comissões da equipe.",
    module: "management",
    minimumPlan: "escalar",
  },
  {
    id: "communityVideos",
    label: "Vídeos da Comunidade",
    description: "Vídeos curtos vinculados a produtos, serviços ou coleções.",
    module: "marketing",
    minimumPlan: "crescer",
  },
]

export const SYSTEM_RESOURCE_IDS: SystemResourceId[] = [
  ...SYSTEM_RESOURCES.map((resource) => resource.id),
  "marketing",
  "showcase",
  "communityVideos",
]

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
      "stockMovements",
      "productCadastros",
      "showcase",
      "appointments",
      "serviceOrders",
      "serviceCadastros",
      "deliveries",
      "financial",
      "team",
      "customers",
      "reports",
      "marketing",
      "coupons",
      "campaigns",
      "productivity",
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
    "stockMovements",
    "productCadastros",
    "showcase",
    "appointments",
    "serviceOrders",
    "serviceCadastros",
    "deliveries",
    "financial",
    "team",
    "customers",
    "reports",
    "marketing",
    "coupons",
    "campaigns",
    "productivity",
    "communityVideos",
  ]
  if (sells.includes("products")) {
    defaults.push("products")
  }
  if (sells.includes("services")) {
    defaults.push("services")
  }
  return defaults
}

export function resolveActiveResources(businessInfo: { sells?: string[]; activeResources?: unknown; resourcesVersion?: number }): SystemResourceId[] {
  if (Array.isArray(businessInfo.activeResources)) {
    const current = normalizeActiveResources(businessInfo.activeResources)

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
    if (version < 4) {
      const v4Resources: SystemResourceId[] = ["stockMovements", "productCadastros", "serviceCadastros", "coupons", "campaigns"]
      for (const r of v4Resources) {
        if (!current.includes(r)) {
          current.push(r)
        }
      }
    }
    if (version < 5) {
      const v5Resources: SystemResourceId[] = ["serviceOrders"]
      for (const r of v5Resources) {
        if (!current.includes(r)) {
          current.push(r)
        }
      }
    }
    if (version < 6) {
      const v6Resources: SystemResourceId[] = ["productivity"]
      for (const r of v6Resources) {
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
