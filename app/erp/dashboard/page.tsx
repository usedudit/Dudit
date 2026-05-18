import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { DashboardTabs } from "@/components/erp/dashboard/widgets/DashboardTabs"
import { ChevronDownIcon as ChevronDown } from "@/lib/icons"
import { GeneralTab } from "@/components/erp/dashboard/widgets/GeneralTab"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { OperationsTab } from "@/components/erp/dashboard/widgets/OperationsTab"
import {
    type DashboardTab,
    getDashboardFinancialData,
    getDashboardOperationsData,
    getDashboardProductsData,
    getDashboardServicesData,
} from "@/lib/data/dashboard"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { normalizeBusinessInfo } from "@/lib/business-info"

export const dynamic = "force-dynamic"

const validTabs = new Set<DashboardTab>(["geral", "produtos", "servicos", "financeiro", "operacao"])

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="h-[140px] animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="h-72 animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 xl:col-span-2" />
                <div className="h-72 animate-pulse rounded-2xl border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
            </div>
        </div>
    )
}

async function ActiveDashboardTab({ tab, partnerId, sells, mode }: { tab: DashboardTab; partnerId: string; sells: string[]; mode: string }) {
    // Quick mode only sees the general tab
    if (mode === "quick" && tab !== "geral") {
        return <GeneralTab partnerId={partnerId} sells={sells} />
    }

    if (tab === "produtos") return <ProductsTab data={await getDashboardProductsData(partnerId)} />
    if (tab === "servicos") return <ServicesTab data={await getDashboardServicesData(partnerId)} />
    if (tab === "financeiro") return <FinancialTab data={await getDashboardFinancialData(partnerId)} />
    if (tab === "operacao") return <OperationsTab data={await getDashboardOperationsData(partnerId)} />
    return <GeneralTab partnerId={partnerId} sells={sells} />
}

export default async function ERPDashboardPage({
    searchParams,
}: {
    searchParams?: Promise<{ tab?: string }>
}) {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const { allowed } = await checkPartnerPermission(partnerId, "dashboard", "view")
    if (!allowed) return <AccessDenied />

    const businessInfo = normalizeBusinessInfo(context.businessInfo)
    const sells = businessInfo.sells || ["products"]
    const mode = businessInfo.mode || "erp"

    const resolvedSearchParams = await searchParams
    const requestedTab = String(resolvedSearchParams?.tab || "geral") as DashboardTab
    const activeTab = validTabs.has(requestedTab) ? requestedTab : "geral"

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

    // Quick mode: only show general tab, hide other tabs
    const showTabs = mode !== "quick"

    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Dashboard"} />
            <FadeIn className="p-4">
                <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                    <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                Dashboard
                                {showTabs && (
                                    <button className="p-1 rounded-full border border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <ChevronDown className="h-4 w-4" />
                                    </button>
                                )}
                            </h1>
                            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                        {showTabs && <DashboardTabs active={activeTab} />}
                    </header>
                    <Suspense key={activeTab} fallback={<DashboardSkeleton />}>
                        <ActiveDashboardTab tab={activeTab} partnerId={partnerId} sells={sells} mode={mode} />
                    </Suspense>
                </div>
            </FadeIn>
        </>
    )
}
