import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { DashboardProvider } from "@/components/erp/dashboard/DashboardContext"
import { ReportsHubPage } from "@/components/erp/reports/ReportsHubPage"
import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"
import { getDashboardFinancialData, getDashboardProductsData, getDashboardServicesData } from "@/lib/data/dashboard"
import {
  getAppointmentsReportData,
  getCustomerReportData,
  getDeliveryReportData,
  getMarketingReportData,
  getProductivityReportData,
  getReturnsReportData,
  getSalesReportData,
  getServiceOrderReportData,
  getSubscriptionReportData,
} from "@/lib/data/reports"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { resolveActiveResources } from "@/lib/system-resources"
import type { Period } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function ERPReportsPage(props: {
  searchParams?: Promise<{ period?: string }>
}) {
  const context = await getErpRequestContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  try {
    await requireMinimumPlan(partnerId, "crescer")
  } catch {
    return <AccessDenied />
  }

  const [plan, allAccess] = await Promise.all([
    getPartnerPlan(partnerId),
    getAllUserPartnerAccess(),
  ])
  const activeStore = allAccess.find((store: (typeof allAccess)[number]) => store.partnerId === partnerId)
  const businessInfo = normalizeBusinessInfo(context.businessInfo)
  const activeResources = resolveActiveResources(businessInfo)
  const searchParams = await props.searchParams
  const period = (searchParams?.period as Period) || "monthly"

  return (
    <>
      <ERPPageHeader title={activeStore?.storeName ?? "Relatórios"} />
      <FadeIn className="p-4">
        <DashboardProvider>
          <Suspense fallback={<ReportsSkeleton />}>
            <ReportsContent
              partnerId={partnerId}
              activeResources={activeResources}
              period={period}
              planSlug={plan.slug}
              permissionContext={context as RbacUserLike}
            />
          </Suspense>
        </DashboardProvider>
      </FadeIn>
    </>
  )
}

async function ReportsContent({
  partnerId,
  activeResources,
  period,
  planSlug,
  permissionContext,
}: {
  partnerId: string
  activeResources: string[]
  period: Period
  planSlug: string
  permissionContext: RbacUserLike
}) {
  const hasProducts = activeResources.includes("products")
  const hasServices = activeResources.includes("services") || activeResources.includes("appointments")
  const hasFinancial = activeResources.includes("financial")
  const hasOrders = activeResources.includes("orders") || activeResources.includes("products") || activeResources.includes("pos")
  const hasCustomers = activeResources.includes("customers")
  const hasReturns = activeResources.includes("returns")
  const hasDeliveries = activeResources.includes("deliveries")
  const hasMarketing = activeResources.includes("marketing") || activeResources.includes("coupons") || activeResources.includes("campaigns")
  const hasProductivity = activeResources.includes("productivity") || activeResources.includes("team")
  const hasServiceOrders = activeResources.includes("serviceOrders")
  const hasSubscriptions = activeResources.includes("recurringSubscriptions") || activeResources.includes("recurring_subscriptions") || activeResources.includes("recorrentes")
  const hasAppointments = activeResources.includes("appointments")
  const hasPermission = (permission: string) => can(permissionContext, permission)

  const [productsData, servicesData, financialData, salesData, customerData, returnsData, deliveryData, marketingData, productivityData, serviceOrdersData, subscriptionData, appointmentsData] = await Promise.all([
    hasProducts && hasPermission("products.view") ? getDashboardProductsData(partnerId).catch(() => null) : Promise.resolve(null),
    hasServices && hasPermission("appointments.view") ? getDashboardServicesData(partnerId).catch(() => null) : Promise.resolve(null),
    hasFinancial && hasPermission("financial.view") ? getDashboardFinancialData(partnerId).catch(() => null) : Promise.resolve(null),
    hasOrders && hasPermission("products.view") ? getSalesReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasCustomers && hasPermission("customers.view") ? getCustomerReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasReturns && hasPermission("orders.view") ? getReturnsReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasDeliveries && hasPermission("delivery.view") ? getDeliveryReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasMarketing && hasPermission("products.view") ? getMarketingReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasProductivity && hasPermission("appointments.view") ? getProductivityReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasServiceOrders && hasPermission("service_orders.view") ? getServiceOrderReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasSubscriptions && hasPermission("recurring_subscriptions.view") ? getSubscriptionReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    hasAppointments && hasPermission("appointments.view") ? getAppointmentsReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
  ])

  return (
    <ReportsHubPage
      activeResources={activeResources}
      period={period}
      planSlug={planSlug}
      productsData={productsData}
      servicesData={servicesData}
      financialData={financialData}
      salesData={salesData}
      customerData={customerData}
      returnsData={returnsData}
      deliveryData={deliveryData}
      marketingData={marketingData}
      productivityData={productivityData}
      serviceOrdersData={serviceOrdersData}
      subscriptionData={subscriptionData}
      appointmentsData={appointmentsData}
    />
  )
}
