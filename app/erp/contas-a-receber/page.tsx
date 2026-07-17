import { ERPPageHeader } from "@/components/erp/page-header-state"
import { TransactionsPage } from "@/components/erp/transactions"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
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

export default async function FinancialRecebimentosRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const activeStoreId = context.activeStoreId || null
  const { allowed } = await checkPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />

  const plan = await getPartnerPlan(partnerId)
  if (plan.slug.toLowerCase() === "free") {
    return (
      <PlanGatePage
        title="Contas a Receber"
        subtitle="Gerencie suas contas a receber e receitas do negócio. Disponível nos planos Crescer e Escalar."
        requiredPlan="crescer"
      />
    )
  }

  const [txResult, categoriesResult, accountsResult, recurringResult, recurringTemplatesResult, paymentMethodsResult] = await Promise.all([
    getTransactionsData(partnerId, { storeId: activeStoreId }),
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
      <ERPPageHeader title="Contas a receber" />
      <FadeIn className="p-4">
        <TransactionsPage
          initialItems={txResult.items}
          initialNextCursor={txResult.nextCursor}
          initialHasMore={txResult.hasMore}
          partnerId={partnerId}
          storeId={activeStoreId}
          categories={categories}
          accounts={accounts}
          recurringOccurrences={recurringOccurrences}
          recurringTemplates={recurringTemplates as any}
          paymentMethods={paymentMethods as any}
          forcedTab="A receber"
          pageTitle="Contas a receber"
          pageSubtitle="Receitas, valores a receber e cobranças pendentes."
        />
      </FadeIn>
    </>
  )
}
