"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ThreeDotsLoader, ActionsDropdown, DropdownItem } from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import PaymentModal from "@/components/erp/orders/PaymentModal"
import { ChevronLeftIcon, WrenchIcon, UserIcon, CalendarIcon, FileIcon, CheckCircleIcon, ClockIcon, EditIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import SignatureDialog from "./SignatureDialog"
import {
  updateServiceOrderStatusAction,
  assignServiceOrderAction,
  getServiceOrderDetailsAction,
  confirmServiceOrderPaymentAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { useToast } from "@/hooks/use-toast"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"

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

const PRIORITY_META: Record<string, { label: string; variant: "gray" | "green" | "orange" | "red" }> = {
  baixa: { label: "Baixa", variant: "gray" },
  media: { label: "Média", variant: "green" },
  alta: { label: "Alta", variant: "orange" },
  urgente: { label: "Urgente", variant: "red" },
}

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
  <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
    {children}
  </div>
)

interface ServiceOrderDetailProps {
  data: any
  partnerId: string
  onBack?: () => void
  onMutation?: () => void
  onEdit?: (id: string) => void
}

export default function ServiceOrderDetail({ data, partnerId, onBack, onMutation, onEdit }: ServiceOrderDetailProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("summary")
  const [order, setOrder] = useState(data)
  const [loading, setLoading] = useState(false)
  const [showSignature, setShowSignature] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])

  const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]
  const availableTransitions = STATUS_TRANSITIONS[order.status] || []

  // Load team members to resolve technician's name
  useEffect(() => {
    async function loadTeam() {
      try {
        const { getTeamMembers } = await import("@/app/actions/erp/team")
        const res = await getTeamMembers()
        if (res && res.members) {
          setTeamMembers(res.members)
        }
      } catch (err) {
        console.error("Erro ao carregar equipe:", err)
      }
    }
    loadTeam()
  }, [])

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

  const handleSignatureSaved = (key: string) => {
    setOrder((prev: any) => ({ ...prev, signature_image_key: key, signed_at: new Date().toISOString() }))
    setShowSignature(false)
    onMutation?.()
  }

  const handleEditClick = () => {
    if (onEdit) {
      onEdit(order.id)
    } else {
      window.location.href = `/erp/service-orders?edit=${order.id}`
    }
  }

  const formatDateStr = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—"
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("pt-BR") : "—"

  const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`

  // Financial calculations
  const subtotal = useMemo(() => {
    const totalS = (order.services || []).reduce((sum: number, s: any) => sum + (Number(svcPrice(s)) * (s.quantity || 1)), 0)
    const totalP = (order.products || []).reduce((sum: number, p: any) => sum + (Number(prodPrice(p)) * (p.quantity || 1)), 0)
    return totalS + totalP
  }, [order.services, order.products])

  const discountAmount = useMemo(() => {
    if (order.discount_type === 'percentage') {
      return (subtotal * Number(order.discount_value || 0)) / 100
    }
    return Number(order.discount_value || 0)
  }, [subtotal, order.discount_value, order.discount_type])

  const cart = useMemo(() => {
    const list: any[] = []
    ;(order.services || []).forEach((s: any) => {
      list.push({
        id: s.id,
        productId: null,
        variantId: null,
        name: s.service_name || "Mão de Obra",
        unitPrice: Number(svcPrice(s)),
        quantity: Number(s.quantity || 1),
        isService: true,
      })
    })
    ;(order.products || []).forEach((p: any) => {
      list.push({
        id: p.id,
        productId: p.product_id,
        variantId: p.variant_id || null,
        name: p.product_name || "Produto",
        unitPrice: Number(prodPrice(p)),
        quantity: Number(p.quantity || 1),
        isService: false,
      })
    })
    return list
  }, [order.services, order.products])

  const handleConfirmPayment = async (paymentData: any) => {
    setLoading(true)
    try {
      const res = await confirmServiceOrderPaymentAction({
        serviceOrderId: order.id,
        partnerId,
        paymentStatus: paymentData.paymentStatus,
        paidAmount: paymentData.paidAmount,
        paymentMethod: paymentData.paymentMethod,
        paymentBreakdown: paymentData.paymentBreakdown,
        paymentProvider: paymentData.paymentProvider,
        mpPaymentId: paymentData.mpPaymentId,
        financeAccountId: paymentData.financeAccountId,
        notes: paymentData.notes,
      })

      if (res.success) {
        toast({ description: "Pagamento registrado com sucesso!" })
        setIsPaymentModalOpen(false)
        const detailsRes = await getServiceOrderDetailsAction(order.id, partnerId)
        if (detailsRes.success) {
          setOrder(detailsRes.data)
        }
        onMutation?.()
        return { success: true }
      } else {
        toast({ description: res.error || "Erro ao processar pagamento" })
        return { error: res.error || "Erro ao processar pagamento" }
      }
    } catch (err: any) {
      toast({ description: err.message || "Erro inesperado" })
      return { error: err.message || "Erro inesperado" }
    } finally {
      setLoading(false)
    }
  }

  function svcPrice(s: any) {
    return s.service_price !== undefined ? s.service_price : (s.price || 0)
  }

  function prodPrice(p: any) {
    return p.unit_price !== undefined ? p.unit_price : (p.price || 0)
  }

  const assignedMember = teamMembers.find(m => m.user_id === order.assigned_user_id)
  const assignedName = assignedMember ? assignedMember.name : "Não atribuído"

  const steps = order.status === "cancelada"
    ? [
        { label: "Aberta", active: true },
        { label: "Cancelada", active: true, isCancelled: true }
      ]
    : [
        { label: "Aberta", active: true },
        { label: "Em Andamento", active: ["em_andamento", "aguardando_peca", "concluida", "entregue"].includes(order.status) },
        { label: "Concluída", active: ["concluida", "entregue"].includes(order.status) }
      ]

  const activeCount = steps.filter(s => s.active).length
  const progressPercent = steps.length <= 1 ? 0 : ((activeCount - 1) / (steps.length - 1)) * 100

  return (
    <FadeIn>
      <div className="max-w-[1200px] mx-auto pb-12">
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border py-4 px-6 -mx-6 mb-6 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-4 min-w-0">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-full hover:bg-brand-gray dark:hover:bg-dark-border transition-colors">
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading truncate">
                  OS #{order.order_number}
                </h1>
                {statusMeta && (
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                )}
                {order.payment_status && (
                  <Badge variant={order.payment_status === "paid" ? "green" : order.payment_status === "partially_paid" ? "orange" : "gray"}>
                    {order.payment_status === "paid" ? "Pago" : order.payment_status === "partially_paid" ? "Parcialmente Pago" : "Não Pago"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-brand-inactive-text mt-1">
                Criada em {formatDateTime(order.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button size="sm" onClick={handleEditClick} variant="outline">
              <EditIcon className="w-4 h-4 mr-1.5" />
              Editar
            </Button>

            <ActionsDropdown>
              {availableTransitions.map((status) => {
                const meta = SERVICE_ORDER_STATUS_META[status as ServiceOrderStatus]
                return (
                  <DropdownItem key={status} onClick={() => handleStatusChange(status)} disabled={loading}>
                    Marcar como: {meta?.label}
                  </DropdownItem>
                )
              })}
              {!order.signature_image_key && (
                <DropdownItem onClick={() => setShowSignature(true)}>
                  Assinar OS
                </DropdownItem>
              )}
            </ActionsDropdown>
          </div>
        </div>

        {/* Tabs Header */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="summary">Resumo</TabsTrigger>
            <TabsTrigger value="services">Mão de obra</TabsTrigger>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="attachments">Anexos</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            {/* Steps Progress Bar */}
            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 mb-6">
              <div className="relative px-8 pt-6 pb-6">
                <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                  <div
                    className={`absolute left-0 h-full rounded-full transition-all duration-500 ${order.status === "cancelada" ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                    style={{ width: `${progressPercent}%` }}
                  ></div>

                  {steps.map((step, idx) => {
                    const isCancelled = step.isCancelled
                    return (
                      <div key={idx} className="relative flex flex-col items-center">
                        <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                          <span className={`text-xs font-semibold ${step.active ? (isCancelled ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                            {step.label}
                          </span>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isCancelled ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                          {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Details Card */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                  <h3 className="font-bold text-[15px] mb-4 text-brand-dark dark:text-dark-heading flex items-center gap-2">
                    <FileIcon className="w-5 h-5 text-brand-inactive-text" />
                    Detalhes da OS
                  </h3>
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

                {/* Execution Metadata Grid Card */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                  <h3 className="font-bold text-[15px] mb-4 text-brand-dark dark:text-dark-heading flex items-center gap-2">
                    <WrenchIcon className="w-5 h-5 text-brand-inactive-text" />
                    Informações de Execução
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text block mb-1">Responsável</label>
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-brand-inactive-text" />
                        <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading truncate">{assignedName}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text block mb-1">Prioridade</label>
                      {order.priority ? (
                        <Badge variant={PRIORITY_META[order.priority]?.variant || "gray"}>
                          {PRIORITY_META[order.priority]?.label || order.priority}
                        </Badge>
                      ) : (
                        <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">—</span>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text block mb-1">Tempo Estimado</label>
                      <div className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-brand-inactive-text" />
                        <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">
                          {order.estimated_hours ? `${order.estimated_hours} ${order.estimated_hours === 1 ? 'hora' : 'horas'}` : "—"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-brand-inactive-text block mb-1">Previsão</label>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-brand-inactive-text" />
                        <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading truncate">
                          {order.expected_completion_date 
                            ? `${formatDateStr(order.expected_completion_date)}${order.expected_completion_time ? ` às ${order.expected_completion_time}` : ""}` 
                            : "—"
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Client Signature Card */}
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

              {/* Sidebar Column */}
              <div className="space-y-6">
                {/* Customer Info Card */}
                <CustomerCard
                  customer={order.customer_snapshot}
                  address={order.customer_snapshot ? {
                    city: order.customer_snapshot.city,
                    state: order.customer_snapshot.state,
                    zipCode: order.customer_snapshot.zip_code,
                  } : null}
                  showMap={false}
                />

                {/* Totals SidebarCard */}
                <SidebarCard hasTopStrip>
                  <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Resumo Financeiro</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-brand-inactive-text">Mão de obra</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_service_amount || 0)}</span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-brand-inactive-text">Produtos</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_product_amount || 0)}</span>
                    </div>

                    {Number(order.other_costs || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-inactive-text">Outros custos</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">+ {formatCurrency(order.other_costs)}</span>
                      </div>
                    )}

                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-inactive-text">
                          Desconto {order.discount_type === 'percentage' ? `(${order.discount_value}%)` : ''}
                        </span>
                        <span className="font-bold text-brand-green">- {formatCurrency(discountAmount)}</span>
                      </div>
                    )}

                    {Number(order.coupon_discount_amount || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-inactive-text">
                          Cupom {order.coupon_code ? `(${order.coupon_code})` : ''}
                        </span>
                        <span className="font-bold text-brand-green">- {formatCurrency(order.coupon_discount_amount)}</span>
                      </div>
                    )}

                    <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between text-base font-bold">
                      <span className="text-brand-dark dark:text-dark-heading">Total</span>
                      <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_amount || 0)}</span>
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-inactive-text">Status</span>
                        <Badge variant={order.payment_status === "paid" ? "green" : order.payment_status === "partially_paid" ? "orange" : "gray"}>
                          {order.payment_status === "paid" ? "Pago" : order.payment_status === "partially_paid" ? "Parcialmente Pago" : "Não Pago"}
                        </Badge>
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-brand-inactive-text">Valor Pago</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.paid_amount || 0)}</span>
                      </div>
                      
                      {order.payment_method && (
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-inactive-text">Meio de Pagamento</span>
                          <span className="font-medium text-brand-dark dark:text-dark-heading truncate max-w-[120px]">{order.payment_method}</span>
                        </div>
                      )}
                    </div>

                    {order.payment_status !== "paid" && (
                      <Button onClick={() => setIsPaymentModalOpen(true)} className="w-full mt-4">
                        Registrar Pagamento
                      </Button>
                    )}
                  </div>
                </SidebarCard>
              </div>
            </div>
          </TabsContent>

          {/* Tab Serviços / Mão de Obra */}
          <TabsContent value="services" className="mt-6">
            {order.services?.length > 0 ? (
              <div className="space-y-4 p-6 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                {order.services.map((svc: any) => (
                  <div key={svc.id} className="flex items-start gap-4 pb-4 border-b border-brand-border/50 last:border-b-0 last:pb-0">
                    <div className="w-12 h-12 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center">
                      <WrenchIcon className="w-6 h-6 text-brand-inactive-text" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{svc.service_name}</h4>
                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                          {formatCurrency(svc.total_price)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-brand-inactive-text mt-1">
                        <span>Qtd: {svc.quantity}</span>
                        <span>•</span>
                        <span>Preço Unitário: {formatCurrency(svcPrice(svc))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                Nenhuma mão de obra adicionada
              </div>
            )}
          </TabsContent>

          {/* Tab Produtos */}
          <TabsContent value="products" className="mt-6">
            {order.products?.length > 0 ? (
              <div className="space-y-4 p-6 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                {order.products.map((prod: any) => (
                  <div key={prod.id} className="flex items-start gap-4 pb-4 border-b border-brand-border/50 last:border-b-0 last:pb-0">
                    <div className="w-12 h-12 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center">
                      <FileIcon className="w-6 h-6 text-brand-inactive-text" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{prod.product_name}</h4>
                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                          {formatCurrency(prod.total_price)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-brand-inactive-text mt-1">
                        <span>Qtd: {prod.quantity}</span>
                        <span>•</span>
                        <span>Preço Unitário: {formatCurrency(prodPrice(prod))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                Nenhum produto adicionado
              </div>
            )}
          </TabsContent>

          {/* Tab Anexos */}
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

          {/* Tab Histórico */}
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

      {isPaymentModalOpen && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          cart={cart}
          customer={order.customer_snapshot}
          partnerId={partnerId}
          shippingFee={0}
          otherCosts={Number(order.other_costs || 0)}
          discountAmount={discountAmount + Number(order.coupon_discount_amount || 0)}
          headerSubtitle="Recebimento de Ordem de Serviço"
          amountDue={order.total_amount - (order.paid_amount || 0)}
          existingPaidAmount={order.paid_amount || 0}
          existingPaymentBreakdown={order.payment_breakdown ? (typeof order.payment_breakdown === 'string' ? JSON.parse(order.payment_breakdown) : order.payment_breakdown) : []}
          onConfirm={handleConfirmPayment}
        />
      )}
    </FadeIn>
  )
}
