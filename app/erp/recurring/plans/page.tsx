import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import RecurringPlansPage from "@/components/erp/recurring/RecurringPlansPage"
import { listRecurringPlansAction } from "@/app/actions/erp/recurring-plans"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecurringPlansRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const partnerId = context.partnerId
  const permission = await checkPermission(partnerId, "recurring_plans", "view")
  if (!permission.allowed) return <AccessDenied />

  const result = await listRecurringPlansAction(partnerId)
  if (!result.success) throw new Error(result.error || "Erro ao carregar planos")

  return (
    <>
      <ERPPageHeader title="Planos Recorrentes" />
      <FadeIn className="p-4">
        <RecurringPlansPage
          partnerId={partnerId}
          initialPlans={result.data?.items || []}
          initialHasMore={result.data?.hasMore || false}
          initialNextCursor={result.data?.nextCursor || null}
        />
      </FadeIn>
    </>
  )
}
