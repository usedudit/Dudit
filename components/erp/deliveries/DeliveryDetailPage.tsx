"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button, Badge, InfoCard, ThreeDotsLoader, FormDropdown, Tabs, TabsContent, TabsList, TabsTrigger, CustomerCard, FormSection, ListItem } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import Input from "@/components/reusable/Input"
import DefaultModal from "@/components/reusable/DefaultModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, ClockArrowUpIcon, ClockCheckIcon, EstimateTimeIcon, RouteIcon, XIcon } from "@/lib/icons"
import { getERPDeliveryDetailsAction, getDeliveryRoutePointsAction, updateERPSingleOrderDeliveryStatusAction } from "@/app/actions/erp/deliveries"
import { formatCurrency, formatDateTime, formatDate, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
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
    planSlug = "free",
}: {
    deliveryId: string
    partnerId: string
    onBack: () => void
    planSlug?: string
}) {
    const [delivery, setDelivery] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [route, setRoute] = useState<any | null>(null)
    const [routeError, setRouteError] = useState<string | null>(null)
    const [routeLoading, setRouteLoading] = useState(false)
    const isEscalar = planSlug === "escalar"
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
    const [selectedLink, setSelectedLink] = useState<any | null>(null)
    const [activeLink, setActiveLink] = useState<any | null>(null)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)

    useEffect(() => {
        if (selectedLink) {
            setActiveLink(selectedLink)
        }
    }, [selectedLink])
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
    const [selectedNewStatus, setSelectedNewStatus] = useState<string>("")
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; orderId: string; nextStatus: string } | null>(null)
    const isMobile = useMediaQuery("(max-width: 768px)")
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const mounted = useRef(true)

    const handleBack = useCallback(() => onBack(), [onBack])

    const { setHeaderOverride } = useSidebar()

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
        if (!isEscalar) return
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
    }, [deliveryId, partnerId, isEscalar])

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
                // Re-fetch details & routes
                const detailRes = await getERPDeliveryDetailsAction(deliveryId, partnerId)
                if (detailRes.success) {
                    setDelivery(detailRes.data)
                    // If sheet is open for this order, update its state too!
                    if (selectedLink && selectedLink.orders?.id === orderId) {
                        const updatedLink = (detailRes.data?.delivery_orders || []).find((l: any) => l?.orders?.id === orderId)
                        if (updatedLink) setSelectedLink(updatedLink)
                    }
                }
                if (isEscalar) {
                    const routeRes = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
                    if (routeRes.success) {
                        setRoute(routeRes.data)
                    }
                }
            } else {
                toast.error(res.error || "Erro ao atualizar status do pedido.")
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao atualizar status.")
        } finally {
            setUpdatingOrderId(null)
        }
    }

    if (loading) return <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center">
        <ThreeDotsLoader />
    </div>

    if (!delivery) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <p className="text-red-500 font-bold text-lg">Não foi possível carregar a entrega</p>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                    Verifique se o pedido/entrega existe ou se o seu plano atual possui acesso.
                </p>
                <Button variant="outline" onClick={handleBack} className="mt-4">
                    Voltar para Entregas
                </Button>
            </div>
        )
    }

    const statusMeta = getDeliveryStatusMeta(delivery.status)
    const links = (delivery.delivery_orders || []).filter((l: any) => l?.orders)

    const allItems = links.flatMap((link: any) => {
        const order = link.orders
        return (order?.order_items || []).map((item: any) => ({
            ...item,
            orderDisplayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
        }))
    })

    const totalDeliveryFee = links.reduce((sum: number, link: any) => sum + Number(link.orders?.delivery_fee || 0), 0)

    const driverName = delivery.partner_users?.user_profiles?.full_name || "Entrega própria"

    const linkedOrdersCard = (
        <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
            <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50 flex items-center justify-between gap-4">
                <div className="text-left shrink-0">
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Pedidos Vinculados ({links.length})</span>
                    <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">Valor total da entrega: {formatCurrency(totalDeliveryFee)}</p>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Entregador</span>
                    <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">{driverName}</p>
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
        <FormSection title="Informações da Entrega" hasSeparator className="mb-8">
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
        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 flex items-center justify-between">
            {/* Back button - desktop only */}
            <div className="absolute -left-12 top-1/2 -translate-y-1/2 hidden xl:flex">
                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
            </div>

            <div className="flex items-center gap-3">
                {/* Back button - mobile/tablet only */}
                <div className="xl:hidden">
                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                </div>
                <div>
                    <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3">
                        Entrega {delivery?.delivery_number ? `#${delivery.delivery_number}` : ""}
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm mt-1">
                        Criado em {formatDateTime(delivery.created_at)} • {driverName}
                    </p>
                </div>
            </div>

            <Badge variant={statusMeta.variant} icon={getDeliveryStatusIcon(delivery?.status)}>{statusMeta.label}</Badge>
        </div>
    )

    return (
        <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
            {isEscalar ? (
                <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden">
                    {/* LEFT SIDE - CONTENT */}
                    <div className="w-full lg:w-1/2 flex flex-col flex-1 min-h-0 lg:flex-none lg:shrink-0 lg:h-full border-r-0 lg:border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative">
                        {/* Header now inside the left column */}
                        <div className={`shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "py-2 shadow-sm" : "py-4"}`}>
                            {pageHeader}
                        </div>

                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar relative">
                            <div className="flex-1 pt-4 pb-12 px-4 md:px-6 space-y-8">
                                {linkedOrdersCard}
                                {deliveryInfoMetrics}
                                {notesSection}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT SIDE - ROUTE MAP (preview area) */}
                    <div className="w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 overflow-auto no-scrollbar">
                        <div className="p-4 md:p-6 flex flex-col h-full">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Mapa da Rota</h3>
                            <div className="flex-1 min-h-[300px] w-full">
                                {mapContent}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10 custom-scrollbar">
                    {/* Sticky Header */}
                    <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "py-2 shadow-sm" : "py-4"}`}>
                        {pageHeader}
                    </div>

                    {/* Content */}
                    <div className="max-w-[1300px] mx-auto w-full p-4 md:p-6 space-y-8 relative mt-4">
                        {linkedOrdersCard}
                        {deliveryInfoMetrics}
                        {notesSection}
                    </div>
                </div>
            )}

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

            {/* Helper payment code */}
            {
                (() => {
                    const getPaymentTypeLabel = (o: any) => {
                        const pm = String(o.payment_method || "").toLowerCase();
                        if (pm === "exchange") return "Crédito de troca";
                        if (pm === "store_credit" || pm === "store-credit") return "Vale-compra";
                        if (pm === "pix" || pm === "bank_transfer") return "Pix";
                        if (pm.includes("crédito") || pm.includes("credito") || pm.includes("credit")) return "Cartão de Crédito";
                        if (pm.includes("débito") || pm.includes("debito") || pm.includes("debit")) return "Cartão de Débito";
                        if (pm.includes("dinheiro") || pm.includes("cash") || pm.includes("money")) return "Dinheiro";
                        if (pm.includes("boleto")) return "Boleto";
                        return o.payment_method || "Não informado";
                    }

                    const getPaymentIcon = (o: any) => {
                        const subMethod = String(o.payment_method || "").toLowerCase();
                        let iconName = null;
                        if (subMethod.includes("pix") || subMethod.includes("bank_transfer")) {
                            iconName = "Pix.png";
                        } else if (subMethod.includes("crédito") || subMethod.includes("credito") || subMethod.includes("credit")) {
                            iconName = "CreditCard.png";
                        } else if (subMethod.includes("débito") || subMethod.includes("debito") || subMethod.includes("debit")) {
                            iconName = "DebitCard.png";
                        } else if (subMethod.includes("boleto")) {
                            iconName = "Boleto.png";
                        }

                        if (iconName) {
                            return (
                                <img src={`https://img.dudit.com.br/static/icons/payments/${iconName}`} alt="Payment icon" className="w-5 h-5 object-contain shrink-0" />
                            );
                        }
                        return <span className="text-brand-dark dark:text-dark-heading shrink-0 text-sm">💳</span>;
                    }

                    const getPaymentStatusDisplay = (situation: string) => {
                        switch (situation) {
                            case "paid":
                                return {
                                    label: "Pago",
                                    color: "text-green-700 dark:text-green-400",
                                };
                            case "partially_paid":
                                return {
                                    label: "Parcialmente Pago",
                                    color: "text-brand-orange dark:text-orange-400",
                                };
                            case "pending":
                            case "unpaid":
                                return {
                                    label: "Pendente",
                                    color: "text-brand-orange dark:text-orange-400",
                                };
                            case "cancelled":
                                return {
                                    label: "Cancelado",
                                    color: "text-red-700 dark:text-red-400",
                                };
                            default:
                                const meta = getPaymentStatusMeta(situation);
                                return {
                                    label: meta.label,
                                    color: "text-gray-700 dark:text-gray-400",
                                };
                        }
                    }

                    const isOpen = !!selectedLink;
                    const handleClose = () => setSelectedLink(null);

                    if (!activeLink) return null;

                    const order = activeLink.orders;
                    if (!order) return null;

                    const paymentBreakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
                        ? order.payment_breakdown.filter((entry: any) => entry?.method)
                        : Number(order.paid_amount || 0) > 0 && order.payment_method
                            ? [{ method: order.payment_method, amount: Number(order.paid_amount || 0) }]
                            : []
                    const couponDiscountAmount = Math.max(0, Number(order.coupon_discount_amount || 0))
                    const paymentMethodDiscountAmount = Math.max(0, Number(order.payment_method_discount_amount || 0))
                    const paymentMethodExtraAmount = Math.max(0, Number(order.payment_method_extra_amount || 0))
                    const subtotalValue = Number(order.subtotal_value || 0) > 0
                        ? Number(order.subtotal_value || 0)
                        : Number(order.total_amount || 0) - Number(order.delivery_fee || 0) - Number(order.additional_costs || 0) + Number(order.discount_value || 0) + couponDiscountAmount + paymentMethodDiscountAmount - paymentMethodExtraAmount
                    const changeAmount = Math.max(0, Number(order.paid_amount || 0) - Number(order.total_amount || 0))
                    const cashEntry = Array.isArray(order.payment_breakdown)
                        ? order.payment_breakdown.find((entry: any) => entry?.method === "cash")
                        : null
                    const wantsChange = cashEntry?.wantsChange ?? String(order.payment_method || "").toLowerCase().includes("troco para")
                    const payWithAmount = cashEntry?.payWithAmount ?? (() => {
                        const match = String(order.payment_method || "").match(/troco para R\$\s*([\d,.]+)/i)
                        if (match) {
                            const cleanNum = match[1].replace(/\./g, "").replace(',', '.')
                            return Number(cleanNum)
                        }
                        return null
                    })()
                    const cashChangeAmount = wantsChange && payWithAmount ? payWithAmount - Number(order.total_amount || 0) : 0

                    const statusDisplay = getPaymentStatusDisplay(order.situation);

                    const sheetContent = (
                        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                                <Button variant="filled" onClick={handleClose} size="icon">
                                    <XIcon className="h-5 w-5" />
                                </Button>
                            </header>

                            <Tabs defaultValue="dados_gerais" className="flex flex-col flex-1 overflow-hidden">
                                <div className="px-6 border-b border-brand-border dark:border-dark-border shrink-0">
                                    <TabsList className="mt-6">
                                        <TabsTrigger value="dados_gerais">
                                            Dados Gerais
                                        </TabsTrigger>
                                        <TabsTrigger value="itens">
                                            Itens do Pedido
                                        </TabsTrigger>
                                        <TabsTrigger value="pagamento">
                                            Pagamento
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    <TabsContent value="dados_gerais" className="mt-0 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(order.total_amount || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data e Hora</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {order.created_at ? formatDateTime(order.created_at) : "-"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Canal de Venda</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {order.order_source || "Manual"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status da Entrega</span>
                                                <Badge variant={getDeliveryStatusMeta(activeLink.status || order.delivery_status).variant} icon={getDeliveryStatusIcon(activeLink.status || order.delivery_status)}>
                                                    {getDeliveryStatusMeta(activeLink.status || order.delivery_status).label}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="border-t border-brand-border dark:border-dark-border w-full" />

                                        <CustomerCard
                                            customer={order.customer || {
                                                name: order.customer_name || "Cliente",
                                                email: "",
                                                phone: "",
                                            }}
                                            address={order.customerAddress || (order.delivery_address ? parseAddressString(order.delivery_address) : null)}
                                            showMap={false}
                                            chrome="minimal"
                                        />
                                    </TabsContent>

                                    <TabsContent value="itens" className="mt-0">
                                        {(() => {
                                            const filteredItems = (order.order_items || []).filter((item: any) => {
                                                const pType = String(item.products?.product_type || "").toLowerCase()
                                                return pType !== "serviço" && pType !== "servico" && pType !== "service"
                                            })
                                            if (filteredItems.length === 0) {
                                                return (
                                                    <div className="p-5 text-sm text-brand-inactive-text border border-brand-border dark:border-dark-border rounded-2xl">
                                                        Nenhum item detalhado foi retornado para o pedido selecionado.
                                                    </div>
                                                )
                                            }
                                            return (
                                                <div className="space-y-4">
                                                    {filteredItems.map((item: any) => {
                                                        const itemImage = getR2ImageUrl(item.products?.images || item.image || null, "thumbnail")
                                                        const itemSku = item.products?.sku || item.sku || "N/A"
                                                        const itemPrice = Number(item.product_price || item.price || 0)
                                                        const itemSubtotal = Number(item.subtotal || itemPrice * Number(item.quantity || 0))

                                                        return (
                                                            <div key={item.id} className="flex items-start gap-4">
                                                                <div className="w-12 h-12 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                    <img
                                                                        src={itemImage}
                                                                        className="w-full h-full object-cover rounded-xl"
                                                                        alt={item.product_name || "Produto sem nome"}
                                                                        onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                    />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex justify-between items-start mb-0.5">
                                                                        <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                            {item.product_name || "Produto sem nome"}
                                                                        </h4>
                                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(itemSubtotal)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mb-1">
                                                                        SKU: {itemSku}
                                                                    </div>
                                                                    <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                        {formatQuantityWithUnit(item.quantity, item.unit)} • {formatUnitPriceWithUnit(itemPrice, item.unit)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })()}
                                    </TabsContent>

                                    <TabsContent value="pagamento" className="mt-0 space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Método de Pagamento</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 flex items-center justify-center overflow-hidden shrink-0">
                                                    {getPaymentIcon(order)}
                                                </div>
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                    {getPaymentTypeLabel(order)}
                                                </span>
                                                <span className="text-brand-border dark:text-dark-border">|</span>
                                                <span className={`font-bold ${statusDisplay.color}`}>
                                                    {statusDisplay.label}
                                                </span>
                                            </div>
                                        </div>

                                        {paymentBreakdown.length > 1 && (
                                            <div className="flex justify-between items-start text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valores por meio</span>
                                                <div className="flex flex-col gap-1 text-right">
                                                    {paymentBreakdown.map((entry: any, index: number) => (
                                                        <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                            {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(entry.amount || 0)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Original</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotalValue)}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tipo de Entrega</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                {order.delivery_type === "pickup" ? "Retirada no local" : "Entrega no endereço"}
                                            </span>
                                        </div>

                                        {(Number(order.delivery_fee || 0) > 0 || order.delivery_payer === "seller" || Number(order.delivery_breakdown?.originalFee || order.delivery_breakdown?.deliverySubsidy || 0) > 0) && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor da Entrega</span>
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5 flex-wrap">
                                                    {Number(order.delivery_fee || 0) > 0
                                                        ? formatCurrency(order.delivery_fee)
                                                        : formatCurrency(Number(order.delivery_breakdown?.originalFee || order.delivery_breakdown?.deliverySubsidy || 0))}
                                                    {Number(order.delivery_fee || 0) === 0 && (
                                                        <span className="text-xs font-semibold text-orange-600 bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400 px-2 py-0.5 rounded-full">Frete Grátis</span>
                                                    )}
                                                    {Number(order.delivery_fee || 0) > 0 && order.delivery_payer === "seller" && (
                                                        <span className="text-xs font-semibold text-orange-600 bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400 px-2 py-0.5 rounded-full">Subsidiado</span>
                                                    )}
                                                    {Number(order.delivery_breakdown?.distanceKm || 0) > 0 && (
                                                        <span className="text-xs text-brand-muted font-normal">({order.delivery_breakdown.distanceKm} km)</span>
                                                    )}
                                                </span>
                                            </div>
                                        )}

                                        {Number(order.additional_costs || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Outros Custos</span>
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.additional_costs)}</span>
                                            </div>
                                        )}

                                        {Number(order.discount_value || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto do Pedido</span>
                                                <span className="text-brand-green font-bold">- {formatCurrency(order.discount_value)}</span>
                                            </div>
                                        )}

                                        {couponDiscountAmount > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto por Cupom</span>
                                                <span className="text-brand-green font-bold">- {formatCurrency(couponDiscountAmount)}</span>
                                            </div>
                                        )}

                                        {paymentMethodDiscountAmount > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                                    {order.payment_method === "exchange" ? "Crédito de troca" :
                                                        order.payment_method === "store_credit" ? "Vale-compra" :
                                                            "Desconto do Método"}
                                                </span>
                                                <span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>
                                            </div>
                                        )}

                                        {paymentMethodExtraAmount > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Taxa do Método</span>
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>
                                            </div>
                                        )}

                                        {changeAmount > 0.009 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Troco</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(changeAmount)}</span>
                                            </div>
                                        )}

                                        {wantsChange && payWithAmount !== null && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Troco Solicitado</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(cashChangeAmount)} (para {formatCurrency(payWithAmount)})</span>
                                            </div>
                                        )}

                                        {order.is_refunded && Number(order.refunded_amount || 0) > 0 && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Reembolsado</span>
                                                <span className="text-brand-red font-bold">- {formatCurrency(order.refunded_amount || 0)}</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                            <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                            <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(order.total_amount)}</span>
                                        </div>

                                        {order.situation !== "paid" && (
                                            <div className="pt-4 flex justify-end">
                                                <Button
                                                    className="w-full h-12"
                                                    onClick={() => setIsPaymentModalOpen(true)}
                                                >
                                                    Registrar Recebimento
                                                </Button>
                                            </div>
                                        )}
                                    </TabsContent>
                                </div>
                            </Tabs>

                            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface flex gap-3">
                                <Button variant="outline" className="flex-1 h-12" onClick={handleClose}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 h-12"
                                    onClick={() => {
                                        setSelectedNewStatus(activeLink.status || order.delivery_status || "pending");
                                        setIsStatusModalOpen(true);
                                    }}
                                >
                                    Alterar Status
                                </Button>
                            </footer>
                        </div>
                    );

                    return isMobile ? (
                        <BottomSheet isOpen={isOpen} onClose={handleClose}>
                            {sheetContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <div
                                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                                onClick={handleClose}
                            >
                                <div
                                    className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {sheetContent}
                                </div>
                            </div>
                        </Portal>
                    );
                })()
            }

            <DefaultModal
                isOpen={isStatusModalOpen}
                onClose={() => setIsStatusModalOpen(false)}
                title="Alterar Status de Entrega"
                maxWidth="sm"
                footer={
                    <div className="flex gap-3 justify-end w-full">
                        <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={async () => {
                                if (selectedLink && selectedNewStatus) {
                                    setIsStatusModalOpen(false);
                                    await handleOrderDeliveryStatusChange(selectedLink.orders.id, selectedNewStatus);
                                }
                            }}
                            disabled={!selectedNewStatus}
                        >
                            Confirmar
                        </Button>
                    </div>
                }
            >
                <div className="p-4 space-y-4">
                    <FormDropdown
                        label="Status da entrega"
                        value={selectedNewStatus}
                        setValue={setSelectedNewStatus}
                        options={[
                            { value: "delivered", label: "Entregue" },
                            { value: "delivery_failed", label: "Falha na entrega" },
                            { value: "pending", label: "Não enviado" },
                            { value: "preparing", label: "Em preparação" },
                            { value: "sent", label: "Enviado" },
                            { value: "cancelled", label: "Cancelada" },
                        ]}
                        placeholder="Selecione o status"
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={simpleConfirmModal?.isOpen ?? false}
                title="Confirmar Alteração de Status"
                description={`Tem certeza que deseja alterar o status da entrega deste pedido para ${getDeliveryStatusLabel(simpleConfirmModal?.nextStatus)}?`}
                confirmText="Confirmar"
                cancelText="Cancelar"
                onClose={() => setSimpleConfirmModal(null)}
                onConfirm={async () => {
                    if (simpleConfirmModal) {
                        const { orderId, nextStatus } = simpleConfirmModal;
                        setSimpleConfirmModal(null);
                        await handleOrderDeliveryStatusChange(orderId, nextStatus, undefined, true);
                    }
                }}
                variant="info"
            />

            {
                isPaymentModalOpen && activeLink?.orders && (
                    <PaymentStatusModal
                        isOpen={isPaymentModalOpen}
                        onClose={() => setIsPaymentModalOpen(false)}
                        order={activeLink.orders}
                        partnerId={partnerId}
                        onSuccess={loadDeliveryDetails}
                    />
                )
            }
        </FadeIn >
    )
}
