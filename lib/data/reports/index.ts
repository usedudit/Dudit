"server-only"

export { REPORT_TAGS } from "./cache"

export {
  getDashboardGeneralData,
  getDashboardProductsData,
  getDashboardServicesData,
  getDashboardFinancialData,
  getDashboardOperationsData,
  getGeneralMetrics,
  getGeneralAlerts,
  getGeneralRevenueChart,
  getGeneralRevenueOrigin,
  getGeneralActivity,
  getGeneralTopCategories,
} from "../dashboard"

export type {
  GeneralDashboardData,
  ProductsDashboardData,
  ServicesDashboardData,
  FinancialDashboardData,
  FinancialAlertItem,
  OperationsDashboardData,
  Metric,
  DashboardListItem,
  ChartPoint,
  AlertItem,
  ActivityItem,
} from "../dashboard"

export { getSalesReportData } from "./vendas"
export type { SalesReportData } from "./vendas"

export { getCustomerReportData } from "./clientes"
export type { CustomerReportData } from "./clientes"

export { getReturnsReportData } from "./trocas"
export type { ReturnsReportData } from "./trocas"

export { getDeliveryReportData } from "./entregas"
export type { DeliveryReportData } from "./entregas"

export { getMarketingReportData } from "./marketing"
export type { MarketingReportData } from "./marketing"

export { getProductivityReportData } from "./produtividade"
export type { ProductivityReportData } from "./produtividade"

export { getGoalReportData } from "./metas"
export type { GoalReportData } from "./metas"

export { getServiceOrderReportData } from "./service-orders"
export type { ServiceOrderReportData } from "./service-orders"

export { getSubscriptionReportData } from "./assinaturas"
export type { SubscriptionReportData } from "./assinaturas"

export { getAppointmentsReportData } from "./agendamentos"
export type { AppointmentsReportData } from "./agendamentos"
