"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, Button, DefaultModal, FormSection, InfoCard, ActionsDropdown, DropdownItem, Pagination, ListItem } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import {
    confirmDeliveryPaymentReceivedAction,
    transitionMyDeliveryAssignmentAction,
} from "@/app/actions/delivery-drivers"
import {
    ChevronLeftIcon,
    TruckIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    PhoneIcon,
    WhatsappIcon,
    MapPinIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { statusConfig, type DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"

const SidebarCard = ({ title, children, className = "" }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) => (
    <>
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 ${className}`}>
            {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
            {children}
        </div>
        <FormSection title={title} hasSeparator className="lg:hidden">
            {children}
        </FormSection>
    </>
)

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

    const totalRouteDeliveryFee = React.useMemo(() => {
        if (assignment.orders && assignment.orders.length > 0) {
            return assignment.orders.reduce((sum: number, o: any) => sum + Number(o.delivery_fee || 0), 0)
        }
        return Number(assignment.delivery_fee || 0)
    }, [assignment])

    const totalRouteAmount = React.useMemo(() => {
        return ordersList.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
    }, [ordersList])

    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
    }

    const orderNumberDisplay = assignment.order_number
        ? `#${assignment.order_number}`
        : `#${String(assignment.order_id).slice(0, 8)}`

    const cleanStorePhone = (assignment.store_phone || "").replace(/\D/g, "")

    const customerMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.delivery_address || "")}`
    const customerWazeUrl = `https://waze.com/ul?q=${encodeURIComponent(assignment.delivery_address || "")}`

    const storeMapsUrl = assignment.store_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.store_address)}`
        : null
    const storeWhatsappUrl = cleanStorePhone ? `https://wa.me/55${cleanStorePhone}` : null

    const pageTitle = ordersList.length > 1
        ? `Rota com ${ordersList.length} pedidos`
        : `Pedido ${orderNumberDisplay}`

    const handleBackClick = useCallback(() => {
        if (onBack) {
            onBack()
        } else {
            router.push("/entregadores")
        }
    }, [onBack, router])

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackClick,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, assignment.status, handleBackClick, setHeaderOverride])

    const advance = async () => {
        const next = NEXT_STATUS[assignment.status]
        if (!next) return

        setLoading(true)
        const result = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: next.status,
        })
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível avançar a entrega.")
            return
        }

        const now = new Date().toISOString()
        setAssignment((prev: any) => ({
            ...prev,
            status: next.status,
            accepted_at: next.status === "accepted" ? now : prev.accepted_at,
            picked_up_at: next.status === "picked_up" ? now : prev.picked_up_at,
            out_for_delivery_at: next.status === "out_for_delivery" ? now : prev.out_for_delivery_at,
            delivered_at: next.status === "delivered" ? now : prev.delivered_at,
        }))
        toast.success("Status da entrega atualizado com sucesso!")
    }

    const reportFailure = async () => {
        if (!failureReason.trim()) {
            toast.error("Por favor, informe o motivo do problema ou falha.")
            return
        }

        setLoading(true)
        const result = await transitionMyDeliveryAssignmentAction({
            assignmentId: assignment.assignment_id,
            status: "failed",
            failureReason,
        })
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível registrar a falha.")
            return
        }

        setAssignment((prev: any) => ({
            ...prev,
            status: "failed",
            failed_at: new Date().toISOString(),
        }))
        setFailureOpen(false)
        toast.success("Problema registrado na entrega.")
    }

    const confirmPayment = async () => {
        setLoading(true)
        const result = await confirmDeliveryPaymentReceivedAction(assignment.assignment_id)
        setLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível confirmar o pagamento.")
            return
        }

        setAssignment((prev: any) => ({
            ...prev,
            payment_confirmed_at: result.data?.confirmed_at || new Date().toISOString(),
        }))
        toast.success("Recebimento em dinheiro confirmado com sucesso!")
    }

    const isCashPayment = /dinheiro|cash|money|especie/i.test(String(assignment.payment_method || ""))
    const currentStepIndex = STEPS.findIndex((s) => s.key === assignment.status)
    const isTerminalFailed = ["failed", "cancelled"].includes(assignment.status)
    const totalActiveSteps = isTerminalFailed ? currentStepIndex + 1 : currentStepIndex + 1

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

    // Build history entries explicitly to avoid && operator issues
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
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            <Badge variant={statusMeta.variant} className="shrink-0">{statusMeta.label}</Badge>
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
                                        {NEXT_STATUS[assignment.status] && (
                                            <Button variant="default" onClick={advance} disabled={loading} isLoading={loading}>
                                                {NEXT_STATUS[assignment.status].label}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="resumo">Resumo</TabsTrigger>
                                        <TabsTrigger value="itens">Itens do Pedido</TabsTrigger>
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
                                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${currentActiveStep.failed
                                                                        ? "bg-brand-red/10 text-brand-red"
                                                                        : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                                                    }`}>
                                                                        <div className={`w-2.5 h-2.5 rounded-full ${currentActiveStep.failed
                                                                            ? "bg-brand-red"
                                                                            : "bg-brand-dark dark:bg-dark-heading"
                                                                        }`} />
                                                                    </div>
                                                                }
                                                            />
                                                        </FormSection>
                                                    ) : (
                                                        <InfoCard
                                                            title={assignment.status === "failed" ? "Entrega com Falha/Problema" : "Entrega Cancelada"}
                                                            message="Esta rota não está mais em andamento. Caso tenha dúvidas, entre em contato com o estabelecimento."
                                                            color="red"
                                                        />
                                                    )}
                                                </div>

                                                {/* Order Instructions */}
                                                {assignment.notes && (
                                                    <InfoCard title="Instruções do Pedido" message={assignment.notes} color="orange" />
                                                )}

                                                {/* Store Section */}
                                                <FormSection title="Local de Coleta (Estabelecimento)">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
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
                                                                    <Button variant="outline" size="sm">Contato</Button>
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
                                                        const custMaps = order.delivery_address
                                                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                                            : null
                                                        const custWaze = order.delivery_address
                                                            ? `https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}`
                                                            : null
                                                        const stopTitle = ordersList.length > 1
                                                            ? `Parada ${idx + 1} de ${ordersList.length} - ${order.customer_name || "Cliente"} (Pedido #${order.order_number || String(order.order_id).slice(0, 8)})`
                                                            : "Local de Entrega (Cliente)"

                                                        return (
                                                            <FormSection key={order.order_id || idx} title={stopTitle}>
                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                                    <div className="space-y-1">
                                                                        <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                                            <span>{order.customer_name || "Cliente"}</span>
                                                                            {order.total_amount && (
                                                                                <span className="text-xs font-normal text-brand-inactive-text">
                                                                                    ({formatCurrency(order.total_amount)})
                                                                                </span>
                                                                            )}
                                                                        </h3>
                                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                            <MapPinIcon size={14} className="shrink-0 text-purple-500 mt-0.5" />
                                                                            <span>{order.delivery_address || "Endereço não informado"}</span>
                                                                        </p>
                                                                        {order.notes && (
                                                                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                                                                <strong>Obs:</strong> {order.notes}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className="shrink-0">
                                                                        <ActionsDropdown
                                                                            trigger={
                                                                                <Button variant="outline" size="sm">Rota</Button>
                                                                            }
                                                                        >
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
                                                                        </ActionsDropdown>
                                                                    </div>
                                                                </div>
                                                            </FormSection>
                                                        )
                                                    })}
                                                </div>

                                                {/* Customer Section(s) / Paradas - Mobile/Tablet */}
                                                <div className="lg:hidden">
                                                    <FormSection title={`Pedidos Vinculados (${ordersList.length})`} className="mt-0">
                                                        <ListItem
                                                            title={`Valor total da entrega: ${formatCurrency(totalRouteAmount)}`}
                                                            description={ordersList.length === 1
                                                                ? `${ordersList[0].customer_name || "Cliente"} • ${ordersList[0].total_amount ? formatCurrency(ordersList[0].total_amount) : ""}`
                                                                : `${ordersList.length} paradas`
                                                            }
                                                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                            showChevron={true}
                                                            onClick={() => setIsOrdersSheetOpen(true)}
                                                            left={
                                                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading">
                                                                    <TruckIcon size={18} />
                                                                </div>
                                                            }
                                                        />
                                                    </FormSection>
                                                </div>
                                            </div>

                                            {/* RIGHT SIDEBAR COLUMN with divider */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                                <SidebarCard title="Remuneração & Valores">
                                                    <InfoCard
                                                        title="Sua Taxa de Entrega (Total)"
                                                        message={formatCurrency(totalRouteDeliveryFee)}
                                                        color="green"
                                                    />
                                                    <div className="space-y-3 text-xs mt-4">
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Total de Paradas:</span>
                                                            <span className="font-bold text-sm">{ordersList.length}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Valor Total dos Pedidos:</span>
                                                            <span className="font-bold text-sm">{formatCurrency(totalRouteAmount)}</span>
                                                        </div>
                                                        {ordersList.length === 1 && (
                                                            <>
                                                                <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Forma de Pagamento:</span>
                                                                    <span className="font-semibold text-right">
                                                                        {formatPaymentMethodLabel(assignment.payment_method, null) || "Não informada"}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Situação do Pagamento:</span>
                                                                    <Badge variant={getPaymentStatusMeta(assignment.payment_status).variant}>
                                                                        {getPaymentStatusMeta(assignment.payment_status).label}
                                                                    </Badge>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    {isCashPayment && (
                                                        <div className="pt-3 border-t border-brand-border dark:border-dark-border mt-4">
                                                            {assignment.payment_confirmed_at ? (
                                                                <div className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                                                    Recebimento em dinheiro confirmado
                                                                </div>
                                                            ) : (
                                                                <Button variant="outline" onClick={confirmPayment} disabled={loading} className="w-full text-xs font-bold">
                                                                    Confirmar Recebimento em Dinheiro
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
                                            {items.length > 0 ? (
                                                <>
                                                    <div className="w-full overflow-hidden rounded-xl">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[600px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Item</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24">Qtd.</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-36">Preço Unit.</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36 rounded-r-lg">Total</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginatedItems.map((it: any, idx: number) => {
                                                                        const qty = Number(it.quantity || 1)
                                                                        const unitPrice = Number(it.product_price || it.price || it.unit_price || 0)
                                                                        const total = Number(it.subtotal || unitPrice * qty)
                                                                        const itemSku = it.sku || it.product_variants?.sku || it.products?.sku || null
                                                                        const unit = it.unit || it.products?.unit || "un"

                                                                        return (
                                                                            <tr key={idx} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                                <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                                    <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                        {it.name || it.product_name || "Item"}
                                                                                    </div>
                                                                                    {itemSku && itemSku !== "N/A" && (
                                                                                        <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mt-0.5">
                                                                                            SKU: {itemSku}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                    {formatQuantityWithUnit(qty, unit)}
                                                                                </td>
                                                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                    {unitPrice > 0 ? formatCurrency(unitPrice) : "-"}
                                                                                </td>
                                                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                    {total > 0 ? formatCurrency(total) : "-"}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {totalItemPages > 1 && (
                                                        <div className="pt-4">
                                                            <Pagination currentPage={itemsPage} totalPages={totalItemPages} onPageChange={setItemsPage} />
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between border-t border-brand-border dark:border-dark-border pt-4 mt-4">
                                                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total do Pedido</span>
                                                        <span className="text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(assignment.total_amount || 0)}
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-xs text-brand-inactive-text">Nenhum item listado.</p>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                )}

                                {activeTab === "historico" && (
                                    <FadeIn key="historico" className="block">
                                        <HistoryTimeline
                                            entries={historyEntries}
                                            emptyMessage="Nenhum registro de histórico encontrado para esta entrega."
                                        />
                                        {isTerminalFailed && (
                                            <div className="mt-4 rounded-xl bg-red-50/70 p-4 border border-red-200/60 dark:bg-red-950/20 dark:border-red-900/40 text-xs">
                                                <span className="font-bold text-red-800 dark:text-red-300">
                                                    {assignment.status === "failed" ? "Falha registrada" : "Entrega cancelada"}:
                                                </span>
                                                <p className="mt-1 text-red-700/80 dark:text-red-400">{assignment.failure_reason || "Não informado."}</p>
                                            </div>
                                        )}
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        {["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) ? (
                            <>
                                <Button variant="outlinered" onClick={() => setFailureOpen(true)} disabled={loading} className="flex-1 h-12">
                                    Informar Falha
                                </Button>
                                <Button onClick={advance} disabled={loading} isLoading={loading} className="flex-1 h-12">
                                    {NEXT_STATUS[assignment.status]?.shortLabel || "Avançar"}
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={handleBackClick} className="flex-1 h-12">
                                Voltar para entregas
                            </Button>
                        )}
                    </div>
                </Tabs>

                {/* MODAL REPORT FAILURE */}
                <DefaultModal
                    isOpen={failureOpen}
                    onClose={() => setFailureOpen(false)}
                    title="Informar Problema na Entrega"
                    maxWidth="md"
                    footer={
                        <div className="flex items-center justify-end gap-2 w-full">
                            <Button variant="outline" onClick={() => setFailureOpen(false)} disabled={loading}>Cancelar</Button>
                            <Button variant="destructive" onClick={reportFailure} disabled={loading || !failureReason.trim()} isLoading={loading}>
                                Confirmar Falha
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 py-2">
                        <p className="text-xs text-brand-inactive-text">
                            Descreva com detalhes o que aconteceu para que o lojista e a plataforma possam dar andamento.
                        </p>
                        <textarea
                            value={failureReason}
                            onChange={(e) => setFailureReason(e.target.value)}
                            placeholder="Ex: Cliente ausente no endereço, endereço incorreto, veículo quebrou..."
                            className="w-full min-h-[110px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                        />
                    </div>
                </DefaultModal>

                <BottomSheet
                    isOpen={isStepsSheetOpen}
                    onClose={() => setIsStepsSheetOpen(false)}
                    title="Status da Entrega"
                >
                    <div className="space-y-0 my-4 px-2">
                        {timelineSteps.map((step, idx) => (
                            <div key={idx} className="relative pl-6 pb-6 border-l-2 border-brand-border dark:border-dark-border last:border-l-transparent">
                                <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (step.failed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                                    {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full" />}
                                </div>
                                <div className="flex flex-col text-left">
                                    <span className={`text-sm font-semibold ${step.active ? (step.failed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                        {step.label}
                                    </span>
                                    {step.date ? (
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            {step.date} às {step.time}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-300 dark:text-dark-body/50 mt-0.5">-</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </BottomSheet>

                <BottomSheet
                    isOpen={isOrdersSheetOpen}
                    onClose={() => setIsOrdersSheetOpen(false)}
                    title="Pedidos Vinculados"
                >
                    <div className="space-y-4 my-4 px-2">
                        {ordersList.map((order: any, idx: number) => {
                            const custMaps = order.delivery_address
                                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                : null
                            const custWaze = order.delivery_address
                                ? `https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}`
                                : null
                            return (
                                <div key={order.order_id || idx} className="border border-brand-border dark:border-dark-border rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                Pedido #{order.order_number || String(order.order_id).slice(0, 8)}
                                            </h4>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                {order.customer_name || "Cliente"} {order.total_amount ? `• ${formatCurrency(order.total_amount)}` : ""}
                                            </p>
                                        </div>
                                        {order.delivery_address && (
                                            <ActionsDropdown
                                                trigger={<Button variant="outline" size="sm">Rota</Button>}
                                            >
                                                {custMaps && (
                                                    <DropdownItem onClick={() => window.open(custMaps, "_blank")}>
                                                        <MapPinIcon size={16} /> Maps
                                                    </DropdownItem>
                                                )}
                                                {custWaze && (
                                                    <DropdownItem onClick={() => window.open(custWaze, "_blank")}>
                                                        <TruckIcon size={16} /> Waze
                                                    </DropdownItem>
                                                )}
                                            </ActionsDropdown>
                                        )}
                                    </div>
                                    {order.delivery_address && (
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                            <MapPinIcon size={12} className="shrink-0 text-purple-500 mt-0.5" />
                                            <span>{order.delivery_address}</span>
                                        </p>
                                    )}
                                    {order.notes && (
                                        <p className="text-xs text-amber-700 dark:text-amber-300">
                                            <strong>Obs:</strong> {order.notes}
                                        </p>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </BottomSheet>
            </div>
        </FadeIn>
    )
}