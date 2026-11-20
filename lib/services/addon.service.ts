import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export type AddonSlug =
  | "cart_abandonment"
  | "order_bump"
  | "service_return"
  | "customer_birthday"

export interface AddonDefinition {
  slug: AddonSlug
  name: string
  shortDescription: string
  fullDescription: string
  price: number // Preço mensal em R$
  imageSrc: string
  category: "vendas" | "retencao" | "fidelizacao"
  features: string[]
  metricsLabels: {
    sentLabel: string
    clickedLabel: string
    conversionLabel: string
    revenueLabel: string
  }
}

export const ADDON_REGISTRY: Record<AddonSlug, AddonDefinition> = {
  cart_abandonment: {
    slug: "cart_abandonment",
    name: "Recuperador de Carrinho",
    shortDescription: "Recupere até 25% dos carrinhos abandonados com lembretes inteligentes automáticos.",
    fullDescription:
      "Quando um cliente adiciona produtos na sacola mas não conclui a compra em até 4 horas, o robô da Dudit envia uma notificação personalizada relembrando os itens e facilitando a finalização em 1 clique.",
    price: 14.9,
    imageSrc: "https://img.dudit.com.br/static/mascots/SacolaVazia.png",
    category: "vendas",
    features: [
      "Detecção automática de sacolas paradas após 4 horas",
      "Disparo inteligente com cooldown de 24h para não incomodar o cliente",
      "Link direto para finalizar a compra com os itens já salvos",
      "Métricas de vendas recuperadas e conversão em tempo real",
    ],
    metricsLabels: {
      sentLabel: "Carrinhos Notificados",
      clickedLabel: "Cliques no Link",
      conversionLabel: "Vendas Concluídas",
      revenueLabel: "Faturamento Recuperado",
    },
  },
  order_bump: {
    slug: "order_bump",
    name: "Aproveite e Leve Junto (Order Bump)",
    shortDescription: "Aumente seu ticket médio oferecendo produtos complementares na tela de pagamento.",
    fullDescription:
      "Exiba um produto complementar com 1 clique de adição no momento em que o cliente já está com a carteira na mão pronto para pagar na sua vitrine.",
    price: 9.9,
    imageSrc: "https://img.dudit.com.br/static/mascots/Vitrine.png",
    category: "vendas",
    features: [
      "Oferta nativa e discreta no checkout da sua vitrine",
      "Adição com 1 toque sem sair da tela de pagamento",
      "Filtro inteligente que só exibe itens disponíveis em estoque",
      "Aumento imediato do valor médio de cada venda",
    ],
    metricsLabels: {
      sentLabel: "Ofertas Exibidas no Checkout",
      clickedLabel: "Cliques de Adição",
      conversionLabel: "Pedidos com Compre Junto",
      revenueLabel: "Faturamento Extra Gerado",
    },
  },
  service_return: {
    slug: "service_return",
    name: "Lembrete de Retorno (Recall)",
    shortDescription: "Traga seus clientes de volta na data certa do retorno de procedimentos e serviços.",
    fullDescription:
      "Defina o intervalo recomendado de retorno para cada serviço (ex: corte de cabelo a cada 30 dias, limpeza de pele a cada 45 dias, revisão veicular a cada 6 meses). O sistema avisa o cliente no momento exato de agendar de novo.",
    price: 14.9,
    imageSrc: "https://img.dudit.com.br/static/mascots/Agendamentos.png",
    category: "retencao",
    features: [
      "Gatilho baseado no intervalo configurado em cada serviço",
      "Notificação amigável e direta para reabrir a agenda",
      "Redução drástica do tempo entre visitas do mesmo cliente",
      "Painel de oportunidades de retenção no módulo de agendamentos",
    ],
    metricsLabels: {
      sentLabel: "Lembretes de Retorno Enviados",
      clickedLabel: "Aberturas / Interações",
      conversionLabel: "Reagendamentos Confirmados",
      revenueLabel: "Receita de Retorno Gerada",
    },
  },
  customer_birthday: {
    slug: "customer_birthday",
    name: "Aniversário com Cupom Automático",
    shortDescription: "Fidelize clientes enviando parabéns e um cupom exclusivo no dia do aniversário.",
    fullDescription:
      "Surpreenda seu cliente no dia mais especial do ano dele! O sistema identifica aniversariantes do dia e gera um cupom promocional para ele comemorar comprando de você.",
    price: 9.9,
    imageSrc: "https://img.dudit.com.br/static/mascots/Cupons.png",
    category: "fidelizacao",
    features: [
      "Identificação automática pela data de nascimento cadastrada",
      "Geração ou vínculo com cupom comemorativo especial",
      "Mensagem personalizada de parabéns com o nome do cliente",
      "Aumento da taxa de recompra e lealdade da marca",
    ],
    metricsLabels: {
      sentLabel: "Parabéns Enviados",
      clickedLabel: "Cupons Resgatados",
      conversionLabel: "Compras de Aniversário",
      revenueLabel: "Faturamento Gerado com Cupons",
    },
  },
}

