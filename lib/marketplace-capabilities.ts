import "server-only"

import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkLimit, getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { resolveActiveResources, type SystemResourceId } from "@/lib/system-resources"

export type MarketplaceOrderFlow = "whatsapp" | "dudit"

export interface MarketplaceCapabilities {
  partnerId: string
  planSlug: string
  /** Fluxo configurado pelo vendedor, antes de considerar os recursos. */
  baseOrderFlow: MarketplaceOrderFlow
  /** Checkout de pedidos pode ser concluído pela Dudit? */
  checkoutViaDudit: boolean
  /** Checkout liberado AGORA (fluxo + recurso + cota mensal do plano). */
  checkoutOpen: boolean
  /** Orçamentos podem ser pedidos pela Dudit? */
  quotesViaDudit: boolean
  /** Orçamento liberado AGORA (fluxo + recurso + cota mensal do plano). */
  quotesOpen: boolean
  returnsViaDudit: boolean
  appointmentsViaDudit: boolean
  /** Agendamento liberado AGORA (fluxo + recurso + cota mensal do plano). */
  appointmentsOpen: boolean
  /** Mercado Pago pode ser oferecido no checkout? (feature do plano) */
  mercadoPagoEnabled: boolean
  /** Cota mensal de pedidos esgotada — a loja atende pelo WhatsApp. */
  ordersLimitReached: boolean
  /** Cota mensal de orçamentos esgotada. */
  quotesLimitReached: boolean
  /** Cota mensal de agendamentos esgotada. */
  appointmentsLimitReached: boolean
  deliveriesEnabled: boolean
  couponsEnabled: boolean
  campaignsEnabled: boolean
  /** Venda nova de assinatura pode ser concluída pela Dudit? */
  recurringEnabled: boolean
  recurringPlansEnabled: boolean
  recurringSubscriptionsEnabled: boolean
  productsEnabled: boolean
  servicesEnabled: boolean
  whatsappPhone: string | null
  activeResources: SystemResourceId[]
  reasons: string[]
}

export interface MarketplaceCapabilitiesOptions {
  storeId?: string | null
}

function resolveBaseOrderFlow(
  explicitFlow: unknown,
  businessInfo: { mode?: unknown },
): MarketplaceOrderFlow {
  if (explicitFlow === "whatsapp" || explicitFlow === "dudit") {
    return explicitFlow
  }
  const mode = String(businessInfo?.mode || "").toLowerCase().trim()
  return mode === "quick" || mode === "showcase" ? "whatsapp" : "dudit"
}

function normalizePhone(value: unknown): string | null {
  const phone = typeof value === "string" ? value.replace(/\D/g, "") : ""
  return phone.length > 0 ? phone : null
}

/**
 * A cota mensal do plano já foi consumida?
 *
 * Fail-open de propósito: se a leitura das cotas falhar, a vitrine continua
 * aberta e o `checkoutCartAction` (fonte autoritativa) ainda bloqueia no
 * momento de fechar o pedido. Falhar fechado aqui derrubaria vendas por um
 * erro transitório de leitura.
 */
async function isMonthlyLimitReached(partnerId: string, limitName: string): Promise<boolean> {
  try {
    const result = await checkLimit(partnerId, limitName)
    return !result.allowed
  } catch (error: any) {
    console.warn(`[MARKETPLACE_CAPS] checkLimit(${limitName}) failed:`, error?.message)
    return false
  }
}

/**
 * Resolves the marketplace capabilities of a partner.
 *
 * This is the single source of truth for "can this partner complete X through
 * Dudit?". It combines:
 *  - the explicit `partners.order_flow` (or the mode-based fallback)
 *  - the partner plan
 *  - `partners.business_info.activeResources`
 *
 * ERP route gating only decides which menus appear. Marketplace actions must
 * always call this resolver on the server, because a client can call actions
 * and payment routes directly.
 */
