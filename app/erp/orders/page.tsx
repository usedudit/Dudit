import { ERPPageHeader } from "@/components/erp/page-header-state"
import OrdersPage from "@/components/erp/orders/OrdersPage"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPOrdersPageAction } from "@/app/actions/erp/orders"

export const dynamic = "force-dynamic"

export default async function OrdersPageServer() {
  // Layout already guarantees auth + valid context
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  // Parallelize permission check and data fetch
  const [{ allowed }, page] = await Promise.all([
    checkPermission(partnerId, "orders", "view"),
    getERPOrdersPageAction(partnerId, { cursor: null, limit: 100 }),
  ])

  if (!allowed) return <AccessDenied />
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar pedidos.")
  }

  return (
    <>
      <ERPPageHeader title="Pedidos" />
      <FadeIn className="p-4">
        <OrdersPage
          orders={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
