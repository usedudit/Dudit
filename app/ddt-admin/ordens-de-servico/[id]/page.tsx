import { redirect } from "next/navigation"

/**
 * Redireciona rota legada / direta para a visualização unificada da OS
 * (/ddt-admin/ordens-de-servico?view=<id>).
 */
export default async function AdminServiceOrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/ordens-de-servico?view=${id}`)
}