export const resolveMarketplaceCapabilities = cache(
  async (
    partnerId: string,
    options?: MarketplaceCapabilitiesOptions,
  ): Promise<MarketplaceCapabilities> => {
    const admin = getAdminClient()
    const storeId = options?.storeId || null

    const [{ data: partner }, plan] = await Promise.all([
      admin
        .from("partners")
        .select("id, order_flow, business_info")
        .eq("id", partnerId)
        .maybeSingle(),
      getPartnerPlan(partnerId).catch(() => null),
    ])

    const businessInfo = normalizeBusinessInfo((partner as any)?.business_info)
    const activeResources = resolveActiveResources(businessInfo)
    const resourceSet = new Set(activeResources)
    const hasResource = (resourceId: SystemResourceId) => resourceSet.has(resourceId)

    const planSlug = plan?.slug || "free"
    const baseOrderFlow = resolveBaseOrderFlow((partner as any)?.order_flow, businessInfo)
    const planFeatures = new Set<string>(
      Array.isArray(plan?.features_json) ? plan!.features_json : [],
    )
    const planHasFeature = (feature: string) => planFeatures.has(feature)

    let storePhone: string | null = null
    try {
      let storeQuery = admin.from("stores").select("phone")
      storeQuery = storeId
        ? storeQuery.eq("id", storeId).eq("partner_id", partnerId)
        : storeQuery
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .order("created_at", { ascending: true })
      const { data: store } = await storeQuery.limit(1).maybeSingle()
      storePhone = normalizePhone((store as any)?.phone)
    } catch {
      storePhone = null
    }

    const whatsappPhone = storePhone || null

    const productsEnabled = hasResource("products")
    const servicesEnabled = hasResource("services")
    const appointmentsEnabled = hasResource("appointments") && servicesEnabled
    const deliveriesEnabled = hasResource("deliveries") && hasMinimumPlan(planSlug, "crescer")
    const couponsEnabled = hasResource("coupons") && hasMinimumPlan(planSlug, "crescer")
    const campaignsEnabled = hasResource("campaigns") && hasMinimumPlan(planSlug, "escalar")
    const recurringPlansEnabled = hasResource("recurringPlans") && hasMinimumPlan(planSlug, "escalar")
    const recurringSubscriptionsEnabled =
      hasResource("recurringSubscriptions") && hasMinimumPlan(planSlug, "escalar")

    const reasons: string[] = []
    if (!hasResource("orders")) reasons.push("orders_disabled")
    if (!hasResource("quotes")) reasons.push("quotes_disabled")
    if (!hasResource("returns")) reasons.push("returns_disabled")
    if (!hasResource("appointments")) reasons.push("appointments_disabled")
    if (!hasResource("deliveries")) reasons.push("deliveries_disabled")
    if (!hasResource("coupons")) reasons.push("coupons_disabled")
    if (!hasResource("campaigns")) reasons.push("campaigns_disabled")
    if (!hasResource("recurringPlans")) reasons.push("recurring_plans_disabled")
    if (!hasResource("recurringSubscriptions")) reasons.push("recurring_subscriptions_disabled")
    if (!hasMinimumPlan(planSlug, "crescer")) reasons.push("plan_crescer_required")
    if (!hasMinimumPlan(planSlug, "escalar")) reasons.push("plan_escalar_required")

    // ── Cotas mensais do plano ────────────────────────────────────────────────
    // A vitrine precisa saber ANTES de o comprador montar o carrinho se a loja
    // ainda aceita pedido/orçamento/agendamento. Sem isso, o limite só aparecia
    // no fim do checkout (ou virava erro seco), depois de tudo preenchido.
    const [ordersLimitReached, quotesLimitReached, appointmentsLimitReached] = await Promise.all([
      isMonthlyLimitReached(partnerId, "monthly_orders"),
      isMonthlyLimitReached(partnerId, "monthly_quotes"),
      isMonthlyLimitReached(partnerId, "monthly_appointments"),
    ])

    if (ordersLimitReached) reasons.push("orders_limit_reached")
    if (quotesLimitReached) reasons.push("quotes_limit_reached")
    if (appointmentsLimitReached) reasons.push("appointments_limit_reached")

    const checkoutViaDudit = baseOrderFlow === "dudit" && hasResource("orders")
    // Mercado Pago é feature paga: sem ela a loja só oferece os métodos
    // manuais ("a combinar", PIX, dinheiro) dentro do checkout da Dudit.
    const mercadoPagoEnabled = checkoutViaDudit && planHasFeature("mercado_pago_checkout")
    if (!mercadoPagoEnabled) reasons.push("mercado_pago_unavailable")

    const quotesViaDudit =
      baseOrderFlow === "dudit" &&
      hasResource("quotes") &&
      planHasFeature("quotes")

    const returnsViaDudit =
      baseOrderFlow === "dudit" &&
      hasResource("returns") &&
      planHasFeature("returns_and_exchanges")

    const appointmentsViaDudit =
      baseOrderFlow === "dudit" &&
      appointmentsEnabled

    const recurringEnabled =
      baseOrderFlow === "dudit" &&
      recurringPlansEnabled &&
      recurringSubscriptionsEnabled

    return {
      partnerId,
      planSlug,
      baseOrderFlow,
      checkoutViaDudit,
      checkoutOpen: checkoutViaDudit && !ordersLimitReached,
      quotesViaDudit,
      quotesOpen: quotesViaDudit && !quotesLimitReached,
      returnsViaDudit,
      appointmentsViaDudit,
      appointmentsOpen: appointmentsViaDudit && !appointmentsLimitReached,
      mercadoPagoEnabled,
      ordersLimitReached,
      quotesLimitReached,
      appointmentsLimitReached,
      deliveriesEnabled,
      couponsEnabled,
      campaignsEnabled,
      recurringEnabled,
      recurringPlansEnabled,
      recurringSubscriptionsEnabled,
      productsEnabled,
      servicesEnabled,
      whatsappPhone,
      activeResources,
      reasons,
    }
  },
)

export {
  resolveRecurringPlanSaleBlock,
  type RecurringPlanItemLike,
  type RecurringSaleBlockReason,
} from "@/lib/marketplace-sale-blocks"
