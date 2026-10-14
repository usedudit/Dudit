import { AdminHeader } from "@/components/admin/admin-header"
import { AdminCatalogList } from "@/components/admin/catalog/AdminCatalogList"
import { listAdminCatalogProducts } from "@/app/actions/admin/catalog"

export const dynamic = "force-dynamic"

export default async function AdminCatalogProductsPage() {
    const res = await listAdminCatalogProducts({ limit: 100 })
    const items = res.success ? res.data.items : []

    return (
        <>
            <AdminHeader pageTitle="Catálogo — Produtos" />
            <AdminCatalogList kind="products" initialItems={items} />
        </>
    )
}
