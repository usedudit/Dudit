import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getCategoriesData, getAccountsData } from "@/lib/data/financial-data"
import FinancialCategoriesPage from "@/components/erp/financial-cadastros/FinancialCategoriesPage"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function FinancialCategoriesRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const { allowed } = await checkPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const [catResult, accResult, plan] = await Promise.all([
    getCategoriesData(partnerId),
    getAccountsData(partnerId),
    getPartnerPlan(partnerId)
  ])

  if (!catResult.success || !catResult.data) {
    throw new Error(catResult.error || "Erro ao carregar categorias")
  }
  if (!accResult.success || !accResult.data) {
    throw new Error(accResult.error || "Erro ao carregar contas")
  }

  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { 
    requiredPlanSlug: "crescer" as const, 
    message: "O acesso aos cadastros financeiros de categorias, contas e contatos requer o plano Crescer ou superior." 
  } : undefined

  return (
    <>
      <ERPPageHeader title="Cadastros financeiros" />
      <FadeIn className="p-4">
        <FinancialCategoriesPage
          initialCategories={isFreePlan ? [] : catResult.data.categories}
          initialAccounts={isFreePlan ? [] : accResult.data.accounts}
          partnerId={partnerId}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
