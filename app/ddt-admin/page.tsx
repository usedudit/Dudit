import { AdminHeader } from "@/components/admin/admin-header"
import AdminDashboard from "@/components/admin/AdminDashboard"
import { getAdminDashboardStats } from "@/app/actions/admin/audit-logs"

export default async function AdminDashboardPage() {
    let stats = null
    try {
        stats = await getAdminDashboardStats()
    } catch {
        // Stats fetch failed — dashboard will show zeros
    }

    return (
        <>
            <AdminHeader pageTitle="Visão Geral" />
            <AdminDashboard stats={stats} />
        </>
    )
}
