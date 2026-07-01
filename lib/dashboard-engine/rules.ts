import {
  DashboardContext,
  DashboardCard,
  DashboardChecklistItem,
  DashboardShortcut,
  DashboardAlert,
  DashboardIntegration,
  DashboardRecommendation
} from "./types";

/**
@@ -10,3 +10,183 @@
 */
export function getChecklistItems(ctx: DashboardContext): DashboardChecklistItem[] {
  const items: DashboardChecklistItem[] = [];

  // 1. Dados Gerais
  items.push({
    id: "profile",
    title: "Dados Gerais e Segmento",
    description: "Defina o nome da loja, categoria principal e número de WhatsApp.",
    completed: ctx.hasPhone && ctx.hasCategory,
    tabTarget: "dados-do-negocio"
  });

  // 2. Endereço
  items.push({
    id: "address",
    title: "Endereço Comercial",
    description: "Cadastre o endereço da sua loja para cálculo de rotas e entrega.",
    completed: ctx.hasAddress,
    tabTarget: "dados-do-negocio"
  });

  // 3. Horários
  items.push({
    id: "hours",
    title: "Horários de Funcionamento",
    description: "Defina os horários em que seu estabelecimento aceita pedidos.",
    completed: ctx.hasHours,
    tabTarget: "dados-do-negocio"
  });

  // 4. Chave Pix
  items.push({
    id: "payments",
    title: "Forma de Recebimento (Pix)",
    description: "Cadastre uma chave Pix ativa para receber pagamentos diretos.",
    completed: ctx.hasPix,
    tabTarget: "formas-de-pagamento"
  });

  // 5. Cadastrar Item (Produto ou Serviço)
  const itemTitle = ctx.sellsProducts && ctx.sellsServices
    ? "Cadastrar Produto ou Serviço"
    : ctx.sellsServices
      ? "Cadastrar Primeiro Serviço"
      : "Cadastrar Primeiro Produto";

  const itemDescription = ctx.sellsProducts && ctx.sellsServices
    ? "Adicione pelo menos um produto ou serviço ativo ao seu catálogo."
    : ctx.sellsServices
      ? "Adicione pelo menos um serviço ativo ao seu catálogo."
      : "Adicione pelo menos um produto ativo ao seu catálogo.";

  const itemHref = ctx.sellsProducts ? "/erp/products?create=true" : "/erp/servicos?create=true";

  items.push({
    id: "items",
    title: itemTitle,
    description: itemDescription,
    completed: ctx.hasItems,
    href: ctx.hasItems ? undefined : itemHref
  });

  // 6. Visual da Vitrine
  items.push({
    id: "showcase",
    title: "Visual da sua Vitrine",
    description: "Personalize sua logo e banner para atrair clientes.",
    completed: ctx.hasLogoAndBanner,
    tabTarget: "vitrine"
  });

  return items;
}

/**
 * Retorna os cards de métricas apropriados para o contexto
 */
export function getCards(ctx: DashboardContext): DashboardCard[] {
  const cards: DashboardCard[] = [];

  // Card de Itens Ativos
  if (ctx.sellsProducts && ctx.sellsServices) {
    cards.push({
      id: "active-items",
      title: "Itens Ativos",
      value: ctx.stats.activeProductsCount + ctx.stats.activeServicesCount,
      subtitle: "Produtos e serviços publicados",
      icon: "Package",
      href: "/erp/products"
    });
  } else if (ctx.sellsServices) {
    cards.push({
      id: "active-services",
      title: "Serviços Ativos",
      value: ctx.stats.activeServicesCount,
      subtitle: "Serviços publicados",
      icon: "WrenchIcon",
      href: "/erp/servicos"
    });
  } else {
    cards.push({
      id: "active-products",
      title: "Produtos Ativos",
      value: ctx.stats.activeProductsCount,
      subtitle: "Produtos publicados",
      icon: "Package",
      href: "/erp/products"
    });
  }

  // Card de Pedidos
  cards.push({
    id: "received-orders",
    title: "Pedidos Recebidos",
    value: ctx.stats.receivedOrdersCount,
    subtitle: "Total de vendas realizadas",
    icon: "ShoppingCartIcon",
    href: "/erp/orders"
  });

  return cards;
}

/**
 * Retorna atalhos rápidos adequados ao tipo de negócio
 */
