import { ERPPageHeader } from "@/components/erp/page-header-state"
import { TransactionsPage } from "@/components/erp/transactions"
import { checkPartnerPermission } from "@/lib/auth/authorization"
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

export default async function FinancialTransactionsRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")

  const [plan] = await Promise.all([
    getPartnerPlan(partnerId),
  ])

  if (!allowed) return <AccessDenied />
  if (plan.slug.toLowerCase() === "free") {
    return (
      <PlanGatePage
        title="Movimentações Financeiras"
        subtitle="Acompanhe todas as movimentações financeiras do seu negócio. Disponível nos planos Crescer e Escalar."
        requiredPlan="crescer"
      />
    )
  }

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
      <ERPPageHeader title="Movimentações" />
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
          forcedTab="Transações"
          pageTitle="Movimentações"
          pageSubtitle="Extrato financeiro com todas as movimentações realizadas."
        />
      </FadeIn>
    </>
  )
}
