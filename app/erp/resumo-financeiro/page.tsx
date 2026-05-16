import { ERPPageHeader } from "@/components/erp/page-header-state"
import FinancialOverviewPage from "@/components/erp/financial-overview/FinancialOverviewPage"
import { AccessDenied } from "@/components/erp/access-denied"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getFinancialOverviewData } from "@/lib/data/financial-overview"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function FinancialOverviewRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const result = await getFinancialOverviewData(partnerId)
  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar visão geral financeira.")
  }

  return (
    <>
      <ERPPageHeader title="Resumo Financeiro" />
      <FadeIn className="min-h-svh bg-white p-4 dark:bg-dark-background md:p-6">
        <div className="mx-auto w-full max-w-[1600px] space-y-6">
            <FinancialOverviewPage data={result.data} />
        </div>
      </FadeIn>
    </>
  )
}
