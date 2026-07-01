import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { canAccessRoute } from "@/lib/permissions/route-permissions"
import type { PartnerRole } from "@/lib/permissions/types"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import GoalsPage from "@/components/erp/goals/GoalsPage"
import { getSalesGoalsModuleAction, getSalesGoalsRankingAction, getSalesGoalsSummaryAction } from "@/app/actions/erp/goals"

export const dynamic = "force-dynamic"

export default async function ProdutividadeMetasPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId
  const role = (context.role || "DELIVERY") as PartnerRole
  const routePermissions = normalizeToRoutePermissions(role, context.permissions)
  if (!canAccessRoute(routePermissions, "productivity_goals")) return <AccessDenied />

  const [plan, goalsRes, rankingRes, summaryRes] = await Promise.all([
    getPartnerPlan(partnerId),
    getSalesGoalsModuleAction(partnerId),
    getSalesGoalsRankingAction(partnerId),
    getSalesGoalsSummaryAction(partnerId),
  ])

  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { requiredPlanSlug: "crescer" as const } : undefined

  const safeGoals = goalsRes.success ? goalsRes.goals : []
  const safeSellers = goalsRes.success ? goalsRes.sellers : []
  const safeRanking = rankingRes.success ? rankingRes.ranking : []
  const safeSummary = summaryRes.success ? summaryRes.summary : { total_sold: 0, total_commissions: 0, total_bonus_paid: 0, active_goals: 0, achieved_goals: 0 }

  return (
    <>
      <ERPPageHeader title="Metas" />
      <FadeIn className="p-4">
        <GoalsPage
          partnerId={partnerId}
          initialGoals={isFreePlan ? [] : safeGoals}
          sellers={isFreePlan ? [] : safeSellers}
          initialRanking={isFreePlan ? [] : safeRanking}
          initialSummary={isFreePlan ? { total_sold: 0, total_commissions: 0, total_bonus_paid: 0, active_goals: 0, achieved_goals: 0 } : safeSummary}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
