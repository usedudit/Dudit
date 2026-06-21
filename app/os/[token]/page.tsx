import { getServiceOrderByTokenAction } from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/reusable"
import { WrenchIcon, CheckCircleIcon, CalendarIcon } from "@/lib/icons"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

export const dynamic = "force-dynamic"

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const result = await getServiceOrderByTokenAction(token)

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-gray p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-sm border border-brand-border">
          <WrenchIcon className="w-12 h-12 mx-auto text-brand-inactive-text mb-4" />
          <h1 className="text-lg font-bold text-brand-dark mb-2">Ordem de Serviço não encontrada</h1>
          <p className="text-sm text-brand-inactive-text">
            Verifique se o link está correto ou entre em contato conosco.
          </p>
        </div>
      </div>
    )
  }

  const { serviceOrder: order, services, products, attachments, history } = result.data
  const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]

  const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—"
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("pt-BR") : "—"

  return (
    <div className="min-h-screen bg-brand-gray dark:bg-dark-surface p-4">
      <div className="max-w-[800px] mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                OS #{order.order_number}
              </h1>
              <p className="text-sm text-brand-inactive-text mt-1">
                Criada em {formatDateTime(order.created_at)}
              </p>
            </div>
            {statusMeta && (
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
            <div>
              <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Cliente</label>
              <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading mt-0.5">
                {order.customer_name || "—"}
              </p>
            </div>
            {order.expected_completion_date && (
              <div>
                <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Previsão de conclusão</label>
                <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading mt-0.5">
                  {formatDate(order.expected_completion_date)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Título e descrição */}
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
          <h2 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-2">{order.title}</h2>
          {order.description && (
            <p className="text-[14px] text-brand-inactive-text whitespace-pre-wrap">{order.description}</p>
          )}
        </div>

        {/* Serviços */}
        {services.length > 0 && (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
            <h3 className="font-bold text-[15px] mb-4 text-brand-dark dark:text-dark-heading">Serviços Realizados</h3>
            <div className="space-y-3">
              {services.map((svc: any) => (
                <div key={svc.id} className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50 last:border-0">
                  <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{svc.service_name}</span>
                  <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(svc.total_price)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">Total Serviços</span>
                <span className="text-[13px] font-bold">{formatCurrency(order.total_service_amount || 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Produtos */}
        {products.length > 0 && (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
            <h3 className="font-bold text-[15px] mb-4 text-brand-dark dark:text-dark-heading">Produtos Utilizados</h3>
            <div className="space-y-3">
              {products.map((prod: any) => (
                <div key={prod.id} className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50 last:border-0">
                  <div>
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{prod.product_name}</span>
                    <span className="text-[11px] text-brand-inactive-text ml-2">x{prod.quantity}</span>
                  </div>
                  <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(prod.total_price)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">Total Produtos</span>
                <span className="text-[13px] font-bold">{formatCurrency(order.total_product_amount || 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Total geral */}
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
          <div className="flex justify-between items-center">
            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Total Geral</span>
            <span className="text-[18px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_amount || 0)}</span>
          </div>
        </div>

        {/* Assinatura */}
        {order.signature_image_key && (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
            <h3 className="font-bold text-[15px] mb-3 text-brand-dark dark:text-dark-heading">Assinatura</h3>
            <img
              src={buildImageUrl(order.signature_image_key)}
              alt="Assinatura"
              className="max-w-[300px] max-h-[120px] border border-brand-border rounded-lg p-2 bg-white"
            />
            <p className="text-xs text-brand-inactive-text mt-2">
              Assinado em: {formatDateTime(order.signed_at)}
            </p>
          </div>
        )}

        {/* Anexos */}
        {attachments.length > 0 && (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
            <h3 className="font-bold text-[15px] mb-3 text-brand-dark dark:text-dark-heading">Anexos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((att: any) => (
                <div key={att.file_key} className="rounded-xl overflow-hidden border border-brand-border">
                  {att.file_type?.startsWith("image/") ? (
                    <img
                      src={buildImageUrl(att.file_key)}
                      alt={att.file_name || ""}
                      className="w-full h-28 object-cover"
                    />
                  ) : (
                    <div className="w-full h-28 bg-brand-gray flex items-center justify-center text-xs text-brand-inactive-text">
                      {att.file_name || "Anexo"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {history.length > 0 && (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
            <h3 className="font-bold text-[15px] mb-3 text-brand-dark dark:text-dark-heading">Histórico</h3>
            <HistoryTimeline
              entries={history.map((h: any) => ({
                id: h.id,
                actor_name: "Sistema",
                change_lines: h.change_lines || [],
                created_at: h.created_at,
                entry_type: h.action_type,
              }))}
            />
          </div>
        )}

        {/* Status final */}
        {order.status === "concluida" || order.status === "entregue" ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <CheckCircleIcon className="w-10 h-10 mx-auto text-green-600 mb-2" />
            <h3 className="font-bold text-[15px] text-green-700">Serviço {statusMeta?.label || "Concluído"}</h3>
            {order.completed_at && (
              <p className="text-sm text-green-600 mt-1">
                Finalizado em {formatDateTime(order.completed_at)}
              </p>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-brand-inactive-text">
            Dudit — Gestão simplificada para seu negócio
          </p>
        </div>
      </div>
    </div>
  )
}
