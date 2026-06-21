"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, WrenchIcon, UserIcon, CalendarIcon, FileIcon, CheckCircleIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import SignatureDialog from "./SignatureDialog"
import {
  updateServiceOrderStatusAction,
  assignServiceOrderAction,
  getServiceOrderDetailsAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { useToast } from "@/hooks/use-toast"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

const STATUS_TRANSITIONS: Record<string, string[]> = {
  aberta: ["aguardando_aprovacao", "cancelada"],
  aguardando_aprovacao: ["aprovada", "cancelada"],
  aprovada: ["em_andamento", "cancelada"],
  em_andamento: ["aguardando_peca", "concluida", "cancelada"],
  aguardando_peca: ["em_andamento", "cancelada"],
  concluida: ["entregue"],
  entregue: [],
  cancelada: [],
}

interface ServiceOrderDetailProps {
  data: any
  partnerId: string
  onBack?: () => void
  onMutation?: () => void
}

export default function ServiceOrderDetail({ data, partnerId, onBack, onMutation }: ServiceOrderDetailProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("summary")
  const [order, setOrder] = useState(data)
  const [loading, setLoading] = useState(false)
  const [showSignature, setShowSignature] = useState(false)

  const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]
  const availableTransitions = STATUS_TRANSITIONS[order.status] || []

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true)
    const res = await updateServiceOrderStatusAction(partnerId, order.id, newStatus)
    if (res.success) {
      setOrder((prev: any) => ({ ...prev, ...res.data }))
      toast({ description: `Status atualizado para ${SERVICE_ORDER_STATUS_META[newStatus as ServiceOrderStatus]?.label}` })
      onMutation?.()
    } else {
      toast({ description: res.error || "Erro ao atualizar status" })
    }
    setLoading(false)
  }

  const handleAssign = async (userId: string | null) => {
    setLoading(true)
    const res = await assignServiceOrderAction(partnerId, order.id, userId)
    if (res.success) {
      setOrder((prev: any) => ({ ...prev, ...res.data }))
      toast({ description: "OS atribuída" })
      onMutation?.()
    } else {
      toast({ description: res.error || "Erro ao atribuir" })
    }
    setLoading(false)
  }

  const handleSignatureSaved = (key: string) => {
    setOrder((prev: any) => ({ ...prev, signature_image_key: key, signed_at: new Date().toISOString() }))
    setShowSignature(false)
    onMutation?.()
  }

  const formatDateStr = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—"
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("pt-BR") : "—"

  const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`

  return (
    <FadeIn>
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-full hover:bg-brand-gray dark:hover:bg-dark-border transition-colors">
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                  OS #{order.order_number}
                </h1>
                {statusMeta && (
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                )}
              </div>
              <p className="text-sm text-brand-inactive-text mt-1">
                Criada em {formatDateTime(order.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {availableTransitions.length > 0 && availableTransitions.map((status) => {
              const meta = SERVICE_ORDER_STATUS_META[status as ServiceOrderStatus]
              return (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  isLoading={loading}
                  onClick={() => handleStatusChange(status)}
                >
                  {meta?.label}
                </Button>
              )
            })}

            {order.status === "concluida" && !order.signature_image_key && (
              <Button size="sm" onClick={() => setShowSignature(true)}>
                <CheckCircleIcon className="w-4 h-4 mr-1" />
                Assinar
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="summary">Resumo</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="attachments">Anexos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Dados da OS */}
              <div className="lg:col-span-2 space-y-6">
                {/* Card principal */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                  <h3 className="font-bold text-[15px] mb-3 text-brand-dark dark:text-dark-heading">Detalhes da OS</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Título</label>
                      <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading mt-0.5">{order.title}</p>
                    </div>
                    {order.description && (
                      <div>
                        <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Descrição</label>
                        <p className="text-[14px] text-brand-dark dark:text-dark-heading mt-0.5 whitespace-pre-wrap">{order.description}</p>
                      </div>
                    )}
                    {order.internal_notes && (
                      <div>
                        <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Observações internas</label>
                        <p className="text-[14px] text-brand-inactive-text mt-0.5 whitespace-pre-wrap">{order.internal_notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Assinatura */}
                {order.signature_image_key && (
                  <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                    <h3 className="font-bold text-[15px] mb-3 text-brand-dark dark:text-dark-heading">Assinatura do Cliente</h3>
                    <img
                      src={buildImageUrl(order.signature_image_key)}
                      alt="Assinatura do cliente"
                      className="max-w-[300px] max-h-[120px] border border-brand-border rounded-lg p-2 bg-white"
                    />
                    <p className="text-xs text-brand-inactive-text mt-2">
                      Assinado em: {formatDateTime(order.signed_at)}
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar info */}
              <div className="space-y-4">
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-5">
                  <h3 className="font-bold text-[13px] mb-3 text-brand-dark dark:text-dark-heading">Cliente</h3>
                  <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">
                    {order.customer_snapshot?.name || "—"}
                  </p>
                  {order.customer_snapshot?.email && (
                    <p className="text-xs text-brand-inactive-text mt-1">{order.customer_snapshot.email}</p>
                  )}
                  {order.customer_snapshot?.phone && (
                    <p className="text-xs text-brand-inactive-text mt-0.5">{order.customer_snapshot.phone}</p>
                  )}
                </div>

                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-5">
                  <h3 className="font-bold text-[13px] mb-3 text-brand-dark dark:text-dark-heading">Prazos</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Previsão</label>
                      <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">
                        {order.expected_completion_date ? formatDateStr(order.expected_completion_date) : "—"}
                      </p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text">Conclusão</label>
                      <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">
                        {order.completed_at ? formatDateTime(order.completed_at) : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-5">
                  <h3 className="font-bold text-[13px] mb-3 text-brand-dark dark:text-dark-heading">Valores</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-brand-inactive-text">Serviços</span>
                      <span className="font-bold">{formatCurrency(order.total_service_amount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-brand-inactive-text">Produtos</span>
                      <span className="font-bold">{formatCurrency(order.total_product_amount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-[14px] pt-2 border-t border-brand-border dark:border-dark-border">
                      <span className="font-bold text-brand-dark dark:text-dark-heading">Total</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_amount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
              {order.services?.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-brand-border dark:border-dark-border">
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Serviço</th>
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Valor</th>
                      <th className="text-center px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Qtd</th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.services.map((svc: any) => (
                      <tr key={svc.id} className="border-b border-brand-border/50 dark:border-dark-border/50">
                        <td className="px-4 py-3 text-[13px] font-medium text-brand-dark dark:text-dark-heading">{svc.service_name}</td>
                        <td className="px-4 py-3 text-[13px] text-brand-inactive-text">{formatCurrency(svc.service_price)}</td>
                        <td className="px-4 py-3 text-[13px] text-center text-brand-inactive-text">{svc.quantity}</td>
                        <td className="px-4 py-3 text-[13px] font-bold text-right">{formatCurrency(svc.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-sm text-brand-inactive-text">Nenhum serviço adicionado</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
              {order.products?.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-brand-border dark:border-dark-border">
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Produto</th>
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Valor Unit.</th>
                      <th className="text-center px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Qtd</th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.products.map((prod: any) => (
                      <tr key={prod.id} className="border-b border-brand-border/50 dark:border-dark-border/50">
                        <td className="px-4 py-3 text-[13px] font-medium text-brand-dark dark:text-dark-heading">{prod.product_name}</td>
                        <td className="px-4 py-3 text-[13px] text-brand-inactive-text">{formatCurrency(prod.unit_price)}</td>
                        <td className="px-4 py-3 text-[13px] text-center text-brand-inactive-text">{prod.quantity}</td>
                        <td className="px-4 py-3 text-[13px] font-bold text-right">{formatCurrency(prod.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-sm text-brand-inactive-text">Nenhum produto adicionado</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="attachments" className="mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {order.attachments?.length > 0 ? (
                order.attachments.map((att: any) => (
                  <div
                    key={att.id}
                    className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-3"
                  >
                    {att.file_type?.startsWith("image/") ? (
                      <img
                        src={buildImageUrl(att.file_key)}
                        alt={att.file_name || ""}
                        className="w-full h-32 object-cover rounded-lg mb-2"
                      />
                    ) : (
                      <div className="w-full h-32 bg-brand-gray dark:bg-dark-border rounded-lg mb-2 flex items-center justify-center">
                        <FileIcon className="w-8 h-8 text-brand-inactive-text" />
                      </div>
                    )}
                    <p className="text-[11px] font-medium text-brand-dark dark:text-dark-heading truncate">
                      {att.file_name || "Sem nome"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="col-span-full p-8 text-center text-sm text-brand-inactive-text">Nenhum anexo</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {order.history?.length > 0 ? (
              <HistoryTimeline entries={order.history.map((h: any) => ({
                id: h.id,
                actor_name: h.actor_user_id || "Sistema",
                change_lines: h.change_lines || [],
                created_at: h.created_at,
                metadata: h.metadata,
                entry_type: h.action_type,
              }))} />
            ) : (
              <div className="p-8 text-center text-sm text-brand-inactive-text">Nenhum histórico</div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {showSignature && (
        <SignatureDialog
          partnerId={partnerId}
          serviceOrderId={order.id}
          onSaved={handleSignatureSaved}
          onClose={() => setShowSignature(false)}
        />
      )}
    </FadeIn>
  )
}
