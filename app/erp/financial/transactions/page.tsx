import { ERPPageHeader } from "@/components/erp/page-header-state"
import { TransactionsPage } from "@/components/erp/transactions"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getFinancialTransactionsAction } from "@/app/actions/erp/transactions"
import { getFinancialCategoriesAction } from "@/app/actions/erp/financial-category-metadata"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"

export const dynamic = "force-dynamic"

export default async function FinancialTransactionsRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const [txResult, categoriesResult, accountsResult] = await Promise.all([
    getFinancialTransactionsAction(partnerId),
    getFinancialCategoriesAction(partnerId),
    getFinanceAccountsAction(partnerId),
  ])

  if (!txResult.success) return <AccessDenied />

  const categories = categoriesResult.success && categoriesResult.data ? categoriesResult.data.categories : []
  const accounts = accountsResult.success && accountsResult.data ? accountsResult.data.accounts : []

  return (
    <>
      <ERPPageHeader title="Transações" />
      <FadeIn className="p-4">
        <TransactionsPage
          transactions={txResult.data}
          partnerId={partnerId}
          categories={categories}
          accounts={accounts}
        />
      </FadeIn>
    </>
  )
}
