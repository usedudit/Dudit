import { redirect } from "next/navigation"

export default async function AdminCatalogPlanDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/catalog/plans?view=${id}`)
}
