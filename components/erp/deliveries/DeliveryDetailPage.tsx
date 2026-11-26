"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button, Badge, InfoCard, FormDropdown, Tabs, TabsContent, TabsList, TabsTrigger, FormSection, ListItem, ActionsDropdown, IconPlaceholder, ThreeDotsLoader, Tooltip } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import Input from "@/components/reusable/Input"
import DefaultModal from "@/components/reusable/DefaultModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, ClockArrowUpIcon, ClockCheckIcon, EstimateTimeIcon, RouteIcon, ThreeDotsIcon, MoneyIcon, TruckIcon, StoreIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getERPDeliveryDetailsAction, getDeliveryRoutePointsAction, updateERPSingleOrderDeliveryStatusAction, updateERPDeliveryStatusAction } from "@/app/actions/erp/deliveries"
import { checkDeliveryOtpRequirementAction, checkOrderDeliveryOtpRequirementAction } from "@/app/actions/delivery-otp"
import ErpDeliveryOtpSection from "./ErpDeliveryOtpSection"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { getDeliveryStatusMeta, getPaymentStatusMeta, getDeliveryStatusLabel } from "@/lib/orders/status"
import { resolveLinkDeliveryStatus } from "@/lib/delivery/status-resolver"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { useMediaQuery } from "@/components/erp/hooks"
import PaymentStatusModal from "../orders/PaymentStatusModal"
import DuditDriverDetailsModal from "./DuditDriverDetailsModal"
import DeliveryOrderDetailSheet from "./DeliveryOrderDetailSheet"
import type { DuditPlatformDriver } from "./types"

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
    userRole,
}: {
    deliveryId: string
    partnerId: string
    onBack: () => void
    onEdit?: (deliveryId: string) => void
    planSlug?: string
    userRole?: string | null
}) {
    const [delivery, setDelivery] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [route, setRoute] = useState<any | null>(null)
    const [mapRouteStats, setMapRouteStats] = useState<{ distanceKm: number; durationMinutes: number } | null>(null)
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
    const [isOrderPaymentModalOpen, setIsOrderPaymentModalOpen] = useState(false)
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
    const [isDriverModalOpen, setIsDriverModalOpen] = useState(false)
    const [selectedNewStatus, setSelectedNewStatus] = useState<string>("")
    const [deliveryOtp, setDeliveryOtp] = useState<string>("")
    const [bypassOtp, setBypassOtp] = useState<boolean>(false)
    const [bypassReason, setBypassReason] = useState<string>("")
    const [deliveryOtpCheck, setDeliveryOtpCheck] = useState<{
        loading: boolean
        requiresOtp: boolean
        otpOrderCount: number
        orderNumber?: string | null
        customerName?: string | null
    }>({ loading: false, requiresOtp: false, otpOrderCount: 0 })
    const [orderOtpCheck, setOrderOtpCheck] = useState<{
        loading: boolean
        requiresOtp: boolean
        orderNumber?: string | null
        customerName?: string | null
    }>({ loading: false, requiresOtp: false })
    const normalizedRole = String(userRole || "").toLowerCase()
    const isOwnerOrAdmin = normalizedRole === "owner" || normalizedRole === "admin"
    const isDelivery = normalizedRole === "delivery"
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; orderId: string; nextStatus: string } | null>(null)
    const [orderStatusModal, setOrderStatusModal] = useState<{ isOpen: boolean; orderId: string; currentStatus: string } | null>(null)
    const [orderNewStatus, setOrderNewStatus] = useState<string>("")
    const [activeTab, setActiveTab] = useState<string>("dados_gerais")
    const isMobile = useMediaQuery("(max-width: 768px)")
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const mounted = useRef(true)

    const handleBack = useCallback(() => onBack(), [onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        if (!isStatusModalOpen || selectedNewStatus !== "delivered" || !delivery?.id) {
            setDeliveryOtpCheck({ loading: false, requiresOtp: false, otpOrderCount: 0 })
            return
        }
        let alive = true
        setDeliveryOtpCheck({ loading: true, requiresOtp: false, otpOrderCount: 0 })
        void checkDeliveryOtpRequirementAction({ deliveryId: delivery.id })
            .then((res) => {
                if (!alive) return
                setDeliveryOtpCheck({
                    loading: false,
                    requiresOtp: Boolean(res.success && res.requiresOtp),
                    otpOrderCount: res.otpOrderCount ?? 0,
                    orderNumber: res.orderNumber ?? null,
                    customerName: res.customerName ?? null,
                })
            })
            .catch(() => {
                if (alive) setDeliveryOtpCheck({ loading: false, requiresOtp: false, otpOrderCount: 0 })
            })
        return () => { alive = false }
    }, [isStatusModalOpen, selectedNewStatus, delivery?.id])

    useEffect(() => {
        if (!orderStatusModal?.isOpen || orderNewStatus !== "delivered" || !orderStatusModal.orderId) {
            setOrderOtpCheck({ loading: false, requiresOtp: false })
            return
        }
        let alive = true
        const targetLink = (delivery?.delivery_orders || []).find((l: any) => l?.orders?.id === orderStatusModal.orderId)
        const targetOrder = targetLink?.orders
        setOrderOtpCheck({ loading: true, requiresOtp: false })
        void checkOrderDeliveryOtpRequirementAction({ orderId: orderStatusModal.orderId })
            .then((res) => {
                if (!alive) return
                setOrderOtpCheck({
                    loading: false,
                    requiresOtp: Boolean(res.success && res.requiresOtp && !res.isConfirmed),
                    orderNumber: targetOrder?.order_number || null,
                    customerName: targetOrder?.customer_name || null,
                })
            })
            .catch(() => {
                if (alive) setOrderOtpCheck({ loading: false, requiresOtp: false })
            })
        return () => { alive = false }
    }, [orderStatusModal?.isOpen, orderStatusModal?.orderId, orderNewStatus, delivery?.delivery_orders])

    const handleStatusChange = useCallback(async () => {
        if (!delivery || selectedNewStatus === delivery.status) return
        const prevDelivery = delivery
        const effectiveBypass = isOwnerOrAdmin && bypassOtp
        setDelivery((current: any) => current ? { ...current, status: selectedNewStatus } : current)
        try {
            const res = await updateERPDeliveryStatusAction({
                deliveryId: delivery.id,
                partnerId,
                status: selectedNewStatus as any,
                deliveryOtp: deliveryOtpCheck.requiresOtp && !effectiveBypass ? deliveryOtp.trim() || undefined : undefined,
                bypassOtp: deliveryOtpCheck.requiresOtp ? effectiveBypass : false,
                bypassReason: deliveryOtpCheck.requiresOtp && effectiveBypass ? bypassReason.trim() || undefined : undefined,
            })
            if (res.success) {
                toast.success("Status da entrega atualizado com sucesso!")
                setDeliveryOtp("")
                setBypassOtp(false)
                setBypassReason("")
            } else {
                setDelivery(prevDelivery)
                toast.error(res.error || "Erro ao atualizar status da entrega.")
            }
        } catch (err: any) {
            setDelivery(prevDelivery)
            toast.error(err?.message || "Erro inesperado ao atualizar status.")
        }
        setIsStatusModalOpen(false)
    }, [delivery, selectedNewStatus, partnerId, deliveryOtp, bypassOtp, bypassReason])

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
        setRoute(null)
        setMapRouteStats(null)
        setRouteError(null)
    }, [deliveryId])

    useEffect(() => {
        if (route !== null) return

        let alive = true
        const run = async () => {
            setRouteLoading(true)
            try {
                const res = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
                if (!alive) return
                if (res.success) {
                    setRoute(res.data)
                    setRouteError(null)
                } else {
                    setRoute(null)
                    setRouteError(res.error || "Não foi possível carregar a rota.")
                }
            } catch (err: any) {
                if (!alive) return
                setRoute(null)
                setRouteError(err?.message || "Não foi possível carregar a rota.")
            } finally {
                if (alive) setRouteLoading(false)
            }
        }
        run()
        return () => { alive = false }
    }, [deliveryId, partnerId, route])

    useEffect(() => {
        if (activeTab === "mapa_rota") {
            const timer = setTimeout(() => {
                window.dispatchEvent(new Event("resize"))
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [activeTab])

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
            const effectiveBypass = isOwnerOrAdmin && bypassOtp
            const res = await updateERPSingleOrderDeliveryStatusAction({
                partnerId,
                deliveryId,
                orderId,
                status: nextStatus as any,
                changeReason: reason,
                deliveryOtp: orderOtpCheck.requiresOtp && !effectiveBypass ? deliveryOtp.trim() || undefined : undefined,
                bypassOtp: orderOtpCheck.requiresOtp ? effectiveBypass : false,
                bypassReason: orderOtpCheck.requiresOtp && effectiveBypass ? bypassReason.trim() || undefined : undefined,
            })
            if (res.success) {
                toast.success("Status do pedido atualizado com sucesso!")
                setDeliveryOtp("")
                setBypassOtp(false)
                setBypassReason("")
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

    const handleOrderStatusChange = async () => {
        if (!orderStatusModal || !orderNewStatus) return
        const { orderId } = orderStatusModal
        setOrderStatusModal(null)
        await handleOrderDeliveryStatusChange(orderId, orderNewStatus, undefined, false)
        setOrderNewStatus("")
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
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
    const platformDriver: DuditPlatformDriver | null = delivery.platform_driver || null
    const driverName = platformDriver?.fullName || delivery.delivery_person_name || delivery.partner_users?.user_profiles?.full_name || (delivery.delivery_person_id ? "Entregador" : "Entrega própria")

    const linkedOrdersCard = (
        <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
            <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50">
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Pedidos Vinculados ({links.length})</span>
                <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">Valor total da entrega: {formatCurrency(totalDeliveryFee)}</p>
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
                        const resolvedOrderDeliveryStatus = resolveLinkDeliveryStatus(link, delivery?.status)
                        const deliveryMeta = getDeliveryStatusMeta(resolvedOrderDeliveryStatus)
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
                                    <Tooltip text={paymentMeta.label}>
                                        <span className="inline-flex">
                                            <span className="hidden lg:inline-flex">
                                                <Badge variant={paymentMeta.variant} icon={<MoneyIcon />}>{paymentMeta.label}</Badge>
                                            </span>
                                            <span className="lg:hidden inline-flex">
                                                <Badge variant={paymentMeta.variant} icon={<MoneyIcon />} />
                                            </span>
                                        </span>
                                    </Tooltip>
                                    <Tooltip text={deliveryMeta.label}>
                                        <span className="inline-flex">
                                            <span className="hidden lg:inline-flex">
                                                <Badge variant={deliveryMeta.variant} icon={order.delivery_type === "pickup" ? <StoreIcon /> : <TruckIcon />}>
                                                    {deliveryMeta.label}
                                                </Badge>
                                            </span>
                                            <span className="lg:hidden inline-flex">
                                                <Badge variant={deliveryMeta.variant} icon={order.delivery_type === "pickup" ? <StoreIcon /> : <TruckIcon />} />
                                            </span>
                                        </span>
                                    </Tooltip>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
            {isPlatformDriver && platformDriver && !platformDriver.isPendingAcceptance && (
                <>
                    <div className="border-t border-brand-border dark:border-dark-border" />
                    <div className="p-4 bg-white dark:bg-dark-surface">
                        <ListItem
                            title={
                                <div>
                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{driverName}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0" />
                                        <span className="text-xs text-brand-dark dark:text-dark-heading font-medium">Rede Dudit</span>
                                    </div>
                                </div>
                            }
                            left={
                                <UserProfileImage
                                    fullName={driverName}
                                    imageUrl={platformDriver?.avatarUrl}
                                    className="w-10 h-10"
                                />
                            }
                            onClick={() => setIsDriverModalOpen(true)}
                            className="border-0"
                        />
                    </div>
                </>
            )}
        </div>
    )

    const resolvedDistanceKm = mapRouteStats?.distanceKm ?? route?.totalDistanceKm ?? delivery.distance_km ?? 0
    const displayDistance = `${Number(resolvedDistanceKm).toFixed(1)} km`

    const resolvedDurationMin = mapRouteStats?.durationMinutes ?? route?.totalEstimatedDurationMinutes ?? delivery.estimated_duration_minutes ?? 0
    const displayDuration = resolvedDurationMin > 0 ? `~${resolvedDurationMin} min` : "-"

    const showDepartureTime = !["pending", "not_sent", "preparing"].includes(String(delivery.status || ""))
    const departureDisplay = showDepartureTime
        ? (delivery.departure_time ? formatDateTime(delivery.departure_time) : (delivery.started_at ? formatDateTime(delivery.started_at) : "-"))
        : "-"

    const deliveryInfoMetrics = (
        <FormSection title="Informações da Entrega" hasSeparator>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ListItem icon={RouteIcon} title="Distância" description={displayDistance} className="px-4 py-3 gap-4" />
                <ListItem icon={EstimateTimeIcon} title="Duração Estimada" description={displayDuration} className="px-4 py-3 gap-4" />
                <ListItem icon={ClockArrowUpIcon} title="Saída" description={departureDisplay} className="px-4 py-3 gap-4" />
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
            onRouteStatsChange={setMapRouteStats}
        />
    ) : (
        <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-surface/50 px-4">
            <span className="text-sm text-brand-inactive-text text-center">{routeError || "Sem dados de rota para exibir."}</span>
        </div>
    )

    const headerContent = (
        <div className="hidden lg:flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>

                <div className="min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 truncate">
                        Entrega {delivery?.delivery_number ? `#${delivery.delivery_number}` : ""}
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm mt-0.5 truncate flex items-center gap-1.5">
                        <span>Criado em {formatDateTime(delivery.created_at)} • </span>
                        {isPlatformDriver && (
                            <Tooltip text="Entregador da Rede Dudit">
                                <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0 cursor-help" />
                            </Tooltip>
                        )}
                        <span>{driverName}</span>
                    </p>
                </div>
            </div>

            {!isDelivery && (
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    <ActionsDropdown
                        onEdit={canEdit && onEdit ? () => onEdit(delivery.id) : undefined}
                        onCancel={delivery?.status !== "cancelled" ? handleCancelDelivery : undefined}
                        cancelLabel="Cancelar entrega"
                    />
                </div>
            )}
        </div>
    )

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                {/* DESKTOP (lg:): 50/50 Split View */}
                <div className="hidden lg:flex lg:flex-row w-full h-full overflow-hidden">
                    {/* LEFT SIDE - HEADER & CONTENT */}
                    <div className="w-1/2 flex flex-col flex-1 min-h-0 shrink-0 h-full border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative">
                        {/* Header confined to Left Half */}
                        <div className={`shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 px-6 ${isScrolled ? "py-2.5 shadow-sm" : "py-4"}`}>
                            {headerContent}
                        </div>

                        {/* Scrollable details */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar relative" ref={scrollContainerRef} onScroll={handleScroll}>
                            <div className="pt-4 pb-12 px-6 space-y-8">
                                {linkedOrdersCard}
                                {deliveryInfoMetrics}
                                {notesSection}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT SIDE - ROUTE MAP (Full height) */}
                    <div className="w-1/2 bg-brand-gray dark:bg-dark-border/20 overflow-hidden flex flex-col h-full min-h-0">
                        <div className="p-6 flex flex-col h-full min-h-0">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4 shrink-0">Mapa da Rota</h3>
                            <div className="flex-1 min-h-0 w-full rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                                {mapContent}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MOBILE / TABLET (< lg): Single-column Tabbed View */}
                <div className="lg:hidden flex flex-col h-full w-full overflow-hidden">
                    {/* Top Header & Tabs for Mobile/Tablet */}
                    <div className="shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                        {headerContent}
                        <div>
                            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                <TabsTrigger value="dados_gerais">
                                    Dados Gerais
                                </TabsTrigger>
                                <TabsTrigger value="mapa_rota">
                                    Mapa da Rota
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    {/* Mobile/Tablet Content */}
                    <div className="flex-1 overflow-hidden relative">
                        <TabsContent value="dados_gerais" className="flex-1 h-full overflow-y-auto no-scrollbar custom-scrollbar mt-0 pb-20">
                            <div className="max-w-[1300px] mx-auto w-full p-4 md:p-6 space-y-8 relative">
                                {linkedOrdersCard}
                                {deliveryInfoMetrics}
                                {notesSection}
                            </div>
                        </TabsContent>

                        <TabsContent value="mapa_rota" className="flex-1 h-full overflow-hidden mt-0 p-4 md:p-6 pb-20">
                            <div className="h-full w-full rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                                {mapContent}
                            </div>
                        </TabsContent>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                {!isDelivery && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                        <ActionsDropdown
                            fullWidth
                            onEdit={canEdit && onEdit ? () => onEdit(delivery.id) : undefined}
                            onCancel={delivery?.status !== "cancelled" ? handleCancelDelivery : undefined}
                            cancelLabel="Cancelar entrega"
                            className="!w-full"
                            trigger={
                                <Button variant="outline" className="flex-1 w-full h-12" leftIcon={<ThreeDotsIcon className="w-5 h-5" />}>
                                    Opções
                                </Button>
                            }
                        />
                    </div>
                )}
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
                        <Button
                            onClick={() => void handleStatusChange()}
                            disabled={
                                selectedNewStatus === delivery?.status ||
                                (selectedNewStatus === "delivered" && deliveryOtpCheck.loading) ||
                                (selectedNewStatus === "delivered" && deliveryOtpCheck.requiresOtp && (
                                    (isOwnerOrAdmin && bypassOtp)
                                        ? !bypassReason.trim()
                                        : (deliveryOtpCheck.otpOrderCount > 1 || deliveryOtp.trim().length !== 6)
                                ))
                            }
                        >
                            Salvar
                        </Button>
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
                            { value: 'not_sent', label: 'Não enviado' },
                            { value: 'preparing', label: 'Em preparação' },
                            { value: 'sent', label: 'Enviado' },
                            { value: 'delivered', label: 'Entregue' },
                            { value: 'delivery_failed', label: 'Falha na entrega' },
                            ...(!isDelivery ? [{ value: 'cancelled', label: 'Cancelada' }] : []),
                        ]}
                    />

                    {selectedNewStatus === "delivered" && deliveryOtpCheck.requiresOtp && (
                        <ErpDeliveryOtpSection
                            code={deliveryOtp}
                            onCodeChange={setDeliveryOtp}
                            bypassOtp={bypassOtp}
                            onBypassOtpChange={setBypassOtp}
                            bypassReason={bypassReason}
                            onBypassReasonChange={setBypassReason}
                            canBypass={isOwnerOrAdmin}
                            orderNumber={deliveryOtpCheck.orderNumber}
                            customerName={deliveryOtpCheck.customerName}
                            otpOrderCount={deliveryOtpCheck.otpOrderCount}
                            checkboxId="erp-bypass-otp-detail"
                        />
                    )}
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
                isOpen={isOrderPaymentModalOpen}
                onClose={() => setIsOrderPaymentModalOpen(false)}
                order={selectedLink?.orders}
                partnerId={partnerId}
                driverMode={isDelivery}
                assignmentId={delivery?.id || deliveryId}
                onSuccess={() => {
                    loadDeliveryDetails()
                    setIsOrderPaymentModalOpen(false)
                }}
            />

            {orderStatusModal && (
                <DefaultModal
                    isOpen={orderStatusModal.isOpen}
                    onClose={() => { setOrderStatusModal(null); setOrderNewStatus("") }}
                    title="Alterar Status da Entrega"
                    maxWidth="md"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => { setOrderStatusModal(null); setOrderNewStatus("") }}>Cancelar</Button>
                            <Button
                                onClick={() => void handleOrderStatusChange()}
                                disabled={
                                    !orderNewStatus ||
                                    orderNewStatus === orderStatusModal.currentStatus ||
                                    (orderNewStatus === "delivered" && orderOtpCheck.loading) ||
                                    (orderNewStatus === "delivered" && orderOtpCheck.requiresOtp && (
                                        (isOwnerOrAdmin && bypassOtp)
                                            ? !bypassReason.trim()
                                            : deliveryOtp.trim().length !== 6
                                    ))
                                }
                            >
                                Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Selecione o novo status de entrega para este pedido.
                        </p>
                        <FormDropdown
                            label="Status"
                            value={orderNewStatus}
                            setValue={setOrderNewStatus}
                            options={[
                                { value: 'not_sent', label: 'Não enviado' },
                                { value: 'preparing', label: 'Em preparação' },
                                { value: 'sent', label: 'Enviado' },
                                { value: 'delivered', label: 'Entregue' },
                                { value: 'delivery_failed', label: 'Falha na entrega' },
                                ...(!isDelivery ? [{ value: 'cancelled', label: 'Cancelada' }] : []),
                            ]}
                        />

                        {orderNewStatus === "delivered" && orderOtpCheck.requiresOtp && (
                            <ErpDeliveryOtpSection
                                code={deliveryOtp}
                                onCodeChange={setDeliveryOtp}
                                bypassOtp={bypassOtp}
                                onBypassOtpChange={setBypassOtp}
                                bypassReason={bypassReason}
                                onBypassReasonChange={setBypassReason}
                                canBypass={isOwnerOrAdmin}
                                orderNumber={orderOtpCheck.orderNumber}
                                customerName={orderOtpCheck.customerName}
                                otpOrderCount={1}
                                checkboxId="erp-bypass-otp-single"
                            />
                        )}
                    </div>
                </DefaultModal>
            )}

            {simpleConfirmModal && (
                <AlertModal
                    isOpen={simpleConfirmModal.isOpen}
                    onClose={() => setSimpleConfirmModal(null)}
                    onConfirm={() => {
                        handleOrderDeliveryStatusChange(simpleConfirmModal.orderId, simpleConfirmModal.nextStatus, undefined, true)
                        setSimpleConfirmModal(null)
                    }}
                    title="Confirmar alteração de status"
                    message={`Tem certeza que deseja alterar o status deste pedido para "${getDeliveryStatusLabel(simpleConfirmModal.nextStatus)}"?`}
                    confirmText="Confirmar"
                    cancelText="Cancelar"
                    variant="warning"
                />
            )}

            {(() => {
                const selectedOrder = selectedLink ? (selectedLink.orders || selectedLink) : null
                const resolvedSelectedStatus = selectedLink
                    ? (selectedLink.status && !["pending", "not_sent"].includes(selectedLink.status)
                        ? selectedLink.status
                        : (selectedOrder?.delivery_status || selectedLink.status || delivery?.status || "not_sent"))
                    : null
                const isDelivered = resolvedSelectedStatus === "delivered"
                const isPaid = selectedOrder
                    ? ["paid", "concluído", "concluido", "approved", "pago"].includes(String(selectedOrder.situation || "").toLowerCase())
                    : false
                const remaining = selectedOrder
                    ? Math.max(0, Number(selectedOrder.total_amount || 0) - Number(selectedOrder.paid_amount || 0))
                    : 0

                const driverPaymentBanner = selectedOrder && isDelivery && !isPaid ? (
                    <div className="p-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-xl border border-brand-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <MoneyIcon size={20} className="text-brand-primary shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pagamento Pendente</p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Valor restante: {formatCurrency(remaining)}</p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => {
                                setActiveLink(selectedLink)
                                setIsOrderPaymentModalOpen(true)
                            }}
                        >
                            Receber Pagamento
                        </Button>
                    </div>
                ) : null

                const sheetFooter = selectedOrder ? (
                    <div className="flex gap-3 w-full">
                        <Button
                            type="button"
                            variant={isDelivery && !isPaid ? "default" : "outline"}
                            className="flex-1 h-12"
                            onClick={() => {
                                setActiveLink(selectedLink)
                                setIsOrderPaymentModalOpen(true)
                            }}
                        >
                            {isDelivery && !isPaid ? "Receber Pagamento" : "Status de Pagamento"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-12"
                            onClick={() => {
                                setOrderStatusModal({
                                    isOpen: true,
                                    orderId: selectedOrder.id,
                                    currentStatus: resolvedSelectedStatus || "not_sent",
                                })
                                setOrderNewStatus("")
                            }}
                        >
                            Status de Entrega
                        </Button>
                    </div>
                ) : undefined

                return (
                    <DeliveryOrderDetailSheet
                        isOpen={!!selectedLink}
                        onClose={() => setSelectedLink(null)}
                        order={selectedOrder}
                        deliveryStatusOverride={resolvedSelectedStatus}
                        extraGeneralContent={driverPaymentBanner}
                        footer={sheetFooter}
                    />
                )
            })()}
        </FadeIn>
    )
}