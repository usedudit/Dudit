import Link from "next/link"
import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminReturnRequestDetail } from "@/app/actions/admin/return-detail"
import { formatCurrency, formatDate, formatFullDate } from "@/lib/utils"
import {
  getReturnStatusLabel,
  getReturnResolutionLabel,
} from "@/lib/returns/types"
import {
  getEligibilityLabel,
  getSlaStatusLabel,
} from "@/lib/returns/policy"
import { notFound } from "next/navigation"

export default async function AdminReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getAdminReturnRequestDetail(id)
  if (!detail) notFound()

  const { request, riskEvents, moderationActions, relatedReports } = detail
  const partner = request.partners as Record<string, unknown> | null
  const order = request.orders as Record<string, unknown> | null

  return (
    <>
      <AdminHeader pageTitle={`Solicitação #${id.slice(0, 8)}`} />
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        <Link href="/ddt-admin/returns" className="text-sm text-brand-primary hover:underline">
          ← Voltar à fila
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface space-y-4">
            <h2 className="font-bold text-lg">Resumo</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-brand-inactive-text">Status</dt><dd>{getReturnStatusLabel(request.status)}</dd></div>
              <div><dt className="text-brand-inactive-text">Tipo</dt><dd>{request.request_type}</dd></div>
              <div><dt className="text-brand-inactive-text">Elegibilidade</dt><dd>{getEligibilityLabel(request.eligibility_status)}</dd></div>
              <div><dt className="text-brand-inactive-text">SLA</dt><dd>{getSlaStatusLabel(request.sla_status)}</dd></div>
              <div><dt className="text-brand-inactive-text">Prazo SLA</dt><dd>{request.sla_due_at ? formatFullDate(request.sla_due_at) : "-"}</dd></div>
              <div><dt className="text-brand-inactive-text">Resolução</dt><dd>{getReturnResolutionLabel(request.resolution_type || request.desired_resolution)}</dd></div>
              <div><dt className="text-brand-inactive-text">Reembolso</dt><dd>{formatCurrency(Number(request.refund_amount || 0))}</dd></div>
              <div><dt className="text-brand-inactive-text">Crédito</dt><dd>{formatCurrency(Number(request.store_credit_amount || 0))}</dd></div>
            </dl>

            <h3 className="font-semibold pt-2">Cliente / Parceiro</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-brand-inactive-text">Cliente</dt><dd>{request.customer_name_snapshot || "-"}</dd></div>
              <div><dt className="text-brand-inactive-text">Parceiro</dt><dd>{String((request.stores as any)?.name || "-")}</dd></div>
              <div><dt className="text-brand-inactive-text">Risk score</dt><dd>{String((request.stores as any)?.risk_score ?? 0)}</dd></div>
              <div><dt className="text-brand-inactive-text">Pedido</dt><dd>{request.order_number_snapshot || String(order?.order_number || "-")}</dd></div>
            </dl>

            {Array.isArray(request.return_items) && request.return_items.length > 0 && (
              <>
                <h3 className="font-semibold">Itens</h3>
                <ul className="text-sm space-y-1">
                  {(request.return_items as Array<Record<string, unknown>>).map((item) => (
                    <li key={String(item.id)}>
                      {String(item.product_name_snapshot)} × {String(item.quantity)} - {formatCurrency(Number(item.net_item_value_snapshot || 0))}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
              <h3 className="font-semibold mb-2">Reports ({relatedReports.length})</h3>
              {relatedReports.length === 0 ? (
                <p className="text-sm text-brand-inactive-text">Nenhum reporte</p>
              ) : (
                <ul className="text-sm space-y-2">
                  {relatedReports.map((r: Record<string, unknown>) => (
                    <li key={String(r.id)}>
                      <span className="font-mono text-xs">{String(r.status)}</span>
                      <div>{String(r.reason_code || r.reason)}</div>
                      <div className="text-xs text-brand-inactive-text">{formatDate(String(r.created_at))}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
              <h3 className="font-semibold mb-2">Risk events</h3>
              <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                {riskEvents.map((e: Record<string, unknown>) => (
                  <li key={String(e.id)}>
                    +{String(e.points)} {String(e.source_type)}
                    {e.reverted_at ? " (revertido)" : ""}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
              <h3 className="font-semibold mb-2">Moderação</h3>
              <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                {moderationActions.map((a: Record<string, unknown>) => (
                  <li key={String(a.id)}>{String(a.action_type)} - {formatDate(String(a.created_at))}</li>
                ))}
                {moderationActions.length === 0 && (
                  <li className="text-brand-inactive-text">Nenhuma ação registrada</li>
                )}
              </ul>
            </div>
          </aside>
        </div>

        <section className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
          <h3 className="font-semibold mb-3">Timeline</h3>
          <ol className="space-y-2 text-sm">
            {(Array.isArray(request.return_events) ? request.return_events : [])
              .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                String(a.created_at).localeCompare(String(b.created_at))
              )
              .map((ev: Record<string, unknown>) => (
                <li key={String(ev.id)} className="border-l-2 border-brand-border pl-3">
                  <div className="font-medium">{String(ev.message || ev.event_type)}</div>
                  <div className="text-xs text-brand-inactive-text">{formatFullDate(String(ev.created_at))}</div>
                </li>
              ))}
          </ol>
        </section>

        {Array.isArray(request.return_messages) && request.return_messages.length > 0 && (
          <section className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
            <h3 className="font-semibold mb-3">Mensagens</h3>
            <div className="space-y-2 text-sm">
              {(request.return_messages as Array<Record<string, unknown>>).map((m) => (
                <div key={String(m.id)} className="rounded-lg bg-brand-gray/50 dark:bg-dark-border/30 p-2">
                  <div className="text-xs text-brand-inactive-text">{String(m.sender_role)} · {formatDate(String(m.created_at))}</div>
                  <div>{String(m.message)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {request.policy_snapshot && (
          <section className="rounded-xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
            <h3 className="font-semibold mb-2">Política vigente na venda (snapshot)</h3>
            <pre className="text-xs whitespace-pre-wrap bg-brand-gray/30 dark:bg-dark-border/20 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(request.policy_snapshot, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </>
  )
}
