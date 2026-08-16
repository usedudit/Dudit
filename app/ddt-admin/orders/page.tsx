import { AdminHeader } from "@/components/admin/admin-header"
import OrdersList from "@/components/admin/orders/OrdersList"
import { getAdminMarketplaceOrders, getAdminMarketplaceOrdersStats } from "@/app/actions/admin/marketplace-ops"

export const dynamic = "force-dynamic"

export default async function AdminOrdersPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminMarketplaceOrders(null, 50),
        getAdminMarketplaceOrdersStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Pedidos" />
            <OrdersList initialData={initialData} initialStats={initialStats} />
        </>
    )
}
