import { AdminHeader } from "@/components/admin/admin-header"
import ReturnsList from "@/components/admin/returns/ReturnsList"
import { getAdminReturnRequests, getAdminReturnRequestsStats } from "@/app/actions/admin/marketplace-ops"

export const dynamic = "force-dynamic"

export default async function AdminReturnsPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminReturnRequests(null, 10),
        getAdminReturnRequestsStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Trocas e devoluções" />
            <ReturnsList initialData={initialData} initialStats={initialStats} />
        </>
    )
}
