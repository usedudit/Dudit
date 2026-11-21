import { AdminHeader } from "@/components/admin/admin-header"
import ServiceOrdersList from "@/components/admin/service-orders/ServiceOrdersList"

export const dynamic = "force-dynamic"

export default async function AdminServiceOrdersPage() {
    return (
        <>
            <AdminHeader pageTitle="Ordens de Serviço" />
            <ServiceOrdersList initialData={[]} initialNextCursor={null} initialHasMore={false} />
        </>
    )
}
