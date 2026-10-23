"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, ThreeDotsLoader, ActionsDropdown, FormSection, SidebarCard, ListItem, IconPlaceholder, AlertModal, FormDropdown, CustomerMobileBar, DefaultModal, Input } from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import { ChevronLeftIcon, WrenchIcon, UserIcon, CalendarIcon, FileIcon, CheckCircleIcon, ClockIcon, PackageIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import BottomSheet from "@/components/BottomSheet"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import SignatureDialog from "./SignatureDialog"
import SpecificationsTab from "./SpecificationsTab"
import AttachmentsTab from "./AttachmentsTab"
import OSSPrintModal from "./OSSPrintModal"
import {
    updateServiceOrderStatusAction,
    getServiceOrderDetailsAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, getServiceOrderNextStatuses, isServiceOrderBackwardTransition, type ServiceOrderStatus } from "@/lib/types/service-order"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { useToast } from "@/hooks/use-toast"
import { useSidebar } from "@/lib/sidebar-context"
import { useMediaQuery } from "@/components/erp/hooks"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useRouter } from "next/navigation"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

function doesServiceTransitionRequireReason(currentStatus: string, nextStatus: string): boolean {
    if (currentStatus === "cancelada" || nextStatus === "cancelada") return false
    return isServiceOrderBackwardTransition(currentStatus as ServiceOrderStatus, nextStatus as ServiceOrderStatus)
}

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "client_request", label: "Solicitação do cliente" },
    { value: "rework", label: "Retrabalho necessário" },
    { value: "logistics_issue", label: "Problema logístico" },
    { value: "other", label: "Outro" }
]

const PRIORITY_META: Record<string, { label: string; variant: "gray" | "green" | "orange" | "red" }> = {
    baixa: { label: "Baixa", variant: "gray" },
    media: { label: "Média", variant: "green" },
    alta: { label: "Alta", variant: "orange" },
    urgente: { label: "Urgente", variant: "red" },
}

interface ServiceOrderDetailProps {
    data: any
    partnerId: string
    onBack?: () => void
    onMutation?: () => void
    onEdit?: (id: string) => void
    onDelete?: (id: string) => void
    teamMembers?: any[]
}

