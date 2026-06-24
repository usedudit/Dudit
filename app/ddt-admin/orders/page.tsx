import { AdminHeader } from "@/components/admin/admin-header"
import OrdersList from "@/components/admin/orders/OrdersList"
import { getAdminMarketplaceOrders } from "@/app/actions/admin/marketplace-ops"

export const dynamic = "force-dynamic"

export default async function AdminOrdersPage() {
    const initialData = await getAdminMarketplaceOrders(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Pedidos" />
            <OrdersList initialData={initialData} />
        </>
    )
}
