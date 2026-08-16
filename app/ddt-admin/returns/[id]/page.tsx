import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminReturnRequestDetail } from "@/app/actions/admin/return-detail"
import { notFound } from "next/navigation"
import AdminReturnDetailClientWrapper from "./AdminReturnDetailClientWrapper"

export const dynamic = "force-dynamic"

export default async function AdminReturnDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const detail = await getAdminReturnRequestDetail(id)
    if (!detail) notFound()

    return (
        <>
            <AdminHeader pageTitle={`Solicitação #${id.slice(0, 8)}`} />
            <AdminReturnDetailClientWrapper detail={detail} />
        </>
    )
}
