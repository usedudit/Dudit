import { ERPPageHeader } from "@/components/erp/page-header-state"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getServiceOrderDetailsAction } from "@/app/actions/erp/service-orders"
import ServiceOrderDetail from "@/components/erp/service-orders/ServiceOrderDetail"

export const dynamic = "force-dynamic"

export default async function ServiceOrderDetailPageServer({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const [{ allowed }, result] = await Promise.all([
    checkPermission(partnerId, "service_orders", "view"),
    getServiceOrderDetailsAction(id, partnerId),
  ])

  if (!allowed) return <AccessDenied />
  if (!result.success) {
    throw new Error(result.error || "Erro ao carregar detalhes da OS.")
  }

  return (
    <>
      <ERPPageHeader title={`OS #${result.data.order_number}`} backHref="/erp/ordens-de-servico" isSubPage />
      <FadeIn className="p-4">
        <ServiceOrderDetail data={result.data} partnerId={partnerId} />
      </FadeIn>
    </>
  )
}
