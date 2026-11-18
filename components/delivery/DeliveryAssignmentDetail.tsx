"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    Badge,
    Button,
    DefaultModal,
    FormSection,
    InfoCard,
    ActionsDropdown,
    DropdownItem,
    Pagination,
    ListItem,
    Accordion,
    CustomerCard,
    IconPlaceholder,
    SidebarCard,
    FormTextarea,
} from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useModalLayer } from "@/lib/modal-stack"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import {
    confirmDeliveryPaymentReceivedAction,
    transitionMyDeliveryAssignmentAction,
    markSingleOrderDeliveredAction,
} from "@/app/actions/delivery-drivers"
import { DeliveryOtpModal } from "@/components/delivery/DeliveryOtpModal"
import {
    ChevronLeftIcon,
    TruckIcon,
    CheckCircleIcon,
    PhoneIcon,
    WhatsappIcon,
    MapPinIcon,
    XIcon,
    EyeIcon,
    BoxIcon,
    MoneyIcon,
    StoreIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getPaymentStatusMeta, getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"
import { useMediaQuery } from "@/components/erp/hooks"
import { parseAddressString } from "@/components/erp/orders/CreateOrder"
import { statusConfig, type DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"
import DriverPaymentModal from "./DriverPaymentModal"

const STEPS = [
    { key: "assigned", label: "Atribuída" },
    { key: "accepted", label: "Aceita" },
    { key: "picked_up", label: "Retirada" },
    { key: "out_for_delivery", label: "Em Rota" },
    { key: "delivered", label: "Entregue" },
]

const NEXT_STATUS: Record<
    string,
    { status: "accepted" | "picked_up" | "out_for_delivery" | "delivered"; label: string; shortLabel: string }
> = {
    assigned: { status: "accepted", label: "Aceitar Entrega", shortLabel: "Aceitar" },
    accepted: { status: "picked_up", label: "Confirmar Retirada na Loja", shortLabel: "Confirmar Retirada" },
    picked_up: { status: "out_for_delivery", label: "Iniciar Rota para o Cliente", shortLabel: "Iniciar Rota" },
    out_for_delivery: { status: "delivered", label: "Confirmar Entrega ao Cliente", shortLabel: "Entregar" },
}

const ITEMS_PER_PAGE = 10

export default function DeliveryAssignmentDetail({
    assignment: initial,
    onBack,
}: {
    assignment: DeliveryAssignmentItem & {
        store_name?: string
        store_phone?: string
        store_address?: string
        store_logo_url?: string
        out_for_delivery_at?: string
        failed_at?: string
    }
    onBack?: () => void
}) {
    const router = useRouter()
    const { setHeaderOverride } = useSidebar()
    const [assignment, setAssignment] = useState<any>(initial)
    const [loading, setLoading] = useState(false)
    const [failureOpen, setFailureOpen] = useState(false)
    const [failureReason, setFailureReason] = useState("")
    const [isStepsSheetOpen, setIsStepsSheetOpen] = useState(false)
    const [isOrdersSheetOpen, setIsOrdersSheetOpen] = useState(false)
    const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any>(null)
    const [isOrderDetailSheetOpen, setIsOrderDetailSheetOpen] = useState(false)
    const [orderDetailLoading, setOrderDetailLoading] = useState(false)
    const [orderDeliveredMap, setOrderDeliveredMap] = useState<Record<string, boolean>>({})
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<any>(null)

    // z-index dinâmico: a sheet desktop de detalhes do pedido abre acima de
    // tudo que já estava aberto (a variante mobile usa BottomSheet, que já
    // registra a própria camada).
    const orderDetailZIndex = useModalLayer(isOrderDetailSheetOpen && !!selectedOrderForDetail)

    const isMobile = useMediaQuery("(max-width: 768px)")

    const [activeTab, setActiveTab] = useState("resumo")
    const [itemsPage, setItemsPage] = useState(1)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const ordersList = React.useMemo(() => {
        if (assignment.orders && assignment.orders.length > 0) {
            return assignment.orders
        }
        return [
            {
                order_id: assignment.order_id,
                order_number: assignment.order_number,
                position: 1,
                customer_name: assignment.customer_name,
                customer_phone: assignment.customer_phone,
                delivery_address: assignment.delivery_address,
                total_amount: assignment.total_amount,
                delivery_fee: assignment.delivery_fee,
                payment_method: assignment.payment_method,
                payment_status: assignment.payment_status,
                items: assignment.items || [],
                notes: assignment.notes,
            },
        ]
    }, [assignment])

    useEffect(() => {
        if (ordersList.length > 0) {
            setOrderDeliveredMap(prev => {
                const next = { ...prev }
                ordersList.forEach((o: any) => {
                    if (o.delivery_status === "delivered" || o.status === "delivered") {
                        next[o.order_id] = true
                    }
                })
                return next
            })
        }
    }, [ordersList])

    const totalRouteDeliveryFee = React.useMemo(() => {
        if (assignment.orders && assignment.orders.length > 0) {
            return assignment.orders.reduce((sum: number, o: any) => sum + Number(o.delivery_fee || 0), 0)
        }
        return Number(assignment.delivery_fee || 0)
    }, [assignment])

    const totalRouteAmount = React.useMemo(() => {
        return ordersList.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
    }, [ordersList])

    const hasUnpaidPayment = React.useMemo(() => {
        return ordersList.some((o: any) => {
            const isPaid = ["paid", "concluído", "concluido", "approved", "pago"].includes(
                (o.payment_status || assignment.payment_status || "").toLowerCase()
            ) || ["paid", "concluído", "concluido", "approved", "pago"].includes(
                (o.situation || "").toLowerCase()
            )
            return !isPaid
        })
    }, [ordersList, assignment])

    const isSingleDelivered = React.useMemo(() => {
        if (assignment.status === "delivered") return true
        const firstOrder = ordersList[0]
        if (!firstOrder) return false
        const fId = firstOrder.order_id || firstOrder.id
        return Boolean(
            orderDeliveredMap[fId] ||
            firstOrder.delivery_status === "delivered" ||
            firstOrder.status === "delivered"
        )
    }, [assignment.status, ordersList, orderDeliveredMap])

    const buildOrderForModal = React.useCallback((orderData: any, fallbackAssignment: any) => {
        return {
            id: orderData?.order_id || orderData?.id || fallbackAssignment.order_id,
            order_number: orderData?.order_number || fallbackAssignment.order_number,
            total_amount: Number(orderData?.total_amount || fallbackAssignment.total_amount || 0),
            paid_amount: Number(orderData?.paid_amount || orderData?.amount_paid || fallbackAssignment.paid_amount || 0),
            payment_method: orderData?.payment_method || fallbackAssignment.payment_method,
            situation: orderData?.payment_status || orderData?.situation || fallbackAssignment.payment_status || fallbackAssignment.situation,
            payment_breakdown: orderData?.payment_breakdown || fallbackAssignment.payment_breakdown,
            order_items: orderData?.items || orderData?.order_items || fallbackAssignment.items || [],
            customer_name: orderData?.customer_name || fallbackAssignment.customer_name || "Cliente",
            created_at: orderData?.created_at || fallbackAssignment.created_at || fallbackAssignment.ordered_at,
        }
    }, [])

    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
    }

    const orderNumberDisplay = assignment.order_number
        ? `#${assignment.order_number}`
        : `#${String(assignment.order_id).slice(0, 8)}`

    const cleanStorePhone = (assignment.store_phone || "").replace(/\D/g, "")

    const storeMapsUrl = assignment.store_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.store_address)}`
        : null
    const storeWhatsappUrl = cleanStorePhone ? `https://wa.me/55${cleanStorePhone}` : null

    const pageTitle = ordersList.length > 1
        ? `Rota com ${ordersList.length} pedidos`
        : `Entrega ${orderNumberDisplay}`

    const handleBackClick = useCallback(() => {
        if (onBack) onBack()
        else router.push("/entregadores")
    }, [onBack, router])

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackClick,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBackClick, setHeaderOverride])

    const allOrdersDelivered = React.useMemo(() => {
        if (ordersList.length <= 1) return true
        return ordersList.every((o: any) => orderDeliveredMap[o.order_id])
    }, [ordersList, orderDeliveredMap])

    const deliveredOrdersCount = React.useMemo(() => {
        return ordersList.filter((o: any) => orderDeliveredMap[o.order_id]).length
    }, [ordersList, orderDeliveredMap])

    const [otpModalState, setOtpModalState] = useState<{
        isOpen: boolean
        orderId?: string
        orderNumber?: string
        customerName?: string
        isSingleOrderRoute?: boolean
    } | null>(null)

    const handleOtpConfirm = async (code: string) => {
        if (!otpModalState) return { success: false, error: "Pedido não selecionado." }

        if (otpModalState.isSingleOrderRoute) {
            setLoading(true)
            const res = await transitionMyDeliveryAssignmentAction({
                assignmentId: assignment.assignment_id,
                status: "delivered",
                deliveryOtp: code,
            })
            setLoading(false)
            if (!res.success) {
                return { success: false, error: res.error }
            }
            setAssignment((prev: any) => ({ ...prev, status: "delivered", delivered_at: new Date().toISOString() }))
            toast.success("Entrega finalizada com sucesso!")
            return { success: true }
        } else {
            setLoading(true)
            const res = await markSingleOrderDeliveredAction({
                assignmentId: assignment.assignment_id,
                orderId: otpModalState.orderId!,
                deliveryOtp: code,
            })
            setLoading(false)
            if (!res.success) {
                return { success: false, error: res.error }
            }
            setOrderDeliveredMap(prev => ({ ...prev, [otpModalState.orderId!]: true }))
            toast.success(`Pedido #${otpModalState.orderNumber || ""} entregue com sucesso!`)
            const allDone = ordersList.every((o: any) => o.order_id === otpModalState.orderId || orderDeliveredMap[o.order_id])
            if (allDone) {
                setAssignment((prev: any) => ({ ...prev, status: "delivered", delivered_at: new Date().toISOString() }))
            }
            return { success: true }
        }
    }

    const advance = async () => {
        const next = NEXT_STATUS[assignment.status]
        if (!next) return

        // Se estiver em rota e houver múltiplos pedidos, todas as paradas devem ser entregues antes de finalizar
        if (assignment.status === "out_for_delivery" && ordersList.length > 1 && !allOrdersDelivered) {
            toast.error(`Ainda restam ${ordersList.length - deliveredOrdersCount} paradas a serem entregues nesta rota.`)
            return
        }

        // Se estiver finalizando rota de pedido único, exigir código de confirmação
        if (next.status === "delivered" && ordersList.length <= 1) {
            const singleOrder = ordersList[0]
            setOtpModalState({
                isOpen: true,
                orderId: singleOrder?.order_id || assignment.order_id,
                orderNumber: singleOrder?.order_number || assignment.order_number,
                customerName: singleOrder?.customer_name || assignment.customer_name,
                isSingleOrderRoute: true,
            })
            return
        }

        setLoading(true)
        const res = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: next.status,
        })
        setLoading(false)

        if (!res.success) {
            toast.error(res.error || "Não foi possível avançar o status.")
            return
        }

        setAssignment((prev: any) => ({ ...prev, status: next.status }))
        toast.success(`Status atualizado para "${next.label}"!`)
    }

    const reportFailure = async () => {
        if (!failureReason.trim()) {
            toast.error("Informe o motivo da falha.")
            return
        }
        setLoading(true)
        const res = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: "failed",
            failureReason: failureReason.trim(),
        })
        setLoading(false)

        if (!res.success) {
            toast.error(res.error || "Não foi possível registrar a falha.")
            return
        }

        setAssignment((prev: any) => ({ ...prev, status: "failed", failure_reason: failureReason.trim() }))
        setFailureOpen(false)
        toast.success("Falha registrada.")
    }

    const confirmPayment = async () => {
        setLoading(true)
        const res = await confirmDeliveryPaymentReceivedAction(
            assignment.assignment_id || assignment.id
        )
        setLoading(false)

        if (!res.success) {
            toast.error(res.error || "Não foi possível confirmar o recebimento.")
            return
        }

        setAssignment((prev: any) => ({
            ...prev,
            payment_confirmed_at: new Date().toISOString(),
        }))
        toast.success("Recebimento em dinheiro confirmado!")
    }

    // Stepper logic
    const currentStepIndex = STEPS.findIndex((s) => s.key === assignment.status)
    const isTerminalFailed = ["failed", "cancelled"].includes(assignment.status)
    const totalActiveSteps = isTerminalFailed ? STEPS.length : currentStepIndex + 1

    const timelineSteps = React.useMemo(() => {
        return STEPS.map((step, idx) => {
            const isPassed = currentStepIndex >= idx
            const isFailed = isTerminalFailed && idx >= currentStepIndex + 1
            const isLastFailed = isTerminalFailed && idx === STEPS.length - 1
            let date: string | undefined
            let time: string | undefined
            if (isPassed && !isFailed) {
                const ts = step.key === "assigned" ? assignment.assigned_at
                    : step.key === "accepted" ? assignment.accepted_at
                        : step.key === "picked_up" ? assignment.picked_up_at
                            : step.key === "out_for_delivery" ? assignment.out_for_delivery_at
                                : step.key === "delivered" ? assignment.delivered_at
                                    : undefined
                if (ts) {
                    const d = new Date(ts)
                    date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                    time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                }
            }
            return {
                label: step.label,
                active: isPassed && !isFailed,
                failed: isLastFailed,
                date,
                time,
            }
        })
    }, [assignment, currentStepIndex, isTerminalFailed])

    const currentActiveStep = React.useMemo(() => {
        const active = timelineSteps.filter((s) => s.active)
        return active[active.length - 1] || timelineSteps[0]
    }, [timelineSteps])

    // Build history entries explicitly
    const historyEntries: HistoryEntry[] = []
    if (assignment.assigned_at) {
        historyEntries.push({ id: "assigned", actor_name: "Sistema", change_lines: ["Entrega atribuída ao entregador"], created_at: assignment.assigned_at, entry_type: "status" })
    }
    if (assignment.accepted_at) {
        historyEntries.push({ id: "accepted", actor_name: "Você", change_lines: ["Aceitou a entrega"], created_at: assignment.accepted_at, entry_type: "status" })
    }
    if (assignment.picked_up_at) {
        historyEntries.push({ id: "picked_up", actor_name: "Você", change_lines: ["Retirou o pedido no estabelecimento"], created_at: assignment.picked_up_at, entry_type: "status" })
    }
    if (assignment.out_for_delivery_at) {
        historyEntries.push({ id: "out_for_delivery", actor_name: "Você", change_lines: ["Iniciou rota de entrega"], created_at: assignment.out_for_delivery_at, entry_type: "status" })
    }
    if (assignment.delivered_at) {
        historyEntries.push({ id: "delivered", actor_name: "Você", change_lines: ["Entrega confirmada com sucesso"], created_at: assignment.delivered_at, entry_type: "status" })
    }
    if (assignment.failed_at) {
        historyEntries.push({ id: "failed", actor_name: "Você", change_lines: [`Falha registrada: ${assignment.failure_reason || "Não informado"}`], created_at: assignment.failed_at, entry_type: "cancel" })
    }

    // Items pagination
    const items = React.useMemo(() => {
        if (assignment.items && assignment.items.length > 0) return assignment.items
        const list: any[] = []
        for (const order of ordersList) {
            for (const item of (order.items || [])) {
                list.push({
                    ...item,
                    order_number: order.order_number,
                    customer_name: order.customer_name,
                })
            }
        }
        return list
    }, [assignment, ordersList])
    const totalItemPages = Math.ceil(items.length / ITEMS_PER_PAGE) || 1
    const paginatedItems = items.slice((itemsPage - 1) * ITEMS_PER_PAGE, itemsPage * ITEMS_PER_PAGE)

    return (
        <>
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="flex flex-col h-full w-full">
                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">{pageTitle}</span>
                                                <Badge variant={statusMeta.variant} className="shrink-0">{statusMeta.label}</Badge>
                                                {ordersList.length > 1 && (
                                                    <Badge variant="gray" className="shrink-0">{deliveredOrdersCount}/{ordersList.length} entregues</Badge>
                                                )}
                                            </h1>
                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                {assignment.store_name || assignment.partner_name || "Loja"} • {assignment.assigned_at ? formatDate(assignment.assigned_at) : "Hoje"}
                                            </div>
                                        </div>

                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            {["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) && (
                                                <Button variant="outlinered" onClick={() => setFailureOpen(true)} disabled={loading}>
                                                    Informar Falha
                                                </Button>
                                            )}
                                            {assignment.status === "out_for_delivery" && ordersList.length > 1 ? (
                                                allOrdersDelivered ? (
                                                    <Button variant="default" onClick={advance} disabled={loading} isLoading={loading}>
                                                        Finalizar Rota de Entrega
                                                    </Button>
                                                ) : (
                                                    <Badge variant="orange">
                                                        Entregue os pedidos individualmente ({deliveredOrdersCount}/{ordersList.length})
                                                    </Badge>
                                                )
                                            ) : (
                                                NEXT_STATUS[assignment.status] && (
                                                    <Button variant="default" onClick={advance} disabled={loading} isLoading={loading}>
                                                        {NEXT_STATUS[assignment.status].label}
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    </div>

                                    <div className="pt-2 md:pt-4">
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border">
                                            <TabsTrigger value="resumo">Resumo</TabsTrigger>
                                            <TabsTrigger value="itens">Itens do Pedido ({items.length})</TabsTrigger>
                                            <TabsTrigger value="historico">Histórico</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <AnimatePresence mode="wait">
                                    {activeTab === "resumo" && (
                                        <FadeIn key="resumo" className="block">
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                                {/* LEFT MAIN COLUMN */}
                                                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                                    {/* STEPPER PROGRESS - Desktop */}
                                                    <div className="hidden lg:block">
                                                        {!isTerminalFailed ? (
                                                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                                                                <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                                                    <div className="flex justify-between items-center">
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Responsável pela entrega:</span>
                                                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                                {assignment.store_name || assignment.partner_name || "Loja"}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                            Status: <strong className="text-brand-dark dark:text-dark-heading">{statusMeta.label}</strong>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                                                    <div className="relative px-4">
                                                                        <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                                            <div
                                                                                className={`absolute left-0 h-full rounded-full transition-all duration-500 ${isTerminalFailed ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                                                                style={{ width: `${STEPS.length <= 1 ? 0 : ((totalActiveSteps - 1) / (STEPS.length - 1)) * 100}%` }}
                                                                            />
                                                                            {STEPS.map((step, idx) => {
                                                                                const isPassed = currentStepIndex >= idx
                                                                                const isLastFailed = isTerminalFailed && idx === STEPS.length - 1
                                                                                const isFailed = isTerminalFailed && idx >= currentStepIndex + 1
                                                                                return (
                                                                                    <div key={step.key} className="relative flex flex-col items-center">
                                                                                        <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                                                            <span className={`text-xs font-medium ${isPassed && !isFailed ? (isLastFailed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                                                                                {step.label}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${isPassed && !isFailed ? (isLastFailed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                                                                                            {isPassed && !isFailed && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full" />}
                                                                                        </div>
                                                                                        <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                                                            {isPassed && !isFailed ? (
                                                                                                <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">✓</div>
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
                                                        ) : (
                                                            <InfoCard
                                                                title={assignment.status === "failed" ? "Entrega com Falha/Problema" : "Entrega Cancelada"}
                                                                message="Esta rota não está mais em andamento. Caso tenha dúvidas, entre em contato com o estabelecimento."
                                                                color="red"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* STEPPER PROGRESS - Mobile/Tablet */}
                                                    <div className="lg:hidden">
                                                        {!isTerminalFailed ? (
                                                            <FormSection title="" className="mt-0">
                                                                <ListItem
                                                                    title={currentActiveStep.label}
                                                                    description={currentActiveStep.date ? `${currentActiveStep.date} às ${currentActiveStep.time}` : undefined}
                                                                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                                    showChevron={true}
                                                                    onClick={() => setIsStepsSheetOpen(true)}
                                                                    left={
                                                                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading">
                                                                            <TruckIcon size={18} />
                                                                        </div>
                                                                    }
                                                                />
                                                            </FormSection>
                                                        ) : (
                                                            <InfoCard
                                                                title="Entrega Cancelada ou com Falha"
                                                                message="Esta entrega não está mais em andamento."
                                                                color="red"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Store Section */}
                                                    <FormSection title="Local de Coleta (Estabelecimento)">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                            <div className="space-y-1 min-w-0">
                                                                <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                    {assignment.store_name || assignment.partner_name || "Estabelecimento Parceiro"}
                                                                </h3>
                                                                {assignment.store_address && (
                                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                        <MapPinIcon size={14} className="shrink-0 text-brand-inactive-text mt-0.5" />
                                                                        <span>{assignment.store_address}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="shrink-0">
                                                                <ActionsDropdown
                                                                    trigger={
                                                                        <Button variant="outline" size="sm">Opções</Button>
                                                                    }
                                                                >
                                                                    {storeMapsUrl && (
                                                                        <DropdownItem onClick={() => window.open(storeMapsUrl, "_blank")}>
                                                                            <MapPinIcon size={16} /> Abrir Rota no Maps
                                                                        </DropdownItem>
                                                                    )}
                                                                    {cleanStorePhone && (
                                                                        <DropdownItem onClick={() => window.open(`tel:${cleanStorePhone}`, "_self")}>
                                                                            <PhoneIcon size={16} /> Ligar para o Estabelecimento
                                                                        </DropdownItem>
                                                                    )}
                                                                    {storeWhatsappUrl && (
                                                                        <DropdownItem onClick={() => window.open(storeWhatsappUrl, "_blank")}>
                                                                            <WhatsappIcon size={16} /> WhatsApp
                                                                        </DropdownItem>
                                                                    )}
                                                                </ActionsDropdown>
                                                            </div>
                                                        </div>
                                                    </FormSection>

                                                    {/* Customer Section(s) / Paradas - Desktop */}
                                                    <div className="hidden lg:block">
                                                        {ordersList.map((order: any, idx: number) => {
                                                            const cleanCustPhone = (order.customer_phone || "").replace(/\D/g, "")
                                                            const custMaps = order.delivery_address
                                                                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                                                : null
                                                            const custWaze = order.delivery_address
                                                                ? `https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}`
                                                                : null
                                                            const custWhatsapp = cleanCustPhone ? `https://wa.me/55${cleanCustPhone}` : null
                                                            const stopTitle = ordersList.length > 1
                                                                ? `Parada ${idx + 1} de ${ordersList.length} - ${order.customer_name || "Cliente"} (Pedido #${order.order_number || String(order.order_id).slice(0, 8)})`
                                                                : "Local de Entrega (Cliente)"
                                                            const isOrderDelivered = orderDeliveredMap[order.order_id] || false

                                                            return (
                                                                <FormSection key={order.order_id || idx} title={stopTitle} hasSeparator>
                                                                    <div
                                                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer rounded-xl hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors -mx-2 px-2 py-2"
                                                                        onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}
                                                                    >
                                                                        <div className="space-y-1 min-w-0">
                                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading flex items-center gap-2 flex-wrap">
                                                                                <span>{order.customer_name || "Cliente"}</span>
                                                                                {order.total_amount && (
                                                                                    <span className="text-xs font-normal text-brand-inactive-text">
                                                                                        ({formatCurrency(order.total_amount)})
                                                                                    </span>
                                                                                )}
                                                                                {isOrderDelivered && (
                                                                                    <Badge variant="green" className="shrink-0">Entregue</Badge>
                                                                                )}
                                                                            </h3>
                                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                                <span>{order.delivery_address || "Endereço não informado"}</span>
                                                                            </p>
                                                                            {order.notes && (
                                                                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                                                                    <strong>Obs:</strong> {order.notes}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                            <ActionsDropdown
                                                                                trigger={
                                                                                    <Button variant="outline" size="sm">Opções</Button>
                                                                                }
                                                                            >
                                                                                <DropdownItem onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}>
                                                                                    <EyeIcon size={16} /> Ver Detalhes do Pedido
                                                                                </DropdownItem>
                                                                                {assignment.status === "out_for_delivery" && !isOrderDelivered && (
                                                                                    <DropdownItem onClick={() => {
                                                                                        setOtpModalState({
                                                                                            isOpen: true,
                                                                                            orderId: order.order_id,
                                                                                            orderNumber: order.order_number,
                                                                                            customerName: order.customer_name,
                                                                                            isSingleOrderRoute: false,
                                                                                        })
                                                                                    }}>
                                                                                        <CheckCircleIcon size={16} className="text-emerald-600" /> Confirmar Entrega deste Pedido
                                                                                    </DropdownItem>
                                                                                )}
                                                                                {custMaps && (
                                                                                    <DropdownItem onClick={() => window.open(custMaps, "_blank")}>
                                                                                        <MapPinIcon size={16} /> Abrir Rota no Maps
                                                                                    </DropdownItem>
                                                                                )}
                                                                                {custWaze && (
                                                                                    <DropdownItem onClick={() => window.open(custWaze, "_blank")}>
                                                                                        <TruckIcon size={16} /> Abrir no Waze
                                                                                    </DropdownItem>
                                                                                )}
                                                                                {cleanCustPhone && (
                                                                                    <DropdownItem onClick={() => window.open(`tel:${cleanCustPhone}`, "_self")}>
                                                                                        <PhoneIcon size={16} /> Ligar para o Cliente
                                                                                    </DropdownItem>
                                                                                )}
                                                                                {custWhatsapp && (
                                                                                    <DropdownItem onClick={() => window.open(custWhatsapp, "_blank")}>
                                                                                        <WhatsappIcon size={16} /> WhatsApp
                                                                                    </DropdownItem>
                                                                                )}
                                                                            </ActionsDropdown>
                                                                        </div>
                                                                    </div>
                                                                </FormSection>
                                                            )
                                                        })}
                                                    </div>

                                                    {/* Customer Section(s) / Paradas - Mobile/Tablet */}
                                                    <div className="lg:hidden">
                                                        <FormSection title={`Pedidos Vinculados (${ordersList.length})`} hasSeparator>
                                                            {ordersList.length === 1 ? (
                                                                <ListItem
                                                                    title={`${ordersList[0].customer_name || "Cliente"} • ${ordersList[0].total_amount ? formatCurrency(ordersList[0].total_amount) : ""}`}
                                                                    description={ordersList[0].delivery_address || "Endereço não informado"}
                                                                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                                    showChevron={true}
                                                                    onClick={() => { setSelectedOrderForDetail(ordersList[0]); setIsOrderDetailSheetOpen(true) }}
                                                                    left={
                                                                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading">
                                                                            <TruckIcon size={18} />
                                                                        </div>
                                                                    }
                                                                />
                                                            ) : (
                                                                ordersList.map((order: any, idx: number) => {
                                                                    const isOrderDelivered = orderDeliveredMap[order.order_id] || false
                                                                    return (
                                                                        <ListItem
                                                                            key={order.order_id || idx}
                                                                            title={
                                                                                <span className="flex items-center gap-2">
                                                                                    Parada {idx + 1} – {order.customer_name || "Cliente"}
                                                                                    {isOrderDelivered && <Badge variant="green" className="text-[10px] px-1.5 py-0">Entregue</Badge>}
                                                                                </span>
                                                                            }
                                                                            description={`${order.total_amount ? formatCurrency(order.total_amount) : ""} • ${order.delivery_address || ""}`}
                                                                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                                            showChevron={true}
                                                                            onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}
                                                                            left={
                                                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isOrderDelivered ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"}`}>
                                                                                    {isOrderDelivered ? <CheckCircleIcon size={18} /> : <span className="text-sm font-bold">{idx + 1}</span>}
                                                                                </div>
                                                                            }
                                                                        />
                                                                    )
                                                                })
                                                            )}
                                                        </FormSection>
                                                    </div>
                                                </div>

                                                {/* RIGHT SIDEBAR COLUMN with divider */}
                                                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                                    {/* Order Instructions */}
                                                    {assignment.notes && (
                                                        <InfoCard title="Instruções do Pedido" message={assignment.notes} color="orange" />
                                                    )}

                                                    <SidebarCard hasSeparator hasTopStrip title="Remuneração & Valores">
                                                        <InfoCard
                                                            title="Sua Taxa de Entrega (Total)"
                                                            message={formatCurrency(totalRouteDeliveryFee)}
                                                            color="green"
                                                        />
                                                        <div className="space-y-3 text-sm mt-4">
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total de Paradas</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{ordersList.length}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total dos Pedidos</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalRouteAmount)}</span>
                                                            </div>
                                                            {ordersList.length === 1 && (
                                                                <>
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Forma de Pagamento</span>
                                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                            {formatPaymentMethodLabel(assignment.payment_method, null) || "Não informada"}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Situação do Pagamento</span>
                                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{getPaymentStatusMeta(assignment.payment_status).label}</span>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                        {ordersList.length === 1 && hasUnpaidPayment && (
                                                            <div className="pt-3 border-t border-brand-border dark:border-dark-border mt-4">
                                                                {isSingleDelivered ? (
                                                                    assignment.payment_confirmed_at ? (
                                                                        <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                                            Recebimento confirmado
                                                                        </div>
                                                                    ) : (
                                                                        <Button
                                                                            variant="outline"
                                                                            onClick={() => {
                                                                                setSelectedPaymentOrder(buildOrderForModal(ordersList[0], assignment))
                                                                                setShowPaymentModal(true)
                                                                            }}
                                                                            disabled={loading}
                                                                            className="w-full"
                                                                        >
                                                                            Processar Pagamento
                                                                        </Button>
                                                                    )
                                                                ) : (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setSelectedPaymentOrder(buildOrderForModal(ordersList[0], assignment))
                                                                            setShowPaymentModal(true)
                                                                        }}
                                                                        disabled={loading}
                                                                        className="w-full text-xs text-brand-muted dark:text-dark-muted hover:text-brand-dark"
                                                                    >
                                                                        Ver Detalhes do Pagamento (Aguardando Entrega)
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    )}

                                    {activeTab === "itens" && (
                                        <FadeIn key="itens" className="block">
                                            <FormSection title={`Itens do Pedido (${items.length})`}>
                                                {items.length === 0 ? (
                                                    <div className="py-12 flex flex-col items-center justify-center text-center">
                                                        <IconPlaceholder
                                                            icon={BoxIcon}
                                                            title="Nenhum item detalhado"
                                                            subtitle="Os itens individuais não foram especificados para este pedido."
                                                        />
                                                    </div>
                                                ) : ordersList.length > 1 ? (
                                                    <div className="space-y-4">
                                                        {ordersList.map((order: any, oIdx: number) => {
                                                            const orderItems = order.items || []
                                                            return (
                                                                <Accordion
                                                                    key={order.order_id || oIdx}
                                                                    title={
                                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            Parada {oIdx + 1}: Pedido #{order.order_number || String(order.order_id).slice(0, 8)} – {order.customer_name || "Cliente"} ({orderItems.length} {orderItems.length === 1 ? "item" : "itens"} • {formatCurrency(order.total_amount || 0)})
                                                                        </span>
                                                                    }
                                                                    defaultOpen={oIdx === 0}
                                                                >
                                                                    <div className="divide-y divide-brand-border dark:divide-dark-border pt-2">
                                                                        {orderItems.map((it: any, idx: number) => {
                                                                            const itemImg = getR2ImageUrl(it.product_variants?.variant_options?.image || it.products?.images || it.images || it.image_url || it.image || null, "thumbnail")
                                                                            const itemSku = it.product_variants?.sku || it.products?.sku || it.sku || (it.sku !== "N/A" ? it.sku : null)
                                                                            const qty = Number(it.quantity || 1)
                                                                            const unit = it.unit || it.products?.unit || "un"
                                                                            const unitPrice = Number(it.product_price || it.price || it.unit_price || 0)
                                                                            const total = Number(it.subtotal || unitPrice * qty)

                                                                            return (
                                                                                <div key={it.id || idx} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                                                                                    <div className="flex items-center gap-4 min-w-0">
                                                                                        <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                                            <img
                                                                                                src={itemImg}
                                                                                                alt={it.name || it.product_name || "Produto"}
                                                                                                className="w-full h-full object-cover"
                                                                                                onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                                            />
                                                                                        </div>
                                                                                        <div className="min-w-0">
                                                                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                                {it.name || it.product_name || "Produto sem nome"}
                                                                                            </h4>
                                                                                            {itemSku && (
                                                                                                <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase">
                                                                                                    SKU: {itemSku}
                                                                                                </div>
                                                                                            )}
                                                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-2 mt-0.5">
                                                                                                <span>{formatQuantityWithUnit(qty, unit)}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="text-right shrink-0">
                                                                                        <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                                            {total > 0 ? formatCurrency(total) : (unitPrice > 0 ? formatCurrency(unitPrice * qty) : "-")}
                                                                                        </div>
                                                                                        {qty > 1 && unitPrice > 0 && (
                                                                                            <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                                                {formatUnitPriceWithUnit(unitPrice, unit)}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </Accordion>
                                                            )
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="divide-y divide-brand-border dark:divide-dark-border">
                                                            {paginatedItems.map((it: any, idx: number) => {
                                                                const itemImg = getR2ImageUrl(it.product_variants?.variant_options?.image || it.products?.images || it.images || it.image_url || it.image || null, "thumbnail")
                                                                const itemSku = it.product_variants?.sku || it.products?.sku || it.sku || (it.sku !== "N/A" ? it.sku : null)
                                                                const qty = Number(it.quantity || 1)
                                                                const unit = it.unit || it.products?.unit || "un"
                                                                const unitPrice = Number(it.product_price || it.price || it.unit_price || 0)
                                                                const total = Number(it.subtotal || unitPrice * qty)

                                                                return (
                                                                    <div key={it.id || idx} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                                                                        <div className="flex items-center gap-4 min-w-0">
                                                                            <div className="w-12 h-12 shrink-0 rounded-full overflow-hidden bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                                <img
                                                                                    src={itemImg}
                                                                                    alt={it.name || it.product_name || "Produto"}
                                                                                    className="w-full h-full object-cover"
                                                                                    onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                                />
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                    {it.name || it.product_name || "Produto sem nome"}
                                                                                </h4>
                                                                                {itemSku && (
                                                                                    <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase">
                                                                                        SKU: {itemSku}
                                                                                    </div>
                                                                                )}
                                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-2 mt-0.5">
                                                                                    <span>{formatQuantityWithUnit(qty, unit)}</span>
                                                                                    {it.order_number && (
                                                                                        <span>• Pedido #{it.order_number}</span>
                                                                                    )}
                                                                                    {it.customer_name && (
                                                                                        <span>• {it.customer_name}</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                                {total > 0 ? formatCurrency(total) : (unitPrice > 0 ? formatCurrency(unitPrice * qty) : "-")}
                                                                            </div>
                                                                            {qty > 1 && unitPrice > 0 && (
                                                                                <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                                    {formatUnitPriceWithUnit(unitPrice, unit)}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>

                                                        {totalItemPages > 1 && (
                                                            <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                                                <Pagination
                                                                    currentPage={itemsPage}
                                                                    totalPages={totalItemPages}
                                                                    onPageChange={setItemsPage}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    )}

                                    {activeTab === "historico" && (
                                        <FadeIn key="historico" className="block">
                                            <div className="space-y-6">
                                                <HistoryTimeline entries={historyEntries} />
                                            </div>
                                        </FadeIn>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </Tabs>

                    {/* Report Failure Modal */}
                    <DefaultModal
                        isOpen={failureOpen}
                        onClose={() => setFailureOpen(false)}
                        title="Informar Falha na Entrega"
                        maxWidth="md"
                        footer={
                            <div className="flex justify-end gap-3 w-full">
                                <Button variant="outline" onClick={() => setFailureOpen(false)}>Cancelar</Button>
                                <Button variant="destructive" onClick={reportFailure} disabled={loading || !failureReason.trim()} isLoading={loading}>
                                    Confirmar Falha
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Informe o motivo pelo qual a entrega não pôde ser concluída (ex: endereço incorreto, cliente ausente, problema com o veículo).
                            </p>
                            <FormTextarea
                                value={failureReason}
                                onChange={(e) => setFailureReason(e.target.value)}
                                placeholder="Descreva o motivo da falha..."
                                maxLength={2000}
                            />
                        </div>
                    </DefaultModal>

                    {/* Mobile Stepper Sheet */}
                    <BottomSheet isOpen={isStepsSheetOpen} onClose={() => setIsStepsSheetOpen(false)}>
                        <div className="p-6 space-y-6">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Progresso da Entrega</h3>
                            <div className="rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border">
                                <div className="bg-brand-gray dark:bg-dark-border/50 p-4 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Responsável pela entrega:</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{assignment.store_name || assignment.partner_name || "Loja"}</span>
                                        </div>
                                        <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                            Status: <strong className="text-brand-dark dark:text-dark-heading">{statusMeta.label}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {timelineSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${step.active ? (step.failed ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700") : "bg-gray-100 dark:bg-dark-border/40 text-gray-400"}`}>
                                            {step.active ? "✓" : idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <p className={`text-sm font-semibold ${step.active ? "text-brand-dark dark:text-dark-heading" : "text-gray-400 dark:text-dark-body"}`}>
                                                {step.label}
                                            </p>
                                            {step.date && (
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                    {step.date} às {step.time}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </BottomSheet>

                    {/* EXACT SAME ORDER DETAILS SHEET AS ERP */}
                    {(() => {
                        const isOpen = isOrderDetailSheetOpen && !!selectedOrderForDetail
                        const handleClose = () => {
                            setIsOrderDetailSheetOpen(false)
                            setSelectedOrderForDetail(null)
                        }

                        if (!selectedOrderForDetail) return null
                        const order = selectedOrderForDetail
                        const displayId = order.order_number ? `#${order.order_number}` : `#${String(order.order_id || order.id || "").slice(0, 8).toUpperCase()}`
                        const isOrderDelivered = Boolean(orderDeliveredMap[order.order_id] || order.delivery_status === "delivered" || order.status === "delivered" || assignment.status === "delivered")
                        const canMarkDelivered = assignment.status === "out_for_delivery" && !isOrderDelivered
                        const paymentMeta = getPaymentStatusMeta(order.situation || order.payment_status || assignment.situation || assignment.payment_status || "pending")
                        const resolvedDeliveryStatus = isOrderDelivered
                            ? "delivered"
                            : (assignment.status === "out_for_delivery"
                                ? "sent"
                                : (order.delivery_status || (assignment.status === "accepted" ? "accepted" : "preparing")))
                        const deliveryMeta = getDeliveryStatusMeta(resolvedDeliveryStatus)
                        const ordItems = order.items || []
                        const orderDate = order.created_at || order.order_date || order.order_created_at || assignment.assigned_at
                        const orderIsPaid = ["paid", "pago", "approved", "aprovado", "concluido", "concluído"].includes(String(order.situation || order.payment_status || "").toLowerCase())
                        const orderNeedsPayment = !orderIsPaid

                        const orderHistoryEntries: HistoryEntry[] = []
                        if (order.created_at || order.order_date) {
                            orderHistoryEntries.push({ id: "created", actor_name: "Sistema", change_lines: ["Pedido criado"], created_at: order.created_at || order.order_date, entry_type: "status" })
                        }
                        if (orderIsPaid) {
                            orderHistoryEntries.push({ id: "paid", actor_name: "Sistema", change_lines: ["Pagamento confirmado"], created_at: order.updated_at || order.created_at, entry_type: "payment" })
                        }
                        if (isOrderDelivered) {
                            orderHistoryEntries.push({ id: "delivered", actor_name: "Entregador", change_lines: ["Pedido entregue ao cliente"], created_at: assignment.delivered_at, entry_type: "status" })
                        }

                        const sheetContent = (
                            <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                                <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                                    <div>
                                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">{displayId}</p>
                                    </div>
                                    <Button variant="filled" onClick={handleClose} size="icon">
                                        <XIcon className="h-5 w-5" />
                                    </Button>
                                </header>

                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    <Tabs defaultValue="dados_gerais" className="w-full">
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                                            <TabsTrigger value="dados_gerais" className="px-0 pb-3 text-sm">
                                                Dados Gerais
                                            </TabsTrigger>
                                            <TabsTrigger value="itens" className="px-0 pb-3 text-sm">
                                                Itens do Pedido ({ordItems.length})
                                            </TabsTrigger>
                                            <TabsTrigger value="historico" className="px-0 pb-3 text-sm">
                                                Histórico
                                            </TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="dados_gerais" className="mt-0 space-y-6">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(order.total_amount || 0)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Taxa de Entrega (Frete)</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(order.delivery_fee || 0)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Forma de Pagamento</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                        {formatPaymentMethodLabel(order.payment_method, null) || "Não informado"}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Situação do Pagamento</span>
                                                    <Badge variant={paymentMeta.variant} icon={<MoneyIcon />}>
                                                        {paymentMeta.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status de Entrega</span>
                                                    <Badge
                                                        variant={deliveryMeta.variant}
                                                        icon={order.delivery_type === "pickup" ? <StoreIcon /> : getDeliveryStatusIcon(resolvedDeliveryStatus)}
                                                    >
                                                        {deliveryMeta.label}
                                                    </Badge>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data do Pedido</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        {orderDate ? formatDateTime(orderDate) : "-"}
                                                    </span>
                                                </div>
                                                {order.delivery_address && (
                                                    <div className="flex justify-between items-start text-sm gap-4">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Endereço de Entrega</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-right flex items-start gap-1">
                                                            <MapPinIcon size={14} className="shrink-0 mt-0.5 text-brand-inactive-text" />
                                                            {order.delivery_address}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-brand-border dark:border-dark-border w-full" />

                                            <CustomerCard
                                                customer={{
                                                    name: order.customer_name || "Cliente",
                                                    phone: order.customer_phone || "",
                                                    email: order.customer_email || "",
                                                }}
                                                address={order.delivery_address ? parseAddressString(order.delivery_address) : null}
                                                showMap={true}
                                                chrome="minimal"
                                            />

                                            {order.notes && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-brand-dark dark:text-dark-heading mb-2 uppercase tracking-wide">Observações do Pedido</h4>
                                                    <p className="text-sm text-brand-dark dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl p-3 border border-brand-border dark:border-dark-border">
                                                        {order.notes}
                                                    </p>
                                                </div>
                                            )}

                                            {orderNeedsPayment && (
                                                <div className="pt-2">
                                                    {isOrderDelivered ? (
                                                        assignment.payment_confirmed_at ? (
                                                            <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                                Recebimento confirmado
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setSelectedPaymentOrder(buildOrderForModal(order, assignment))
                                                                    setShowPaymentModal(true)
                                                                }}
                                                                disabled={loading}
                                                                className="w-full"
                                                            >
                                                                Processar Pagamento
                                                            </Button>
                                                        )
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedPaymentOrder(buildOrderForModal(order, assignment))
                                                                setShowPaymentModal(true)
                                                            }}
                                                            disabled={loading}
                                                            className="w-full text-xs text-brand-muted dark:text-dark-muted hover:text-brand-dark"
                                                        >
                                                            Ver Detalhes do Pagamento (Aguardando Entrega)
                                                        </Button>
                                                    )}
                                                </div>
                                            )}

                                            {isOrderDelivered && (
                                                <div className="rounded-xl bg-emerald-50 p-4 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                    <CheckCircleIcon size={16} className="inline mr-1" />
                                                    Este pedido já foi entregue ao cliente
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="itens" className="mt-0">
                                            {ordItems.length === 0 ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <IconPlaceholder
                                                        icon={BoxIcon}
                                                        title="Sem itens por aqui"
                                                        subtitle="Nenhum item detalhado foi retornado para o pedido selecionado."
                                                    />
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {ordItems.map((item: any, idx: number) => {
                                                        const itemImage = getR2ImageUrl(item.product_variants?.variant_options?.image || item.products?.images || item.services?.images || item.images || item.image || item.image_url || null, "thumbnail")
                                                        const itemSku = item.product_variants?.sku || item.products?.sku || item.sku || (item.sku !== "N/A" ? item.sku : null)
                                                        const itemUnit = item.products?.unit || item.unit || "un"
                                                        const itemPrice = Number(item.product_price || item.price || item.unit_price || 0)
                                                        const itemQty = Number(item.quantity || 1)
                                                        const itemSubtotal = Number(item.subtotal || itemPrice * itemQty)

                                                        return (
                                                            <div key={item.id || idx} className="flex items-start gap-4">
                                                                <div className="w-12 h-12 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                    <img
                                                                        src={itemImage}
                                                                        className="w-full h-full object-cover rounded-full"
                                                                        alt={item.name || item.product_name || "Produto sem nome"}
                                                                        onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                    />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex justify-between items-start mb-0.5">
                                                                        <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                            {item.name || item.product_name || "Produto sem nome"}
                                                                        </h4>
                                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(itemSubtotal)}
                                                                        </span>
                                                                    </div>
                                                                    {itemSku && (
                                                                        <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mb-1">
                                                                            SKU: {itemSku}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                        {formatQuantityWithUnit(itemQty, itemUnit)} • {formatUnitPriceWithUnit(itemPrice, itemUnit)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="historico" className="mt-0">
                                            <HistoryTimeline entries={orderHistoryEntries} />
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            </div>
                        )

                        return isMobile ? (
                            <BottomSheet isOpen={isOpen} onClose={handleClose}>
                                {sheetContent}
                            </BottomSheet>
                        ) : (
                            <Portal>
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div
                                            className="fixed inset-0 z-[110] bg-black/50"
                                            style={{ zIndex: orderDetailZIndex }}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            onClick={handleClose}
                                        >
                                            <motion.div
                                                className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
                                                initial={{ x: "120%", opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                exit={{ x: "120%", opacity: 0 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {sheetContent}
                                            </motion.div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </Portal>
                        )
                    })()}
                </div>
            </FadeIn>

            <DriverPaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                assignmentId={assignment.assignment_id || assignment.id}
                order={selectedPaymentOrder}
                canConfirm={Boolean(
                    selectedPaymentOrder?.delivery_status === "delivered" ||
                    assignment.status === "delivered" ||
                    (ordersList.length === 1 && isSingleDelivered)
                )}
                onSuccess={() => {
                    setShowPaymentModal(false)
                    const paidOrderId = selectedPaymentOrder?.id || selectedPaymentOrder?.order_id
                    setAssignment((prev: any) => {
                        const updatedOrders = prev.orders?.map((o: any) => {
                            if (o.order_id === paidOrderId || o.id === paidOrderId) {
                                return {
                                    ...o,
                                    payment_status: "paid",
                                    situation: "paid",
                                    paid_amount: o.total_amount,
                                }
                            }
                            return o
                        })

                        const allPaid = updatedOrders && updatedOrders.length > 0
                            ? updatedOrders.every((o: any) => ["paid", "concluído", "concluido", "approved", "pago"].includes((o.payment_status || o.situation || "").toLowerCase()))
                            : true

                        return {
                            ...prev,
                            orders: updatedOrders || prev.orders,
                            payment_confirmed_at: allPaid ? new Date().toISOString() : prev.payment_confirmed_at,
                            payment_status: allPaid ? "paid" : prev.payment_status,
                            payment_method: selectedPaymentOrder?.payment_method || prev.payment_method,
                        }
                    })
                }}
            />

            <DeliveryOtpModal
                isOpen={Boolean(otpModalState?.isOpen)}
                onClose={() => setOtpModalState(null)}
                onConfirm={handleOtpConfirm}
                orderNumber={otpModalState?.orderNumber}
                customerName={otpModalState?.customerName}
            />
        </>
    )
}
