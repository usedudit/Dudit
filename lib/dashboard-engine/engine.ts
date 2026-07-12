import { createAdminClient } from "@/lib/supabase/server";
import { getPartnerPlan } from "@/lib/services/subscription.service";
import { normalizeBusinessInfo } from "@/lib/business-info";
import { DashboardContext, DashboardLayout } from "./types";
import { getPartnerUrl } from "@/lib/utils/url-generator";
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
export async function getDashboardLayout(partnerId: string): Promise<DashboardLayout> {
  const supabase = createAdminClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString();

  // 1. Executa todas as consultas ao DB de forma paralela e agregada
  const [
    partnerRes,
    addressRes,
    paymentMethodsRes,
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
      .select("store_name, phone, category_id, store_image_url, banner_url, opening_hours, is_showcase_active, mp_user_id, business_info")
      .eq("id", partnerId)
      .single(),
    
    // Endereço Padrão (precisa de city/state para URL pública)
    supabase
      .from("addresses")
      .select("city, state")
      .eq("partner_id", partnerId)
      .eq("is_default", true)
      .limit(1),

    // Métodos de Pagamento (para validar Pix)
    supabase
      .from("payment_methods")
      .select("id, type, is_active")
      .eq("partner_id", partnerId),

    // Contagem de produtos
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("is_active", true),

    // Contagem de serviços
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("is_active", true),

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

  if (partnerRes.error || !partnerRes.data) {
    throw new Error("Parceiro não encontrado no sistema.");
  }

  const partner = partnerRes.data;
  const businessInfo = normalizeBusinessInfo(partner.business_info);

  // 2. Determina variáveis auxiliares de Onboarding
  const sellsProducts = businessInfo.sells.includes("products");
  const sellsServices = businessInfo.sells.includes("services");

  const hasPhone = !!partner.phone;
  const hasCategory = !!partner.category_id;
  const hasAddress = (addressRes.data || []).length > 0;
  const hasHours = !!partner.opening_hours && Object.keys(partner.opening_hours).length > 0;
  const hasPix = (paymentMethodsRes.data || []).some(
    (m: any) => (m.type === "pix" || m.payment_type === "pix") && m.is_active
  );
  
  const activeProducts = productsCountRes.count || 0;
  const activeServices = servicesCountRes.count || 0;
  const hasItems = (activeProducts + activeServices) > 0;

  const hasLogoAndBanner = !!partner.store_image_url && 
    !!partner.banner_url && 
    !partner.banner_url.includes("default/");

  const isWhatsAppConnected = (whatsappConnRes.data || []).length > 0;
  const isMercadoPagoConnected = !!partner.mp_user_id;

  const planSlug = (plan?.slug || "free") as "free" | "crescer" | "escalar";

  // Processamento de itens recentes (produtos + serviços mesclados e ordenados por data)
  const recentItems = [
    ...(recentProductsRes.data || []).map((p: any) => ({ ...p, itemType: "product" })),
    ...(recentServicesRes.data || []).map((s: any) => ({ ...s, itemType: "service" }))
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const recentOrders = recentOrdersRes.data || [];

  // 3. Monta o objeto de Contexto
  const context: DashboardContext = {
    partnerId,
    storeName: partner.store_name || "Sua Loja",
    isQuickMode: businessInfo.mode === "quick",
    sellsProducts,
    sellsServices,
    planSlug,
    hasPhone,
    hasCategory,
    hasAddress,
    hasHours,
    hasPix,
    hasItems,
    hasLogoAndBanner,
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
  const percentComplete = Math.round((completedCount / totalCount) * 100);

  const checklist = percentComplete < 100
    ? {
        percentComplete,
        completedCount,
        totalCount,
        items: checklistItems
      }
    : null;

  // 6. Gera saudação e mensagens baseadas no modo e preenchimento
  const greeting = {
    title: `Olá, ${partner.store_name}! 👋`,
    subtitle: checklist
      ? "Complete o onboarding para começar a vender na Dudit."
      : "Veja como está seu negócio hoje no Marketplace."
  };

  // 7. Gera a URL pública do perfil do vendedor
  const partnerForUrl = {
    id: partnerId,
    store_name: partner.store_name,
    addresses: addressRes.data || [],
  };
  const partnerUrl = getPartnerUrl(partnerForUrl);

  return {
    storeName: partner.store_name,
    partnerUrl,
    isQuickMode: context.isQuickMode,
    planSlug: context.planSlug,
    sellsProducts: context.sellsProducts,
    sellsServices: context.sellsServices,
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
