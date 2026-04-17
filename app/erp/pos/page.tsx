import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import POSPage from "@/components/erp/pos/POSPage"
import { getPOSInitialDataAction } from "@/app/actions/erp/pos"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"

export const dynamic = "force-dynamic"

export default async function POSPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  // PDV: qualquer membro da equipe com acesso ao ERP pode usar (não exige orders.create).
  const [{ allowed }, initialDataResult, activeSessionResult] = await Promise.all([
    checkPartnerPermission(partnerId, "orders", "view"),
    getPOSInitialDataAction(partnerId),
    getActiveCashSessionAction(partnerId),
  ])

  if (!allowed) return <AccessDenied />

  if (!initialDataResult.success) {
    return <AccessDenied />
  }

  if (!activeSessionResult.success) {
    return <AccessDenied />
  }

  return (
    <>
      <ERPPageHeader title="PDV" />
      <FadeIn className="p-4 md:p-6 h-full">
        <POSPage
          partnerId={partnerId}
          initialData={initialDataResult.data}
          initialActiveSession={activeSessionResult.data}
        />
      </FadeIn>
    </>
  )
}
