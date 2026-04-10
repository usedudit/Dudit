import { ERPPageHeader } from "@/components/erp/page-header-state"
import { TransactionsPage } from "@/components/erp/transactions"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getFinancialTransactionsAction } from "@/app/actions/erp/transactions"

export const dynamic = "force-dynamic"

export default async function FinancialTransactionsRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "financial", "view")
  if (!allowed) return <AccessDenied />
  const result = await getFinancialTransactionsAction(partnerId)
  if (!result.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Transações" />
      <FadeIn className="p-4">
        <TransactionsPage transactions={result.data} />
      </FadeIn>
    </>
  )
}
