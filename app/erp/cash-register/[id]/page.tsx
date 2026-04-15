import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCashSessionDetailsAction } from "@/app/actions/erp/cash-register"
import CashSessionDetailPage from "@/components/erp/cash-register/CashSessionDetailPage"

export const dynamic = "force-dynamic"

export default async function CashSessionDetailsServer({ params }: { params: { id: string } }) {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [{ allowed }, detailsResult] = await Promise.all([
    checkPartnerPermission(partnerId, "financial", "view"),
    getCashSessionDetailsAction(partnerId, params.id),
  ])

  if (!allowed || !detailsResult.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Detalhes do Caixa" />
      <FadeIn className="p-4 md:p-6 h-full">
        <CashSessionDetailPage details={detailsResult.data} />
      </FadeIn>
    </>
  )
}
