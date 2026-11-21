import { AdminHeader } from "@/components/admin/admin-header"
import OrdersList from "@/components/admin/orders/OrdersList"

export const dynamic = "force-dynamic"

export default async function AdminOrdersPage() {
    return (
        <>
            <AdminHeader pageTitle="Pedidos" />
            <OrdersList
                initialData={{ data: [], nextCursor: null, prevCursor: null, hasMore: false }}
            />
        </>
    )
}
