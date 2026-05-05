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

export const HARDCODED_PLANS: Record<string, { name: string; objective: string; features: string[]; limits: string[] }> = {
  free: {
    name: "Começar",
    objective: "Pra quem quer testar e começar a vender",
    features: [
      "Crie sua vitrine online e compartilhe com clientes",
      "Cadastre produtos e serviços em poucos passos",
      "Controle seu estoque básico sem planilhas",
      "Receba agendamentos e organize sua agenda",
      "Envie orçamentos de forma simples e rápida",
      "Registre pedidos e vendas no sistema",
      "Use um PDV básico para vendas presenciais",
      "Organize seus clientes em um só lugar",
      "Receba pedidos e agendamentos direto pelo WhatsApp",
    ],
    limits: [
      "Até 15 itens no catálogo",
      "Até 2 imagens por item",
      "Até 25 pedidos/mês",
      "Até 30 agendamentos/mês",
      "Até 15 ordens de serviço/mês",
      "1 usuário",
    ],
  },
  crescer: {
    name: "Crescer",
    objective: "Pra quem já vende e quer crescer na cidade",
    features: [
      "Tudo do Começar +",
      "Receba pedidos direto pelo sistema",
      "Aceite pagamentos online automáticos (Mercado Pago)",
      "Ofereça variações de produtos (tamanho, cor, etc.)",
      "Crie cupons e promoções para aumentar suas vendas",
      "Configure entrega local de forma simples",
      "Gerencie fornecedores com mais organização",
      "Crie e gerencie ordens de serviço",
      "Controle seu financeiro sem complicação",
      "Acompanhe relatórios básicos do seu negócio",
    ],
    limits: [
      "Até 100 itens no catálogo",
      "Até 5 imagens por item",
      "Até 150 pedidos/mês",
      "Até 150 agendamentos/mês",
      "Até 100 ordens de serviço/mês",
      "Até 3 usuários",
    ],
  },
  escalar: {
    name: "Escalar",
    objective: "Pra quem quer mais controle e organização",
    features: [
      "Tudo do Crescer +",
      "Gerencie expedição e entregas com mais controle",
      "Tenha um financeiro completo (fluxo de caixa + DRE)",
      "Acompanhe relatórios avançados para tomar decisões",
      "Controle devoluções e trocas com facilidade",
      "Monte kits e combos de produtos",
      "Crie campanhas promocionais mais estratégicas",
    ],
    limits: [
      "Itens e Pedidos ilimitados",
      "Até 15 imagens por item",
      "Ordens de serviço ilimitadas",
      "Agendamentos ilimitados",
      "Até 10 usuários",
    ],
  },
  profissional: {
    name: "Profissional",
    objective: "Para grandes operações e redes",
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
