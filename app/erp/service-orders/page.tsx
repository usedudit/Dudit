import { ERPPageHeader } from "@/components/erp/page-header-state"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPServiceOrdersPageAction } from "@/app/actions/erp/service-orders"
import ServiceOrdersPage from "@/components/erp/service-orders/ServiceOrdersPage"

export const dynamic = "force-dynamic"

export default async function ServiceOrdersPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "service_orders", "view"),
    getERPServiceOrdersPageAction(partnerId, { cursor: null, limit: 100 }),
  ])

  if (!allowed) return <AccessDenied />
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar ordens de serviço.")
  }

  return (
    <>
      <ERPPageHeader title="Ordens de Serviço" />
      <FadeIn className="p-4">
        <ServiceOrdersPage
          orders={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