export interface PartnerAddonStatus {
  slug: AddonSlug
  name: string
  shortDescription: string
  fullDescription: string
  price: number
  imageSrc: string
  category: "vendas" | "retencao" | "fidelizacao"
  features: string[]
  metricsLabels: {
    sentLabel: string
    clickedLabel: string
    conversionLabel: string
    revenueLabel: string
  }
  isEnabled: boolean
  isIncludedInPlan: boolean // se plano Escalar cobre nativamente
  planSlug: string
  updatedAt?: string
}

/**
 * Verifica se um Add-on específico está ativo para o parceiro.
 * Se o plano do parceiro for "escalar", retorna ativo por padrão (a menos que desligado manualmente).
 */
export async function checkIsAddonActive(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<boolean> {
  try {
    const admin = getAdminClient()

    // 1. Verificar plano do parceiro
    let isEscalar = false
    try {
      const plan = await getPartnerPlan(partnerId)
      isEscalar = plan?.slug === "escalar"
    } catch {
      // Ignora erro ao resolver plano
    }

    // 2. Verificar na tabela partner_addons
    try {
      const { data: row, error } = await admin
        .from("partner_addons")
        .select("is_enabled")
        .eq("partner_id", partnerId)
        .eq("addon_slug", addonSlug)
        .maybeSingle()

      if (!error && row) {
        return Boolean(row.is_enabled)
      }
    } catch {
      // Tabela pode ainda estar sendo migrada; usa fallback
    }

    // 3. Fallback: verificar em partners.business_info->'addons'
    const { data: partner } = await admin
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .maybeSingle()

    const addonsConfig = partner?.business_info?.addons
    if (addonsConfig && typeof addonsConfig === "object" && addonSlug in addonsConfig) {
      return Boolean(addonsConfig[addonSlug]?.enabled)
    }

    // Se é Escalar e nunca foi explicitamente desativado, é ativo por padrão!
    return isEscalar
  } catch (err) {
    console.error(`[addon.service] Erro ao verificar addon ${addonSlug}:`, err)
    return false
  }
}

/**
 * Ativa ou desativa um Add-on para o parceiro (atualiza partner_addons e business_info).
 */
export async function setPartnerAddonStatus(
  partnerId: string,
  addonSlug: AddonSlug,
  isEnabled: boolean,
  settings: Record<string, unknown> = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getAdminClient()
    const now = new Date().toISOString()

    // 1. Tentar salvar em partner_addons
    try {
      await admin.from("partner_addons").upsert(
        {
          partner_id: partnerId,
          addon_slug: addonSlug,
          is_enabled: isEnabled,
          settings,
          updated_at: now,
        },
        { onConflict: "partner_id, addon_slug" },
      )
    } catch (dbErr) {
      console.warn("[addon.service] Falha ao upsert na tabela partner_addons, usando fallback JSONB:", dbErr)
    }

    // 2. Sincronizar em partners.business_info->'addons'
    const { data: partner } = await admin
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .maybeSingle()

    const currentBusinessInfo = partner?.business_info || {}
    const currentAddons = currentBusinessInfo.addons || {}

    currentAddons[addonSlug] = {
      enabled: isEnabled,
      updated_at: now,
      ...settings,
    }

    await admin
      .from("partners")
      .update({
        business_info: {
          ...currentBusinessInfo,
          addons: currentAddons,
        },
      })
      .eq("id", partnerId)

    return { success: true }
  } catch (err: any) {
    console.error(`[addon.service] Erro ao atualizar status do addon ${addonSlug}:`, err)
    return { success: false, error: err.message || "Erro ao salvar status do aplicativo" }
  }
}

/**
 * Registra um evento para métricas do Add-on (envios, cliques, conversões).
 * Seguro e não bloqueante: nunca lança exceção para não quebrar fluxos principais.
 */
