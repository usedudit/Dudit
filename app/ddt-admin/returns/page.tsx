import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminReturnRequests } from "@/app/actions/admin/marketplace-ops"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getReturnStatusLabel, getReturnResolutionLabel } from "@/lib/returns/types"

export default async function AdminReturnsPage({ searchParams }: { searchParams?: Promise<{ status?: string; type?: string; source?: string }> }) {
    const params = await searchParams
    const requests = await getAdminReturnRequests({ status: params?.status, type: params?.type, source: params?.source, limit: 75 })

    return (
        <>
            <AdminHeader pageTitle="Trocas e devolucoes" />
            <div className="p-4 md:p-6 space-y-4">
                <div className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        Fila administrativa com cliente, seller, origem, valores, evidencias, linha do tempo e ações financeiras geradas.
                    </p>
                    <p className="mt-2 text-xs text-brand-inactive-text dark:text-dark-body">
                        Dica: use query params como <span className="font-mono">?status=APPROVED</span>, <span className="font-mono">?type=exchange</span> ou <span className="font-mono">?source=marketplace</span>.
                    </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                    <table className="w-full min-w-[1100px] text-left text-sm">
                        <thead className="bg-brand-gray dark:bg-dark-border/40">
                            <tr>
                                <th className="p-3 font-semibold">Solicitação</th>
                                <th className="p-3 font-semibold">Pedido</th>
                                <th className="p-3 font-semibold">Cliente</th>
                                <th className="p-3 font-semibold">Seller</th>
                                <th className="p-3 font-semibold">Tipo</th>
                                <th className="p-3 font-semibold">Status</th>
                                <th className="p-3 font-semibold">Resolução</th>
                                <th className="p-3 font-semibold">Valor</th>
                                <th className="p-3 font-semibold">Origem</th>
                                <th className="p-3 font-semibold">Timeline</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((request: any) => {
                                const refundAmount = Number(request.refund_amount || 0)
                                const creditAmount = Number(request.store_credit_amount || 0)
                                const exchangeDifference = Number(request.exchange_shortfall_amount || 0)
                                const exchangeSurplus = Number(request.exchange_surplus_amount || 0)
                                const timelineCount = Array.isArray(request.return_events) ? request.return_events.length : 0
                                const evidenceCount = Array.isArray(request.return_evidence) ? request.return_evidence.length : 0
                                return (
                                    <tr key={request.id} className="border-t border-brand-border align-top dark:border-dark-border">
                                        <td className="p-3">
                                            <div className="font-bold text-brand-dark dark:text-dark-heading">#{request.id.slice(0, 8)}</div>
                                            <div className="text-xs text-brand-inactive-text">{formatDate(request.created_at)}</div>
                                        </td>
                                        <td className="p-3">{request.order_number_snapshot || request.orders?.order_number || "-"}</td>
                                        <td className="p-3">{request.customer_name_snapshot || "Cliente"}</td>
                                        <td className="p-3">{request.partners?.store_name || request.partners?.business_name || "-"}</td>
                                        <td className="p-3">{request.request_type || "-"}</td>
                                        <td className="p-3">{getReturnStatusLabel(request.status)}</td>
                                        <td className="p-3">{getReturnResolutionLabel(request.resolution_type || request.approved_resolution || request.desired_resolution)}</td>
                                        <td className="p-3">
                                            <div>Reembolso: {formatCurrency(refundAmount)}</div>
                                            <div>Credito: {formatCurrency(creditAmount)}</div>
                                            {(exchangeDifference > 0 || exchangeSurplus > 0) && (
                                                <div className="text-xs text-brand-inactive-text">
                                                    Troca: +{formatCurrency(exchangeDifference)} / saldo {formatCurrency(exchangeSurplus)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">{request.source || "-"}</td>
                                        <td className="p-3">
                                            <div>{timelineCount} eventos</div>
                                            <div className="text-xs text-brand-inactive-text">{evidenceCount} evidencias</div>
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
