import { AdminHeader } from "@/components/admin/admin-header"
import ReturnsList from "@/components/admin/returns/ReturnsList"

export const dynamic = "force-dynamic"

export default async function AdminReturnsPage() {
    return (
        <>
            <AdminHeader pageTitle="Trocas e devoluções" />
            <ReturnsList
                initialData={{ data: [], nextCursor: null, prevCursor: null, hasMore: false }}
            />
        </>
    )
}
