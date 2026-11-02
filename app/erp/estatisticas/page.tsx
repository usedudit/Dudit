import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { ReportsPage } from "@/components/erp/reports/ReportsPage"
import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { DashboardProvider } from "@/components/erp/dashboard/DashboardContext"
import {
    getDashboardFinancialData,
    getDashboardProductsData,
    getDashboardServicesData,
} from "@/lib/data/dashboard"
import {
    getSalesReportData,
    getCustomerReportData,
    getReturnsReportData,
    getDeliveryReportData,
    getMarketingReportData,
    getProductivityReportData,
    getServiceOrderReportData,
    getGoalReportData,
    getSubscriptionReportData,
    getAppointmentsReportData,
} from "@/lib/data/reports"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { resolveActiveResources } from "@/lib/system-resources"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { redirect } from "next/navigation"
import type { Period } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function ERPEstatisticasPage(props: {
    searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }>
}) {
    const context = await getErpRequestContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    try {
        await requireMinimumPlan(partnerId, "crescer")
    } catch {
        redirect("/erp/inicio")
    }

    const plan = await getPartnerPlan(partnerId)

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)
    const businessInfo = normalizeBusinessInfo(context.businessInfo)
    const activeResources = resolveActiveResources(businessInfo)

    const searchParams = await props.searchParams
    const period = (searchParams?.period as Period) || "monthly"
    const hasProducts = activeResources.includes("products")
    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Estatísticas"} />
            <FadeIn className="p-4">
                <DashboardProvider>
                    <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                            <div className="hidden xl:block" />
                            <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-full bg-brand-gray/40 dark:bg-dark-border/20" />}>
                                <GlobalPeriodFilter />
                            </Suspense>
                        </header>

                        <Suspense fallback={<ReportsSkeleton />}>
                            <ReportsContent
                                partnerId={partnerId}
                                activeResources={activeResources}
                                period={period}
                                planSlug={plan.slug}
                                permissionContext={context as RbacUserLike}
                            />
                        </Suspense>
                    </div>
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
    const hasGoals = activeResources.includes("goals")
    const hasSubscriptions = activeResources.includes("recurringSubscriptions") || activeResources.includes("recurring_subscriptions") || activeResources.includes("recorrentes")
    const hasAppointments = activeResources.includes("appointments")
    const hasPermission = (permission: string) => can(permissionContext, permission)

    const [productsData, servicesData, financialData, salesData, customerData, returnsData, deliveryData, marketingData, productivityData, serviceOrdersData, goalData, subscriptionData, stockValue, appointmentsData] = await Promise.all([
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
        hasGoals && hasPermission("appointments.view") ? getGoalReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
        hasSubscriptions && hasPermission("recurring_subscriptions.view") ? getSubscriptionReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
        hasProducts && hasPermission("products.view") ? (async () => {
            try {
                const supabase = (await import("@/lib/supabase/server")).createAdminClient()
                const r = await supabase.from("products").select("stock_quantity, cost_price").eq("partner_id", partnerId)
                if (r.error || !r.data) return 0
                return r.data.reduce((sum: number, p: any) => sum + (Number(p.stock_quantity || 0) * Number(p.cost_price || 0)), 0)
            } catch { return 0 }
        })() : Promise.resolve(0),
        hasAppointments && hasPermission("appointments.view") ? getAppointmentsReportData(partnerId, period).catch(() => null) : Promise.resolve(null),
    ])

    return (
        <ReportsPage
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
            goalData={goalData}
            subscriptionData={subscriptionData}
            stockValue={stockValue}
            appointmentsData={appointmentsData}
        />
    )
}
