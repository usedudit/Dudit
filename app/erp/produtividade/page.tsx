import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { canAccessRoute } from "@/lib/permissions/route-permissions"
import type { PartnerRole } from "@/lib/permissions/types"
import ProductivityPage from "@/components/erp/produtividade/ProductivityPage"
import {
  getProductivityOverviewAction,
  getProductivityRankingAction,
} from "@/app/actions/erp/produtividade"

export const dynamic = "force-dynamic"

export default async function ProdutividadePage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const role = (context.role || "DELIVERY") as PartnerRole
  const routePermissions = normalizeToRoutePermissions(role, context.roleId === "owner" ? null : context.permissions)
  if (!canAccessRoute(routePermissions, "productivity_overview")) return <AccessDenied />

  const overviewRes = await getProductivityOverviewAction(partnerId)
  const rankingRes = await getProductivityRankingAction(partnerId)

  const overview = overviewRes.success
    ? {
        totalSold: overviewRes.totalSold || 0,
        totalSalesCount: overviewRes.totalSalesCount || 0,
        averageTicket: overviewRes.averageTicket || 0,
        generalGoal: overviewRes.generalGoal || 0,
        goalAchievedPercent: overviewRes.goalAchievedPercent || 0,
        estimatedCommission: overviewRes.estimatedCommission || 0,
        paidCommission: overviewRes.paidCommission || 0,
        pendingCommission: overviewRes.pendingCommission || 0,
      }
    : {
        totalSold: 0,
        totalSalesCount: 0,
        averageTicket: 0,
        generalGoal: 0,
        goalAchievedPercent: 0,
        estimatedCommission: 0,
        paidCommission: 0,
        pendingCommission: 0,
      }

  const ranking = rankingRes.success ? rankingRes.ranking : []

  return (
    <>
      <ERPPageHeader title="Visão Geral" />
      <FadeIn className="p-4">
        <ProductivityPage overview={overview} ranking={ranking} />
      </FadeIn>
    </>
  )
}
