import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminRefundRequestDetail } from "@/app/actions/admin/refund-detail"
import { notFound } from "next/navigation"
import AdminRefundDetailClientWrapper from "./AdminRefundDetailClientWrapper"

export const dynamic = "force-dynamic"

export default async function AdminRefundDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const detail = await getAdminRefundRequestDetail(id)
    if (!detail) notFound()

    return (
        <>
            <AdminHeader pageTitle={`Solicitacao #${id.slice(0, 8)}`} />
            <AdminRefundDetailClientWrapper detail={detail} />
        </>
    )
}
