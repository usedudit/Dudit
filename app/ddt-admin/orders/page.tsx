import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminMarketplaceOrders } from "@/app/actions/admin/marketplace-ops"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function AdminOrdersPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
    const params = await searchParams
    const orders = await getAdminMarketplaceOrders({ status: params?.status, limit: 75 })

    return (
        <>
            <AdminHeader pageTitle="Pedidos" />
            <div className="p-4 md:p-6 space-y-4">
                <div className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        Visao operacional de pedidos com pagamento, estoque, historico de cancelamentos, trocas e pedidos vinculados.
                    </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                    <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="bg-brand-gray dark:bg-dark-border/40">
                            <tr>
                                <th className="p-3 font-semibold">Pedido</th>
                                <th className="p-3 font-semibold">Cliente</th>
                                <th className="p-3 font-semibold">Seller</th>
                                <th className="p-3 font-semibold">Pagamento</th>
                                <th className="p-3 font-semibold">Entrega</th>
                                <th className="p-3 font-semibold">Total pago</th>
                                <th className="p-3 font-semibold">Impacto</th>
                                <th className="p-3 font-semibold">Historico</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order: any) => {
                                const returns = Array.isArray(order.return_requests) ? order.return_requests : []
                                const exchangeOrder = order.exchange_parent_order_id || order.exchange_return_request_id
                                return (
                                    <tr key={order.id} className="border-t border-brand-border dark:border-dark-border">
                                        <td className="p-3">
                                            <div className="font-bold text-brand-dark dark:text-dark-heading">{order.order_number || order.id.slice(0, 8)}</div>
                                            <div className="text-xs text-brand-inactive-text">{formatDate(order.created_at)}</div>
                                        </td>
                                        <td className="p-3">{order.customer_name || "Cliente"}</td>
                                        <td className="p-3">{order.partners?.store_name || order.partners?.business_name || "-"}</td>
                                        <td className="p-3">
                                            <div>{order.situation || "-"}</div>
                                            <div className="text-xs text-brand-inactive-text">{order.payment_method || order.payment_provider || "-"}</div>
                                        </td>
                                        <td className="p-3">{order.delivery_status || "-"}</td>
                                        <td className="p-3 font-bold">{formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}</td>
                                        <td className="p-3">
                                            <div>{order.order_items?.length || 0} itens</div>
                                            <div className="text-xs text-brand-inactive-text">{exchangeOrder ? "Pedido de troca vinculado" : "Sem troca vinculada"}</div>
                                        </td>
                                        <td className="p-3">
                                            {returns.length > 0 ? (
                                                <span title="Contains return/exchange history">↩ {returns.length}</span>
                                            ) : (
                                                <span className="text-brand-inactive-text">Sem solicitacoes</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    )
}