export function getShortcuts(ctx: DashboardContext): DashboardShortcut[] {
  const shortcuts: DashboardShortcut[] = [];

  if (ctx.sellsProducts) {
    shortcuts.push({
      id: "add-product",
      label: "Anunciar Produto",
      description: "Crie um novo anúncio no marketplace",
      icon: "PlusIcon",
      href: "/erp/products?create=true"
    });
  }

  if (ctx.sellsServices) {
    shortcuts.push({
      id: "add-service",
      label: "Anunciar Serviço",
      description: "Ofereça um novo serviço aos clientes",
      icon: "WrenchIcon",
      href: "/erp/servicos?create=true"
    });
  }

  return shortcuts;
}

/**
 * Retorna alertas de atenção baseados em limites de plano ou conexões ausentes
 */
export function getAlerts(ctx: DashboardContext): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  // Alerta de Limite do Plano Free (Produtos)
  if (ctx.planSlug === "free" && ctx.sellsProducts && ctx.stats.activeProductsCount >= 15) {
    alerts.push({
      id: "alert-product-limit",
      title: "Limite de produtos atingido",
      description: "Você atingiu o limite de 15 produtos do plano grátis. Faça upgrade para continuar cadastrando.",
      type: "danger",
      actionLabel: "Fazer Upgrade",
      actionHref: "/erp/settings" // Direciona para a aba de planos
    });
  }

  // Alerta de Limite do Plano Free (Vendas)
  if (ctx.planSlug === "free" && ctx.stats.monthlyOrdersCount >= 25) {
    alerts.push({
      id: "alert-orders-limit",
      title: "Limite de pedidos atingido",
      description: "Você atingiu o limite de 25 pedidos mensais do plano grátis. Faça upgrade para continuar vendendo.",
      type: "danger",
      actionLabel: "Fazer Upgrade",
      actionHref: "/erp/settings"
    });
  }

  // Alerta de Mercado Pago ausente se o plano for pago (Crescer/Escalar)
  if (ctx.planSlug !== "free" && !ctx.isMercadoPagoConnected) {
    alerts.push({
      id: "alert-mp-missing",
      title: "Pagamento Online Desativado",
      description: "Você está em um plano pago, mas ainda não conectou o Mercado Pago para receber pagamentos de forma integrada.",
      type: "warning",
      actionLabel: "Conectar Mercado Pago",
      actionHref: "/erp/settings?tab=formas-de-pagamento"
    });
  }

  return alerts;
}

/**
 * Retorna a lista de integrações suportadas atualmente e seu status
 */
export function getIntegrations(ctx: DashboardContext): DashboardIntegration[] {
  return [
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "Receba pedidos e envie atualizações automáticas via WhatsApp.",
      status: ctx.isWhatsAppConnected ? "connected" : "disconnected",
      actionHref: "/erp/integrations/whatsapp"
    },
    {
      id: "mercadopago",
      name: "Mercado Pago",
      description: "Habilite pagamentos online via Pix, boleto e cartão no checkout da sua vitrine.",
      status: ctx.isMercadoPagoConnected ? "connected" : "disconnected",
      actionHref: "/erp/settings?tab=formas-de-pagamento"
    }
  ];
}

/**
 * Retorna recomendações e upsells específicos ao contexto de planos e preenchimento
 */
export function getRecommendations(ctx: DashboardContext): DashboardRecommendation[] {
  const recs: DashboardRecommendation[] = [];

  // Recomendação de Upgrade do Free para Crescer
  if (ctx.planSlug === "free") {
    recs.push({
      id: "upgrade-crescer",
      title: "Ative o Plano Crescer",
      description: "Aumente seu limite de catálogo para 100 itens, receba pagamentos via Mercado Pago e ative cupons promocionais para vender mais.",
      badge: "RECURSO PREMIUM",
      actionLabel: "Ver Planos",
      actionHref: "/erp/settings",
      variant: "upgrade"
    });
  }

  // Recomendação de Upgrade do Crescer para Escalar
  if (ctx.planSlug === "crescer") {
    recs.push({
      id: "upgrade-escalar",
      title: "Migre para o Plano Escalar",
      description: "Tenha itens e pedidos ilimitados, financeiro avançado com fluxo de caixa, DRE simplificado e gestão completa de devoluções.",
      badge: "GESTÃO COMPLETA",
      actionLabel: "Ver Planos",
      actionHref: "/erp/settings",
      variant: "upgrade"
    });
  }

  // Dica contextual se o WhatsApp não estiver configurado
  if (!ctx.isWhatsAppConnected) {
    recs.push({
      id: "connect-whatsapp-tip",
      title: "Venda mais com o WhatsApp",
      description: "Conecte seu número de WhatsApp corporativo para receber pedidos e agendamentos diretos de forma totalmente integrada.",
      actionLabel: "Conectar Agora",
      actionHref: "/erp/integrations/whatsapp",
      variant: "tip"
    });
  }

  return recs;
}
