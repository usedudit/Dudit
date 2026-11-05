import { redirect } from "next/navigation"

/**
 * Rota legada: o detalhe do pedido agora é aberto via query param,
 * no mesmo padrão das demais páginas do admin (/ddt-admin/orders?view=<id>).
 */
export default async function AdminOrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/ddt-admin/orders?view=${id}`)
}
