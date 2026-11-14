import { redirect } from "next/navigation"

/**
 * Redireciona rota legada / direta para a visualização unificada de Orçamentos
 * (/ddt-admin/orcamentos?view=<id>).
 */
export default async function AdminQuoteDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/orcamentos?view=${id}`)
}
