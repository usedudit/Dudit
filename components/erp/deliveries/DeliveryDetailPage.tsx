"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button, Badge, InfoCard, FormDropdown, Tabs, TabsContent, TabsList, TabsTrigger, CustomerCard, FormSection, ListItem, ActionsDropdown, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import Input from "@/components/reusable/Input"
import DefaultModal from "@/components/reusable/DefaultModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, ClockArrowUpIcon, ClockCheckIcon, EstimateTimeIcon, RouteIcon, XIcon, EditIcon, ThreeDotsIcon } from "@/lib/icons"
import { getERPDeliveryDetailsAction, getDeliveryRoutePointsAction, updateERPSingleOrderDeliveryStatusAction, updateERPDeliveryStatusAction } from "@/app/actions/erp/deliveries"
import { formatCurrency, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getDeliveryStatusMeta, getPaymentStatusMeta, getDeliveryStatusLabel, getDeliveryStatusIcon } from "@/lib/orders/status"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { parseAddressString } from "../orders/CreateOrder"
import PaymentStatusModal from "../orders/PaymentStatusModal"
import DuditDriverDetailsModal from "./DuditDriverDetailsModal"

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "rescheduling", label: "Cliente solicitou reagendamento" },
    { value: "logistics_issue", label: "Problema logístico / Rota" },
    { value: "payment_issue", label: "Problema com pagamento" },
    { value: "other", label: "Outro" }
]

