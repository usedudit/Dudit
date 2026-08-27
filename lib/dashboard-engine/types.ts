export interface DashboardContext {
  partnerId: string;
  storeName: string;
  isQuickMode: boolean; // true = quick, false = erp
  sellsProducts: boolean;
  sellsServices: boolean;
  planSlug: "free" | "crescer" | "escalar";
  
  // Dados de Onboarding / Configurações Faltantes
  hasPhone: boolean;
  hasCategory: boolean;
  hasAddress: boolean;
  hasHours: boolean;
  hasPix: boolean;
  hasItems: boolean;
  hasLogoAndBanner: boolean;
  hasDeliveryConfig: boolean;
  
  // Estados de Integração
  isWhatsAppConnected: boolean;
  isMercadoPagoConnected: boolean;
  
  // Métricas e Recursos Reais
  stats: {
    activeProductsCount: number;
    activeServicesCount: number;
    receivedOrdersCount: number;
    monthlyOrdersCount: number;
  };
}

export interface DashboardCard {
  id: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  color?: string;
  href?: string;
}

export interface DashboardChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
  tabTarget?: string;
  actionText?: string;
  badgeText?: string;
  importOptions?: {
    sellsProducts: boolean;
    sellsServices: boolean;
    isQuickMode: boolean;
    isErpMode: boolean;
  };
}

export interface DashboardShortcut {
  id: string;
  label: string;
  description: string;
  icon: string;
  href: string;
}

export interface DashboardAlert {
  id: string;
  title: string;
  description: string;
  type: "info" | "warning" | "danger";
  actionLabel?: string;
  actionHref?: string;
}

export interface DashboardIntegration {
  id: string;
  name: string;
  description: string;
  status: "connected" | "disconnected";
  actionHref: string;
}

export interface DashboardRecommendation {
  id: string;
  title: string;
  description: string;
  badge?: string;
  actionLabel: string;
  actionHref: string;
  variant: "upgrade" | "tip";
}

export interface DashboardLayout {
  storeName: string;
  partnerUrl: string;
  isQuickMode: boolean;
  planSlug: "free" | "crescer" | "escalar";
  sellsProducts: boolean;
  sellsServices: boolean;
  greeting: {
    title: string;
    subtitle: string;
  };
  checklist: {
    percentComplete: number;
    completedCount: number;
    totalCount: number;
    items: DashboardChecklistItem[];
  } | null;
  cards: DashboardCard[];
  shortcuts: DashboardShortcut[];
  alerts: DashboardAlert[];
  integrations: DashboardIntegration[];
  recommendations: DashboardRecommendation[];
  recentItems: any[];
  recentOrders: any[];
}
