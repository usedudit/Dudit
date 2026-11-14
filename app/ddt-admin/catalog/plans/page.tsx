import { AdminHeader } from "@/components/admin/admin-header"
import PlansList from "@/components/admin/catalog/PlansList"
import { listAdminCatalogPlans } from "@/app/actions/admin/catalog"

export const dynamic = "force-dynamic"

export default async function AdminPlansPage() {
    const res = await listAdminCatalogPlans({ limit: 100 })
    const items = res.success && res.data ? res.data.items : []

    return (
        <>
            <AdminHeader pageTitle="Planos Recorrentes" />
            <PlansList initialItems={items} />
        </>
    )
}

