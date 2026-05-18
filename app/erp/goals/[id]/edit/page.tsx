import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getGoalFormOptionsAction, getSalesGoalByIdAction } from "@/app/actions/erp/goals"
import GoalFormPage from "@/components/erp/goals/GoalFormPage"

export const dynamic = "force-dynamic"

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const [{ allowed }, options, goalRes] = await Promise.all([
    checkPartnerPermission(partnerId, "goals", "edit"),
    getGoalFormOptionsAction(partnerId),
    getSalesGoalByIdAction(partnerId, id),
  ])
  if (!allowed || !options.success || !goalRes.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Editar meta" />
      <FadeIn className="p-0">
        <GoalFormPage partnerId={partnerId} mode="edit" sellers={options.sellers} accounts={options.accounts} initialGoal={goalRes.goal} />
      </FadeIn>
    </>
  )
}
