import { AdminHeader } from "@/components/admin/admin-header"
import DispatchHealthDashboard from "@/components/admin/delivery-drivers/DispatchHealthDashboard"
import { getDispatchHealthAdminAction } from "@/app/actions/admin/delivery-drivers"

export const dynamic = "force-dynamic"

export default async function AdminDispatchHealthPage() {
    const res = await getDispatchHealthAdminAction({ days: 14 }).catch(() => null)

    return (
        <>
            <AdminHeader pageTitle="Saúde do Despacho" />
            <DispatchHealthDashboard initialMetrics={res && res.success ? res.data : null} />
        </>
    )
}
