import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { OperationsTab } from "@/components/erp/dashboard/widgets/OperationsTab"
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

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="h-[140px] animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="h-72 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 xl:col-span-2" />
                <div className="h-72 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
            </div>
        </div>
    )
}

export default async function ERPReportsPage() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    // Enforce plan restriction: only crescer and escalar can access reports
    try {
        await requireMinimumPlan(partnerId, "crescer")
    } catch {
        redirect("/erp/dashboard")
    }

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

    // Load data in parallel for allowed tabs
    const [productsData, servicesData, financialData, operationsData] = await Promise.all([
        checkPermission(partnerId, "products", "view").then(res => res.allowed ? getDashboardProductsData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "appointments", "view").then(res => res.allowed ? getDashboardServicesData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "financial", "view").then(res => res.allowed ? getDashboardFinancialData(partnerId).catch(() => null) : null),
        checkPermission(partnerId, "delivery", "view").then(res => res.allowed ? getDashboardOperationsData(partnerId).catch(() => null) : null)
    ])

    const initialTab = productsData ? "produtos" : servicesData ? "servicos" : financialData ? "financeiro" : operationsData ? "operacao" : ""

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

                    {initialTab ? (
                        <Tabs defaultValue={initialTab} className="w-full">
                            <TabsList className="mb-8">
                                {productsData && <TabsTrigger value="produtos">Produtos</TabsTrigger>}
                                {servicesData && <TabsTrigger value="servicos">Serviços</TabsTrigger>}
                                {financialData && <TabsTrigger value="financeiro">Financeiro</TabsTrigger>}
                                {operationsData && <TabsTrigger value="operacao">Operação</TabsTrigger>}
                            </TabsList>

                            {productsData && (
                                <TabsContent value="produtos">
                                    <Suspense fallback={<DashboardSkeleton />}>
                                        <ProductsTab data={productsData} />
                                    </Suspense>
                                </TabsContent>
                            )}

                            {servicesData && (
                                <TabsContent value="servicos">
                                    <Suspense fallback={<DashboardSkeleton />}>
                                        <ServicesTab data={servicesData} />
                                    </Suspense>
                                </TabsContent>
                            )}

                            {financialData && (
                                <TabsContent value="financeiro">
                                    <Suspense fallback={<DashboardSkeleton />}>
                                        <FinancialTab data={financialData} />
                                    </Suspense>
                                </TabsContent>
                            )}

                            {operationsData && (
                                <TabsContent value="operacao">
                                    <Suspense fallback={<DashboardSkeleton />}>
                                        <OperationsTab data={operationsData} />
                                    </Suspense>
                                </TabsContent>
                            )}
                        </Tabs>
                    ) : (
                        <AccessDenied />
                    )}
                </div>
            </FadeIn>
        </>
    )
}
