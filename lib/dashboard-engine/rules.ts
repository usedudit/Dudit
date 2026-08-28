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
 * Retorna os itens do checklist de onboarding dinâmico e inteligente
 */
export function getChecklistItems(ctx: DashboardContext): DashboardChecklistItem[] {
  if (ctx.isDesapego) {
    return [];
  }

  const items: DashboardChecklistItem[] = [];

  // 1. Dados Básicos da Loja (Nome + WhatsApp + Categoria + Endereço)
  // O usuário já preenche isso no cadastro, então já nasce completo como vitória inicial (Endowed Progress)
  const dadosNegocioCompleted = ctx.hasPhone && ctx.hasCategory && ctx.hasAddress;
  items.push({
    id: "business-data",
    title: "Dados da sua Loja",
    description: "Nome, WhatsApp, categoria e endereço comercial já foram configurados.",
    completed: dadosNegocioCompleted,
    actionText: "Revisar Dados",
    badgeText: "Concluído no cadastro",
    tabTarget: "dados-do-negocio"
  });

  // 2. Catálogo de Itens (Produtos e/ou Serviços)
  const isHybrid = ctx.sellsProducts && ctx.sellsServices;
  const isServicesOnly = ctx.sellsServices && !ctx.sellsProducts;

  let itemTitle = "Publicar seu 1º produto";
  let itemDesc = "Adicione foto, nome e preço. Você também pode importar direto via XML de NF-e ou planilha!";
  let itemAction = "Adicionar Produto";

  if (isHybrid) {
    itemTitle = "Cadastrar produtos ou serviços";
    itemDesc = "Adicione seus primeiros itens ao catálogo para começar a vender online e no balcão.";
    itemAction = "Adicionar Itens";
  } else if (isServicesOnly) {
    itemTitle = "Cadastrar seu 1º serviço";
    itemDesc = "Defina o nome do serviço, duração média e preço para receber agendamentos e pedidos.";
    itemAction = "Adicionar Serviço";
  }

  const itemHref = ctx.sellsProducts ? "/erp/produtos?create=true" : "/erp/servicos?create=true";

  items.push({
    id: "items",
    title: itemTitle,
    description: itemDesc,
    completed: ctx.hasItems,
    href: ctx.hasItems ? undefined : itemHref,
    actionText: itemAction,
    badgeText: "⚡ 1 minuto",
    importOptions: {
      sellsProducts: ctx.sellsProducts,
      sellsServices: ctx.sellsServices,
      isQuickMode: ctx.isQuickMode,
      isErpMode: !ctx.isQuickMode,
    }
  });

  // 3. Horários de Atendimento (Especialmente importante para prestadores de serviços / atendimento local)
  if (isServicesOnly) {
    items.push({
      id: "hours",
      title: "Definir horários de atendimento",
      description: "Informe os dias e horários em que você está disponível para atender clientes.",
      completed: ctx.hasHours,
      actionText: "Ajustar Horários",
      tabTarget: "dados-do-negocio"
    });
  }

  // 4. Formas de Recebimento
  if (ctx.planSlug === "crescer" || ctx.planSlug === "escalar") {
    items.push({
      id: "payments",
      title: "Ativar recebimento online (Mercado Pago)",
      description: "Conecte sua conta para receber no Pix automático e cartão com aprovação imediata.",
      completed: ctx.hasPix || ctx.isMercadoPagoConnected,
      actionText: "Conectar Pagamento",
      badgeText: "Pix Automático",
      tabTarget: "formas-de-pagamento"
    });
  } else {
    items.push({
      id: "payments",
      title: "Definir chave Pix para recebimento",
      description: "Cadastre sua chave Pix para seus clientes transferirem direto para você.",
      completed: ctx.hasPix,
      actionText: "Definir Pix",
      tabTarget: "formas-de-pagamento"
    });
  }

  // 5. Entregas e Logística (Apenas para quem vende PRODUTOS físicos e tem plano Crescer/Escalar com endereço)
  if (ctx.sellsProducts && (ctx.planSlug === "crescer" || ctx.planSlug === "escalar") && ctx.hasAddress) {
    items.push({
      id: "logistics",
      title: "Configurar taxas de entrega",
      description: "Defina sua taxa fixa ou valor por km para o cálculo automático no checkout.",
      completed: ctx.hasDeliveryConfig,
      actionText: "Configurar Frete",
      tabTarget: "entregas"
    });
  }

  // 6. Visual da Vitrine Online & Marca
  items.push({
    id: "showcase",
    title: "Personalizar sua Vitrine Online",
    description: "Adicione sua logo e banner para deixar seu catálogo público com a cara da sua marca.",
    completed: ctx.hasLogoAndBanner,
    actionText: "Personalizar Vitrine",
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
      subtitle: "Serviços publicados no catálogo",
      icon: "WrenchIcon",
      href: "/erp/servicos"
    });
  } else {
    cards.push({
      id: "active-products",
      title: "Produtos Ativos",
      value: ctx.stats.activeProductsCount,
      subtitle: "Produtos publicados no catálogo",
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
      label: "Novo Produto",
      description: "Cadastre ou importe um produto",
      icon: "PlusIcon",
      href: "/erp/produtos?create=true"
    });
  }

  if (ctx.sellsServices) {
    shortcuts.push({
      id: "add-service",
      label: "Novo Serviço",
      description: "Cadastre um novo serviço ou procedimento",
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
      title: "Você atingiu o limite de 15 produtos!",
      description: "Para continuar cadastrando mais produtos e expandir sua vitrine, migre para o Plano Crescer.",
      type: "danger",
      actionLabel: "Fazer Upgrade",
      actionHref: "/erp/configuracoes"
    });
  }

  // Alerta de Limite do Plano Free (Vendas)
  if (ctx.planSlug === "free" && ctx.stats.monthlyOrdersCount >= 25) {
    alerts.push({
      id: "alert-orders-limit",
      title: "Limite de 25 pedidos mensais atingido!",
      description: "Seu negócio está crescendo! Faça o upgrade para continuar recebendo pedidos sem interrupções.",
      type: "danger",
      actionLabel: "Fazer Upgrade",
      actionHref: "/erp/configuracoes"
    });
  }

  // Alerta de Mercado Pago ausente se o plano for pago (Crescer/Escalar)
  if (ctx.planSlug !== "free" && !ctx.isMercadoPagoConnected) {
    alerts.push({
      id: "alert-mp-missing",
      title: "Pagamento online pendente",
      description: "Seu plano permite checkout transparente e Pix automático. Conecte sua conta do Mercado Pago para ativar.",
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
      description: "Receba pedidos e envie atualizações automáticas direto no WhatsApp dos clientes.",
      status: ctx.isWhatsAppConnected ? "connected" : "disconnected",
      actionHref: "/erp/integracoes/whatsapp"
    },
    {
      id: "mercadopago",
      name: "Mercado Pago",
      description: "Receba no Pix automático, boleto e cartão no checkout da sua vitrine.",
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
      title: "Turbine seu negócio com o Plano Crescer",
      description: "Aumente seu catálogo para 100 itens, receba no Pix automático com Mercado Pago e crie cupons de desconto para fidelizar clientes.",
      badge: "RECOMENDADO",
      actionLabel: "Conhecer Plano Crescer",
      actionHref: "/erp/configuracoes",
      variant: "upgrade"
    });
  }

  // Recomendação de Upgrade do Crescer para Escalar
  if (ctx.planSlug === "crescer") {
    recs.push({
      id: "upgrade-escalar",
      title: "Escale suas operações com o Plano Escalar",
      description: "Tenha produtos e pedidos ilimitados, fluxo de caixa avançado, DRE simplificado e gestão completa de devoluções.",
      badge: "GESTÃO COMPLETA",
      actionLabel: "Conhecer Plano Escalar",
      actionHref: "/erp/configuracoes",
      variant: "upgrade"
    });
  }

  // Dica contextual se o WhatsApp não estiver configurado
  if (!ctx.isWhatsAppConnected) {
    recs.push({
      id: "connect-whatsapp-tip",
      title: "Venda mais com o WhatsApp",
      description: "Conecte seu WhatsApp para responder clientes em 1 clique e enviar status dos pedidos automaticamente.",
      actionLabel: "Conectar Agora",
      actionHref: "/erp/integracoes/whatsapp",
      variant: "tip"
    });
  }

  return recs;
}

