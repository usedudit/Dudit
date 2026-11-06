import { redirect } from "next/navigation"

/**
 * Rota legada: o detalhe da devolução agora é aberto via query param,
 * no mesmo padrão das demais páginas do admin (/ddt-admin/returns?view=<id>).
 */
export default async function AdminReturnDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/returns?view=${id}`)
}
