import { redirect } from "next/navigation"

export default async function AdminPromotionDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/promocoes?search=${id}`)
}
