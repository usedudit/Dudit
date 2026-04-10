import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import CreateTransactionPage from "@/components/erp/transactions/CreateTransactionPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getFinancialCategoriesAction } from "@/app/actions/erp/financial-category-metadata"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"

export const dynamic = "force-dynamic"

export default async function NewFinancialTransactionRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "edit")
  if (!allowed) return <AccessDenied />

  const [categoriesResult, accountsResult] = await Promise.all([
    getFinancialCategoriesAction(partnerId),
    getFinanceAccountsAction(partnerId),
  ])

  if (!categoriesResult.success || !accountsResult.success || !categoriesResult.data || !accountsResult.data) {
    return <AccessDenied />
  }

  return (
    <>
      <ERPPageHeader title="Nova Transação" />
      <FadeIn className="p-0">
        <CreateTransactionPage
          partnerId={partnerId}
          categories={categoriesResult.data.categories}
          accounts={accountsResult.data.accounts}
        />
      </FadeIn>
    </>
  )
}

