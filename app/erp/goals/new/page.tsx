import { ERPPageHeader } from "@/components/erp/page-header-state"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getGoalFormOptionsAction } from "@/app/actions/erp/goals"
import GoalFormPage from "@/components/erp/goals/GoalFormPage"

export const dynamic = "force-dynamic"

export default async function NewGoalPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />
  const partnerId = context.partnerId

  const [{ allowed }, options] = await Promise.all([
    checkPartnerPermission(partnerId, "goals", "create"),
    getGoalFormOptionsAction(partnerId),
  ])
  if (!allowed || !options.success) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Nova meta" />
      <FadeIn className="p-0">
        <GoalFormPage partnerId={partnerId} mode="create" sellers={options.sellers} accounts={options.accounts} />
      </FadeIn>
    </>
  )
}
