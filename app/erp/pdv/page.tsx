import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import POSPage from "@/components/erp/pdv/POSPage"
import { getPOSInitialDataAction } from "@/app/actions/erp/pdv"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { getTeamMembers } from "@/app/actions/erp/team"

export const dynamic = "force-dynamic"

export default async function POSPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  if (context.businessInfo?.mode === "quick") return <AccessDenied />

  const partnerId = context.partnerId

  // Parallel: load all initial data in a single waterfall step
  const [initialDataResult, activeSessionResult, promotionsResult, teamResult] = await Promise.all([
    getPOSInitialDataAction(partnerId),
    getActiveCashSessionAction(partnerId),
    listActivePromotionsForMarketplaceAction(partnerId).catch(() => []),
    getTeamMembers().catch(() => ({ members: [], currentUserId: undefined })),
  ])

  // PDV deve ser acessível para qualquer usuário com acesso ao ERP.
  // Não bloquear a tela por permissão granular nem por falha de carregamento.
  const initialData = initialDataResult.success
    ? initialDataResult.data
    : {
      products: [],
      customers: [],
      financeAccounts: [],
      preSales: [],
      paymentMethods: [],
    }
  const activeSession = activeSessionResult.success ? activeSessionResult.data : null
  const initialPromotions = Array.isArray(promotionsResult) ? promotionsResult : []

  // Normalize team members for the POSPage component
  const initialTeam = {
    members: (teamResult?.members || []).map((member: any) => ({
      id: member.id,
      fullName: member.fullName || null,
      userId: member.userId,
      avatarUrl: member.avatarUrl || null,
    })),
    currentUserId: teamResult?.currentUserId || undefined,
  }

  return (
    <>
      <ERPPageHeader title="PDV" />
      <FadeIn className="p-4 h-full overflow-hidden">
        <POSPage
          partnerId={partnerId}
          initialData={initialData}
          initialActiveSession={activeSession}
          initialPromotions={initialPromotions}
          initialTeam={initialTeam}
        />
      </FadeIn>
    </>
  )
}

