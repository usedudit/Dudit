import { AdminHeader } from "@/components/admin/admin-header"
import ReturnsList from "@/components/admin/returns/ReturnsList"
import { getAdminReturnRequests } from "@/app/actions/admin/marketplace-ops"

export const dynamic = "force-dynamic"

export default async function AdminReturnsPage() {
    const initialData = await getAdminReturnRequests(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Trocas e devoluções" />
            <ReturnsList initialData={initialData} />
        </>
    )
}
