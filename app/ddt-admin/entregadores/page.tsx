import { AdminHeader } from "@/components/admin/admin-header"
import DeliveryDriversManager from "@/components/admin/DeliveryDriversManager"
import {
    listDeliveryDriversAdminAction,
    getDeliveryDriverStatsAdminAction,
} from "@/app/actions/admin/delivery-drivers"

export const dynamic = "force-dynamic"

export default async function AdminDeliveryDriversPage() {
    const [result, stats] = await Promise.all([
        listDeliveryDriversAdminAction({ limit: 50 }),
        getDeliveryDriverStatsAdminAction().catch(() => undefined),
    ])

    return (
        <>
            <AdminHeader pageTitle="Entregadores" />
            <DeliveryDriversManager
                initialData={result.success ? result : { items: [], hasMore: false, nextCursor: null }}
                initialStats={stats}
            />
        </>
    )
}
