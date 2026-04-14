import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getCategoriesData, getAccountsData } from "@/lib/data/financial-data"
import FinancialCategoriesPage from "@/components/erp/financial-cadastros/FinancialCategoriesPage"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function FinancialCategoriesRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const [catResult, accResult] = await Promise.all([
    getCategoriesData(partnerId),
    getAccountsData(partnerId),
  ])

  if (!catResult.success || !catResult.data) {
    throw new Error(catResult.error || "Erro ao carregar categorias")
  }
  if (!accResult.success || !accResult.data) {
    throw new Error(accResult.error || "Erro ao carregar contas")
  }

  return (
    <>
      <ERPPageHeader title="Cadastros financeiros" />
      <FadeIn className="p-4">
        <FinancialCategoriesPage
          initialCategories={catResult.data.categories}
          initialAccounts={accResult.data.accounts}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
