import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { PlanGatePage } from "@/components/erp/PlanGatePage"
import { getActiveCashSessionAction, getCashSessionsHistoryPageAction } from "@/app/actions/erp/cash-register"
import CashRegisterPage from "@/components/erp/cash-register/CashRegisterPage"

export const dynamic = "force-dynamic"

export default async function CashRegisterPageServer(props: { searchParams?: Promise<{ view?: string }> }) {
  const searchParams = await props.searchParams
  const viewId = searchParams?.view || null

  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId
  const plan = await getPartnerPlan(partnerId)
  if (plan.slug.toLowerCase() === "free") {
    return (
      <PlanGatePage
        title="Caixa (PDV)"
        subtitle="Gerencie o caixa do seu negócio com abertura e fechamento de sessões. Disponível nos planos Crescer e Escalar."
        requiredPlan="crescer"
      />
    )
  }
  const [historyResult, activeSessionResult] = await Promise.all([
    getCashSessionsHistoryPageAction(partnerId, { cursor: null, limit: 100 }),
    getActiveCashSessionAction(partnerId),
  ])

  if (!historyResult.success || !activeSessionResult.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Caixa (PDV)" />
      <FadeIn className="p-4">
        <CashRegisterPage
          partnerId={partnerId}
          initialHistory={historyResult.items || []}
          initialNextCursor={historyResult.nextCursor}
          initialHasMore={historyResult.hasMore}
          initialActiveSession={activeSessionResult.data || null}
          initialViewId={viewId}
        />
      </FadeIn>
    </>
  )
}
