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
import { getAllUserStoreAccess } from "@/lib/auth/partner-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { resolveActiveResources } from "@/lib/system-resources"
import type { Period } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function ERPReportsPage(props: {
  searchParams?: Promise<{ period?: string; tab?: string; store?: string }>
}) {
  const context = await getErpRequestContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  try {
    await requireMinimumPlan(partnerId, "crescer")
  } catch {
    return <AccessDenied />
  }

  const [plan, storeAccess] = await Promise.all([
    getPartnerPlan(partnerId),
    getAllUserStoreAccess(),
  ])
  const stores = storeAccess
    .filter((store) => store.partnerId === partnerId)
    .map((store) => ({ id: store.storeId, name: store.storeName }))
  const businessInfo = normalizeBusinessInfo(context.businessInfo)
  const activeResources = resolveActiveResources(businessInfo)
  const searchParams = await props.searchParams
  const rawPeriod = searchParams?.period
  const period: Period = rawPeriod === "daily" || rawPeriod === "weekly" || rawPeriod === "monthly"
    ? rawPeriod
    : "monthly"
  const requestedStoreId = searchParams?.store
  const selectedStoreIds = requestedStoreId === "all"
    ? (stores.length ? stores.map((store) => store.id) : context.activeStoreId ? [context.activeStoreId] : [])
    : stores.some((store) => store.id === requestedStoreId)
      ? [requestedStoreId!]
      : context.activeStoreId
        ? [context.activeStoreId]
        : []
  const storeId = selectedStoreIds.join(",")

  return (
    <>
      <ERPPageHeader title="Relatórios" />
      <FadeIn className="p-4">
        <DashboardProvider>
          <Suspense key={`${period}-${storeId}`} fallback={<ReportsSkeleton />}>
            <ReportsContent
              partnerId={partnerId}
              activeResources={activeResources}
              period={period}
              storeId={storeId}
              stores={stores}
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
  storeId,
  stores,
  planSlug,
  permissionContext,
}: {
  partnerId: string
  activeResources: string[]
  period: Period
  storeId: string
  stores: Array<{ id: string; name: string }>
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
    hasProducts && hasPermission("products.view") ? getDashboardProductsData(partnerId, storeId).catch(() => null) : Promise.resolve(null),
    hasServices && hasPermission("appointments.view") ? getDashboardServicesData(partnerId, storeId).catch(() => null) : Promise.resolve(null),
    hasFinancial && hasPermission("financial.view") ? getDashboardFinancialData(partnerId, storeId).catch(() => null) : Promise.resolve(null),
    hasOrders && hasPermission("products.view") ? getSalesReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasCustomers && hasPermission("customers.view") ? getCustomerReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasReturns && hasPermission("orders.view") ? getReturnsReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasDeliveries && hasPermission("delivery.view") ? getDeliveryReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasMarketing && hasPermission("products.view") ? getMarketingReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasProductivity && hasPermission("appointments.view") ? getProductivityReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasServiceOrders && hasPermission("service_orders.view") ? getServiceOrderReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasSubscriptions && hasPermission("recurring_subscriptions.view") ? getSubscriptionReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
    hasAppointments && hasPermission("appointments.view") ? getAppointmentsReportData(partnerId, period, storeId).catch(() => null) : Promise.resolve(null),
  ])

  return (
    <ReportsHubPage
      activeResources={activeResources}
      period={period}
      storeId={storeId}
      stores={stores}
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
