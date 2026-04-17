import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getCashSessionDetailsAction } from "@/app/actions/erp/cash-register"
import CashSessionDetailPage from "@/components/erp/cash-register/CashSessionDetailPage"

export const dynamic = "force-dynamic"

export default async function CashSessionDetailsServer({ params }: { params: { id: string } }) {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [detailsResult] = await Promise.all([
    getCashSessionDetailsAction(partnerId, params.id),
  ])

  if (!detailsResult.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Detalhes do Caixa" />
      <FadeIn className="p-4 md:p-6 h-full">
        <CashSessionDetailPage partnerId={partnerId} details={detailsResult.data} />
      </FadeIn>
    </>
  )
}
