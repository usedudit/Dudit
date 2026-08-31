import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import DeliveriesPage from "@/components/erp/deliveries/DeliveriesPage"
import { getERPDeliveriesPageAction } from "@/app/actions/erp/deliveries"

export const dynamic = "force-dynamic"

export default async function DeliveriesRoutePage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "delivery", "view"),
    getERPDeliveriesPageAction(partnerId, { cursor: null, limit: 100 }),
  ])

  if (!allowed) return <AccessDenied />
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar entregas.")
  }

  const planGate = page.planGate
  const userRole = page.userRole

  return (
    <>
      <ERPPageHeader title="Entregas" />
      <FadeIn className="p-4">
        <DeliveriesPage
          partnerId={partnerId}
          deliveries={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          planGate={planGate}
          userRole={userRole}
        />
      </FadeIn>
    </>
  )
}
