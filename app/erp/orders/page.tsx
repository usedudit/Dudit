import { ERPPageHeader } from "@/components/erp/page-header-state"
import OrdersPage from "@/components/erp/orders/OrdersPage"
import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function OrdersPageServer() {
  // Layout already guarantees auth + valid context
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  // Parallelize permission check and data fetch
  const [{ allowed }, orders] = await Promise.all([
    checkPartnerPermission(partnerId, "orders", "view"),
    getPartnerOrdersCached(partnerId),
  ])

  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Pedidos" />
      <FadeIn className="p-4">
        <OrdersPage
          orders={orders || []}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
