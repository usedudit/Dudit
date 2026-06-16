import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FinancialSummary } from "@/components/erp/financial-overview/FinancialSummary"
import { AccessDenied } from "@/components/erp/access-denied"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getFinancialOverviewData } from "@/lib/data/financial-overview"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function FinancialOverviewRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
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

  const result = await getFinancialOverviewData(partnerId)
  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar visão geral financeira.")
  }

  return (
    <>
      <ERPPageHeader title="Resumo Financeiro" />
      <FadeIn className="p-4">
        <div className="w-full space-y-6 pt-4 px-4 md:px-8">
          <FinancialSummary data={result.data} />
        </div>
      </FadeIn>
    </>
  )
}

