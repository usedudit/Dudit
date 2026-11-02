import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { GeneralTab } from "@/components/erp/dashboard/widgets/GeneralTab"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { DashboardProvider } from "@/components/erp/dashboard/DashboardContext"
import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { checkPermission } from "@/lib/permissions/access"
import { IconPlaceholder } from "@/components/reusable"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { resolveActiveResources } from "@/lib/system-resources"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import type { Period, CompareMode } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function ERPDashboardPage(props: { searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }> }) {
    const context = await getErpRequestContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const roleId = context.roleId

    if (!can(context as RbacUserLike, "dashboard.view")) {
        return (
            <>
                <ERPPageHeader title="Início" />
                <div className="flex items-center justify-center min-h-[calc(100vh-140px)] p-4 text-center">
                    <FadeIn>
                        <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/QRDino.png"
                            imageAlt="Área do Entregador"
                            title="Área do Entregador"
                            subtitle="Acesse a seção de entregas para acompanhar suas rotas e entregas em tempo real."
                            itemButton={{
                                text: "Acessar Entregas",
                                action: "/erp/entregas"
                            }}
                        />
                    </FadeIn>
                </div>
            </>
        )
    }

    const { allowed } = await checkPermission(partnerId, "dashboard", "view")
    if (!allowed) return <AccessDenied />

    const businessInfo = normalizeBusinessInfo(context.businessInfo)
    const activeResources = resolveActiveResources(businessInfo)

    const allAccess = await getAllUserPartnerAccess()
    const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

    const searchParams = await props.searchParams
    const period = (searchParams?.period as Period) || "monthly"
    const compare = (searchParams?.compare as CompareMode) || "none"
    const compareFrom = searchParams?.compareFrom
    const compareTo = searchParams?.compareTo

    return (
        <>
            <ERPPageHeader title={activeStore?.storeName ?? "Dashboard"} />
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
                            <GeneralTab partnerId={partnerId} sells={activeResources} period={period} compare={compare} compareFrom={compareFrom} compareTo={compareTo} />
                        </Suspense>
                    </div>
                </DashboardProvider>
            </FadeIn>
        </>
    )
}
