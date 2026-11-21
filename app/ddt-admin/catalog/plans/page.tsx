import { AdminHeader } from "@/components/admin/admin-header"
import PlansList from "@/components/admin/catalog/PlansList"
import { listAdminCatalogPlans } from "@/app/actions/admin/catalog"

export const dynamic = "force-dynamic"

export default async function AdminPlansPage() {
    const res = await listAdminCatalogPlans({ limit: 10 })
    const items = res.success && res.data ? res.data.items : []
    const nextCursor = res.success && res.data ? res.data.nextCursor : null
    const hasMore = res.success && res.data ? res.data.hasMore : false

    return (
        <>
            <AdminHeader pageTitle="Planos Recorrentes" />
            <PlansList initialItems={items} initialNextCursor={nextCursor} initialHasMore={hasMore} />
        </>
    )
}
