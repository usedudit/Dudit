import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getFinancialCategoriesAction } from "@/app/actions/erp/financial-category-metadata"
import FinancialCategoriesPage from "@/components/erp/financial-cadastros/FinancialCategoriesPage"
import { redirect } from "next/navigation"
import { getCurrentUser, checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function FinancialCategoriesRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const result = await getFinancialCategoriesAction(partnerId)
  if (!result.success || !result.data) {
    throw new Error(result.error || "Erro ao carregar dados")
  }

  return (
    <>
      <ERPPageHeader title="Categorias Financeiras" />
      <FadeIn className="p-4">
        <FinancialCategoriesPage initialCategories={result.data.categories} partnerId={partnerId} />
      </FadeIn>
    </>
  )
}