export default function ServiceOrderDetail({ data, partnerId, onBack, onMutation, onEdit, onDelete, teamMembers: propTeamMembers = [] }: ServiceOrderDetailProps) {
    const { toast } = useToast()
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const router = useRouter()
    const [activeTab, setActiveTab] = useState("summary")
    const [order, setOrder] = useState(data)
    const [loading, setLoading] = useState(false)
    const [showSignature, setShowSignature] = useState(false)
    const [teamMembers, setTeamMembers] = useState<any[]>(propTeamMembers)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showShareModal, setShowShareModal] = useState(false)
    const [shareLoading, setShareLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isRegeneratingCode, setIsRegeneratingCode] = useState(false)
    const [showStatusModal, setShowStatusModal] = useState(false)
    const [selectedStatus, setSelectedStatus] = useState("")
    const [statusWarningModal, setStatusWarningModal] = useState<{ isOpen: boolean; currentStatus: string; nextStatus: string; reasonValue: string; customReason: string } | null>(null)
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; nextStatus: string } | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [isStepsSheetOpen, setIsStepsSheetOpen] = useState(false)
    const isMobile = useMediaQuery("(max-width: 1023px)")

    useEffect(() => { setOrder(data) }, [data])

    const handleRegenerateCode = async () => {
        if (isRegeneratingCode || !order) return;
        setIsRegeneratingCode(true);
        try {
            const { regenerateServiceOrderApprovalCodeAction } = await import("@/app/actions/erp/service-orders")
            const res = await regenerateServiceOrderApprovalCodeAction(order.id, partnerId);
            if (res.success) {
                setOrder((prev: any) => ({
                    ...prev,
                    metadata: {
                        ...(prev.metadata || {}),
                        plain_code: res.code
                    }
                }));
                toast({ description: `Novo código de assinatura gerado: ${res.code}` });
                onMutation?.();
            } else {
                toast({ description: res.error || "Não foi possível regenerar o código." });
            }
        } catch {
            toast({ description: "Erro ao conectar ao servidor." });
        } finally {
            setIsRegeneratingCode(false);
        }
    };

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    const handleBack = useCallback(() => {
        if (onBack) {
            onBack()
        } else {
            window.location.href = "/erp/ordens-de-servico"
        }
    }, [onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        if (!order?.order_number) return
        setHeaderOverride({
            title: `OS #${order.order_number}`,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [order?.order_number, handleBack, setHeaderOverride])

    const statusMeta = order?.status ? SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus] : null

    useEffect(() => {
        if (propTeamMembers && propTeamMembers.length > 0) {
            setTeamMembers(propTeamMembers)
        }
    }, [propTeamMembers])

    // Load team members to resolve technician's name only if not provided by parent
    useEffect(() => {
        if (teamMembers.length > 0) return
        if (order?.assigned_user_name) return
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
    }, [teamMembers.length, order?.assigned_user_name])

    const handleStatusChange = async (newStatus: string, reason?: string) => {
        setLoading(true)
        const res = await updateServiceOrderStatusAction(partnerId, order.id, newStatus, reason)
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

    const handleStatusTransition = (currentStatus: string, nextStatus: string) => {
        setShowStatusModal(false)
        setSelectedStatus("")
        if (currentStatus === nextStatus) return

        if (doesServiceTransitionRequireReason(currentStatus, nextStatus)) {
            setStatusWarningModal({
                isOpen: true,
                currentStatus,
                nextStatus,
                reasonValue: "",
                customReason: "",
            })
        } else {
            setSimpleConfirmModal({
                isOpen: true,
                nextStatus,
            })
        }
    }

    const confirmStatusWarning = async () => {
        if (!statusWarningModal) return
        const { nextStatus, reasonValue, customReason } = statusWarningModal
        let finalReason = reasonValue
        if (reasonValue === "other" && customReason.trim()) {
            finalReason = `Outro: ${customReason.trim()}`
        } else {
            const foundLabel = CHANGE_STATUS_REASONS.find(r => r.value === reasonValue)?.label
            if (foundLabel) finalReason = foundLabel
        }
        setStatusWarningModal(null)
        await handleStatusChange(nextStatus, finalReason)
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
            window.location.href = `/erp/ordens-de-servico?edit=${order.id}`
        }
    }

    const formatDateStr = (d: string) => {
        if (!d) return "-"
        const clean = String(d).split("T")[0]
        const parts = clean.split("-")
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        return new Date(d).toLocaleDateString("pt-BR")
    }
    const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("pt-BR") : "-"

    const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`

    // Endereços do cliente derivados do snapshot (fallback do CustomerCard)
    const customerPrimaryAddress = useMemo(
        () => order?.customer_snapshot?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order?.customer_snapshot?.addresses?.[0] || null,
        [order?.customer_snapshot]
    )
    const customerBillingAddress = useMemo(
        () => order?.customer_snapshot?.addresses?.find((a: any) => a.address_type === "billing") || null,
        [order?.customer_snapshot]
    )

    // Financial calculations
    const subtotal = useMemo(() => {
        if (!order) return 0
        const totalS = (order.services || []).reduce((sum: number, s: any) => sum + (Number(svcPrice(s)) * (s.quantity || 1)), 0)
        const totalP = (order.products || []).reduce((sum: number, p: any) => sum + (Number(prodPrice(p)) * (p.quantity || 1)), 0)
        return totalS + totalP
    }, [order?.services, order?.products])

    const discountAmount = useMemo(() => {
        if (!order) return 0
        if (order.discount_type === 'percentage') {
            return (subtotal * Number(order.discount_value || 0)) / 100
        }
        return Number(order.discount_value || 0)
    }, [subtotal, order?.discount_value, order?.discount_type])

    function svcPrice(s: any) {
        return s.service_price !== undefined ? s.service_price : (s.price || 0)
    }

    function prodPrice(p: any) {
        return p.unit_price !== undefined ? p.unit_price : (p.price || 0)
    }

    if (!order) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    const assignedMember = teamMembers.find(m => m.userId === order.assigned_user_id)
    const assignedName = order.assigned_user_name
        || (assignedMember ? assignedMember.fullName : null)
        || "Não atribuído"

    // Order Details style steps timeline
    const getTimelineSteps = () => {
        const findHistoryTime = (statusName: string) => {
            const entry = (order.history || []).find((h: any) => {
                if (h.action_type !== "status_changed") return false
                const match = (h.change_lines?.[0] || "").match(/→\s*(\w+)/)
                return match && match[1] === statusName
            })
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
                                <div className={`absolute -left-12 top-7 h-full hidden lg:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
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
                                        <ActionsDropdown
                                            onEdit={handleEditClick}
                                            onStatus={() => { setSelectedStatus(order.status || ""); setShowStatusModal(true) }}
                                            onShare={async () => {
                                                if (!hasMinimumPlan(planSlug, "crescer")) {
                                                    openPlanUpgrade("crescer");
                                                    return
                                                }
                                                if (order.public_token) {
                                                    setShowShareModal(true);
                                                    return
                                                }
                                                setShareLoading(true);
                                                setShowShareModal(true);
                                                const { ensurePublicTokenAction } = await import("@/app/actions/erp/service-orders")
                                                const token = await ensurePublicTokenAction(partnerId, order.id)
                                                if (token) {
                                                    setOrder((prev: any) => ({ ...prev, public_token: token }))
                                                }
                                                setShareLoading(false);
                                            }}
                                            onPrint={() => setShowPrintModal(true)}
                                            onDelete={() => setConfirmDelete(true)}
                                        />
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
                                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                                {/* Cliente - Mobile/Tablet only */}
                                                <div className="lg:hidden">
                                                    <CustomerMobileBar customer={order.customer_snapshot} address={customerPrimaryAddress} billingAddress={customerBillingAddress} showMap={false} />
                                                </div>
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
                                                            <div className="md:hidden">
                                                                <button
                                                                    onClick={() => setIsStepsSheetOpen(true)}
                                                                    className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text dark:text-dark-body hover:text-brand-dark"
                                                                >
                                                                    <span>Ver etapas</span>
                                                                </button>
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
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {order.description && (
                                                                <div>
                                                                    <label className="font-semibold text-[15px] text-brand-dark dark:text-dark-heading">Descrição</label>
                                                                    <p className="text-[14px] text-brand-dark dark:text-dark-heading mt-0.5 whitespace-pre-wrap">{order.description}</p>
                                                                </div>
                                                            )}
                                                            {order.diagnosis && (
                                                                <div>
                                                                    <label className="font-semibold text-[15px] text-brand-dark dark:text-dark-heading">Diagnóstico</label>
                                                                    <p className="text-[14px] text-brand-dark dark:text-dark-heading mt-0.5 whitespace-pre-wrap">{order.diagnosis}</p>
                                                                </div>
                                                            )}
                                                        </div>
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
                                                            description={order.priority ? (PRIORITY_META[order.priority]?.label || order.priority) : "-"}
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                        <ListItem
                                                            icon={ClockIcon}
                                                            title="Tempo Estimado"
                                                            description={order.estimated_hours ? `${order.estimated_hours} ${order.estimated_hours === 1 ? 'hora' : 'horas'}` : "-"}
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                        <ListItem
                                                            icon={CalendarIcon}
                                                            title="Previsão de Conclusão"
                                                            description={order.expected_completion_date
                                                                ? `${formatDateStr(order.expected_completion_date)}${order.expected_completion_time ? ` às ${order.expected_completion_time}` : ""}`
                                                                : "-"
                                                            }
                                                            className="border border-brand-border dark:border-dark-border rounded-xl px-4 py-3 bg-brand-gray/5"
                                                        />
                                                    </div>
                                                </FormSection>

                                                {/* Payment Details FormSection (Exactly like Order Details) */}
                                                <FormSection title="Detalhes do Pagamento" hasSeparator>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text font-medium">Mão de obra</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_service_amount || 0)}</span>
                                                        </div>

                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text font-medium">Produtos</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_product_amount || 0)}</span>
                                                        </div>

                                                        {Number(order.other_costs || 0) > 0 && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text font-medium">Outros custos</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">+ {formatCurrency(order.other_costs)}</span>
                                                            </div>
                                                        )}

                                                        {discountAmount > 0 && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text font-medium">
                                                                    Desconto {order.discount_type === 'percentage' ? `(${order.discount_value}%)` : ''}
                                                                </span>
                                                                <span className="font-bold text-brand-green">- {formatCurrency(discountAmount)}</span>
                                                            </div>
                                                        )}

                                                        {Number(order.coupon_discount_amount || 0) > 0 && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text font-medium">
                                                                    Cupom {order.coupon_code ? `(${order.coupon_code})` : ''}
                                                                </span>
                                                                <span className="font-bold text-brand-green">- {formatCurrency(order.coupon_discount_amount)}</span>
                                                            </div>
                                                        )}

                                                        <div className="border-t border-brand-border dark:border-dark-border pt-3 mt-2 flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text font-medium">Status de Pagamento</span>
                                                            <Badge variant={order.payment_status === "paid" ? "green" : order.payment_status === "partially_paid" ? "orange" : "gray"}>
                                                                {order.payment_status === "paid" ? "Pago" : order.payment_status === "partially_paid" ? "Parcialmente Pago" : "Não Pago"}
                                                            </Badge>
                                                        </div>

                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text font-medium">Pedido Vinculado</span>
                                                            <a href={`/erp/pedidos/?view=${order.order_id}`} className="font-bold text-brand-primary hover:underline text-right">
                                                                #{order.linked_order_number || order.order_id}
                                                            </a>
                                                        </div>

                                                        {order.payment_method && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text font-medium">Meio de Pagamento</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">{order.payment_method}</span>
                                                            </div>
                                                        )}

                                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                            <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total da OS</span>
                                                            <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount || 0)}</span>
                                                        </div>

                                                        {order.payment_status !== "paid" && order.order_id && (
                                                            <div className="pt-4 flex justify-end">
                                                                <Button onClick={() => router.push(`/erp/pedidos?edit=${order.order_id}&payment=1`)} className="w-full md:w-auto">
                                                                    Registrar Pagamento
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                            </div>

                                            {/* Right Sidebar Column with vertical border-l (col-span-4) */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">

                                                {/* Venda Vinculada Card */}
                                                {order.sale && (
                                                    <SidebarCard hasSeparator title="Venda Vinculada">
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Venda</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                    #{order.sale.sale_number || "-"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatCurrency(order.sale.final_amount || order.sale.total_amount || 0)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Pago</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatCurrency(order.sale.paid_amount || 0)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status</span>
                                                                <Badge
                                                                    variant={order.sale.payment_status === "paid" ? "green" : order.sale.payment_status === "partially_paid" ? "orange" : "gray"}
                                                                    className="text-[11px]"
                                                                >
                                                                    {order.sale.payment_status === "paid" ? "Pago" : order.sale.payment_status === "partially_paid" ? "Parcial" : "Pendente"}
                                                                </Badge>
                                                            </div>
                                                            {order.sale.status === "cancelled" && (
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-brand-red font-medium">Cancelada</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </SidebarCard>
                                                )}

                                                {/* Timing Info Card */}
                                                {order.created_at && (
                                                    <SidebarCard hasSeparator hasTopStrip title="Tempo">
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Abertura</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatDateTime(order.created_at)}
                                                                </span>
                                                            </div>
                                                            {order.completed_at && (
                                                                <div className="flex justify-between items-center text-sm">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Conclusão</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading text-right">
                                                                        {formatDateTime(order.completed_at)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between items-center text-sm pt-1 border-t border-brand-border dark:border-dark-border">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tempo {order.completed_at || (order.status === "concluida" || order.status === "entregue") ? "total" : "decorrido"}</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {(() => {
                                                                        const start = new Date(order.created_at).getTime()
                                                                        const end = order.completed_at ? new Date(order.completed_at).getTime() : ((order.status === "concluida" || order.status === "entregue") ? new Date(order.updated_at).getTime() : Date.now())
                                                                        const diffMs = Math.max(0, end - start)
                                                                        const diffH = Math.floor(diffMs / 3600000)
                                                                        const diffM = Math.floor((diffMs % 3600000) / 60000)
                                                                        if (diffH >= 24) {
                                                                            const days = Math.floor(diffH / 24)
                                                                            return `${days}d ${diffH % 24}h ${diffM}m`
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
                                                                const referenceDate = order.completed_at ? new Date(order.completed_at) : ((order.status === "concluida" || order.status === "entregue") ? new Date(order.updated_at) : new Date())
                                                                const isLate = referenceDate.getTime() > expectedDate.getTime()
                                                                const diffLateMs = Math.max(0, referenceDate.getTime() - expectedDate.getTime())
                                                                const diffLateH = Math.floor(diffLateMs / 3600000)
                                                                const diffLateD = Math.floor(diffLateH / 24)
                                                                const diffLateM = Math.floor((diffLateMs % 3600000) / 60000)
                                                                const isCompleted = !!order.completed_at
                                                                if (isLate) {
                                                                    const label = isCompleted ? "Concluído com atraso" : "Atrasado"
                                                                    return (
                                                                        <div className="flex justify-between items-center text-sm pt-1 border-t border-brand-border dark:border-dark-border">
                                                                            <span className="text-brand-red font-medium">{label}</span>
                                                                            <span className="font-bold text-brand-red">
                                                                                {diffLateD > 0 ? `${diffLateD}d ${diffLateH % 24}h ${diffLateM}m` : `${diffLateH}h ${diffLateM}m`}
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                }
                                                                if (isCompleted) {
                                                                    return (
                                                                        <div className="flex justify-between items-center text-sm pt-1 border-t border-brand-border dark:border-dark-border">
                                                                            <span className="text-brand-green font-medium">Prazo</span>
                                                                            <span className="font-bold text-brand-green">Concluído no prazo</span>
                                                                        </div>
                                                                    )
                                                                }
                                                                return null
                                                            })()}
                                                        </div>
                                                    </SidebarCard>
                                                )}

                                                {/* Customer Info Card */}
                                                <div className="hidden lg:block">
                                                    <CustomerCard
                                                        customer={order.customer_snapshot}
                                                        address={customerPrimaryAddress}
                                                        billingAddress={customerBillingAddress}
                                                        showMap={false}
                                                    />
                                                </div>

                                                {/* Online Signature Link & Code Card */}
                                                {hasMinimumPlan(planSlug, "crescer") ? (
                                                    <SidebarCard hasSeparator hasTopStrip title="Aprovação e Assinatura Online">
                                                        <p className="text-xs text-brand-inactive-text mb-4">Compartilhe o link da OS para o cliente aprovar e assinar online.</p>

                                                        <div className="space-y-3">
                                                            <Button
                                                                variant="outline"
                                                                className="w-full"
                                                                onClick={() => {
                                                                    const text = `Olá! Segue o link para visualizar, aprovar e assinar a Ordem de Serviço *#${order.order_number}*:\n\n${window.location.origin}/os/${order.public_token}\n\n*Código de Aprovação:* ${order.metadata?.plain_code || "Enviado por aqui"}`;
                                                                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                                                                }}
                                                            >
                                                                Compartilhar no WhatsApp
                                                            </Button>

                                                            <div className="border-t border-brand-border dark:border-dark-border pt-3 mt-1 flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text block">Código de Aprovação</span>
                                                                    <span className="text-lg font-bold text-emerald-500 tracking-wider">
                                                                        {order.metadata?.plain_code || "---"}
                                                                    </span>
                                                                </div>

                                                                {!order.signature_image_key && order.status !== "concluida" && order.status !== "entregue" && order.status !== "cancelada" && (
                                                                    <Button
                                                                        variant="outline"
                                                                        className="text-xs py-1 h-[32px] rounded-lg border-brand-border dark:border-dark-border"
                                                                        onClick={handleRegenerateCode}
                                                                        disabled={isRegeneratingCode}
                                                                    >
                                                                        {isRegeneratingCode ? "Gerando..." : "Novo Código"}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </SidebarCard>
                                                ) : (
                                                    <SidebarCard hasSeparator title="Link de Assinatura Online">
                                                        <div className="flex flex-col items-center text-center py-4">
                                                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1">Disponível no plano Crescer</p>
                                                            <p className="text-xs text-brand-inactive-text mb-4">Compartilhe a OS online e receba a assinatura do cliente em tempo real.</p>
                                                            <Button onClick={() => openPlanUpgrade("crescer")} className="text-xs h-9">
                                                                Fazer upgrade
                                                            </Button>
                                                        </div>
                                                    </SidebarCard>
                                                )}

                                                {/* Client Signature Card where Totals used to be */}
                                                {order.signature_image_key ? (
                                                    <SidebarCard hasSeparator hasTopStrip title="Assinatura do Cliente">
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
                                                    order.status !== "cancelada" && (
                                                        <SidebarCard hasSeparator hasTopStrip title="Assinatura do Cliente">
                                                            <div className="flex flex-col items-center justify-center p-4 border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                                                                {order.status === "aberta" || order.status === "aguardando_aprovacao" ? (
                                                                    <p className="text-sm text-brand-inactive-text text-center">
                                                                        A assinatura ficará disponível após a aprovação da ordem de serviço.
                                                                    </p>
                                                                ) : (
                                                                    <>
                                                                        <p className="text-sm text-brand-inactive-text text-center mb-4">A ordem de serviço ainda não foi assinada pelo cliente.</p>
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
                                                                    </>
                                                                )}
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
                                            <div className="flex flex-col items-center justify-center text-center py-8">
                                                <IconPlaceholder
                                                    icon={WrenchIcon}
                                                    title="Nenhuma mão de obra adicionada"
                                                    subtitle="Tente adicionar serviços ou mão de obra."
                                                />
                                            </div>
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
                                            <div className="flex flex-col items-center justify-center text-center py-8">
                                                <IconPlaceholder
                                                    icon={PackageIcon}
                                                    title="Nenhum produto"
                                                    subtitle="Não foram encontrados produtos para esta OS."
                                                />
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
                                            <div className="flex flex-col items-center justify-center text-center py-8">
                                                <IconPlaceholder
                                                    icon={ClockIcon}
                                                    title="Nenhum histórico encontrado"
                                                    subtitle="Não foram encontrados eventos para esta OS."
                                                />
                                            </div>
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
                showShareModal && (
                    <ShareModal
                        isOpen={showShareModal}
                        onClose={() => setShowShareModal(false)}
                        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/os/${order.public_token}`}
                        isLoading={shareLoading}
                        title={`OS #${order.order_number}`}
                        shareMessage={`Olá! Segue o link para visualizar a Ordem de Serviço *#${order.order_number}*:`}
                        label="Link da OS"
                    />
                )
            }

            {/* Status Change Modal */}
            <DefaultModal
                isOpen={showStatusModal}
                onClose={() => { setShowStatusModal(false); setSelectedStatus("") }}
                title="Alterar Status"
                maxWidth="sm"
                footer={
                    <div className="flex gap-3 justify-end w-full">
                        <Button variant="outline" onClick={() => { setShowStatusModal(false); setSelectedStatus("") }}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => {
                                if (selectedStatus) {
                                    handleStatusTransition(order.status, selectedStatus)
                                }
                            }}
                            disabled={!selectedStatus || selectedStatus === order.status}
                        >
                            Confirmar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Selecione o novo status para esta OS:
                    </p>
                    <FormDropdown
                        label="Novo Status"
                        options={getServiceOrderNextStatuses(order.status as ServiceOrderStatus).map((status) => ({
                            value: status,
                            label: SERVICE_ORDER_STATUS_META[status].label
                        }))}
                        value={selectedStatus}
                        setValue={setSelectedStatus}
                        placeholder="Selecione o novo status"
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={statusWarningModal?.isOpen ?? false}
                onClose={() => setStatusWarningModal(null)}
                onConfirm={confirmStatusWarning}
                title="Atenção: Alteração de Status"
                message={
                    <div className="flex flex-col gap-4 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Esta OS já estava como{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {SERVICE_ORDER_STATUS_META[statusWarningModal?.currentStatus as ServiceOrderStatus]?.label || statusWarningModal?.currentStatus}
                            </strong>{" "}
                            e você está alterando para{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {SERVICE_ORDER_STATUS_META[statusWarningModal?.nextStatus as ServiceOrderStatus]?.label || statusWarningModal?.nextStatus}
                            </strong>.
                            Esta ação requer uma justificativa.
                        </p>
                        <div className="flex flex-col gap-4 mt-2">
                            <FormDropdown
                                label="Motivo da alteração"
                                options={CHANGE_STATUS_REASONS}
                                value={statusWarningModal?.reasonValue || ""}
                                setValue={(val) => setStatusWarningModal(prev => prev ? { ...prev, reasonValue: val } : null)}
                                placeholder="Selecione o motivo"
                            />
                            {statusWarningModal?.reasonValue === "other" && (
                                <Input
                                    label="Descreva o motivo"
                                    placeholder="Digite o motivo aqui..."
                                    value={statusWarningModal?.customReason || ""}
                                    onChange={(e) => setStatusWarningModal(prev => prev ? { ...prev, customReason: e.target.value } : null)}
                                />
                            )}
                        </div>
                    </div>
                }
                confirmText="Confirmar Alteração"
                cancelText="Cancelar"
                variant="warning"
                disabled={
                    !statusWarningModal?.reasonValue ||
                    (statusWarningModal.reasonValue === "other" && !statusWarningModal.customReason.trim())
                }
            />

            <AlertModal
                isOpen={simpleConfirmModal?.isOpen ?? false}
                title="Confirmar Alteração de Status"
                description={`Tem certeza que deseja alterar o status desta OS para ${SERVICE_ORDER_STATUS_META[simpleConfirmModal?.nextStatus as ServiceOrderStatus]?.label || simpleConfirmModal?.nextStatus}?`}
                confirmText="Confirmar"
                cancelText="Cancelar"
                onClose={() => setSimpleConfirmModal(null)}
                onConfirm={async () => {
                    if (simpleConfirmModal) {
                        const { nextStatus } = simpleConfirmModal
                        setSimpleConfirmModal(null)
                        await handleStatusChange(nextStatus)
                    }
                }}
                variant="warning"
            />

            <AlertModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title="Excluir OS"
                description="Tem certeza que deseja excluir esta ordem de serviço?"
                onConfirm={() => {
                    setConfirmDelete(false)
                    onDelete?.(order.id)
                }}
                confirmText="Excluir"
                variant="danger"
            />

            <BottomSheet
                isOpen={isStepsSheetOpen}
                onClose={() => setIsStepsSheetOpen(false)}
                title="Etapas da Ordem de Serviço"
            >
                <div className="space-y-2 my-4">
                    {timelineSteps.map((step: any, idx: number) => {
                        const isStepCancelled = step.isCancelled
                        return (
                            <div key={idx} className="flex items-center gap-3 p-3 border border-brand-border dark:border-dark-border rounded-lg">
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${step.active ? (isStepCancelled ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                                    {step.active && <div className="w-2 h-2 bg-white dark:bg-dark-surface rounded-full"></div>}
                                </div>
                                <div className="flex-1">
                                    <span className={`text-sm font-semibold ${step.active ? (isStepCancelled ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                        {step.label}
                                    </span>
                                    {step.date && (
                                        <div className="flex items-center gap-1 text-xs text-brand-inactive-text mt-0.5">
                                            <span>{step.date}</span>
                                            {step.time && <span>{step.time}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </BottomSheet>

            <OSSPrintModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                orderId={order?.id}
                partnerId={partnerId}
                storeId={order?.store_id}
            />
        </FadeIn >
    )
}

