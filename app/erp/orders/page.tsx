import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
import OrdersPage from "@/components/erp/orders/OrdersPage"
import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission, getCurrentUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import OrdersLoading from "./loading"

export default async function OrdersPageServer() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  // Layout already guarantees auth + valid context
  const context = (await getCurrentPartnerContext())!
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "orders", "view")
  if (!allowed) return <AccessDenied />

  const orders = await getPartnerOrdersCached(partnerId)

  const userProfile = {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  }

  return (
    <>
      <ERPHeader
        pageTitle="Pedidos"
        userProfile={userProfile}
      />
      <FadeIn className="p-4">
        <Suspense fallback={<OrdersLoading />}>
          <OrdersPage
            orders={orders || []}
            partnerId={partnerId}
          />
        </Suspense>
      </FadeIn>
    </>
  )
}
