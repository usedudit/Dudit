import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FinancialSummary } from "@/components/erp/financial-overview/FinancialSummary"
import { AccessDenied } from "@/components/erp/access-denied"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { GlobalPeriodFilter } from "@/components/erp/GlobalPeriodFilter"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getFinancialOverviewData } from "@/lib/data/financial-overview"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { FadeIn } from "@/components/animations/FadeIn"
import type { Period, CompareMode } from "@/lib/period-types"

export const dynamic = "force-dynamic"

export default async function FinancialOverviewRoute(props: { searchParams?: Promise<{ period?: string; compare?: string }> }) {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const plan = await getPartnerPlan(partnerId)
  const isFreePlan = plan.slug.toLowerCase() === "free"

  if (isFreePlan) {
    return (
      <PlanGatePage
        title="Resumo Financeiro"
        subtitle="Acompanhe suas finanças com gráficos e relatórios detalhados. Disponível nos planos Crescer e Escalar."
        requiredPlan="crescer"
      />
    )
  }

  const searchParams = await props.searchParams
  const period = (searchParams?.period as Period) || "monthly"
  const compare = (searchParams?.compare as CompareMode) || "previous"

  const result = await getFinancialOverviewData(partnerId, period)
  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar visão geral financeira.")
  }

  return (
    <>
      <ERPPageHeader title="Resumo Financeiro" />
      <FadeIn className="p-4">
        <div className="w-full space-y-6 pt-4 px-4 md:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight mb-2">Resumo Financeiro</h2>
              <p className="text-brand-inactive-text dark:text-dark-body text-sm">Acompanhe suas métricas financeiras</p>
            </div>
            <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-full bg-brand-gray/40 dark:bg-dark-border/20" />}>
              <GlobalPeriodFilter />
            </Suspense>
          </div>
          <FinancialSummary data={result.data} />
        </div>
      </FadeIn>
    </>
  )
}

