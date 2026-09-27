/** Human-readable labels for `plans.features_json` keys (shared by settings + upgrade modal). */
export const FEATURE_LABELS: Record<string, string> = {
  public_storefront: "Vitrine online para seus clientes",
  customer_management: "Clientes organizados em um só lugar",
  product_management: "Cadastro rápido de produtos",
  service_management: "Cadastro rápido de serviços",
  category_management: "Categorias de produtos e serviços",
  basic_inventory: "Controle de estoque sem planilhas",
  appointments: "Agenda com agendamentos online",
  quotes: "Orçamentos simples e profissionais",
  pdv_basic: "PDV para vendas presenciais",
  whatsapp_orders: "Pedidos via WhatsApp",
  whatsapp_bookings: "Agendamentos via WhatsApp",
  mercado_pago_checkout: "Pagamentos online com Mercado Pago",
  system_orders: "Receba pedidos direto pelo sistema",
  system_bookings: "Agendamentos pelo sistema",
  product_variants: "Variações de produtos (cor, tamanho e mais)",
  product_complements: "Complementos e adicionais",
  promotions_and_coupons: "Cupons para vender mais",
  local_shipping_config: "Configuração simples de entregas",
  supplier_management: "Gestão organizada de fornecedores",
  financial_categories: "Categorias financeiras",
  xml_import: "Importação XML (NF-e)",
  basic_financial: "Controle financeiro com visão do lucro",
  basic_reports: "Relatórios do negócio",
  national_shipping: "Entrega nacional (Superfrete)",
  full_shipping_management: "Controle de expedição e entregas",
  advanced_financial: "Financeiro completo com fluxo de caixa e DRE",
  cash_flow: "Fluxo de caixa",
  dre_report: "DRE gerencial",
  service_orders: "Ordens de serviço em um só lugar",
  returns_and_exchanges: "Gestão de trocas e devoluções",
  subscriptions_recurring: "Assinaturas recorrentes",
  multistore: "Multilojas",
  invoice_integration: "Importação de XML (NF-e)",
  promotions_campaigns: "Campanhas promocionais",
  goals_management: "Metas e desempenho da equipe",
  reminders: "Lembretes e envios automáticos via WhatsApp",
}

export const TIER_SLUGS_ORDERED = ["free", "crescer", "escalar"] as const

export function buildFeaturesDisplay(features: string[], tierSlug: string, allPlans: { slug: string; name: string; features_json?: string[] }[]): string[] {
  const tierIndex = TIER_SLUGS_ORDERED.indexOf(tierSlug as (typeof TIER_SLUGS_ORDERED)[number])

  if (tierIndex <= 0) {
    return features.map((f) => FEATURE_LABELS[f] || f).slice(0, 10)
  }

  const prevTier = allPlans.find((p) => p.slug === TIER_SLUGS_ORDERED[tierIndex - 1])
  const prevFeatures = new Set<string>(prevTier?.features_json || [])
  const newFeatures = features.filter((f) => !prevFeatures.has(f))

  const prevName = prevTier?.name || "anterior"
  return [`Tudo do ${prevName} +`, ...newFeatures.map((f) => FEATURE_LABELS[f] || f)]
}

export const HARDCODED_PLANS: Record<string, { name: string; objective: string; features: string[]; limits: string[] }> = {
  free: {
    name: "Começar",
    objective: "Pra começar a vender e organizar seu negócio",
    features: [
      "Vitrine online para seus clientes",
      "Pedidos e agendamentos pelo WhatsApp",
      "PDV para vendas presenciais",
      "Registro fácil de pedidos e vendas",
      "Agenda com agendamentos online",
      "Orçamentos simples e profissionais",
      "Controle de estoque sem planilhas",
      "Clientes organizados em um só lugar",
      "Cadastro rápido de produtos e serviços",
    ],
    limits: [
      "Até 15 itens no catálogo",
      "Até 25 pedidos por mês",
      "1 usuário",
    ],
  },
  crescer: {
    name: "Crescer",
    objective: "Pra quem quer crescer e vender mais",
    features: [
      "Tudo do plano Começar +",
      "Receba pedidos direto pelo sistema",
      "Pagamentos online com Mercado Pago",
      "Cupons para vender mais",
      "Variações de produtos (cor, tamanho e mais)",
      "Complementos e adicionais",
      "Gestão de trocas e devoluções",
      "Controle financeiro com visão do lucro",
      "Relatórios do negócio",
      "Gestão organizada de fornecedores",
      "Ordens de serviço em um só lugar",
      "Importação XML (NF-e) - até 20/mês",
    ],
    limits: [
      "Até 100 itens no catálogo",
      "Até 150 pedidos por mês",
      "Até 20 importações XML por mês",
      "3 usuários",
    ],
  },
  escalar: {
    name: "Escalar",
    objective: "Pra negócios que precisam de mais controle",
    features: [
      "Tudo do plano Crescer +",
      "Financeiro completo com fluxo de caixa e DRE",
      "Controle de entregas e envios",
      "Campanhas promocionais",
      "Metas e desempenho da equipe",
      "Lembretes e envios automáticos via WhatsApp",
      "Importação de XML (NF-e)"
    ],
    limits: [
      "Itens e pedidos ilimitados",
      "Ordens de serviço ilimitadas",
      "Agendamentos ilimitados",
      "Importações XML ilimitadas",
      "Até 15 imagens por item",
      "10 usuários",
    ],
  },
}

export function getHardcodedPlan(slug: string) {
  return HARDCODED_PLANS[slug] || HARDCODED_PLANS.free
}
