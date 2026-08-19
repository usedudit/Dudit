import type { Metadata } from "next"
import { getDeliveryDashboardAction, listMyDeliveryAssignmentsAction } from "@/app/actions/delivery-drivers"
import DeliveryDashboard from "@/components/delivery/DeliveryDashboard"

export const metadata: Metadata = {
  title: "Portal do Entregador",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

export default async function DeliveryPortalPage() {
  const [dashboard, deliveries] = await Promise.all([
    getDeliveryDashboardAction(),
    listMyDeliveryAssignmentsAction({ bucket: "all", limit: 6 }),
  ])
  return (
    <DeliveryDashboard
      dashboard={dashboard.success ? dashboard.data : null}
      deliveries={deliveries.success ? (deliveries.items as any) : []}
    />
  )
}