export async function recordAddonEvent(params: {
  partnerId: string
  addonSlug: AddonSlug
  eventType: "sent" | "viewed" | "clicked" | "converted"
  entityType?: "cart" | "order" | "appointment" | "customer" | "product"
  entityId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin.from("partner_addon_events").insert({
      partner_id: params.partnerId,
      addon_slug: params.addonSlug,
      event_type: params.eventType,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn(`[addon.service] Aviso ao registrar evento do addon ${params.addonSlug}:`, err)
  }
}

export interface AddonMetrics {
  slug: AddonSlug
  sentCount: number
  clickedCount: number
  conversionCount: number
  conversionRate: number // em porcentagem, ex: 18.5
  revenueGenerated: number // em Reais
  chartData: Array<{
    name: string
    total: number
    recente: number
  }>
  recentEvents: Array<{
    id: string
    eventType: string
    createdAt: string
    label: string
    description: string
    amount?: number
    isTest?: boolean
  }>
}

/**
 * Retorna as métricas agregadas e eventos recentes de um Add-on para o lojista.
 */
export async function getAddonMetrics(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<AddonMetrics> {
  const admin = getAdminClient()

  let sentCount = 0
  let clickedCount = 0
  let conversionCount = 0
  let revenueGenerated = 0
  let sentRecent30d = 0
  let clickedRecent30d = 0
  let conversionRecent30d = 0

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const recentEvents: AddonMetrics["recentEvents"] = []

  try {
    const { data: events, error } = await admin
      .from("partner_addon_events")
      .select("id, event_type, entity_type, entity_id, metadata, created_at")
      .eq("partner_id", partnerId)
      .eq("addon_slug", addonSlug)
      .order("created_at", { ascending: false })
      .limit(100)

    if (!error && events && events.length > 0) {
      for (const ev of events) {
        const isRecent = ev.created_at >= thirtyDaysAgo
        if (ev.event_type === "sent" || ev.event_type === "viewed") {
          sentCount++
          if (isRecent) sentRecent30d++
        } else if (ev.event_type === "clicked") {
          clickedCount++
          if (isRecent) clickedRecent30d++
        } else if (ev.event_type === "converted") {
          conversionCount++
          if (isRecent) conversionRecent30d++
          const amount = Number(ev.metadata?.amount || 0)
          if (!isNaN(amount)) revenueGenerated += amount
        }
      }

      // 15 eventos mais recentes formatados
      for (const ev of events.slice(0, 15)) {
        const meta = ev.metadata || {}
        let label = "Disparo realizado"
        let description = "Evento registrado pelo sistema"

        if (addonSlug === "cart_abandonment") {
          label = ev.event_type === "sent" ? "Lembrete enviado" : ev.event_type === "converted" ? "Venda recuperada" : "Cliente acessou carrinho"
          description = meta.customerName ? `Cliente: ${meta.customerName} (${meta.itemCount || 1} itens)` : `Sacola com ${meta.itemCount || 1} itens`
        } else if (addonSlug === "order_bump") {
          label = ev.event_type === "clicked" ? "Item adicionado" : ev.event_type === "converted" ? "Venda com item extra" : "Oferta exibida"
          description = meta.productName ? `Produto: ${meta.productName}` : "Oferta no checkout"
        } else if (addonSlug === "service_return") {
          label = ev.event_type === "sent" ? "Aviso de retorno enviado" : "Reagendamento confirmado"
          description = meta.serviceName ? `Serviço: ${meta.serviceName}` : "Retorno de atendimento"
        } else if (addonSlug === "customer_birthday") {
          label = ev.event_type === "sent" ? "Cupom de parabéns enviado" : "Cupom resgatado em compra"
          description = meta.customerName ? `Aniversariante: ${meta.customerName} (Cupom: ${meta.couponCode || "ANIVER"})` : "Cupom comemorativo"
        }

        recentEvents.push({
          id: ev.id,
          eventType: ev.event_type,
          createdAt: ev.created_at,
          label,
          description,
          amount: meta.amount ? Number(meta.amount) : undefined,
          isTest: Boolean(meta.isTest),
        })
      }
    }
  } catch (err) {
    console.warn(`[addon.service] Aviso ao ler métricas do addon ${addonSlug}:`, err)
  }

  const rawRate = sentCount > 0 ? (conversionCount / sentCount) * 100 : (clickedCount > 0 ? (conversionCount / clickedCount) * 100 : 0)
  const conversionRate = Math.min(100, Number(rawRate.toFixed(1)))

  const chartData = [
    {
      name: "Disparos",
      total: sentCount,
      recente: sentRecent30d,
    },
    {
      name: "Interações",
      total: clickedCount,
      recente: clickedRecent30d,
    },
    {
      name: "Conversões",
      total: conversionCount,
      recente: conversionRecent30d,
    },
  ]

  return {
    slug: addonSlug,
    sentCount,
    clickedCount,
    conversionCount,
    conversionRate,
    revenueGenerated,
    chartData,
    recentEvents,
  }
}

/**
 * Obtém todos os Add-ons cadastrados com o status para o parceiro informado.
 */
export async function getAllPartnerAddons(
  partnerId: string,
): Promise<PartnerAddonStatus[]> {
  let planSlug = "free"
  try {
    const plan = await getPartnerPlan(partnerId)
    planSlug = plan?.slug || "free"
  } catch {
    // fallback
  }

  const isEscalar = planSlug === "escalar"
  const slugs: AddonSlug[] = ["cart_abandonment", "order_bump", "service_return", "customer_birthday"]

  const results: PartnerAddonStatus[] = []

  for (const slug of slugs) {
    const def = ADDON_REGISTRY[slug]
    const isEnabled = await checkIsAddonActive(partnerId, slug)

    results.push({
      ...def,
      isEnabled,
      isIncludedInPlan: isEscalar,
      planSlug,
    })
  }

  return results
}
