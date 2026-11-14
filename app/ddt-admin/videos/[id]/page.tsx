import { redirect } from "next/navigation"

export default async function AdminVideoDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/videos?search=${id}`)
}
