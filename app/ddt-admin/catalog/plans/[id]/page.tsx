import { notFound } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminCatalogPlanDetail } from "@/app/actions/admin/catalog"
import AdminPlanDetailClient from "@/components/admin/catalog/AdminPlanDetailClient"

export const dynamic = "force-dynamic"

export default async function AdminCatalogPlanDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const res = await getAdminCatalogPlanDetail(id)
    if (!res.success || !res.data) notFound()

    const { plan, store, partner } = res.data

    return (
        <>
            <AdminHeader pageTitle={plan.name || "Plano recorrente"} />
            <AdminPlanDetailClient
                plan={plan}
                partnerId={plan.partnerId}
                businessInfo={partner?.business_info}
                store={store}
            />
        </>
    )
}
