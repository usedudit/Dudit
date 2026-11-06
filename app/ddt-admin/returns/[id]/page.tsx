import { AdminHeader } from "@/components/admin/admin-header"
import { notFound } from "next/navigation"
import AdminReturnDetailClientWrapper from "./AdminReturnDetailClientWrapper"

export const dynamic = "force-dynamic"

export default async function AdminReturnDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    return (
        <>
            <AdminHeader pageTitle={`Solicitação #${id.slice(0, 8)}`} />
            <AdminReturnDetailClientWrapper returnId={id} onBack={() => {}} />
        </>
    )
}
