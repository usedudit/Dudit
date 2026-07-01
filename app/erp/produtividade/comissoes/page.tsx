import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { canAccessRoute } from "@/lib/permissions/route-permissions"
import type { PartnerRole } from "@/lib/permissions/types"
import CommissionPage from "@/components/erp/produtividade/CommissionPage"
import { getSellersCommissionOverviewAction } from "@/app/actions/erp/produtividade"

export const dynamic = "force-dynamic"

export default async function ProdutividadeComissoesPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const role = (context.role || "DELIVERY") as PartnerRole
  const routePermissions = normalizeToRoutePermissions(role, context.permissions)
  if (!canAccessRoute(routePermissions, "productivity_commissions")) return <AccessDenied />

  const overview = overviewRes.success && overviewRes.overview
    ? overviewRes.overview
    : {
        totalPending: 0,
        totalPaid: 0,
        totalGeneral: 0,
        goalBonuses: 0,
        estimatedCommission: 0,
        sellers: [],
      }

  return (
    <>
      <ERPPageHeader title="Comissões" />
      <FadeIn className="p-4">
        <CommissionPage partnerId={partnerId} overview={overview} />
      </FadeIn>
    </>
  )
}
