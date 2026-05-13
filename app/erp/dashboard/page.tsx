import { Suspense } from "react"
import { redirect } from "next/navigation"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { DashboardTabs } from "@/components/erp/dashboard/widgets/DashboardTabs"
import { GeneralTab } from "@/components/erp/dashboard/widgets/GeneralTab"
import { ProductsTab } from "@/components/erp/dashboard/widgets/ProductsTab"
import { ServicesTab } from "@/components/erp/dashboard/widgets/ServicesTab"
import { FinancialTab } from "@/components/erp/dashboard/widgets/FinancialTab"
import { OperationsTab } from "@/components/erp/dashboard/widgets/OperationsTab"
import {
  type DashboardTab,
  getDashboardFinancialData,
  getDashboardGeneralData,
  getDashboardOperationsData,
  getDashboardProductsData,
  getDashboardServicesData,
} from "@/lib/data/dashboard"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"

export const dynamic = "force-dynamic"

const validTabs = new Set<DashboardTab>(["geral", "produtos", "servicos", "financeiro", "operacao"])

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/60 dark:border-dark-border dark:bg-dark-border/20" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/60 dark:border-dark-border dark:bg-dark-border/20" />
    </div>
  )
}

async function ActiveDashboardTab({ tab, partnerId }: { tab: DashboardTab; partnerId: string }) {
  if (tab === "produtos") return <ProductsTab data={await getDashboardProductsData(partnerId)} />
  if (tab === "servicos") return <ServicesTab data={await getDashboardServicesData(partnerId)} />
  if (tab === "financeiro") return <FinancialTab data={await getDashboardFinancialData(partnerId)} />
  if (tab === "operacao") return <OperationsTab data={await getDashboardOperationsData(partnerId)} />
  return <GeneralTab data={await getDashboardGeneralData(partnerId)} />
}

export default async function ERPDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string }
}) {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  if (context.businessInfo?.mode === "quick") {
    redirect("/erp/inicio")
  }

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "dashboard", "view")
  if (!allowed) return <AccessDenied />

  const resolvedSearchParams = await searchParams
  const requestedTab = String(resolvedSearchParams?.tab || "geral") as DashboardTab
  const activeTab = validTabs.has(requestedTab) ? requestedTab : "geral"

  const allAccess = await getAllUserPartnerAccess()
  const activeStore = allAccess.find((s: (typeof allAccess)[number]) => s.partnerId === partnerId)

  return (
    <>
      <ERPPageHeader title={activeStore?.storeName ?? "Dashboard"} />
      <FadeIn className="min-h-svh bg-white p-4 dark:bg-dark-background md:p-6">
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
          <header className="flex flex-col gap-3">
            <div>
              <h1 className="text-[24px] font-bold tracking-tight text-brand-dark dark:text-dark-heading">Dashboard</h1>
              <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">Central operacional da loja</p>
            </div>
            <DashboardTabs active={activeTab} />
          </header>
          <Suspense key={activeTab} fallback={<DashboardSkeleton />}>
            <ActiveDashboardTab tab={activeTab} partnerId={partnerId} />
          </Suspense>
        </div>
      </FadeIn>
    </>
  )
}
