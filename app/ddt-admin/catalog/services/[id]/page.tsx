import { notFound } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminCatalogServiceDetail } from "@/app/actions/admin/catalog"
import AdminServiceDetailClient from "@/components/admin/catalog/AdminServiceDetailClient"

export const dynamic = "force-dynamic"

export default async function AdminCatalogServiceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const res = await getAdminCatalogServiceDetail(id)
    if (!res.success || !res.data) notFound()

    const { service, store, partner, auditEvents } = res.data

    return (
        <>
            <AdminHeader pageTitle={service.name || "Serviço"} />
            <AdminServiceDetailClient
                service={service}
                partnerId={service.partner_id}
                businessInfo={partner?.business_info}
                store={store}
                partnerName={store?.name}
                auditEvents={auditEvents}
            />
        </>
    )
}
