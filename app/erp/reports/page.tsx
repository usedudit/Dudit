import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { ReportsPage } from "@/components/erp/reports/ReportsPage"
import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"
import {
    getDashboardFinancialData,
    getDashboardOperationsData,
    getDashboardProductsData,
    getDashboardServicesData,
} from "@/lib/data/dashboard"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ERPReportsPage() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    try {
        await requireMinimumPlan(partnerId, "crescer")
    } catch {
        redirect("/erp/dashboard")
    }

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

    const businessInfo = normalizeBusinessInfo(context.businessInfo)
    const sells = businessInfo.sells || ["products"]

    const [productsData, servicesData, financialData, operationsData] = await Promise.all([
        checkPermission(partnerId, "products", "view").then(res => res.allowed ? getDashboardProductsData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getDashboardServicesData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "financial", "view").then(res => res.allowed ? getDashboardFinancialData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "delivery", "view").then(res => res.allowed ? getDashboardOperationsData(partnerId).catch(() => null) : null)
    ])

    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Relatórios"} />
            <FadeIn className="p-4">
                <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                    <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                Relatórios
                            </h1>
                            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </header>

                    <Suspense fallback={<ReportsSkeleton />}>
                        <ReportsPage
                            sells={sells}
                            productsData={productsData}
                            servicesData={servicesData}
                            financialData={financialData}
                            operationsData={operationsData}
                        />
                    </Suspense>
                </div>
            </FadeIn>
        </>
    )
}
