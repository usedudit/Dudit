import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getActiveCashSessionAction, getCashSessionsHistoryAction } from "@/app/actions/erp/cash-register"
import CashRegisterPage from "@/components/erp/cash-register/CashRegisterPage"

export const dynamic = "force-dynamic"

export default async function CashRegisterPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [historyResult, activeSessionResult] = await Promise.all([
    getCashSessionsHistoryAction(partnerId),
    getActiveCashSessionAction(partnerId),
  ])

  if (!historyResult.success || !activeSessionResult.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Caixa (PDV)" />
      <FadeIn className="p-4 md:p-6 h-full">
        <CashRegisterPage
          partnerId={partnerId}
          initialHistory={historyResult.data || []}
          initialActiveSession={activeSessionResult.data || null}
        />
      </FadeIn>
    </>
  )
}
