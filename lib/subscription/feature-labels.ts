/** Human-readable labels for `plans.features_json` keys (shared by settings + upgrade modal). */
export const FEATURE_LABELS: Record<string, string> = {
  public_storefront: "Vitrine digital pública",
  customer_management: "Cadastro de clientes",
  product_management: "Cadastro de produtos",
  service_management: "Cadastro de serviços",
  category_management: "Categorias de produtos e serviços",
  basic_inventory: "Estoque básico",
  appointments: "Agendamentos",
  quotes: "Orçamentos",
  technical_specs: "Ficha técnica com campos livres",
  pdv_basic: "PDV (Ponto de Venda)",
  whatsapp_orders: "Pedidos via WhatsApp",
  whatsapp_bookings: "Agendamentos via WhatsApp",
  qr_code_profile: "QR Code da Vitrine",
  mercado_pago_checkout: "Pagamento online (Mercado Pago)",
  system_orders: "Pedidos pelo sistema",
  system_bookings: "Agendamentos pelo sistema",
  product_variants: "Variantes de produtos",
  product_complements: "Complementos de produtos",
  promotions_and_coupons: "Promoções e cupons",
  local_shipping_config: "Frete local configurável",
  supplier_management: "Gestão de fornecedores",
  financial_categories: "Categorias financeiras",
  xml_import: "Importação XML (NF-e)",
  basic_financial: "Financeiro básico",
  basic_reports: "Relatórios básicos",
  national_shipping: "Frete nacional (Superfrete)",
  full_shipping_management: "Gestão de entregas",
  advanced_financial: "Financeiro avançado",
  cash_flow: "Fluxo de caixa",
  dre_report: "DRE simplificado",
  advanced_reports: "Relatórios avançados",
  service_orders: "Ordem de serviço",
  returns_and_exchanges: "Devoluções e trocas",
  product_kits: "Kits de produtos",
  marketplace_highlight: "Destaque no marketplace",
  search_priority: "Prioridade na busca",
  complete_reports: "Relatórios completos",
  subscriptions_recurring: "Assinaturas recorrentes",
  multistore: "Multilojas",
  invoice_integration: "Integração com NF-e",
}

export const TIER_SLUGS_ORDERED = ["free", "crescer", "escalar", "profissional"] as const

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

export const HARDCODED_PLANS: Record<string, { name: string; features: string[]; limits: string[] }> = {
  free: {
    name: "Começar",
    features: [
      "Vitrine digital pública",
      "Produtos e serviços",
      "Agendamentos",
      "Orçamentos",
      "Pedidos via WhatsApp",
      "PDV",
      "Clientes",
    ],
    limits: [
      "Até 15 itens",
      "Até 2 imagens por item",
      "Até 25 pedidos e agendamentos/mês",
      "Até 5 orçamentos/mês",
      "1 usuário",
    ],
  },
  crescer: {
    name: "Crescer",
    features: [
      "Tudo do Começar +",
      "Pagamento online (Mercado Pago)",
      "Pedidos pelo sistema",
      "Variantes de produtos",
      "Cupons",
      "Frete local configurável",
      "Fornecedores",
      "Importação XML",
      "Financeiro básico",
      "Relatórios básicos",
    ],
    limits: [
      "Até 100 itens",
      "Até 5 imagens por item",
      "Até 150 pedidos e agendamentos/mês",
      "Até 30 orçamentos/mês",
      "Até 3 usuários",
    ],
  },
  escalar: {
    name: "Escalar",
    features: [
      "Tudo do Crescer +",
      "Gestão de entregas",
      "Financeiro completo",
      "Relatórios avançados",
      "Ordem de serviço",
      "Kits de produtos",
      "Campanhas promocionais",
    ],
    limits: [
      "Itens ilimitados",
      "Até 8 imagens por item",
      "Pedidos ilimitados",
      "Agendamentos ilimitados",
      "Orçamentos ilimitados",
      "Até 10 usuários",
    ],
  },
  profissional: {
    name: "Profissional",
    features: [
      "Tudo do Escalar +",
      "Multilojas",
      "Integração com NF-e",
      "Assinaturas recorrentes",
      "Marketplace destaque",
      "Prioridade na busca",
      "Relatórios completos",
    ],
    limits: [
      "Itens ilimitados",
      "Imagens ilimitadas",
      "Pedidos ilimitados",
      "Usuários ilimitados",
    ],
  },
}

export function getHardcodedPlan(slug: string) {
  return HARDCODED_PLANS[slug] || HARDCODED_PLANS.free
}
