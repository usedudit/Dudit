import { redirect } from "next/navigation"

export default async function AdminDeliveryDriverDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/entregadores?view=${id}`)
}
