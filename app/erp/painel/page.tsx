import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { GeneralTab } from "@/components/erp/dashboard/widgets/GeneralTab"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { DashboardProvider } from "@/components/erp/dashboard/DashboardContext"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { IconPlaceholder } from "@/components/reusable"
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

export default async function ERPDashboardPage(props: { searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }> }) {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const roleId = context.roleId

    if (roleId === "delivery") {
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
    const activeResources = businessInfo.activeResources

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
                            <GeneralTab partnerId={partnerId} sells={activeResources} period={period} compare={compare} compareFrom={compareFrom} compareTo={compareTo} />
                        </Suspense>
                    </div>
                </DashboardProvider>
            </FadeIn>
        </>
    )
}
