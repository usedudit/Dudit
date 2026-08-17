import { getDeliveryDashboardAction, listMyDeliveryAssignmentsAction } from "@/app/actions/delivery-drivers"
import DeliveryDashboard from "@/components/delivery/DeliveryDashboard"

export default async function DeliveryPortalPage() {
  const [dashboard, deliveries] = await Promise.all([
    getDeliveryDashboardAction(),
    listMyDeliveryAssignmentsAction({ bucket: "all", limit: 6 }),
  ])
  return <DeliveryDashboard dashboard={dashboard.success ? dashboard.data : null} deliveries={deliveries.success ? deliveries.items : []} />
}
