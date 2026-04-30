import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import POSPage from "@/components/erp/pdv/POSPage"
import { getPOSInitialDataAction } from "@/app/actions/erp/pdv"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"

export const dynamic = "force-dynamic"

export default async function POSPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [initialDataResult, activeSessionResult] = await Promise.all([
    getPOSInitialDataAction(partnerId),
    getActiveCashSessionAction(partnerId),
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

  return (
    <>
      <ERPPageHeader title="PDV" />
      <FadeIn className="p-4 md:p-6 h-full">
        <POSPage
          partnerId={partnerId}
          initialData={initialData}
          initialActiveSession={activeSession}
        />
      </FadeIn>
    </>
  )
}
