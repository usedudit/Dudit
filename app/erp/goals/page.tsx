import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import GoalsPage from "@/components/erp/goals/GoalsPage"
import { getSalesGoalsModuleAction, getSalesGoalsRankingAction, getSalesGoalsSummaryAction } from "@/app/actions/erp/goals"

export const dynamic = "force-dynamic"

export default async function GoalsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const [{ allowed }, goalsRes, rankingRes, summaryRes] = await Promise.all([
    checkPartnerPermission(partnerId, "orders", "view"),
    getSalesGoalsModuleAction(partnerId),
    getSalesGoalsRankingAction(partnerId),
    getSalesGoalsSummaryAction(partnerId),
  ])

  if (!allowed) return <AccessDenied />
  if (!goalsRes.success) throw new Error(goalsRes.error || "Erro ao carregar metas.")
  if (!rankingRes.success) throw new Error("Erro ao carregar ranking.")
  if (!summaryRes.success) throw new Error("Erro ao carregar resumo.")

  return (
    <>
      <ERPPageHeader title="Metas" />
      <FadeIn className="p-4">
        <GoalsPage
          partnerId={partnerId}
          initialGoals={goalsRes.goals}
          sellers={goalsRes.sellers}
          initialRanking={rankingRes.ranking}
          initialSummary={summaryRes.summary}
        />
      </FadeIn>
    </>
  )
}
