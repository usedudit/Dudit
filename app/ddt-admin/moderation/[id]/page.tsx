import { AdminHeader } from "@/components/admin/admin-header"
import { getModerationItemDetail } from "@/app/actions/admin/moderation"
import { notFound } from "next/navigation"
import AdminModerationDetailClientWrapper from "./AdminModerationDetailClientWrapper"

export const dynamic = "force-dynamic"

export default async function AdminModerationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const result = await getModerationItemDetail(id)
    if (!result.success || !result.data) notFound()

    const item = result.data
    const typeLabel = item.type === "product" ? "Produto" : item.type === "service" ? "Serviço" : "Item"

    return (
        <>
            <AdminHeader pageTitle={`${typeLabel} #${id.slice(0, 8)}`} />
            <AdminModerationDetailClientWrapper item={item} />
        </>
    )
}
