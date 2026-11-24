import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import {
  getMpPlatformAccessToken,
  getMpSubscriptionStatus,
  cancelMpPreapproval,
} from "@/lib/services/mercadopago/subscriptions"
import { SecureLogger } from "@/lib/secure-logger"

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
    price: 4.99,
    imageSrc: "https://img.dudit.com.br/static/addons/RecoverCart.png",
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
    price: 4.99,
    imageSrc: "https://img.dudit.com.br/static/addons/OrderBump.png",
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
    price: 4.99,
    imageSrc: "https://img.dudit.com.br/static/addons/OrderBump.png",
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
    price: 4.99,
    imageSrc: "https://img.dudit.com.br/static/addons/OrderBump.png",
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

export type AddonSubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "paused"
  | "cancelled"
  | "past_due"

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
  hasAccess: boolean // true se plano Escalar ou assinatura paga ativa/vigente
  subscriptionStatus: AddonSubscriptionStatus
  mpPreapprovalId?: string | null
  mpInitPoint?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
  planSlug: string
  updatedAt?: string
}

interface StoredAddonRecord {
  is_enabled?: boolean
  subscription_status?: AddonSubscriptionStatus
  mp_preapproval_id?: string | null
  mp_init_point?: string | null
  billing_email?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  cancelled_at?: string | null
  settings?: Record<string, unknown>
  updated_at?: string | null
}

const VALID_ADDON_SLUGS = new Set<string>([
  "cart_abandonment",
  "order_bump",
  "service_return",
  "customer_birthday",
])

