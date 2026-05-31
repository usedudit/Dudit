import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { redirect } from "next/navigation"
import { getCurrentUser, checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import RecurringSubscriptionsPage from "@/components/erp/recurring/RecurringSubscriptionsPage"
import { listRecurringSubscriptionsAction } from "@/app/actions/erp/recurring-subscriptions"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function RecurringSubscriptionsRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const partnerId = context.partnerId
  const permission = await checkPartnerPermission(partnerId, "recurring_subscriptions", "view")
  if (!permission.allowed) return <AccessDenied />

  const result = await listRecurringSubscriptionsAction(partnerId)
  if (!result.success) throw new Error(result.error || "Erro ao carregar assinaturas")

  return (
    <>
      <ERPPageHeader title="Assinaturas Recorrentes" />
      <FadeIn className="p-4">
        <RecurringSubscriptionsPage
          partnerId={partnerId}
          initialSubscriptions={result.data?.items || []}
          initialHasMore={result.data?.hasMore || false}
          initialNextCursor={result.data?.nextCursor || null}
        />
      </FadeIn>
    </>
  )
}
