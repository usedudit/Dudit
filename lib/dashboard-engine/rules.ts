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
 * Retorna os itens do checklist de onboarding dinâmico
 */
export function getChecklistItems(ctx: DashboardContext): DashboardChecklistItem[] {
  const items: DashboardChecklistItem[] = [];

  // 1. Dados do Negócio (combina: Dados Gerais + Endereço + Horários)
  const dadosNegocioCompleted = ctx.hasPhone && ctx.hasCategory && ctx.hasAddress && ctx.hasHours;
  items.push({
    id: "business-data",
    title: "Dados do Negócio",
    description: "Complete o nome da loja, categoria, WhatsApp, endereço e horários de funcionamento.",
    completed: dadosNegocioCompleted,
    tabTarget: "dados-do-negocio"
  });

  // 2. Itens (Produtos/Serviços) - com accordion para importação
  const itemTitle = ctx.sellsProducts && ctx.sellsServices
    ? "Cadastrar Produtos ou Serviços"
    : ctx.sellsServices
      ? "Cadastrar Serviços"
      : "Cadastrar Produtos";

  const itemDescription = ctx.sellsProducts && ctx.sellsServices
    ? "Adicione itens ao catálogo: cadastre manualmente, importe via planilha ou XML (NF-e)."
    : ctx.sellsServices
      ? "Adicione serviços: cadastre manualmente ou importe via planilha."
      : "Adicione produtos: cadastre manualmente, importe via planilha ou XML (NF-e).";

  const itemHref = ctx.sellsProducts ? "/erp/produtos?create=true" : "/erp/servicos?create=true";

  items.push({
    id: "items",
    title: itemTitle,
    description: itemDescription,
    completed: ctx.hasItems,
    href: ctx.hasItems ? undefined : itemHref,
    // Novos campos para o accordion de importação
    importOptions: {
      sellsProducts: ctx.sellsProducts,
      sellsServices: ctx.sellsServices,
      isQuickMode: ctx.isQuickMode,
      isErpMode: !ctx.isQuickMode,
    }
  });

  // 3. Forma de Recebimento (apenas planos Crescer/Escalar)
  if (ctx.planSlug === "crescer" || ctx.planSlug === "escalar") {
    items.push({
      id: "payments",
      title: "Forma de Recebimento",
      description: "Configure Pix, Mercado Pago e outras formas de pagamento para receber online.",
      completed: ctx.hasPix || ctx.isMercadoPagoConnected,
      tabTarget: "formas-de-pagamento"
    });
  }

  // 4. Entregas/Logística (apenas se tem endereço e plano Crescer/Escalar)
  if ((ctx.planSlug === "crescer" || ctx.planSlug === "escalar") && ctx.hasAddress) {
    items.push({
      id: "logistics",
      title: "Entregas e Logística",
      description: "Configure áreas de entrega, taxas, transportadoras e prazos para seus pedidos.",
      completed: false, // TODO: verificar se já configurou logística
      tabTarget: "entregas"
    });
  }

  // 5. Visual da Vitrine
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
      href: "/erp/produtos"
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
      href: "/erp/produtos"
    });
  }

  // Card de Pedidos
  cards.push({
    id: "received-orders",
    title: "Pedidos Recebidos",
    value: ctx.stats.receivedOrdersCount,
    subtitle: "Total de vendas realizadas",
    icon: "ShoppingCartIcon",
    href: "/erp/pedidos"
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
      href: "/erp/produtos?create=true"
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
      actionHref: "/erp/configuracoes" // Direciona para a aba de planos
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
      actionHref: "/erp/configuracoes"
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
      actionHref: "/erp/configuracoes?tab=formas-de-pagamento"
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
      actionHref: "/erp/integracoes/whatsapp"
    },
    {
      id: "mercadopago",
      name: "Mercado Pago",
      description: "Habilite pagamentos online via Pix, boleto e cartão no checkout da sua vitrine.",
      status: ctx.isMercadoPagoConnected ? "connected" : "disconnected",
      actionHref: "/erp/configuracoes?tab=formas-de-pagamento"
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
      actionHref: "/erp/configuracoes",
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
      actionHref: "/erp/configuracoes",
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
      actionHref: "/erp/integracoes/whatsapp",
      variant: "tip"
    });
  }

  return recs;
}