export function isValidAddonSlug(slug: string): slug is AddonSlug {
  return VALID_ADDON_SLUGS.has(slug)
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function buildAddonBundleReason(slugs: AddonSlug[]): string {
  if (slugs.length === 1) {
    return `Dudit - ${ADDON_REGISTRY[slugs[0]].name}`.slice(0, 60)
  }
  return `Dudit - Aplicativos (${slugs.length} ativos)`.slice(0, 60)
}

async function updateMpAddonBundleAmount(
  mpPreapprovalId: string,
  amount: number,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  if (!mpPreapprovalId || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Parâmetros inválidos para atualizar assinatura." }
  }

  try {
    const accessToken = await getMpPlatformAccessToken()
    const response = await fetch(`https://api.mercadopago.com/preapproval/${mpPreapprovalId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reason: reason.slice(0, 60),
        auto_recurring: {
          transaction_amount: roundCurrency(amount),
          currency_id: "BRL",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      SecureLogger.error("[addon.service] MP bundle preapproval amount update failed", {
        mpPreapprovalId,
        amount,
        status: response.status,
        providerError: errorData?.error || errorData?.message || null,
      })
      return { success: false, error: `MP ${response.status}` }
    }

    return { success: true }
  } catch (err: any) {
    SecureLogger.error("[addon.service] MP bundle preapproval update network error", {
      mpPreapprovalId,
      amount,
      error: err?.message || "Unknown",
    })
    return { success: false, error: err?.message || "Unknown" }
  }
}

async function getAllPartnerAddonRows(
  partnerId: string,
): Promise<Array<StoredAddonRecord & { addon_slug: AddonSlug }>> {
  const admin = getAdminClient()
  try {
    const { data: rows, error } = await admin
      .from("partner_addons")
      .select(
        "addon_slug, is_enabled, subscription_status, mp_preapproval_id, mp_init_point, billing_email, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, settings, updated_at",
      )
      .eq("partner_id", partnerId)

    if (!error && rows) {
      return rows.filter((r: any) => isValidAddonSlug(r.addon_slug)) as Array<
        StoredAddonRecord & { addon_slug: AddonSlug }
      >
    }
  } catch {
    // ignore
  }
  return []
}

function hasPaidAddonAccess(record: StoredAddonRecord | null): boolean {
  if (!record) return false
  const status = record.subscription_status || "none"
  const nowMs = Date.now()
  const periodEndMs = record.current_period_end ? new Date(record.current_period_end).getTime() : null

  if (status === "active") {
    // Se tiver data de fim de período, tolera até 3 dias de carência (grace period)
    if (periodEndMs && Number.isFinite(periodEndMs)) {
      const graceMs = 3 * 24 * 60 * 60 * 1000
      return nowMs <= periodEndMs + graceMs
    }
    return true
  }

  // Assinatura cancelada mas ainda dentro do período já pago
  if (status === "cancelled" && periodEndMs && Number.isFinite(periodEndMs)) {
    return nowMs <= periodEndMs
  }

  return false
}

async function getPartnerAddonRecord(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<StoredAddonRecord | null> {
  const admin = getAdminClient()

  // 1. Tentar ler da tabela partner_addons
  try {
    const { data: row, error } = await admin
      .from("partner_addons")
      .select(
        "is_enabled, subscription_status, mp_preapproval_id, mp_init_point, billing_email, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, settings, updated_at",
      )
      .eq("partner_id", partnerId)
      .eq("addon_slug", addonSlug)
      .maybeSingle()

    if (!error && row) {
      return row as StoredAddonRecord
    }
  } catch {
    // Fallback para JSONB caso a tabela/colunas ainda estejam sendo migradas
  }

  // 2. Fallback: partners.business_info->'addons'
  try {
    const { data: partner } = await admin
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .maybeSingle()

    const addonsConfig = partner?.business_info?.addons
    if (addonsConfig && typeof addonsConfig === "object" && addonSlug in addonsConfig) {
      const raw = addonsConfig[addonSlug] || {}
      return {
        is_enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
        subscription_status: (raw.subscription_status as AddonSubscriptionStatus) || "none",
        mp_preapproval_id: raw.mp_preapproval_id ?? null,
        mp_init_point: raw.mp_init_point ?? null,
        billing_email: raw.billing_email ?? null,
        current_period_start: raw.current_period_start ?? null,
        current_period_end: raw.current_period_end ?? null,
        cancel_at_period_end: Boolean(raw.cancel_at_period_end),
        cancelled_at: raw.cancelled_at ?? null,
        updated_at: raw.updated_at ?? null,
      }
    }
  } catch {
    // ignore
  }

  return null
}

async function persistPartnerAddonRecord(
  partnerId: string,
  addonSlug: AddonSlug,
  patch: Partial<StoredAddonRecord>,
): Promise<void> {
  const admin = getAdminClient()
  const now = new Date().toISOString()
  const existing = await getPartnerAddonRecord(partnerId, addonSlug)

  const merged: StoredAddonRecord = {
    is_enabled: patch.is_enabled !== undefined ? patch.is_enabled : (existing?.is_enabled ?? false),
    subscription_status:
      patch.subscription_status !== undefined
        ? patch.subscription_status
        : (existing?.subscription_status ?? "none"),
    mp_preapproval_id:
      patch.mp_preapproval_id !== undefined
        ? patch.mp_preapproval_id
        : (existing?.mp_preapproval_id ?? null),
    mp_init_point:
      patch.mp_init_point !== undefined ? patch.mp_init_point : (existing?.mp_init_point ?? null),
    billing_email:
      patch.billing_email !== undefined ? patch.billing_email : (existing?.billing_email ?? null),
    current_period_start:
      patch.current_period_start !== undefined
        ? patch.current_period_start
        : (existing?.current_period_start ?? null),
    current_period_end:
      patch.current_period_end !== undefined
        ? patch.current_period_end
        : (existing?.current_period_end ?? null),
    cancel_at_period_end:
      patch.cancel_at_period_end !== undefined
        ? patch.cancel_at_period_end
        : (existing?.cancel_at_period_end ?? false),
    cancelled_at:
      patch.cancelled_at !== undefined ? patch.cancelled_at : (existing?.cancelled_at ?? null),
    settings: patch.settings !== undefined ? patch.settings : (existing?.settings ?? {}),
    updated_at: now,
  }

  // 1. Tentar salvar em partner_addons
  try {
    const { error } = await admin.from("partner_addons").upsert(
      {
        partner_id: partnerId,
        addon_slug: addonSlug,
        is_enabled: Boolean(merged.is_enabled),
        subscription_status: merged.subscription_status || "none",
        mp_preapproval_id: merged.mp_preapproval_id,
        mp_init_point: merged.mp_init_point,
        billing_email: merged.billing_email,
        current_period_start: merged.current_period_start,
        current_period_end: merged.current_period_end,
        cancel_at_period_end: Boolean(merged.cancel_at_period_end),
        cancelled_at: merged.cancelled_at,
        settings: merged.settings || {},
        updated_at: now,
      },
      { onConflict: "partner_id, addon_slug" },
    )
    if (error) {
      console.warn("[addon.service] Aviso ao upsert na tabela partner_addons:", error.message)
    }
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
    ...(currentAddons[addonSlug] || {}),
    enabled: Boolean(merged.is_enabled),
    subscription_status: merged.subscription_status || "none",
    mp_preapproval_id: merged.mp_preapproval_id,
    mp_init_point: merged.mp_init_point,
    billing_email: merged.billing_email,
    current_period_start: merged.current_period_start,
    current_period_end: merged.current_period_end,
    cancel_at_period_end: Boolean(merged.cancel_at_period_end),
    cancelled_at: merged.cancelled_at,
    updated_at: now,
    ...(patch.settings || {}),
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
}

/**
 * Verifica se um Add-on específico está ativo para o parceiro.
 * Exige plano "escalar" OU assinatura paga ativa do aplicativo.
 */
export async function checkIsAddonActive(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<boolean> {
  try {
    let isEscalar = false
    try {
      const plan = await getPartnerPlan(partnerId)
      isEscalar = plan?.slug === "escalar"
    } catch {
      // Ignora erro ao resolver plano
    }

    const record = await getPartnerAddonRecord(partnerId, addonSlug)
    const hasAccess = isEscalar || hasPaidAddonAccess(record)

    // Sem acesso (nem Escalar nem assinatura paga ativa) -> nunca executa
    if (!hasAccess) {
      return false
    }

    if (record && typeof record.is_enabled === "boolean") {
      return record.is_enabled
    }

    // Se é Escalar e nunca foi explicitamente desativado, é ativo por padrão
    return isEscalar
  } catch (err) {
    console.error(`[addon.service] Erro ao verificar addon ${addonSlug}:`, err)
    return false
  }
}

/**
 * Ativa ou desativa um Add-on para o parceiro.
 * Bloqueia ativação se o parceiro não estiver no plano Escalar e não possuir assinatura paga ativa.
 */
export async function setPartnerAddonStatus(
  partnerId: string,
  addonSlug: AddonSlug,
  isEnabled: boolean,
  settings: Record<string, unknown> = {},
): Promise<{ success: boolean; requiresPayment?: boolean; error?: string }> {
  try {
    if (isEnabled) {
      let isEscalar = false
      try {
        const plan = await getPartnerPlan(partnerId)
        isEscalar = plan?.slug === "escalar"
      } catch {
        // ignore
      }

      if (!isEscalar) {
        const record = await getPartnerAddonRecord(partnerId, addonSlug)
        if (!hasPaidAddonAccess(record)) {
          return {
            success: false,
            requiresPayment: true,
            error: "Para ativar este aplicativo, assine o adicional ou faça upgrade para o plano Escalar.",
          }
        }
      }
    }

    await persistPartnerAddonRecord(partnerId, addonSlug, {
      is_enabled: isEnabled,
      ...(Object.keys(settings).length > 0 ? { settings } : {}),
    })

    return { success: true }
  } catch (err: any) {
    console.error(`[addon.service] Erro ao atualizar status do addon ${addonSlug}:`, err)
    return { success: false, error: err.message || "Erro ao salvar status do aplicativo" }
  }
}

/**
 * Cria ou expande a assinatura mensal consolidada de Add-ons (Mercado Pago Preapproval).
 *
 * - 1º aplicativo: cria 1 único Preapproval no MP (R$ 4,99/mês).
 * - 2º+ aplicativo: atualiza o mesmo Preapproval via PUT somando +R$ 4,99/mês,
 *   liberando o uso na hora e cobrando o total unificado na próxima fatura.
 */
export async function createAddonMpSubscription(
  partnerId: string,
  addonSlug: AddonSlug,
  payerEmail: string,
): Promise<{
  success: boolean
  initPoint?: string
  mpPreapprovalId?: string
  alreadyIncluded?: boolean
  alreadyActive?: boolean
  addedToExistingBundle?: boolean
  newMonthlyTotal?: number
  error?: string
}> {
  if (!isValidAddonSlug(addonSlug)) {
    return { success: false, error: "Aplicativo inválido." }
  }

  const addon = ADDON_REGISTRY[addonSlug]

  try {
    // 1. Verificar se já está incluso no plano Escalar
    try {
      const plan = await getPartnerPlan(partnerId)
      if (plan?.slug === "escalar") {
        await persistPartnerAddonRecord(partnerId, addonSlug, { is_enabled: true })
        return { success: true, alreadyIncluded: true }
      }
    } catch {
      // ignore
    }

    // 2. Verificar se já tem assinatura ativa (não cancelada) deste add-on
    const existing = await getPartnerAddonRecord(partnerId, addonSlug)
    if (
      existing?.subscription_status === "active" &&
      !existing.cancel_at_period_end &&
      hasPaidAddonAccess(existing)
    ) {
      await persistPartnerAddonRecord(partnerId, addonSlug, { is_enabled: true })
      return { success: true, alreadyActive: true }
    }

    // 3. Verificar se já existe uma assinatura consolidada ativa de outros add-ons
    const allRows = await getAllPartnerAddonRows(partnerId)
    const activeBundleRows = allRows.filter(
      (r) =>
        r.subscription_status === "active" &&
        !r.cancel_at_period_end &&
        typeof r.mp_preapproval_id === "string" &&
        r.mp_preapproval_id.trim().length > 0 &&
        hasPaidAddonAccess(r),
    )

    if (activeBundleRows.length > 0) {
      const donor = activeBundleRows[0]
      const sharedPreapprovalId = donor.mp_preapproval_id!

      // Collect all active slugs on this shared preapproval + the new slug
      const bundleSlugs = Array.from(
        new Set<AddonSlug>([
          ...activeBundleRows
            .filter((r) => r.mp_preapproval_id === sharedPreapprovalId)
            .map((r) => r.addon_slug),
          addonSlug,
        ]),
      )

      const newTotal = roundCurrency(
        bundleSlugs.reduce((sum, slug) => sum + ADDON_REGISTRY[slug].price, 0),
      )

      const updateRes = await updateMpAddonBundleAmount(
        sharedPreapprovalId,
        newTotal,
        buildAddonBundleReason(bundleSlugs),
      )

      if (!updateRes.success) {
        return {
          success: false,
          error: "Não foi possível atualizar sua assinatura de aplicativos no Mercado Pago. Tente novamente.",
        }
      }

      const now = new Date()
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      await persistPartnerAddonRecord(partnerId, addonSlug, {
        is_enabled: true,
        subscription_status: "active",
        mp_preapproval_id: sharedPreapprovalId,
        mp_init_point: null,
        billing_email: donor.billing_email || payerEmail,
        current_period_start: donor.current_period_start || now.toISOString(),
        current_period_end: donor.current_period_end || nextMonth.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
      })

      return {
        success: true,
        addedToExistingBundle: true,
        mpPreapprovalId: sharedPreapprovalId,
        newMonthlyTotal: newTotal,
      }
    }

    // 4. Cancelar preapprovals pendentes anteriores (abandonados) para não acumular cobranças
    const pendingPreapprovalIds = Array.from(
      new Set(
        allRows
          .filter((r) => r.subscription_status === "pending" && r.mp_preapproval_id)
          .map((r) => r.mp_preapproval_id!),
      ),
    )
    for (const staleId of pendingPreapprovalIds) {
      await cancelMpPreapproval(staleId).catch(() => {})
    }

    // 5. Criar 1 único preapproval consolidado no Mercado Pago (1º add-on)
    const accessToken = await getMpPlatformAccessToken()
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br").replace(/\/$/, "")
    const backUrl = `${appUrl}/erp/configuracoes?tab=integracoes&section=aplicativos&addon_checkout=${addonSlug}`

    const mpPayload = {
      reason: buildAddonBundleReason([addonSlug]),
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: addon.price,
        currency_id: "BRL",
      },
      payer_email: payerEmail,
      back_url: backUrl,
      external_reference: `addon_bundle:${partnerId}`,
    }

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(mpPayload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      SecureLogger.error("[addon.service] MP preapproval creation failed", {
        status: response.status,
        partnerId,
        addonSlug,
        providerError: errorData?.error || errorData?.message || null,
      })
      return {
        success: false,
        error: "Não foi possível iniciar o checkout no Mercado Pago. Tente novamente.",
      }
    }

    const mpData = (await response.json()) as {
      id: string
      status: string
      init_point: string
    }

    if (!mpData?.id || !mpData?.init_point) {
      return { success: false, error: "Resposta inválida do Mercado Pago ao criar assinatura." }
    }

    await persistPartnerAddonRecord(partnerId, addonSlug, {
      is_enabled: false,
      subscription_status: "pending",
      mp_preapproval_id: mpData.id,
      mp_init_point: mpData.init_point,
      billing_email: payerEmail,
      cancel_at_period_end: false,
      cancelled_at: null,
    })

    return {
      success: true,
      initPoint: mpData.init_point,
      mpPreapprovalId: mpData.id,
    }
  } catch (err: any) {
    SecureLogger.error("[addon.service] createAddonMpSubscription error", {
      partnerId,
      addonSlug,
      error: err?.message,
    })
    return { success: false, error: "Erro interno ao iniciar assinatura do aplicativo." }
  }
}

/**
 * Sincroniza o estado da assinatura de Add-ons (consolidada ou legada individual)
 * a partir de um evento do Mercado Pago (`subscription_preapproval` /
 * `subscription_authorized_payment` ou retorno de checkout).
 * Também registra a fatura/pagamento no módulo de billing quando há cobrança real.
 * Retorna `true` se o recurso pertencia a Add-ons.
 */
export async function syncAddonSubscriptionFromMp(params: {
  mpPreapprovalId?: string | null
  externalReference?: string | null
  mpStatus?: string | null
  authorizedPaymentData?: any
}): Promise<boolean> {
  const admin = getAdminClient()
  const preapprovalId = params.mpPreapprovalId ? String(params.mpPreapprovalId) : null
  const extRef = params.externalReference ? String(params.externalReference) : null

  let partnerId: string | null = null
  let targetSlugs: AddonSlug[] = []

  // 1. Parse de external_reference:
  //    - Novo formato consolidado: "addon_bundle:<partnerId>"
  //    - Formato legado individual: "addon:<partnerId>:<addonSlug>"
  if (extRef && extRef.startsWith("addon_bundle:")) {
    const parts = extRef.split(":")
    if (parts.length >= 2 && parts[1]) {
      partnerId = parts[1]
    }
  } else if (extRef && extRef.startsWith("addon:")) {
    const parts = extRef.split(":")
    if (parts.length === 3 && isValidAddonSlug(parts[2])) {
      partnerId = parts[1]
      targetSlugs = [parts[2]]
    }
  }

  // 2. Procurar em partner_addons por mp_preapproval_id (cobre bundle multi-addon e fallback)
  if (preapprovalId) {
    try {
      const { data: rows } = await admin
        .from("partner_addons")
        .select("partner_id, addon_slug")
        .eq("mp_preapproval_id", preapprovalId)

      if (rows && rows.length > 0) {
        if (!partnerId) partnerId = rows[0].partner_id
        const matchedSlugs = rows
          .map((r: any) => r.addon_slug)
          .filter((s: string): s is AddonSlug => isValidAddonSlug(s))
        if (matchedSlugs.length > 0) {
          targetSlugs = Array.from(new Set([...targetSlugs, ...matchedSlugs]))
        }
      }
    } catch {
      // ignore
    }
  }

  if (!partnerId || targetSlugs.length === 0) {
    // Recognized bundle external_reference but already detached (e.g. upgraded to Escalar)
    if (extRef?.startsWith("addon_bundle:")) {
      return true
    }
    return false
  }

  const normalizedStatus = String(params.mpStatus || "").toLowerCase()
  const now = new Date()
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  let anyUpdated = false
  let earliestPeriodStart: Date | null = null

  for (const addonSlug of targetSlugs) {
    const existing = await getPartnerAddonRecord(partnerId, addonSlug)

    // Ignore late "cancelled" webhooks from a preapproval that was already detached
    // or replaced (e.g. cancelled automatically when upgrading to the Escalar plan
    // or detached when another add-on remains active on the bundle).
    if (
      normalizedStatus === "cancelled" &&
      preapprovalId &&
      existing?.mp_preapproval_id !== preapprovalId
    ) {
      continue
    }

    if (existing?.current_period_start) {
      const d = new Date(existing.current_period_start)
      if (!isNaN(d.getTime()) && (!earliestPeriodStart || d < earliestPeriodStart)) {
        earliestPeriodStart = d
      }
    }

    const patch: Partial<StoredAddonRecord> = {
      ...(preapprovalId ? { mp_preapproval_id: preapprovalId } : {}),
    }

    if (["authorized", "approved", "processed"].includes(normalizedStatus)) {
      patch.subscription_status = "active"
      patch.is_enabled = true
      patch.mp_init_point = null
      patch.cancel_at_period_end = false
      patch.cancelled_at = null
      patch.current_period_start = now.toISOString()
      patch.current_period_end = nextMonth.toISOString()
    } else if (normalizedStatus === "pending" || normalizedStatus === "waiting_for_gateway") {
      if (existing?.subscription_status !== "active") {
        patch.subscription_status = "pending"
      }
    } else if (normalizedStatus === "paused") {
      patch.subscription_status = "paused"
      patch.is_enabled = false
    } else if (normalizedStatus === "cancelled") {
      patch.subscription_status = "cancelled"
      patch.cancel_at_period_end = true
      patch.cancelled_at = now.toISOString()
      patch.mp_init_point = null
      const periodEndMs = existing?.current_period_end
        ? new Date(existing.current_period_end).getTime()
        : 0
      if (!periodEndMs || periodEndMs <= now.getTime()) {
        patch.is_enabled = false
      }
    } else if (["rejected", "refunded", "chargeback"].includes(normalizedStatus)) {
      patch.subscription_status = "past_due"
      patch.is_enabled = false
    } else {
      continue
    }

    await persistPartnerAddonRecord(partnerId, addonSlug, patch)
    anyUpdated = true
  }

  // 3. Registrar fatura consolidada no módulo de billing quando houver cobrança real
  if (params.authorizedPaymentData && preapprovalId) {
    try {
      const { chargeFromAuthorizedPayment, authorizedPaymentCycleDate } = await import(
        "@/lib/billing/record-charge"
      )
      const { recordAddonBundleCharge } = await import("@/lib/billing/record-addon-charge")

      const charge = chargeFromAuthorizedPayment(params.authorizedPaymentData)
      const cycleDate = authorizedPaymentCycleDate(params.authorizedPaymentData)
      const addonItems = targetSlugs.map((slug) => ({
        code: slug,
        name: ADDON_REGISTRY[slug].name,
        description: "Assinatura mensal de aplicativo",
        quantity: 1,
        unit_price: ADDON_REGISTRY[slug].price,
        total: ADDON_REGISTRY[slug].price,
      }))

      await recordAddonBundleCharge({
        partnerId,
        mpPreapprovalId: preapprovalId,
        addonSlugs: targetSlugs,
        addonItems,
        charge,
        cycleStart: cycleDate,
        anchorDate: earliestPeriodStart || cycleDate,
        context: "webhook",
      })
    } catch (billErr: any) {
      SecureLogger.warn("[addon.service] Failed to record add-on bundle billing charge", {
        partnerId,
        preapprovalId,
        error: billErr?.message,
      })
    }
  }

  return anyUpdated || Boolean(preapprovalId)
}

/**
 * Consulta diretamente a API do Mercado Pago para confirmar um checkout recém-concluído.
 */
export async function verifyAndSyncAddonCheckout(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<{
  success: boolean
  status: AddonSubscriptionStatus
  isEnabled: boolean
}> {
  const record = await getPartnerAddonRecord(partnerId, addonSlug)
  if (!record?.mp_preapproval_id) {
    return {
      success: true,
      status: record?.subscription_status || "none",
      isEnabled: Boolean(record?.is_enabled),
    }
  }

  try {
    const mpData = await getMpSubscriptionStatus(record.mp_preapproval_id)
    if (mpData?.status) {
      await syncAddonSubscriptionFromMp({
        mpPreapprovalId: record.mp_preapproval_id,
        externalReference: `addon:${partnerId}:${addonSlug}`,
        mpStatus: String(mpData.status),
      })
    }
  } catch (err: any) {
    console.warn("[addon.service] Falha ao consultar status no MP:", err?.message)
  }

  const updated = await getPartnerAddonRecord(partnerId, addonSlug)
  return {
    success: true,
    status: updated?.subscription_status || "none",
    isEnabled: Boolean(updated?.is_enabled),
  }
}

/**
 * Cancela a assinatura recorrente de um Add-on no Mercado Pago.
 * Se outros aplicativos compartilharem o mesmo Preapproval consolidado,
 * apenas reduz o valor mensal no MP e mantém os demais ativos.
 * Se for o último aplicativo do Preapproval, cancela o Preapproval no MP.
 */
export async function cancelAddonMpSubscription(
  partnerId: string,
  addonSlug: AddonSlug,
): Promise<{ success: boolean; error?: string }> {
  try {
    const record = await getPartnerAddonRecord(partnerId, addonSlug)
    const now = new Date()

    if (!record?.mp_preapproval_id) {
      await persistPartnerAddonRecord(partnerId, addonSlug, {
        subscription_status: "cancelled",
        cancel_at_period_end: true,
        cancelled_at: now.toISOString(),
        is_enabled: false,
        mp_init_point: null,
      })
      return { success: true }
    }

    const preapprovalId = record.mp_preapproval_id
    const allRows = await getAllPartnerAddonRows(partnerId)
    const remainingOnSameBundle = allRows.filter(
      (r) =>
        r.addon_slug !== addonSlug &&
        r.mp_preapproval_id === preapprovalId &&
        r.subscription_status === "active" &&
        !r.cancel_at_period_end,
    )

    const periodEndMs = record.current_period_end
      ? new Date(record.current_period_end).getTime()
      : 0
    const stillHasPaidTime =
      record.subscription_status === "active" && periodEndMs > now.getTime()

    if (remainingOnSameBundle.length > 0) {
      // Outros add-ons continuam no mesmo preapproval -> apenas reduzir o valor mensal
      const remainingSlugs = remainingOnSameBundle.map((r) => r.addon_slug)
      const newTotal = roundCurrency(
        remainingSlugs.reduce((sum, slug) => sum + ADDON_REGISTRY[slug].price, 0),
      )

      const updateRes = await updateMpAddonBundleAmount(
        preapprovalId,
        newTotal,
        buildAddonBundleReason(remainingSlugs),
      )
      if (!updateRes.success) {
        return {
          success: false,
          error: "Não foi possível atualizar o valor da assinatura no Mercado Pago. Tente novamente.",
        }
      }

      // Desvincula o mp_preapproval_id apenas deste add-on cancelado para que futuras
      // renovações do bundle não reativem este item.
      await persistPartnerAddonRecord(partnerId, addonSlug, {
        subscription_status: "cancelled",
        cancel_at_period_end: true,
        cancelled_at: now.toISOString(),
        mp_preapproval_id: null,
        mp_init_point: null,
        is_enabled: stillHasPaidTime ? Boolean(record.is_enabled) : false,
      })

      return { success: true }
    }

    // Último add-on do preapproval -> cancelar o preapproval inteiro no Mercado Pago
    const cancelRes = await cancelMpPreapproval(preapprovalId)
    if (!cancelRes.success) {
      console.warn("[addon.service] Falha ao cancelar preapproval no MP:", cancelRes.error)
    }

    await persistPartnerAddonRecord(partnerId, addonSlug, {
      subscription_status: "cancelled",
      cancel_at_period_end: true,
      cancelled_at: now.toISOString(),
      mp_preapproval_id: null,
      mp_init_point: null,
      is_enabled: stillHasPaidTime ? Boolean(record.is_enabled) : false,
    })

    return { success: true }
  } catch (err: any) {
    console.error(`[addon.service] Erro ao cancelar assinatura do addon ${addonSlug}:`, err)
    return { success: false, error: err.message || "Erro ao cancelar assinatura do aplicativo." }
  }
}

/**
 * Cancela imediatamente todas as assinaturas pagas/pendentes de add-ons de um parceiro
 * no Mercado Pago quando ele passa a ter cobertura inclusa pelo plano (ex: upgrade para Escalar).
 * Mantém os add-ons já habilitados ativos para não interromper o uso do parceiro.
 */
export async function cancelPartnerAddonSubscriptionsForPlanInclusion(
  partnerId: string,
): Promise<{ cancelledCount: number; cancelledPreapprovalIds: string[] }> {
  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  try {
    const { data: rows, error } = await admin
      .from("partner_addons")
      .select("addon_slug, is_enabled, subscription_status, mp_preapproval_id")
      .eq("partner_id", partnerId)
      .or("mp_preapproval_id.not.is.null,subscription_status.in.(active,pending,paused,past_due)")

    if (error) {
      SecureLogger.warn("[addon.service] Failed to query partner_addons for Escalar cancellation", {
        partnerId,
        error: error.message,
      })
      return { cancelledCount: 0, cancelledPreapprovalIds: [] }
    }

    const activeRows = (rows || []).filter((r: any) => isValidAddonSlug(r.addon_slug))
    if (activeRows.length === 0) {
      return { cancelledCount: 0, cancelledPreapprovalIds: [] }
    }

    // Deduplicate preapproval IDs so shared/consolidated preapprovals are cancelled once.
    const uniquePreapprovalIds: string[] = Array.from(
      new Set<string>(
        activeRows
          .map((r: any) => r.mp_preapproval_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0),
      ),
    )

    // Detach local billing records first so any immediate MP "cancelled" webhook echo
    // sees mp_preapproval_id === null and does not disable the Escalar-included add-on.
    for (const row of activeRows as Array<{
      addon_slug: AddonSlug
      is_enabled?: boolean
      subscription_status?: AddonSubscriptionStatus
    }>) {
      await persistPartnerAddonRecord(partnerId, row.addon_slug, {
        subscription_status: "none",
        mp_preapproval_id: null,
        mp_init_point: null,
        cancel_at_period_end: false,
        cancelled_at: nowIso,
        current_period_start: null,
        current_period_end: null,
        is_enabled: typeof row.is_enabled === "boolean" ? row.is_enabled : true,
      })
    }

    const cancelledPreapprovalIds: string[] = []
    for (const preapprovalId of uniquePreapprovalIds) {
      const res = await cancelMpPreapproval(preapprovalId).catch((err: any) => ({
        success: false,
        error: err?.message || "Unknown error",
      }))
      if (res.success) {
        cancelledPreapprovalIds.push(preapprovalId)
      } else {
        SecureLogger.warn("[addon.service] Failed to cancel addon preapproval on Escalar upgrade", {
          partnerId,
          preapprovalId,
          error: res.error,
        })
      }
    }

    SecureLogger.info("[addon.service] Cancelled standalone addon subscriptions after Escalar activation", {
      partnerId,
      addonsUpdated: activeRows.length,
      mpPreapprovalsCancelled: cancelledPreapprovalIds.length,
    })

    return {
      cancelledCount: activeRows.length,
      cancelledPreapprovalIds,
    }
  } catch (err: any) {
    SecureLogger.error("[addon.service] Error cancelling addon subscriptions for plan inclusion", {
      partnerId,
      error: err?.message || "Unknown error",
    })
    return { cancelledCount: 0, cancelledPreapprovalIds: [] }
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
    const record = await getPartnerAddonRecord(partnerId, slug)
    const hasAccess = isEscalar || hasPaidAddonAccess(record)
    const isEnabled = hasAccess
      ? record && typeof record.is_enabled === "boolean"
        ? record.is_enabled
        : isEscalar
      : false

    results.push({
      ...def,
      isEnabled,
      isIncludedInPlan: isEscalar,
      hasAccess,
      subscriptionStatus: record?.subscription_status || "none",
      mpPreapprovalId: record?.mp_preapproval_id ?? null,
      mpInitPoint: record?.subscription_status === "pending" ? (record?.mp_init_point ?? null) : null,
      currentPeriodEnd: record?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(record?.cancel_at_period_end),
      planSlug,
      updatedAt: record?.updated_at ?? undefined,
    })
  }

  return results
}
