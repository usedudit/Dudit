import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"
import { notFound } from "next/navigation"
import AdminOrderDetailClient from "@/components/admin/orders/AdminOrderDetailClient"

export const dynamic = "force-dynamic"

export default async function AdminOrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const detail = await getAdminMarketplaceOrderDetail(id)
    if (!detail) notFound()

    const orderLabel = detail.order_number
        ? `Pedido #${detail.order_number}`
        : `Pedido #${id.slice(0, 8)}`

    return (
        <>
            <AdminHeader pageTitle={orderLabel} />
            <AdminOrderDetailClient detail={detail} />
        </>
    )
}
