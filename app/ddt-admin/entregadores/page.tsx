import { AdminHeader } from "@/components/admin/admin-header"
import DeliveryDriversManager from "@/components/admin/DeliveryDriversManager"
import { listDeliveryDriversAdminAction } from "@/app/actions/admin/delivery-drivers"

export default async function AdminDeliveryDriversPage() {
  const result = await listDeliveryDriversAdminAction({ limit: 25 })
  return (
    <>
      <AdminHeader pageTitle="Entregadores" />
      <DeliveryDriversManager initialData={result.success ? result : { items: [], hasMore: false, nextCursor: null }} />
    </>
  )
}
