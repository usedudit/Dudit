import { ERPPageHeader } from "@/components/erp/page-header-state"
import { TransactionsPage } from "@/components/erp/transactions"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  getTransactionsData,
  getCategoriesData,
  getAccountsData,
  getRecurringOccurrencesData,
  getRecurringTemplatesData,
  getPaymentMethodsData,
} from "@/lib/data/financial-data"

export const dynamic = "force-dynamic"

export default async function FinancialPagamentosRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const [txResult, categoriesResult, accountsResult, recurringResult, recurringTemplatesResult, paymentMethodsResult] = await Promise.all([
    getTransactionsData(partnerId),
    getCategoriesData(partnerId),
    getAccountsData(partnerId),
    getRecurringOccurrencesData(partnerId),
    getRecurringTemplatesData(partnerId),
    getPaymentMethodsData(partnerId),
  ])

  if (!txResult.success) {
    throw new Error(txResult.error || "Erro ao carregar transações.")
  }

  const categories = categoriesResult.success && categoriesResult.data ? categoriesResult.data.categories : []
  const accounts = accountsResult.success && accountsResult.data ? accountsResult.data.accounts : []
  const recurringOccurrences = recurringResult.success ? recurringResult.data : []
  const recurringTemplates = recurringTemplatesResult?.success ? recurringTemplatesResult.data : []
  const paymentMethods = paymentMethodsResult?.methods || []

  return (
    <>
      <ERPPageHeader title="Contas a pagar" />
      <FadeIn className="p-4">
        <TransactionsPage
          initialItems={txResult.items}
          initialNextCursor={txResult.nextCursor}
          initialHasMore={txResult.hasMore}
          partnerId={partnerId}
          categories={categories}
          accounts={accounts}
          recurringOccurrences={recurringOccurrences}
          recurringTemplates={recurringTemplates as any}
          paymentMethods={paymentMethods as any}
          forcedTab="A pagar"
          pageTitle="Contas a pagar"
          pageSubtitle="Despesas, contas a pagar e obrigações financeiras."
        />
      </FadeIn>
    </>
  )
}