function doesTransitionRequireReason(currentStatus: string, nextStatus: string): boolean {
    if (currentStatus === "delivered" && nextStatus !== "delivered") {
        return true;
    }
    if (currentStatus === "delivery_failed" && nextStatus !== "delivery_failed") {
        return true;
    }
    if (currentStatus === "sent" && ["preparing", "pickup_available", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true;
    }
    if (currentStatus === "pickup_available" && ["preparing", "sent", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true;
    }
    if (currentStatus === "preparing" && ["not_sent", "pending", "delivery_failed"].includes(nextStatus)) {
        return true;
    }
    return false;
}

const DeliveryRouteMap = dynamic(
    () => import("./DeliveryRouteMap").then((m) => m.DeliveryRouteMap),
    { ssr: false },
)

export default function DeliveryDetailPage({
    deliveryId,
    partnerId,
    onBack,
    onEdit,
    planSlug = "free",
}: {
    deliveryId: string
    partnerId: string
    onBack: () => void
    onEdit?: (deliveryId: string) => void
    planSlug?: string
}) {
    const [delivery, setDelivery] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [route, setRoute] = useState<any | null>(null)
    const [routeError, setRouteError] = useState<string | null>(null)
    const [routeLoading, setRouteLoading] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
    const [deliveryWarningModal, setDeliveryWarningModal] = useState<{
        isOpen: boolean
        orderId: string
        nextStatus: string
        currentStatus: string
        reasonDropdownValue: string
        customReasonText: string
    } | null>(null)
    const [cancelDeliveryModal, setCancelDeliveryModal] = useState<{
        isOpen: boolean
        requiresReason: boolean
        reasonDropdownValue: string
        customReasonText: string
    } | null>(null)
    const [selectedLink, setSelectedLink] = useState<any | null>(null)
    const [activeLink, setActiveLink] = useState<any | null>(null)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
    const [isDriverModalOpen, setIsDriverModalOpen] = useState(false)
    const [selectedNewStatus, setSelectedNewStatus] = useState<string>("")
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; orderId: string; nextStatus: string } | null>(null)
    const [activeTab, setActiveTab] = useState<string>("dados_gerais")
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const mounted = useRef(true)

    const handleBack = useCallback(() => onBack(), [onBack])

    const { setHeaderOverride } = useSidebar()

    const handleStatusChange = useCallback(async () => {
        if (!delivery || selectedNewStatus === delivery.status) return
        const prevDelivery = delivery
        setDelivery((current: any) => current ? { ...current, status: selectedNewStatus } : current)
        try {
            const res = await updateERPDeliveryStatusAction({
                deliveryId: delivery.id,
                partnerId,
                status: selectedNewStatus as any,
            })
            if (res.success) {
                toast.success("Status da entrega atualizado com sucesso!")
            } else {
                setDelivery(prevDelivery)
                toast.error(res.error || "Erro ao atualizar status da entrega.")
            }
        } catch (err: any) {
            setDelivery(prevDelivery)
            toast.error(err?.message || "Erro inesperado ao atualizar status.")
        }
        setIsStatusModalOpen(false)
    }, [delivery, selectedNewStatus, partnerId])

    useEffect(() => {
        setHeaderOverride({
            title: `Entrega ${delivery?.delivery_number ? `#${delivery.delivery_number}` : ""}`,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [delivery?.delivery_number, handleBack, setHeaderOverride])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    const loadDeliveryDetails = useCallback(async () => {
        setLoading(true)
        const res = await getERPDeliveryDetailsAction(deliveryId, partnerId)
        if (mounted.current) {
            if (!res.success) {
                console.error("[DeliveryDetailPage] Failed to load:", res.error)
                toast.error(res.error || "Erro ao carregar detalhes da entrega.")
            }
            setDelivery(res.success ? res.data : null)
            setLoading(false)
        }
    }, [deliveryId, partnerId])

    useEffect(() => {
        mounted.current = true
        loadDeliveryDetails()
        return () => {
            mounted.current = false
        }
    }, [loadDeliveryDetails])

    useEffect(() => {
        let alive = true
        const run = async () => {
            setRouteLoading(true)
            const res = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
            if (!alive) return
            if (res.success) {
                setRoute(res.data)
                setRouteError(null)
            } else {
                setRoute(null)
                setRouteError(res.error || "Não foi possível carregar a rota.")
            }
            setRouteLoading(false)
        }
        run()
        return () => { alive = false }
    }, [deliveryId, partnerId])

    const confirmDeliveryWarningStatusChange = async () => {
        if (!deliveryWarningModal) return
        const { orderId, nextStatus, reasonDropdownValue, customReasonText } = deliveryWarningModal
        const reason = reasonDropdownValue === "other"
            ? customReasonText.trim()
            : CHANGE_STATUS_REASONS.find(r => r.value === reasonDropdownValue)?.label || ""

        setDeliveryWarningModal(null)
        await handleOrderDeliveryStatusChange(orderId, nextStatus, reason, true)
    }

    const handleOrderDeliveryStatusChange = async (orderId: string, nextStatus: string, reason?: string, isConfirmed?: boolean) => {
        const link = (delivery?.delivery_orders || []).find((l: any) => l?.orders?.id === orderId)
        const currentStatus = link?.status || link?.orders?.delivery_status || "not_sent"

        if (!isConfirmed) {
            if (doesTransitionRequireReason(currentStatus, nextStatus)) {
                setDeliveryWarningModal({
                    isOpen: true,
                    orderId,
                    nextStatus,
                    currentStatus,
                    reasonDropdownValue: "",
                    customReasonText: "",
                })
                return
            } else {
                setSimpleConfirmModal({
                    isOpen: true,
                    orderId,
                    nextStatus
                })
                return
            }
        }

        const prevDelivery = delivery
        const prevSelectedLink = selectedLink

        setDelivery((current: any) => {
            if (!current) return current
            return {
                ...current,
                delivery_orders: (current.delivery_orders || []).map((item: any) =>
                    item?.orders?.id === orderId
                        ? {
                            ...item,
                            status: nextStatus,
                            orders: { ...item.orders, delivery_status: nextStatus },
                        }
                        : item,
                ),
            }
        })
        setSelectedLink((current: any) => current?.orders?.id === orderId
            ? { ...current, status: nextStatus, orders: { ...current.orders, delivery_status: nextStatus } }
            : current)

        setUpdatingOrderId(orderId)
        try {
            const res = await updateERPSingleOrderDeliveryStatusAction({
                partnerId,
                deliveryId,
                orderId,
                status: nextStatus as any,
                changeReason: reason,
            })
            if (res.success) {
                toast.success("Status do pedido atualizado com sucesso!")
                if (res.deliveryStatus) {
                    setDelivery((current: any) => current ? { ...current, status: res.deliveryStatus } : current)
                }
            } else {
                setDelivery(prevDelivery)
                setSelectedLink(prevSelectedLink)
                toast.error(res.error || "Erro ao atualizar status do pedido.")
            }
        } catch (err: any) {
            setDelivery(prevDelivery)
            setSelectedLink(prevSelectedLink)
            toast.error(err?.message || "Erro inesperado ao atualizar status.")
        } finally {
            setUpdatingOrderId(null)
        }
    }

    const handleCancelDelivery = () => {
        if (!delivery) return
        const requiresReason = doesTransitionRequireReason(delivery.status, "cancelled")
        setCancelDeliveryModal({
            isOpen: true,
            requiresReason,
            reasonDropdownValue: "",
            customReasonText: "",
        })
    }

    const confirmCancelDelivery = async () => {
        if (!cancelDeliveryModal || !delivery) return
        const reason = cancelDeliveryModal.reasonDropdownValue === "other"
            ? cancelDeliveryModal.customReasonText.trim()
            : CHANGE_STATUS_REASONS.find(r => r.value === cancelDeliveryModal.reasonDropdownValue)?.label || ""

        setCancelDeliveryModal(null)
        const prevDelivery = delivery
        setDelivery((current: any) => current ? { ...current, status: "cancelled" } : current)

        const res = await updateERPDeliveryStatusAction({
            deliveryId: delivery.id,
            partnerId,
            status: "cancelled" as any,
            changeReason: reason || undefined,
        })

        if (res.success) {
            toast.success("Entrega cancelada com sucesso!")
        } else {
            setDelivery(prevDelivery)
            toast.error(res.error || "Erro ao cancelar entrega.")
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!delivery) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Erro ao carregar entrega"
                    title="Não foi possível carregar a entrega"
                    subtitle="Verifique se o pedido/entrega existe ou se o seu plano atual possui acesso."
                    itemButton={{
                        text: "Voltar para Entregas",
                        action: handleBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const statusMeta = getDeliveryStatusMeta(delivery.status)
    const canEdit = ["pending", "not_sent", "preparing"].includes(delivery.status)
    const links = (delivery.delivery_orders || []).filter((l: any) => l?.orders && l.orders.situation !== "cancelled")

    const allItems = links.flatMap((link: any) => {
        const order = link.orders
        return (order?.order_items || []).map((item: any) => ({
            ...item,
            orderDisplayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
        }))
    })

    const totalDeliveryFee = links.reduce((sum: number, link: any) => sum + Number(link.orders?.delivery_fee || 0), 0)

    const isPlatformDriver = Boolean(delivery.platform_driver || delivery.is_platform_driver || delivery.delivery_person_id?.startsWith?.("platform:"))
    const platformDriver = delivery.platform_driver || null
    const driverName = platformDriver?.fullName || delivery.delivery_person_name || delivery.partner_users?.user_profiles?.full_name || (delivery.delivery_person_id ? "Entregador" : "Entrega própria")

    const linkedOrdersCard = (
        <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
            <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50 flex items-center justify-between gap-4">
                <div className="text-left shrink-0">
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Pedidos Vinculados ({links.length})</span>
                    <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">Valor total da entrega: {formatCurrency(totalDeliveryFee)}</p>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Entregador</span>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        {isPlatformDriver && (
                            <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className="w-4 h-4 object-contain shrink-0" />
                        )}
                        <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">{driverName}</p>
                    </div>
                    {platformDriver && !platformDriver.isPendingAcceptance && (
                        <Button
                            onClick={() => setIsDriverModalOpen(true)}
                            variant="link"
                            className="text-sm block mt-0.5 ml-auto"
                        >
                            Ver detalhes do entregador
                        </Button>
                    )}
                </div>
            </div>
            <div className="bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-border">
                {links.length === 0 ? (
                    <div className="p-6 text-sm text-brand-inactive-text text-center">
                        Nenhum pedido vinculado a esta entrega.
                    </div>
                ) : (
                    links.map((link: any) => {
                        const order = link.orders
                        if (!order) return null
                        const paymentMeta = getPaymentStatusMeta(order.situation)
                        const deliveryMeta = getDeliveryStatusMeta(link.status || order.delivery_status)
                        const displayId = order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`

                        return (
                            <div
                                key={link.id}
                                className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-dark-border/40 cursor-pointer transition-colors"
                                onClick={() => setSelectedLink(link)}
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                        {displayId}
                                    </p>
                                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                        {order.customer_name || "Cliente"} • {formatCurrency(order.total_amount)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant={paymentMeta.variant}>
                                        {paymentMeta.label}
                                    </Badge>
                                    <Badge variant={deliveryMeta.variant} icon={getDeliveryStatusIcon(link.status || order.delivery_status)}>
                                        {deliveryMeta.label}
                                    </Badge>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )

    const deliveryInfoMetrics = (
        <FormSection title="Informações da Entrega" hasSeparator>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ListItem icon={RouteIcon} title="Distância" description={`${Number(delivery.distance_km || 0).toFixed(2)} km`} className="px-4 py-3 gap-4" />
                <ListItem icon={EstimateTimeIcon} title="Duração Estimada" description={`${delivery.estimated_duration_minutes || 0} min`} className="px-4 py-3 gap-4" />
                <ListItem icon={ClockArrowUpIcon} title="Saída" description={delivery.departure_time ? formatDateTime(delivery.departure_time) : (delivery.started_at ? formatDateTime(delivery.started_at) : "-")} className="px-4 py-3 gap-4" />
                <ListItem icon={ClockCheckIcon} title="Conclusão" description={delivery.completed_at ? formatDateTime(delivery.completed_at) : (delivery.delivered_at ? formatDateTime(delivery.delivered_at) : "-")} className="px-4 py-3 gap-4" />
            </div>
        </FormSection>
    )

    const notesSection = delivery.notes ? (
        <div>
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">
                Observações da Entrega
            </h3>
            <InfoCard title="Observações" message={delivery.notes} color="gray" />
        </div>
    ) : null

    const mapContent = routeLoading ? (
        <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <span className="text-sm text-brand-inactive-text">Carregando mapa...</span>
        </div>
    ) : route?.points?.length ? (
        <DeliveryRouteMap
            points={route.points}
            origin={route.origin}
            initialLat={route.origin?.lat ?? null}
            initialLng={route.origin?.lng ?? null}
        />
    ) : (
        <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-surface/50 px-4">
            <span className="text-sm text-brand-inactive-text text-center">{routeError || "Sem dados de rota para exibir."}</span>
        </div>
    )

    const pageHeader = (
        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">
            {/* Desktop header with title, back, edit, actions */}
            <div className="hidden lg:flex items-center justify-between gap-3 py-2">
                <div className="absolute -left-12 top-1/2 -translate-y-1/2">
                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                </div>

                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 truncate">
                            Entrega {delivery?.delivery_number ? `#${delivery.delivery_number}` : ""}
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm mt-1 truncate flex items-center gap-1.5">
                            <span>Criado em {formatDateTime(delivery.created_at)} • </span>
                            {isPlatformDriver && (
                                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className="w-3.5 h-3.5 object-contain inline-block shrink-0" />
                            )}
                            <span>{driverName}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    {canEdit && onEdit && (
                        <Button variant="outline" size="sm" onClick={() => onEdit(delivery.id)} leftIcon={<EditIcon size={16} />} className="hidden sm:inline-flex">
                            Editar
                        </Button>
                    )}
                    <ActionsDropdown
                        onEdit={canEdit && onEdit ? () => onEdit(delivery.id) : undefined}
                        onCancel={delivery?.status !== "cancelled" ? handleCancelDelivery : undefined}
                        cancelLabel="Cancelar entrega"
                    />
                </div>
            </div>

            {/* Mobile/Tablet Tabs - only visible on <lg */}
            <div className="lg:hidden border-b border-brand-border dark:border-dark-border">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 max-w-[1300px] mx-auto px-4 md:px-6">
                    <TabsTrigger value="dados_gerais">
                        Dados Gerais
                        <RouteIcon className="w-4 h-4" />
                    </TabsTrigger>
                    <TabsTrigger value="mapa_rota">
                        Mapa da Rota
                    </TabsTrigger>
                </TabsList>
            </div>
        </div>
    )

    return (
        <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Sticky Header */}
                    <div className={`shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "py-2 shadow-sm" : "py-4"}`}>
                        {pageHeader}
                    </div>

                    {/* Content - Desktop: split view, Mobile: tabs */}
                    <div className="flex-1 overflow-hidden relative">
                        {/* DESKTOP: Split view - left content, right map (always visible) */}
                        <div className="hidden lg:flex lg:flex-row w-full h-full">
                            {/* LEFT SIDE - CONTENT */}
                            <div className="w-1/2 flex flex-col flex-1 min-h-0 shrink-0 h-full border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative">
                                <div className="flex-1 overflow-y-auto no-scrollbar relative">
                                    <div className="flex-1 pt-4 pb-12 px-4 md:px-6 space-y-8">
                                        {linkedOrdersCard}
                                        {deliveryInfoMetrics}
                                        {notesSection}
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT SIDE - ROUTE MAP */}
                            <div className="w-1/2 bg-brand-gray dark:bg-dark-border/20 overflow-auto no-scrollbar">
                                <div className="p-4 md:p-6 flex flex-col h-full">
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Mapa da Rota</h3>
                                    <div className="flex-1 min-h-[300px] w-full">
                                        <div className="h-full w-full rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                                            {mapContent}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* MOBILE/TABLET: Tabbed view */}
                        <div className="lg:hidden flex-1 overflow-hidden">
                            {/* DADOS GERAIS TAB */}
                            <TabsContent value="dados_gerais" className="flex-1 h-full overflow-y-auto no-scrollbar custom-scrollbar" forceMount>
                                <div className="max-w-[1300px] mx-auto w-full p-4 md:p-6 space-y-8 relative">
                                    {linkedOrdersCard}
                                    {deliveryInfoMetrics}
                                    {notesSection}
                                </div>
                            </TabsContent>

                            {/* MAPA DA ROTA TAB */}
                            <TabsContent value="mapa_rota" className="flex-1 h-full overflow-hidden" forceMount>
                                <div className="h-full w-full p-4 md:p-6">
                                    <div className="h-full w-full rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                                        {mapContent}
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                    <Button variant="filled" onClick={handleBack} className="flex-1 h-12">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </Button>
                    <ActionsDropdown
                        onEdit={canEdit && onEdit ? () => onEdit(delivery.id) : undefined}
                        onCancel={delivery?.status !== "cancelled" ? handleCancelDelivery : undefined}
                        cancelLabel="Cancelar entrega"
                        trigger={
                            <Button variant="outline" className="flex-1 h-12" leftIcon={<ThreeDotsIcon className="w-5 h-5" />}>
                                Opções
                            </Button>
                        }
                    />
                </div>
            </Tabs>

            <AlertModal
                isOpen={cancelDeliveryModal?.isOpen ?? false}
                onClose={() => setCancelDeliveryModal(null)}
                onConfirm={confirmCancelDelivery}
                title="Cancelar Entrega"
                message={
                    cancelDeliveryModal?.requiresReason ? (
                        <div className="flex flex-col gap-4 text-left">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Esta entrega está como <strong className="text-brand-dark dark:text-dark-heading">{getDeliveryStatusLabel(delivery?.status)}</strong>. Informar um motivo é obrigatório para cancelar.
                            </p>
                            <div className="flex flex-col gap-4 mt-2">
                                <FormDropdown
                                    label="Motivo do cancelamento"
                                    options={CHANGE_STATUS_REASONS}
                                    value={cancelDeliveryModal.reasonDropdownValue || ""}
                                    setValue={(val) => setCancelDeliveryModal(prev => prev ? { ...prev, reasonDropdownValue: val } : null)}
                                    placeholder="Selecione o motivo"
                                />
                                {cancelDeliveryModal.reasonDropdownValue === "other" && (
                                    <Input
                                        label="Descreva o motivo"
                                        placeholder="Digite o motivo aqui..."
                                        value={cancelDeliveryModal.customReasonText || ""}
                                        onChange={(e) => setCancelDeliveryModal(prev => prev ? { ...prev, customReasonText: e.target.value } : null)}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        "Tem certeza que deseja cancelar esta entrega?"
                    )
                }
                confirmText="Confirmar Cancelamento"
                cancelText="Voltar"
            />

            <AlertModal
                isOpen={deliveryWarningModal?.isOpen ?? false}
                onClose={() => setDeliveryWarningModal(null)}
                onConfirm={confirmDeliveryWarningStatusChange}
                title="Atenção: Alteração de Status"
                message={
                    <div className="flex flex-col gap-4 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Este pedido já estava como{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusLabel(deliveryWarningModal?.currentStatus)}
                            </strong>{" "}
                            e você está alterando para{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusLabel(deliveryWarningModal?.nextStatus)}
                            </strong>.
                            Esta ação requer uma justificativa.
                        </p>
                        <div className="flex flex-col gap-4 mt-2">
                            <FormDropdown
                                label="Motivo da alteração"
                                options={CHANGE_STATUS_REASONS}
                                value={deliveryWarningModal?.reasonDropdownValue || ""}
                                setValue={(val) => setDeliveryWarningModal(prev => prev ? { ...prev, reasonDropdownValue: val } : null)}
                                placeholder="Selecione o motivo"
                            />
                            {deliveryWarningModal?.reasonDropdownValue === "other" && (
                                <Input
                                    label="Descreva o motivo"
                                    placeholder="Digite o motivo aqui..."
                                    value={deliveryWarningModal?.customReasonText || ""}
                                    onChange={(e) => setDeliveryWarningModal(prev => prev ? { ...prev, customReasonText: e.target.value } : null)}
                                />
                            )}
                        </div>
                    </div>
                }
                confirmText="Confirmar Alteração"
                cancelText="Cancelar"
            />

            <DefaultModal
                isOpen={isStatusModalOpen}
                onClose={() => setIsStatusModalOpen(false)}
                title="Alterar Status da Entrega"
                maxWidth="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancelar</Button>
                        <Button onClick={() => void handleStatusChange()} disabled={selectedNewStatus === delivery?.status}>Salvar</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Selecione o novo status para esta entrega.</p>
                    <FormDropdown
                        label="Status"
                        value={selectedNewStatus}
                        setValue={setSelectedNewStatus}
                        options={[
                            { value: 'pending', label: 'Pendente' },
                            { value: 'not_sent', label: 'Não Enviado' },
                            { value: 'preparing', label: 'Preparando' },
                            { value: 'pickup_available', label: 'Disponível para Retirada' },
                            { value: 'sent', label: 'Enviado' },
                            { value: 'delivered', label: 'Entregue' },
                            { value: 'delivery_failed', label: 'Falha na Entrega' },
                            { value: 'cancelled', label: 'Cancelado' }
                        ]}
                    />
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={isDriverModalOpen}
                onClose={() => setIsDriverModalOpen(false)}
                title="Detalhes do Entregador"
                maxWidth="md"
            >
                <DuditDriverDetailsModal isOpen={isDriverModalOpen} onClose={() => setIsDriverModalOpen(false)} driver={platformDriver} />
            </DefaultModal>

            <PaymentStatusModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                order={activeLink?.orders}
                partnerId={partnerId}
            />

            {simpleConfirmModal && (
                <AlertModal
                    isOpen={simpleConfirmModal.isOpen}
                    onClose={() => setSimpleConfirmModal(null)}
                    onConfirm={() => {
                        handleOrderDeliveryStatusChange(simpleConfirmModal.orderId, simpleConfirmModal.nextStatus, undefined, true)
                        setSimpleConfirmModal(null)
                    }}
                    title="Confirmar alteração de status"
                    message="Tem certeza que deseja alterar o status deste pedido?"
                    confirmText="Confirmar"
                    cancelText="Cancelar"
                />
            )}
        </FadeIn>
    )
}