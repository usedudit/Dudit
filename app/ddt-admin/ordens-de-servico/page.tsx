import { AdminHeader } from "@/components/admin/admin-header"
import ServiceOrdersList from "@/components/admin/service-orders/ServiceOrdersList"
import { getAdminServiceOrders, getAdminServiceOrdersStats } from "@/app/actions/admin/service-orders"

export const dynamic = "force-dynamic"

export default async function AdminServiceOrdersPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminServiceOrders(null, 10),
        getAdminServiceOrdersStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Ordens de Serviço" />
            <ServiceOrdersList initialData={initialData.data} initialStats={initialStats} />
        </>
    )
}

