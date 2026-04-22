import { AccessDenied } from "@/components/erp/access-denied"
import CouponsPage from "@/components/erp/coupons/CouponsPage"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { listCouponsAction } from "@/app/actions/erp/coupons"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function CouponsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const [{ allowed }, couponsRes] = await Promise.all([
    checkPartnerPermission(partnerId, "orders", "view"),
    listCouponsAction(partnerId, { page: 1, limit: 100 }),
  ])
  if (!allowed) return <AccessDenied />
  if (!couponsRes.success) throw new Error(couponsRes.error || "Erro ao carregar cupons.")

  return (
    <>
      <ERPPageHeader title="Cupons" />
      <FadeIn className="p-4">
        <CouponsPage
          partnerId={partnerId}
          initialCoupons={couponsRes.data}
          initialTotal={couponsRes.total ?? 0}
        />
      </FadeIn>
    </>
  )
}
