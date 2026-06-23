"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ThreeDotsLoader, ActionsDropdown, DropdownItem, FormSection, ListItem, IconPlaceholder } from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import PaymentModal from "@/components/erp/orders/PaymentModal"
import { ChevronLeftIcon, WrenchIcon, UserIcon, CalendarIcon, FileIcon, CheckCircleIcon, ClockIcon, EditIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import SignatureDialog from "./SignatureDialog"
import SpecificationsTab from "./SpecificationsTab"
import AttachmentsTab from "./AttachmentsTab"
import {
    updateServiceOrderStatusAction,
    assignServiceOrderAction,
    getServiceOrderDetailsAction,
    confirmServiceOrderPaymentAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"

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
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const [activeTab, setActiveTab] = useState("summary")
    const [order, setOrder] = useState(data)
    const [loading, setLoading] = useState(false)
    const [showSignature, setShowSignature] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [teamMembers, setTeamMembers] = useState<any[]>([])
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showShareModal, setShowShareModal] = useState(false)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    const handleBack = () => {
        if (onBack) {
            onBack()
        } else {
            window.location.href = "/erp/service-orders"
        }
    }

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
            // Reload full service order details to get correct history / updates
            const detailsRes = await getServiceOrderDetailsAction(order.id, partnerId)
            if (detailsRes.success) {
                setOrder(detailsRes.data)
            } else {
                setOrder((prev: any) => ({ ...prev, ...res.data }))
            }
            toast({ description: `Status atualizado para ${SERVICE_ORDER_STATUS_META[newStatus as ServiceOrderStatus]?.label}` })
            onMutation?.()
        } else {
            toast({ description: res.error || "Erro ao atualizar status" })
        }
        setLoading(false)
    }

    const handleSignatureSaved = async (key: string) => {
        setShowSignature(false)
        // Reload full details to reflect signature in DB
        const detailsRes = await getServiceOrderDetailsAction(order.id, partnerId)
        if (detailsRes.success) {
            setOrder(detailsRes.data)
        } else {
            setOrder((prev: any) => ({ ...prev, signature_image_key: key, signed_at: new Date().toISOString() }))
        }
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
            ; (order.services || []).forEach((s: any) => {
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
            ; (order.products || []).forEach((p: any) => {
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

    const assignedMember = teamMembers.find(m => m.userId === order.assigned_user_id)
    const assignedName = assignedMember ? assignedMember.fullName : "Não atribuído"

    // Order Details style steps timeline
    const getTimelineSteps = () => {
        const findHistoryTime = (statusName: string) => {
            const entry = (order.statusHistory || []).find((h: any) => h.new_status === statusName)
            if (entry) {
                const d = new Date(entry.created_at)
                return {
                    date: d.toLocaleDateString("pt-BR"),
                    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                }
            }
            return null
        }

        const baseDate = new Date(order.created_at).toLocaleDateString("pt-BR")
        const baseTime = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

        const steps = [
            {
                label: "OS Aberta",
                date: baseDate,
                time: baseTime,
                active: true
            },
            {
                label: "Aprovada",
                date: findHistoryTime("aprovada")?.date,
                time: findHistoryTime("aprovada")?.time,
                active: ["aprovada", "em_andamento", "aguardando_peca", "concluida", "entregue"].includes(order.status)
            },
            {
                label: "Em Andamento",
                date: findHistoryTime("em_andamento")?.date,
                time: findHistoryTime("em_andamento")?.time,
                active: ["em_andamento", "aguardando_peca", "concluida", "entregue"].includes(order.status)
            },
            {
                label: "Concluída",
                date: order.completed_at ? new Date(order.completed_at).toLocaleDateString("pt-BR") : findHistoryTime("concluida")?.date,
                time: order.completed_at ? new Date(order.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : findHistoryTime("concluida")?.time,
                active: ["concluida", "entregue"].includes(order.status)
            }
        ]

        if (order.status === "cancelada") {
            const cancelTime = findHistoryTime("cancelada")
            steps.push({
                label: "Cancelada",
                date: cancelTime?.date || new Date().toLocaleDateString("pt-BR"),
                time: cancelTime?.time || new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                active: true,
                isCancelled: true
            } as any)
        } else {
            steps.push({
                label: "Entregue",
                date: findHistoryTime("entregue")?.date,
                time: findHistoryTime("entregue")?.time,
                active: order.status === "entregue"
            })
        }

        return steps
    }

    const timelineSteps = getTimelineSteps() as Array<{ label: string; date?: string; time?: string; active: boolean; isCancelled?: boolean }>
    const activeSteps = timelineSteps.filter(s => s.active)
    const isCancelled = order.status === "cancelada"
    const progressPercent = timelineSteps.length <= 1 ? 0 : ((activeSteps.length - 1) / (timelineSteps.length - 1)) * 100

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">OS #{order.order_number}</span>
                                            {statusMeta && (
                                                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                            )}
                                            {order.payment_status && (
                                                <Badge variant={order.payment_status === "paid" ? "green" : order.payment_status === "partially_paid" ? "orange" : "gray"}>
                                                    {order.payment_status === "paid" ? "Pago" : order.payment_status === "partially_paid" ? "Parcialmente Pago" : "Não Pago"}
                                                </Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Criada em {formatDateTime(order.created_at)}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
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
                                                <DropdownItem onClick={() => {
                                                    if (!hasMinimumPlan(planSlug, "crescer")) {
                                                        openPlanUpgrade("crescer");
                                                    } else {
                                                        setShowSignature(true);
                                                    }
                                                }}>
                                                    Assinar OS
                                                </DropdownItem>
                                            )}
                                            <DropdownItem onClick={() => window.print()}>
                                                Imprimir OS
                                            </DropdownItem>
                                            <DropdownItem onClick={() => {
                                                if (!hasMinimumPlan(planSlug, "crescer")) {
                                                    openPlanUpgrade("crescer");
                                                } else {
                                                    setShowShareModal(true);
                                                }
                                            }}>
                                                Compartilhar
                                            </DropdownItem>
                                        </ActionsDropdown>
                                        <Button onClick={handleEditClick} leftIcon={<EditIcon size={18} />}>
                                            Editar OS
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="summary">Resumo</TabsTrigger>
                                        <TabsTrigger value="services">Mão de obra</TabsTrigger>
                                        <TabsTrigger value="products">Produtos</TabsTrigger>
                                        <TabsTrigger value="specifications">Especificações</TabsTrigger>
                                        <TabsTrigger value="attachments">Anexos</TabsTrigger>
                                        <TabsTrigger value="history">Histórico</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <TabsContent value="summary">
                                    <FadeIn key="summary">
                                        <div className="grid grid-cols-12 gap-y-8 xl:gap-y-0 relative">
                                            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12 space-y-6">
                                                <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                    <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                    Responsável pelo serviço:
                                                                </span>
                                                                <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                    {assignedName}
                                                                </div>
                                                            </div>
                                                            <div className="hidden md:block text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                Prioridade: <strong className="text-brand-dark dark:text-dark-heading">{PRIORITY_META[order.priority]?.label || "Média"}</strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                                        <div className="relative px-4">
                                                            <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                                <div
                                                                    className={`absolute left-0 h-full rounded-full transition-all duration-500 ${isCancelled ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                                                    style={{ width: `${progressPercent}%` }}
                                                                ></div>

                                                                {timelineSteps.map((step, idx) => {
                                                                    const isStepCancelled = step.isCancelled
                                                                    return (
                                                                        <div key={idx} className="relative flex flex-col items-center">
                                                                            <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                                                <span className={`text-xs font-semibold ${step.active ? (isStepCancelled ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                                                                    {step.label}
                                                                                </span>
                                                                            </div>
                                                                            <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isStepCancelled ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                                                                                {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>}
                                                                            </div>
                                                                            <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                                                {step.date ? (
                                                                                    <div className="flex items-center gap-1 text-xs text-brand-inactive-text">
                                                                                        <span>{step.date}</span>
                                                                                        {step.time && <span>{step.time}</span>}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">-</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Details OS FormSection */}
                                                <FormSection title="Detalhes da OS" hasSeparator>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="font-semibold text-[15px] text-brand-dark dark:text-dark-heading">Título</label>
                                                            <p className="text-[14px] font-medium text-brand-dark dark:text-dark-heading mt-0.5">{order.title}</p>
                                                        </div>
                                                        {order.description && (
                                                            <div>
                                                                <label className="font-semibold text-[15px] text-brand-dark dark:text-dark-heading">Descrição</label>
                                                                <p className="text-[14px] text-brand-dark dark:text-dark-heading mt-0.5 whitespace-pre-wrap">{order.description}</p>
                                                            </div>
                                                        )}
                                                        {order.internal_notes && (
                                                            <div>
                                                                <label className="font-semibold text-[15px] text-brand-dark dark:text-dark-heading">Observações internas</label>
                                                                <p className="text-[14px] text-brand-inactive-text mt-0.5 whitespace-pre-wrap">{order.internal_notes}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                                {/* Execution Info FormSection with ListItems */}
                                                <FormSection title="Informações de Execução" hasSeparator>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <ListItem
                                                            icon={UserIcon}
                                                            title="Responsável"
                                                            description={assignedName}
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                        <ListItem
                                                            icon={WrenchIcon}
                                                            title="Prioridade"
                                                            description={order.priority ? (PRIORITY_META[order.priority]?.label || order.priority) : "—"}
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                            right={
                                                                order.priority ? (
                                                                    <div className="flex items-center h-full">
                                                                        <Badge variant={PRIORITY_META[order.priority]?.variant || "gray"}>
                                                                            {PRIORITY_META[order.priority]?.label || order.priority}
                                                                        </Badge>
                                                                    </div>
                                                                ) : null
                                                            }
                                                        />
                                                        <ListItem
                                                            icon={ClockIcon}
                                                            title="Tempo Estimado"
                                                            description={order.estimated_hours ? `${order.estimated_hours} ${order.estimated_hours === 1 ? 'hora' : 'horas'}` : "—"}
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                        <ListItem
                                                            icon={CalendarIcon}
                                                            title="Previsão de Conclusão"
                                                            description={order.expected_completion_date
                                                                ? `${formatDateStr(order.expected_completion_date)}${order.expected_completion_time ? ` às ${order.expected_completion_time}` : ""}`
                                                                : "—"
                                                            }
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                    </div>
                                                </FormSection>

                                                {/* Payment Details FormSection (Exactly like Order Details) */}
                                                <FormSection title="Detalhes do Pagamento" hasSeparator>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center text-[14px]">
                                                            <span className="text-brand-inactive-text font-medium">Mão de obra</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_service_amount || 0)}</span>
                                                        </div>

                                                        <div className="flex justify-between items-center text-[14px]">
                                                            <span className="text-brand-inactive-text font-medium">Produtos</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_product_amount || 0)}</span>
                                                        </div>

                                                        {Number(order.other_costs || 0) > 0 && (
                                                            <div className="flex justify-between items-center text-[14px]">
                                                                <span className="text-brand-inactive-text font-medium">Outros custos</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">+ {formatCurrency(order.other_costs)}</span>
                                                            </div>
                                                        )}

                                                        {discountAmount > 0 && (
                                                            <div className="flex justify-between items-center text-[14px]">
                                                                <span className="text-brand-inactive-text font-medium">
                                                                    Desconto {order.discount_type === 'percentage' ? `(${order.discount_value}%)` : ''}
                                                                </span>
                                                                <span className="font-bold text-brand-green">- {formatCurrency(discountAmount)}</span>
                                                            </div>
                                                        )}

                                                        {Number(order.coupon_discount_amount || 0) > 0 && (
                                                            <div className="flex justify-between items-center text-[14px]">
                                                                <span className="text-brand-inactive-text font-medium">
                                                                    Cupom {order.coupon_code ? `(${order.coupon_code})` : ''}
                                                                </span>
                                                                <span className="font-bold text-brand-green">- {formatCurrency(order.coupon_discount_amount)}</span>
                                                            </div>
                                                        )}

                                                        <div className="border-t border-brand-border dark:border-dark-border pt-3 mt-2 flex justify-between items-center text-[14px]">
                                                            <span className="text-brand-inactive-text font-medium">Status de Pagamento</span>
                                                            <Badge variant={order.payment_status === "paid" ? "green" : order.payment_status === "partially_paid" ? "orange" : "gray"}>
                                                                {order.payment_status === "paid" ? "Pago" : order.payment_status === "partially_paid" ? "Parcialmente Pago" : "Não Pago"}
                                                            </Badge>
                                                        </div>

                                                        <div className="flex justify-between items-center text-[14px]">
                                                            <span className="text-brand-inactive-text font-medium">Valor Pago</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.paid_amount || 0)}</span>
                                                        </div>

                                                        {order.payment_method && (
                                                            <div className="flex justify-between items-center text-[14px]">
                                                                <span className="text-brand-inactive-text font-medium">Meio de Pagamento</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">{order.payment_method}</span>
                                                            </div>
                                                        )}

                                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                            <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total da OS</span>
                                                            <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount || 0)}</span>
                                                        </div>

                                                        {order.payment_status !== "paid" && (
                                                            <div className="pt-4 flex justify-end">
                                                                <Button onClick={() => setIsPaymentModalOpen(true)} className="w-full md:w-auto">
                                                                    Registrar Pagamento
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                            </div>

                                            {/* Right Sidebar Column with vertical border-l (col-span-4) */}
                                            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">

                                                {/* Venda Vinculada Card */}
                                                {order.sale && (
                                                    <SidebarCard>
                                                        <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Venda Vinculada</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center text-[13px]">
                                                                <span className="text-brand-inactive-text">Venda</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                    #{order.sale.sale_number || "—"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[13px]">
                                                                <span className="text-brand-inactive-text">Total</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatCurrency(order.sale.final_amount || order.sale.total_amount || 0)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[13px]">
                                                                <span className="text-brand-inactive-text">Pago</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatCurrency(order.sale.paid_amount || 0)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[13px]">
                                                                <span className="text-brand-inactive-text">Status</span>
                                                                <Badge
                                                                    variant={order.sale.payment_status === "paid" ? "green" : order.sale.payment_status === "partially_paid" ? "orange" : "gray"}
                                                                    className="text-[11px]"
                                                                >
                                                                    {order.sale.payment_status === "paid" ? "Pago" : order.sale.payment_status === "partially_paid" ? "Parcial" : "Pendente"}
                                                                </Badge>
                                                            </div>
                                                            {order.sale.status === "cancelled" && (
                                                                <div className="flex justify-between items-center text-[13px]">
                                                                    <span className="text-brand-red font-medium">Cancelada</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </SidebarCard>
                                                )}

                                                {/* Timing Info Card */}
                                                {order.created_at && (
                                                    <SidebarCard>
                                                        <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Tempo</h3>
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center text-[13px]">
                                                                <span className="text-brand-inactive-text">Abertura</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatDateTime(order.created_at)}
                                                                </span>
                                                            </div>
                                                            {order.completed_at && (
                                                                <>
                                                                    <div className="flex justify-between items-center text-[13px]">
                                                                        <span className="text-brand-inactive-text">Conclusão</span>
                                                                        <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                            {formatDateTime(order.completed_at)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center text-[13px] pt-1 border-t border-brand-border dark:border-dark-border">
                                                                        <span className="text-brand-inactive-text">Tempo total</span>
                                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                            {(() => {
                                                                                const start = new Date(order.created_at).getTime()
                                                                                const end = new Date(order.completed_at).getTime()
                                                                                const diffMs = Math.max(0, end - start)
                                                                                const diffH = Math.floor(diffMs / 3600000)
                                                                                const diffM = Math.floor((diffMs % 3600000) / 60000)
                                                                                if (diffH >= 24) {
                                                                                    const days = Math.floor(diffH / 24)
                                                                                    return `${days}d ${diffH % 24}h`
                                                                                }
                                                                                return `${diffH}h ${diffM}m`
                                                                            })()}
                                                                        </span>
                                                                    </div>
                                                                    {order.expected_completion_date && (() => {
                                                                        const expectedDate = new Date(order.expected_completion_date)
                                                                        if (order.expected_completion_time) {
                                                                            const [h, m] = order.expected_completion_time.split(":").map(Number)
                                                                            expectedDate.setHours(h || 0, m || 0)
                                                                        }
                                                                        const completed = new Date(order.completed_at)
                                                                        const isLate = completed.getTime() > expectedDate.getTime()
                                                                        const diffLateMs = Math.max(0, completed.getTime() - expectedDate.getTime())
                                                                        const diffLateH = Math.floor(diffLateMs / 3600000)
                                                                        const diffLateD = Math.floor(diffLateH / 24)
                                                                        return isLate ? (
                                                                            <div className="flex justify-between items-center text-[13px] pt-1 border-t border-brand-border dark:border-dark-border">
                                                                                <span className="text-brand-red font-medium">Atraso</span>
                                                                                <span className="font-bold text-brand-red">
                                                                                    {diffLateD > 0 ? `${diffLateD}d ${diffLateH % 24}h` : `${diffLateH}h ${Math.floor((diffLateMs % 3600000) / 60000)}m`}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex justify-between items-center text-[13px] pt-1 border-t border-brand-border dark:border-dark-border">
                                                                                <span className="text-brand-green font-medium">Prazo</span>
                                                                                <span className="font-bold text-brand-green">No prazo</span>
                                                                            </div>
                                                                        )
                                                                    })()}
                                                                </>
                                                            )}
                                                        </div>
                                                    </SidebarCard>
                                                )}

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

                                                {/* Client Signature Card where Totals used to be */}
                                                {order.signature_image_key ? (
                                                    <SidebarCard hasTopStrip>
                                                        <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Assinatura do Cliente</h3>
                                                        <div className="flex flex-col items-center">
                                                            <img
                                                                src={buildImageUrl(order.signature_image_key)}
                                                                alt="Assinatura do cliente"
                                                                className="w-full max-h-[120px] object-contain border border-brand-border rounded-lg p-2 bg-white"
                                                            />
                                                            <p className="text-xs text-brand-inactive-text mt-2 text-center">
                                                                Assinado em: {formatDateTime(order.signed_at)}
                                                            </p>
                                                        </div>
                                                    </SidebarCard>
                                                ) : (
                                                    order.status === "concluida" && (
                                                        <SidebarCard hasTopStrip>
                                                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Assinatura do Cliente</h3>
                                                            <div className="flex flex-col items-center justify-center p-4 border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                                                                <p className="text-sm text-brand-inactive-text text-center mb-4">A ordem de serviço foi concluída mas ainda não foi assinada.</p>
                                                                <Button variant="outline" size="sm" onClick={() => {
                                                                    if (!hasMinimumPlan(planSlug, "crescer")) {
                                                                        openPlanUpgrade("crescer");
                                                                    } else {
                                                                        setShowSignature(true);
                                                                    }
                                                                }} className="w-full">
                                                                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                                                                    Assinar OS
                                                                </Button>
                                                            </div>
                                                        </SidebarCard>
                                                    )
                                                )}

                                            </div>
                                        </div>
                                    </FadeIn>
                                </TabsContent>

                                {/* Tab Serviços / Mão de Obra */}
                                <TabsContent value="services" className="mt-6">
                                    <FadeIn key="services">
                                        {order.services?.length > 0 ? (
                                            <div className="w-full overflow-x-auto pb-4 custom-scrollbar mb-4 bg-white dark:bg-dark-surface">
                                                <table className="w-full text-left border-separate border-spacing-0">
                                                    <thead>
                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                            <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Serviço</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36 rounded-r-lg">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {order.services.map((svc: any, index: number) => {
                                                            const unitPrice = svcPrice(svc)
                                                            const qty = svc.quantity || 1
                                                            return (
                                                                <tr key={svc.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                            </div>
                                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {svc.service_name || svc.name}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(unitPrice)}
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {qty}
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(unitPrice * qty)}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <IconPlaceholder
                                                icon={WrenchIcon}
                                                title="Nenhuma mão de obra adicionada"
                                                subtitle="Tente adicionar serviços ou mão de obra."
                                            />
                                        )}
                                    </FadeIn>
                                </TabsContent>

                                {/* Tab Produtos */}
                                <TabsContent value="products" className="mt-6">
                                    <FadeIn key="products">
                                        {order.products?.length > 0 ? (
                                            <div className="w-full overflow-x-auto pb-4 custom-scrollbar mb-4 bg-white dark:bg-dark-surface">
                                                <table className="w-full text-left border-separate border-spacing-0">
                                                    <thead>
                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                            <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36 rounded-r-lg">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {order.products.map((prod: any, index: number) => {
                                                            const unitPrice = prodPrice(prod)
                                                            const qty = prod.quantity || 1
                                                            return (
                                                                <tr key={prod.id || index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                                            </div>
                                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                                {prod.product_name || prod.name}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(unitPrice)}
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {qty}
                                                                    </td>
                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(unitPrice * qty)}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                                                Nenhum produto adicionado
                                            </div>
                                        )}
                                    </FadeIn>
                                </TabsContent>

                                {/* Tab Especificações */}
                                <TabsContent value="specifications" className="mt-6">
                                    <FadeIn key="specifications">
                                        <SpecificationsTab
                                            partnerId={partnerId}
                                            serviceOrderId={order.id}
                                            specifications={order.specifications || []}
                                            isEditing={false}
                                        />
                                    </FadeIn>
                                </TabsContent>

                                {/* Tab Anexos */}
                                <TabsContent value="attachments" className="mt-6">
                                    <FadeIn key="attachments">
                                        <AttachmentsTab
                                            partnerId={partnerId}
                                            serviceOrderId={order.id}
                                            attachments={order.attachments || []}
                                            onMutation={async () => {
                                                const res = await getServiceOrderDetailsAction(order.id, partnerId)
                                                if (res.success) setOrder(res.data)
                                            }}
                                        />
                                    </FadeIn>
                                </TabsContent>

                                {/* Tab Histórico */}
                                <TabsContent value="history" className="mt-6">
                                    <FadeIn key="history">
                                        {order.history?.length > 0 ? (
                                            <HistoryTimeline entries={order.history.map((h: any) => ({
                                                id: h.id,
                                                actor_name: h.actorName || h.actor_name || h.actorUserId || h.actor_user_id || "Sistema",
                                                change_lines: h.change_lines || [],
                                                created_at: h.created_at,
                                                metadata: h.metadata,
                                                entry_type: h.action_type,
                                            }))} />
                                        ) : (
                                            <div className="p-8 text-center text-sm text-brand-inactive-text">Nenhum histórico</div>
                                        )}
                                    </FadeIn>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>
                </Tabs>
            </div >

            {showSignature && (
                <SignatureDialog
                    partnerId={partnerId}
                    serviceOrderId={order.id}
                    onSaved={handleSignatureSaved}
                    onClose={() => setShowSignature(false)}
                />
            )
            }

            {
                isPaymentModalOpen && (
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
                )
            }

            {
                showShareModal && (
                    <ShareModal
                        isOpen={showShareModal}
                        onClose={() => setShowShareModal(false)}
                        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/os/${order.public_token}`}
                        title={`OS #${order.order_number}`}
                        shareMessage={`Olá! Segue o link para visualizar a Ordem de Serviço *#${order.order_number}*:`}
                        label="Link da OS"
                    />
                )
            }
        </FadeIn >
    )
}
