import { createAdminClient } from "@/lib/supabase/server";
import { getPartnerPlan } from "@/lib/services/subscription.service";
import { normalizeBusinessInfo, readOnboardingState } from "@/lib/business-info";
import { DashboardContext, DashboardLayout } from "./types";
import { getStoreUrl } from "@/lib/utils/url-generator";
import { getActiveStoreId } from "@/lib/auth/partner-context";
import { createSlug } from "@/lib/utils/slugify";
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration";
import {
  getChecklistItems,
  getCards,
  getShortcuts,
  getAlerts,
  getIntegrations,
  getRecommendations
} from "./rules";

/**
 * Carrega todo o contexto do parceiro e gera a estrutura do Dashboard Inteligente
 */
export async function getDashboardLayout(
  partnerId: string,
  activeStoreIdOverride?: string | null,
): Promise<DashboardLayout> {
  const supabase = createAdminClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString();

  // 0. Tenta obter a loja ativa (se o usuário selecionou uma)
  // When this function is called from an unstable_cache loader, the cookie
  // value must already have been resolved by the caller. `undefined` keeps
  // the legacy behavior for uncached callers; `null` is an explicit
  // "no active store" value and must not read cookies here.
  const activeStoreId = activeStoreIdOverride !== undefined
    ? activeStoreIdOverride
    : await getActiveStoreId();

  // Store e queries de fallback
  const STORE_SELECT = "id, short_id, name, slug, logo_url, banner_url, phone, is_showcase_active, partner_id, category_id, opening_hours, business_info, addresses!store_id!left(city, state)"

  // 1. Executa todas as consultas ao DB de forma paralela e agregada
  const [
    partnerRes,
    storeByIdRes,
    storeByPartnerRes,
    addressRes,
    paymentMethodsRes,
    deliverySettingsRes,
    productsCountRes,
    servicesCountRes,
    ordersCountRes,
    monthlyOrdersCountRes,
    whatsappConnRes,
    plan,
    recentProductsRes,
    recentServicesRes,
    recentOrdersRes
  ] = await Promise.all([
    // Parcerias/Dados Gerais
    supabase
      .from("partners")
      .select("category_id, is_showcase_active, business_info, partner_integrations(provider_slug, status, account_id)")
      .eq("id", partnerId)
      .single(),

    // Loja por ID ativo (pode não existir se o cookie estiver desatualizado)
    activeStoreId
      ? supabase
        .from("stores")
        .select(STORE_SELECT)
        .eq("id", activeStoreId)
        // Never let a stale store cookie from another ERP/account influence
        // the dashboard or the public seller URL.
        .eq("partner_id", partnerId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Fallback: busca deterministicamente a sede (ou a primeira loja ativa).
    // `maybeSingle()` sem limit/order falha quando o parceiro possui múltiplas
    // lojas e isso fazia o dashboard cair para `partnerUrl: "/"`.
    supabase
      .from("stores")
      .select(STORE_SELECT)
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .is("suspended_at", null)
      .order("is_headquarters", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Busca endereço vinculado ao partner (fallback será feito depois via store_id)
    supabase
      .from("addresses")
      .select("city, state")
      .eq("partner_id", partnerId)
      .limit(1),

    // Métodos de Pagamento (para validar Pix)
    supabase
      .from("payment_methods")
      .select("id, type, is_active")
      .eq("partner_id", partnerId),

    // Configurações de entrega
    supabase
      .from("delivery_settings")
      .select("id, base_fee, included_km, extra_km_price, max_delivery_km, is_delivery_enabled, free_delivery_threshold, delivery_payer")
      .eq("partner_id", partnerId)
      .limit(1),

    // Contagem de produtos
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "ativo"),

    // Contagem de serviços
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("status", "ativo"),

    // Contagem total de pedidos
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId),

    // Pedidos no mês atual (para checar limites)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .gte("created_at", startOfMonthIso),

    // Conexão ativa do WhatsApp
    supabase
      .from("partner_whatsapp_connections")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .limit(1),

    // Plano de assinatura atual
    getPartnerPlan(partnerId),

    // Anúncios recentes (produtos)
    supabase
      .from("products")
      .select("id, name, price, images, is_active, created_at, type:id")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(4),

    // Anúncios recentes (serviços)
    supabase
      .from("services")
      .select("id, name, price, images, is_active, created_at, type:id")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(4),

    // Pedidos recentes
    supabase
      .from("orders")
      .select("id, order_number, customer_name, total_amount, situation, created_at, delivery_status")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  // 1b. Resolve a loja: prioriza a ativa, mas usa fallback da primeira do parceiro
  const store = storeByIdRes?.data || storeByPartnerRes?.data;

  if (!store) {
    console.warn("[DASHBOARD] Nenhuma loja encontrada para o partner", partnerId);
  }

  if (partnerRes.error || !partnerRes.data) {
    throw new Error("Parceiro não encontrado no sistema.");
  }

  const partner = partnerRes.data;
  // mp_* status fields are sourced from partner_integrations.
  if (partner) Object.assign(partner, withMpPartnerFields(partner));
  const businessInfo = normalizeBusinessInfo(partner.business_info);

  // 2. Determina variáveis auxiliares de Onboarding
  const { isSystemResourceActive } = await import("@/lib/system-resources");
  const sellsProducts = isSystemResourceActive(businessInfo, "products");
  const sellsServices = isSystemResourceActive(businessInfo, "services");

  const hasPhone = !!store?.phone;
  const hasCategory = !!(store?.category_id || partner.category_id);
  let addressData = addressRes.data || [];
  // Fallback: se não encontrou endereço via partner_id, busca via store_id
  if ((!addressData || addressData.length === 0) && store?.id) {
    const { data: storeAddress } = await supabase
      .from("addresses")
      .select("city, state")
      .eq("store_id", store.id)
      .limit(1)
    if (storeAddress && storeAddress.length > 0) {
      addressData = storeAddress
    }
  }
  const hasAddress = Array.isArray(addressData) ? addressData.length > 0 : !!addressData;

  // Verifica se pelo menos 1 dia está habilitado nos horários
  const openingHours = store?.opening_hours;
  const hasHours = !!openingHours && typeof openingHours === "object" && Object.values(openingHours).some(
    (day: any) => day?.enabled === true
  );

  const hasPix = (paymentMethodsRes.data || []).some(
    (m: any) => (m.type === "pix" || m.payment_type === "pix") && m.is_active
  );

  const activeProducts = productsCountRes.count || 0;
  const activeServices = servicesCountRes.count || 0;
  const hasItems = (activeProducts + activeServices) > 0;

  const logoUrl = store?.logo_url
  const bannerUrl = store?.banner_url
  // Considera completo se tem logo OU (banner e não é o default)
  const hasLogo = !!logoUrl;
  const hasCustomBanner = !!bannerUrl && !bannerUrl.includes("default/");
  const hasLogoAndBanner = hasLogo || hasCustomBanner;

  const isWhatsAppConnected = (whatsappConnRes.data || []).length > 0;
  const isMercadoPagoConnected = !!partner.mp_user_id;

  // Verifica se configurou entregas (baseFee, includedKm, etc.)
  const deliverySettings = deliverySettingsRes.data?.[0];
  const hasDeliveryConfig = !!deliverySettings && (
    (deliverySettings.base_fee > 0) ||
    (deliverySettings.included_km > 0) ||
    (deliverySettings.extra_km_price > 0) ||
    (deliverySettings.max_delivery_km > 0) ||
    (deliverySettings.free_delivery_threshold > 0) ||
    (deliverySettings.delivery_payer === "seller")
  );

  const planSlug = (plan?.slug || "free") as "free" | "crescer" | "escalar";

  // Processamento de itens recentes (produtos + serviços mesclados e ordenados por data)
  const recentItems = [
    ...(recentProductsRes.data || []).map((p: any) => ({ ...p, itemType: "product" })),
    ...(recentServicesRes.data || []).map((s: any) => ({ ...s, itemType: "service" }))
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const recentOrders = recentOrdersRes.data || [];

  const businessMode = businessInfo.mode || "erp";
  const isDesapego = businessMode === "desapego";
  const isQuickMode = businessMode === "quick" || businessMode === "showcase";

  const rawBusinessInfo: any = partner.business_info || {};
  // O Guia de Configuração é concluído uma única vez. A flag é persistida em
  // `partners.business_info` e espelhada em `stores.business_info` pelo wizard.
  // A loja é usada como fallback para que o guia não reapareça caso algum fluxo
  // de configuração tenha recriado o `business_info` do parceiro.
  const onboardingCompleted =
    readOnboardingState(rawBusinessInfo).completed ||
    readOnboardingState((store as any)?.business_info).completed;
  const needsOnboarding = !onboardingCompleted && !isDesapego && !hasItems;

  const context: DashboardContext = {
    partnerId,
    storeName: store?.name || "Sua Loja",
    businessMode,
    isDesapego,
    isQuickMode,
    sellsProducts,
    sellsServices,
    planSlug,
    needsOnboarding,
    onboardingCompleted,
    hasPhone,
    hasCategory,
    hasAddress,
    hasHours,
    hasPix,
    hasItems,
    hasLogoAndBanner,
    hasDeliveryConfig,
    isWhatsAppConnected,
    isMercadoPagoConnected,
    stats: {
      activeProductsCount: activeProducts,
      activeServicesCount: activeServices,
      receivedOrdersCount: ordersCountRes.count || 0,
      monthlyOrdersCount: monthlyOrdersCountRes.count || 0
    }
  };

  // 4. Executa as Regras Dinâmicas
  const checklistItems = getChecklistItems(context);
  const cards = getCards(context);
  const shortcuts = getShortcuts(context);
  const alerts = getAlerts(context);
  const integrations = getIntegrations(context);
  const recommendations = getRecommendations(context);

  // 5. Constrói o checklist se houver tarefas pendentes
  const totalCount = checklistItems.length;
  const completedCount = checklistItems.filter((i) => i.completed).length;
  const percentComplete = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  const checklist = (totalCount > 0 && percentComplete < 100)
    ? {
      percentComplete,
      completedCount,
      totalCount,
      items: checklistItems
    }
    : null;

  // 6. Gera saudação e mensagens baseadas no modo e preenchimento
  const storeName = store?.name?.trim() || "Sua Loja";
  const remainingCount = totalCount - completedCount;
  const greeting = {
    title: `Olá, ${storeName}! 👋`,
    subtitle: isDesapego
      ? "Gerencie seus anúncios rápidos e desapegos na Dudit."
      : checklist
        ? (remainingCount === 1
          ? `🔥 Falta apenas 1 passo para sua vitrine ficar 100% pronta para vender!`
          : `🔥 Você já concluiu ${percentComplete}% da sua loja! Faltam apenas ${remainingCount} passos para começar a vender.`)
        : new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  };

  // 7. Gera a URL pública do perfil do vendedor (baseada na loja ativa)
  const firstAddress = Array.isArray(addressData) ? addressData[0] : addressData;

  const storeSlug = store?.slug || (store?.name ? createSlug(store.name) : "");
  const storeId = store?.id || "";
  const storeAddress = Array.isArray(store?.addresses) ? store.addresses[0] : store?.addresses;
  const storeCity = storeAddress?.city || firstAddress?.city;
  const storeState = storeAddress?.state || firstAddress?.state;

  const partnerUrl = store && storeSlug && storeId
    ? getStoreUrl({
      id: storeId,
      short_id: store.short_id,
      slug: storeSlug,
      name: store.name,
      city: storeCity,
      state: storeState,
    })
    : "/";


  if (!store && (addressData.length > 0 || partnerRes.data)) {
    console.warn("[DASHBOARD] Loja não encontrada, partnerUrl será '/'", { partnerId, storeSlug, storeId });
  }

  return {
    storeName: storeName,
    partnerUrl,
    businessMode,
    isDesapego,
    isQuickMode: context.isQuickMode,
    planSlug: context.planSlug,
    sellsProducts: context.sellsProducts,
    sellsServices: context.sellsServices,
    needsOnboarding,
    onboardingCompleted,
    businessInfo: partner.business_info,
    greeting,
    checklist,
    cards,
    shortcuts,
    alerts,
    integrations,
    recommendations,
    recentItems,
    recentOrders
  };
}
