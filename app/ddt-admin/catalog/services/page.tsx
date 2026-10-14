import { AdminHeader } from "@/components/admin/admin-header"
import { AdminCatalogList } from "@/components/admin/catalog/AdminCatalogList"
import { listAdminCatalogServices } from "@/app/actions/admin/catalog"

export const dynamic = "force-dynamic"

export default async function AdminCatalogServicesPage() {
    const res = await listAdminCatalogServices({ limit: 100 })
    const items = res.success ? res.data.items : []

    return (
        <>
            <AdminHeader pageTitle="Catálogo — Serviços" />
            <AdminCatalogList kind="services" initialItems={items} />
        </>
    )
}
