import { AdminHeader } from "@/components/admin/admin-header"
import { AdminCatalogList } from "@/components/admin/catalog/AdminCatalogList"
import { listAdminCatalogPlans } from "@/app/actions/admin/catalog"

export const dynamic = "force-dynamic"

export default async function AdminCatalogPlansPage() {
    const res = await listAdminCatalogPlans({ limit: 100 })
    const items = res.success ? res.data.items : []

    return (
        <>
            <AdminHeader pageTitle="Catálogo — Planos recorrentes" />
            <AdminCatalogList kind="plans" initialItems={items} />
        </>
    )
}
