import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { GeneralTab } from "@/components/erp/dashboard/widgets/GeneralTab"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { normalizeBusinessInfo } from "@/lib/business-info"
import type { Period, CompareMode } from "@/lib/period-types"

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

export default async function ERPDashboardPage(props: { searchParams?: Promise<{ period?: string; compare?: string }> }) {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const { allowed } = await checkPermission(partnerId, "dashboard", "view")
    if (!allowed) return <AccessDenied />

    const businessInfo = normalizeBusinessInfo(context.businessInfo)
    const sells = businessInfo.sells || ["products"]

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

    const searchParams = await props.searchParams
    const period = (searchParams?.period as Period) || "monthly"
    const compare = (searchParams?.compare as CompareMode) || "previous"

    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Dashboard"} />
            <FadeIn className="p-4">
                <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                    <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                Dashboard
                            </h1>
                            <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-full bg-brand-gray/40 dark:bg-dark-border/20" />}>
                            <GlobalPeriodFilter />
                        </Suspense>
                    </header>
                    <Suspense fallback={<DashboardSkeleton />}>
                        <GeneralTab partnerId={partnerId} sells={sells} period={period} compare={compare} />
                    </Suspense>
                </div>
            </FadeIn>
        </>
    )
}
