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
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { redirect } from "next/navigation"
import type { Period } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function ERPEstatisticasPage(props: {
    searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }>
}) {
    const context = await getCurrentPartnerContext()
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
    const activeResources = businessInfo.activeResources

    const searchParams = await props.searchParams
    const period = (searchParams?.period as Period) || "monthly"

    const [productsData, servicesData, financialData, salesData, customerData, returnsData, deliveryData, marketingData, productivityData, serviceOrdersData, goalData, subscriptionData, stockValue, appointmentsData] = await Promise.all([
        checkPermission(partnerId, "products", "view").then(res => res.allowed ? getDashboardProductsData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getDashboardServicesData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "financial", "view").then(res => res.allowed ? getDashboardFinancialData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "products", "view").then(res => res.allowed ? getSalesReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "customers", "view").then(res => res.allowed ? getCustomerReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "orders", "view").then(res => res.allowed ? getReturnsReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "delivery", "view").then(res => res.allowed ? getDeliveryReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "products", "view").then(res => res.allowed ? getMarketingReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getProductivityReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "service_orders", "view").then(res => res.allowed ? getServiceOrderReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getGoalReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "recurring_subscriptions", "view").then(res => res.allowed ? getSubscriptionReportData(partnerId, period).catch(() => null) : null),
        checkPermission(partnerId, "products", "view").then(async (res) => {
          if (!res.allowed) return 0
          try {
            const supabase = (await import("@/lib/supabase/server")).createAdminClient()
            const r = await supabase.from("products").select("stock_quantity, cost_price").eq("partner_id", partnerId)
            if (r.error || !r.data) return 0
            return r.data.reduce((sum: number, p: any) => sum + (Number(p.stock_quantity || 0) * Number(p.cost_price || 0)), 0)
          } catch { return 0 }
        }),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getAppointmentsReportData(partnerId, period).catch(() => null) : null),
    ])

    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Estatísticas"} />
            <FadeIn className="p-4">
                <DashboardProvider>
                    <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                    Estatísticas
                                </h1>
                                <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                    {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-full bg-brand-gray/40 dark:bg-dark-border/20" />}>
                                <GlobalPeriodFilter />
                            </Suspense>
                        </header>

                        <Suspense fallback={<ReportsSkeleton />}>
                            <ReportsPage
                                activeResources={activeResources}
                                period={period}
                                planSlug={plan.slug}
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
                        </Suspense>
                    </div>
                </DashboardProvider>
            </FadeIn>
        </>
    )
}
