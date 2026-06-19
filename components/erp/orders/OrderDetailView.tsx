"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
    ChevronLeftIcon,
    ThreeDotsIcon,
    UserIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    XIcon,
    ClockIcon
} from "@/lib/icons"
import {
    Button,
    Badge,
    ActionsDropdown,
    ThreeDotsLoader,
    InfoCard,
    CustomerCard,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Input,
    ListItem,
    FormSection
} from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import { usePermissions } from "@/lib/permission-context"

import { getOrderDetailsAction, getOrderHistoryAction } from "@/app/actions/erp/orders"
import { getOrderDeliverySummaryAction } from "@/app/actions/erp/deliveries"
import { OrderHistoryTab } from "./OrderHistoryTab"
import { useNotification } from "@/hooks/use-notification"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDateTime, formatTime, formatDayMonth } from "@/lib/utils"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { FadeIn } from "@/components/animations/FadeIn"

import { useStore } from "@/lib/store-context"
import { parseAddressString } from "./CreateOrder"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import BottomSheet from "@/components/BottomSheet"
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal"

const formatProductQuantity = (qty: number, unit?: string | null) => {
    const cleanUnit = String(unit || "").trim().toLowerCase();
    if (!cleanUnit || cleanUnit === "un" || cleanUnit === "unidade") {
        return `${qty} un.`;
    }
    return `${qty} ${unit}`;
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    const cleanUnit = String(unit || "").trim().toLowerCase();
    if (!cleanUnit || cleanUnit === "un" || cleanUnit === "unidade") {
        return formatCurrency(price);
    }
    return `${formatCurrency(price)}/${unit}`;
};

const getServiceScheduleInfo = (item: any, order: any) => {
    const appointments = order?.appointments || [];
    const matchingAppt = appointments.find((appt: any) =>
        appt.service_name?.toLowerCase() === item.product_name?.toLowerCase()
    );
    if (matchingAppt && matchingAppt.start_date && matchingAppt.start_time) {
        return {
            date: matchingAppt.start_date,
            time: matchingAppt.start_time
        };
    }

    const lines = order?.checkout_fulfillment?.lines || [];
    const matchingLine = lines.find((line: any) =>
        line.itemType === "service_booking" &&
        line.bookingMetadata?.serviceName?.toLowerCase() === item.product_name?.toLowerCase()
    );
    if (matchingLine?.bookingMetadata?.date && matchingLine?.bookingMetadata?.time) {
        return {
            date: matchingLine.bookingMetadata.date,
            time: matchingLine.bookingMetadata.time
        };
    }

    return null;
};

const formatServiceSchedule = (dateStr: string, timeStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const day = parts[2];
    const month = parts[1];
    const year = parts[0];
    let timeFormatted = "";
    if (timeStr) {
        const timeParts = timeStr.split(":");
        if (timeParts.length >= 2) {
            timeFormatted = ` às ${timeParts[0]}:${timeParts[1]}`;
        }
    }
    return `${day}/${month}/${year}${timeFormatted}`;
};

interface OrderDetailViewProps {
    orderId: string
    partnerId: string
    onBack: () => void
    onEditOrder: (order: any, reason?: string) => void
    onUpdateDeliveryStatus: (order: any) => void
    onUpdatePaymentStatus: (order: any) => void
    onCancelOrder: (order: any) => void
    onOpenNotes: (order: any) => void
    initialOrder?: any
}

export default function OrderDetailView({ orderId, partnerId, onBack, onEditOrder, onUpdateDeliveryStatus, onUpdatePaymentStatus, onCancelOrder, onOpenNotes, initialOrder }: OrderDetailViewProps) {
    const { role } = usePermissions()
    const { selectedStore } = useStore()

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [order, setOrder] = useState<any>(initialOrder || null)
    const [loading, setLoading] = useState(!initialOrder)
    const [activeTab, setActiveTab] = useState("summary")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [deliverySummary, setDeliverySummary] = useState<any | null>(null)
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
    const [isStepsSheetOpen, setIsStepsSheetOpen] = useState(false)
    const [printModalOrderId, setPrintModalOrderId] = useState<string | null>(null)
    const { error: notifyError } = useNotification()

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    // Always fetch full data in background, even if we have initialOrder
    useEffect(() => {
        let mounted = true

        async function load() {
            // Only show loading spinner if we have NO data at all
            if (!initialOrder) setLoading(true)

            const res = await getOrderDetailsAction(orderId, partnerId)
            if (!mounted) return

            if (res.success) {
                setOrder(res.data)
            } else if (!initialOrder) {
                notifyError("Erro", res.error)
                onBack()
            }
            setLoading(false)
        }

        load()
        return () => { mounted = false }
    }, [orderId, partnerId])

    useEffect(() => {
        let mounted = true
        async function loadDelivery() {
            if (!orderId || !partnerId) return
            const res = await getOrderDeliverySummaryAction({ partnerId, orderId })
            if (!mounted) return
            if (res.success) {
                setDeliverySummary(res.data)
            } else {
                setDeliverySummary(null)
            }
        }
        loadDelivery()
        return () => { mounted = false }
    }, [orderId, partnerId])

    useEffect(() => {
        async function loadHistory() {
            if (activeTab !== "history" || historyLoaded) return
            setHistoryLoading(true)
            const res = await getOrderHistoryAction(orderId, partnerId)
            if (res.success) {
                setHistoryEntries(res.data || [])
                setHistoryLoaded(true)
            } else {
                notifyError("Erro", res.error)
            }
            setHistoryLoading(false)
        }
        loadHistory()
    }, [activeTab, historyLoaded, orderId, partnerId, notifyError])

    if (loading) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface min-h-[400px]"><ThreeDotsLoader /></div>
    if (!order) return null

    const pageTitle = `Pedido ${order.order_number}`
    const paymentStatus = getPaymentStatusMeta(order.situation)
    const pendingSuffix = paymentStatus.label !== "Pago" ? ` (${paymentStatus.label})` : ""
    const remainingPaymentAmount = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0))
    const hasPendingPayment = order.situation !== "paid" && order.situation !== "cancelled" && remainingPaymentAmount > 0.009
    const getPaymentTypeLabel = () => {
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const breakdownMethod = breakdown.find((e: any) => e?.method)?.method;
        if (breakdownMethod) {
            const m = breakdownMethod.toLowerCase();
            if (m === "pix" || m === "bank_transfer") return "Pix";
            if (m.includes("crédito") || m.includes("credito") || m.includes("credit")) return "Cartão de Crédito";
            if (m.includes("débito") || m.includes("debito") || m.includes("debit")) return "Cartão de Débito";
            if (m.includes("dinheiro") || m.includes("cash") || m.includes("money")) return "Dinheiro";
            if (m.includes("boleto")) return "Boleto";
            return breakdownMethod;
        }
        const pm = String(order.payment_method || "").toLowerCase();
        if (pm === "pix" || pm === "bank_transfer") return "Pix";
        if (pm.includes("crédito") || pm.includes("credito") || pm.includes("credit")) return "Cartão de Crédito";
        if (pm.includes("débito") || pm.includes("debito") || pm.includes("debit")) return "Cartão de Débito";
        if (pm.includes("dinheiro") || pm.includes("cash") || pm.includes("money")) return "Dinheiro";
        if (pm.includes("boleto")) return "Boleto";
        return order.payment_method || "Nao informado";
    };
    const paymentMethodLabel = `${getPaymentTypeLabel()}${pendingSuffix}`
    const getPaymentIcon = () => {
        const type = getPaymentTypeLabel().toLowerCase();
        const icon = type === "pix" ? "Pix.png" :
            type.includes("crédito") || type.includes("credito") || type.includes("credit") ? "CreditCard.png" :
                type.includes("débito") || type.includes("debito") || type.includes("debit") ? "DebitCard.png" : null;
        return icon ? (
            <img src={`https://img.dudit.com.br/static/icons/payments/${icon}`} alt={getPaymentTypeLabel()} className="w-5 h-5 object-contain" />
        ) : null;
    }

    const getPaymentStatusDisplay = (situation: string) => {
        switch (situation) {
            case "paid":
                return {
                    label: "Pago",
                    color: "text-green-700 dark:text-green-400",
                    Icon: CheckCircleIcon,
                };
            case "partially_paid":
                return {
                    label: "Parcialmente Pago",
                    color: "text-brand-orange dark:text-orange-400",
                    Icon: ClockIcon,
                };
            case "pending":
            case "unpaid":
                return {
                    label: "Pendente",
                    color: "text-brand-orange dark:text-orange-400",
                    Icon: ClockIcon,
                };
            case "cancelled":
                return {
                    label: "Cancelado",
                    color: "text-red-700 dark:text-red-400",
                    Icon: XIcon,
                };
            case "awaiting_pickup_payment":
                return {
                    label: "Aguardando pagamento na retirada",
                    color: "text-brand-orange dark:text-orange-400",
                    Icon: ClockIcon,
                };
            default:
                const meta = getPaymentStatusMeta(situation);
                return {
                    label: meta.label,
                    color: "text-gray-700 dark:text-gray-400",
                    Icon: AlertCircleIcon,
                };
        }
    };

    const renderPaymentMethodValue = () => {
        const statusDisplay = getPaymentStatusDisplay(order.situation);
        const StatusIcon = statusDisplay.Icon;
        const methodType = getPaymentTypeLabel();
        const methodName = order.payment_method ? ` (${order.payment_method})` : "";

        return (
            <div className="flex items-center gap-2 flex-wrap text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                        {getPaymentIcon()}
                    </div>
                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                        {methodType}{methodName}
                    </span>
                </div>
                <span className="text-brand-border dark:text-dark-border">|</span>
                <span className={`inline-flex items-center gap-1 font-bold ${statusDisplay.color}`}>
                    <StatusIcon size={14} className="shrink-0" />
                    <span>{statusDisplay.label}</span>
                </span>
            </div>
        );
    };

    const paymentBreakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
        ? order.payment_breakdown.filter((entry: any) => entry?.method)
        : Number(order.paid_amount || 0) > 0 && order.payment_method
            ? [{ method: order.payment_method, amount: Number(order.paid_amount || 0) }]
            : []
    const itemCount = Number(order.order_items?.length || 0)
    const sortedOrderItems = [...(order.order_items || [])].sort((a: any, b: any) => {
        if (a.is_gift && !b.is_gift) return 1;
        if (!a.is_gift && b.is_gift) return -1;
        return (a.sort_order || 0) - (b.sort_order || 0);
    });
    const itemsLabel = itemCount === 1 ? "1 item" : `${itemCount} itens`
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

    const cleanNotes = String(order.notes || "").replace(/\n*Pedido cancelado por:[\s\S]*$/, "").trim()
    const cancelNote = (String(order.notes || "").match(/Pedido cancelado por:[\s\S]*$/)?.[0] || "").trim()
    const canEdit = order.situation !== "cancelled"
    const isPickupOrder = order.delivery_type === "pickup" || Number(order.delivery_fee || 0) <= 0

    const isMarketplaceOrder = true

    // Detect if order has services vs products for dynamic timeline labels
    const orderItems = order.order_items || []
    const hasOnlyServices = orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking")
    const hasAnyService = orderItems.some((item: any) => item.service_id || item.line_type === "service_booking")
    const hasMixedItems = hasAnyService && !hasOnlyServices

    const timelineDate = (isActive: boolean) => {
        if (!isActive) return { date: "", time: "" }
        const when = order.updated_at || order.created_at
        return { date: formatDayMonth(when), time: formatTime(when) }
    }

    const getTimelineSteps = (status: string) => {
        const baseDate = formatDayMonth(order.created_at)
        const baseTime = formatTime(order.created_at)

        const isPaid = ["paid", "partially_paid"].includes(order.situation)
        const isCancelled = order.situation === "cancelled"

        if (isCancelled) {
            const cancelledAt = order.updated_at || order.created_at
            return [
                { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
                { label: isPaid ? "Pago" : "Aguardando pagamento", date: baseDate, time: baseTime, active: true },
                { label: "Cancelado", date: formatDayMonth(cancelledAt), time: formatTime(cancelledAt), active: true }
            ]
        }

        const isPreparing = ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(status)
        const isSent = ["sent", "delivered", "delivery_failed", "pickup_available"].includes(status)
        const isDelivered = ["delivered", "pickup_available", "delivery_failed"].includes(status)

        const preparingMeta = timelineDate(isPaid && isPreparing)
        const sentMeta = timelineDate(isPaid && isSent)
        const finalMeta = timelineDate(isPaid && isDelivered)
        const paymentMeta = timelineDate(isPaid)

        const isPickup = isPickupOrder

        let finalLabel = isPickup ? "Pedido retirado" : "Pedido entregue"
        if (status === "delivery_failed") {
            finalLabel = isPickup ? "Retirada não realizada" : "Entrega não realizada"
        }

        if (hasOnlyServices) {
            return [
                {
                    label: "Pedido Realizado",
                    date: baseDate,
                    time: baseTime,
                    active: true
                },
                {
                    label: isPaid ? "Pago" : "Aguardando pagamento",
                    date: isPaid ? paymentMeta.date : baseDate,
                    time: isPaid ? paymentMeta.time : baseTime,
                    active: true
                },
                {
                    label: "Em andamento",
                    date: isPaid && isPreparing ? preparingMeta.date : undefined,
                    time: isPaid && isPreparing ? preparingMeta.time : undefined,
                    active: isPaid && isPreparing
                },
                {
                    label: "Concluído",
                    date: isPaid && isDelivered && status === "delivered" ? finalMeta.date : undefined,
                    time: isPaid && isDelivered && status === "delivered" ? finalMeta.time : undefined,
                    active: isPaid && isDelivered && status === "delivered"
                }
            ]
        }

        if (hasMixedItems) {
            const servicesCount = orderItems.filter((item: any) => !item.product_id && !item.variant_id).length;
            const productsCount = orderItems.filter((item: any) => item.product_id || item.variant_id).length;
            const serviceText = servicesCount === 1 ? "1 serviço sendo realizado" : `${servicesCount} serviços sendo realizados`;
            const productText = productsCount === 1 ? "1 produto sendo preparado" : `${productsCount} produtos sendo preparados`;

            return [
                {
                    label: "Pedido Realizado",
                    date: baseDate,
                    time: baseTime,
                    active: true
                },
                {
                    label: isPaid ? "Pago" : "Aguardando pagamento",
                    date: isPaid ? paymentMeta.date : baseDate,
                    time: isPaid ? paymentMeta.time : baseTime,
                    active: true
                },
                {
                    label: "Em progresso",
                    date: isPaid && isPreparing ? preparingMeta.date : undefined,
                    time: isPaid && isPreparing ? preparingMeta.time : undefined,
                    active: isPaid && isPreparing,
                    subLabel: [serviceText, productText]
                },
                {
                    label: "Finalizado",
                    date: isPaid && isSent ? sentMeta.date : undefined,
                    time: isPaid && isSent ? sentMeta.time : undefined,
                    active: isPaid && isSent
                },
                {
                    label: "Concluído",
                    date: isPaid && isDelivered ? finalMeta.date : undefined,
                    time: isPaid && isDelivered ? finalMeta.time : undefined,
                    active: isPaid && isDelivered
                }
            ]
        }

        return [
            {
                label: "Pedido Realizado",
                date: baseDate,
                time: baseTime,
                active: true
            },
            {
                label: isPaid ? "Pago" : "Aguardando pagamento",
                date: isPaid ? paymentMeta.date : baseDate,
                time: isPaid ? paymentMeta.time : baseTime,
                active: true
            },
            {
                label: "Em andamento",
                date: isPaid && isPreparing ? preparingMeta.date : undefined,
                time: isPaid && isPreparing ? preparingMeta.time : undefined,
                active: isPaid && isPreparing
            },
            {
                label: isPickup ? "Pronto para retirada" : "Enviado",
                date: isPaid && isSent ? sentMeta.date : undefined,
                time: isPaid && isSent ? sentMeta.time : undefined,
                active: isPaid && isSent
            },
            {
                label: finalLabel,
                date: isPaid && isDelivered ? finalMeta.date : undefined,
                time: isPaid && isDelivered ? finalMeta.time : undefined,
                active: isPaid && isDelivered
            }
        ]
    }

    const timelineSteps = getTimelineSteps(order.delivery_status)

    const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px] gap-4">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right">{value}</div>
        </div>
    )

    return (
        <>
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
                                                <span className="hidden md:inline truncate">{pageTitle}</span>
                                                <Badge variant={paymentStatus.variant}>
                                                    {paymentStatus.label}
                                                </Badge>
                                                {order.is_refunded && (
                                                    <Badge variant="purple">
                                                        Reembolsado
                                                    </Badge>
                                                )}
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Criado em {formatDateTime(order.created_at)} • {order.order_source || "Manual"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <ActionsDropdown
                                                onPrint={() => setPrintModalOrderId(order.id || order.order_number)}
                                                onEdit={(canEdit && role !== 'DELIVERY') ? () => onEditOrder(order) : undefined}
                                                onCancel={order.situation === "cancelled" ? () => onOpenNotes(order) : () => onCancelOrder(order)}
                                                onPaymentStatus={order.situation !== "cancelled" ? () => onUpdatePaymentStatus(order) : undefined}
                                                onDeliveryStatus={order.situation !== "cancelled" ? () => onUpdateDeliveryStatus(order) : undefined}
                                                cancelLabel={order.situation === "cancelled" ? "Observação" : "Cancelar"}
                                            />
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="summary">Dados gerais</TabsTrigger>
                                            <TabsTrigger value="history">Histórico</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsContent value="summary" className="mt-0">
                                        <FadeIn key="summary">
                                            {/* Desktop View */}
                                            <div className="hidden xl:grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                        <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                        {order.order_source === "Marketplace" ? "Canal de venda:" : "Responsável pela venda:"}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                        {order.order_source === "Marketplace"
                                                                            ? (order.order_source || "Marketplace")
                                                                            : (order.seller_name || "Não informado")}
                                                                    </div>
                                                                </div>
                                                                {order.order_source !== "Marketplace" && (
                                                                    <div className="hidden md:block text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                        Canal de venda: <strong className="text-brand-dark dark:text-dark-heading">{order.order_source || "Manual"}</strong>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                                            <div className="relative px-4">
                                                                <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                                    <div
                                                                        className={`absolute left-0 h-full rounded-full transition-all duration-500 ${order.delivery_status === "delivery_failed" ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                                                        style={{ width: `${timelineSteps.length <= 1 ? 0 : ((timelineSteps.filter((s) => s.active).length - 1) / (timelineSteps.length - 1)) * 100}%` }}
                                                                    ></div>

                                                                    {timelineSteps.map((step, idx) => {
                                                                        const isLastFailed = order.delivery_status === "delivery_failed" && idx === timelineSteps.length - 1;
                                                                        return (
                                                                            <div key={idx} className="relative flex flex-col items-center">
                                                                                <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                                                    <span className={`text-xs font-medium ${step.active ? (isLastFailed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                                                                        {step.label}
                                                                                    </span>
                                                                                </div>
                                                                                <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isLastFailed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
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
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <FormSection title="Itens do Pedido" hasSeparator>
                                                        <div className="space-y-4">
                                                            {sortedOrderItems.map((item: any) => {
                                                                const isService = !!item.service_id || item.line_type === "service_booking";
                                                                const scheduleInfo = isService ? getServiceScheduleInfo(item, order) : null;
                                                                return (
                                                                    <div key={item.id} className="flex items-start gap-4">
                                                                        <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                            <img
                                                                                src={getR2ImageUrl(item.image || item.products?.images || item.services?.images || null, "thumbnail")}
                                                                                className="w-full h-full object-cover rounded-xl"
                                                                                alt={item.product_name}
                                                                                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-start mb-1">
                                                                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.product_name || "Produto sem nome"}</h4>
                                                                                    {item.is_gift && (
                                                                                        <Badge variant="blue" icon={null}>Brinde</Badge>
                                                                                    )}
                                                                                </div>
                                                                                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">
                                                                                    {item.is_gift ? (
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        formatCurrency(item.subtotal || item.product_price * item.quantity)
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                            {isService ? (
                                                                                scheduleInfo ? (
                                                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                                                                        Data do agendamento: {formatServiceSchedule(scheduleInfo.date, scheduleInfo.time)}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                                                                        SKU: {item.product_variants?.sku || item.products?.sku || item.sku || "N/A"}
                                                                                    </div>
                                                                                )
                                                                            ) : (
                                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.product_variants?.sku || item.products?.sku || item.sku || "N/A"}</div>
                                                                            )}
                                                                            <div className="flex items-center gap-2 text-xs mt-1">
                                                                                <span className="text-brand-inactive-text">{formatProductQuantity(item.quantity, item.products?.unit)}</span>
                                                                                <span className="text-brand-border dark:text-dark-border">|</span>
                                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                                    {item.is_gift ? (
                                                                                        <span className="flex items-center gap-1.5 inline-flex">
                                                                                            <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                        </span>
                                                                                    ) : (
                                                                                        formatProductUnitPrice(item.product_price, item.products?.unit)
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </FormSection>

                                                    <FormSection title="Detalhes do Pagamento" hasSeparator>
                                                        <div className="space-y-3">
                                                            <PaymentRow
                                                                label="Método de Pagamento"
                                                                value={renderPaymentMethodValue()} />

                                                            {paymentBreakdown.length > 1 && (
                                                                <PaymentRow
                                                                    label="Valores por meio"
                                                                    value={<div className="flex flex-col gap-1">
                                                                        {paymentBreakdown.map((entry: any, index: number) => (
                                                                            <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                                {entry.method}: {formatCurrency(entry.amount || 0)}
                                                                            </span>
                                                                        ))}
                                                                    </div>} />
                                                            )}

                                                            <PaymentRow label="Valor Original" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotalValue)}</span>} />

                                                            {!hasOnlyServices && (
                                                                <PaymentRow
                                                                    label="Tipo de Entrega"
                                                                    value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                        {order.delivery_type === "pickup" ? "Retirada no local" : "Entrega no endereço"}
                                                                    </span>} />
                                                            )}

                                                            {Number(order.delivery_fee || 0) > 0 && (
                                                                <PaymentRow
                                                                    label="Valor da Entrega"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.delivery_fee)}</span>} />
                                                            )}

                                                            {Number(order.additional_costs || 0) > 0 && (
                                                                <PaymentRow label="Outros Custos" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.additional_costs)}</span>} />
                                                            )}

                                                            {Number(order.discount_value || 0) > 0 && (
                                                                <PaymentRow
                                                                    label="Desconto do Pedido"
                                                                    value={<span className="text-brand-green font-bold">- {formatCurrency(order.discount_value)}</span>} />
                                                            )}
                                                            {couponDiscountAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Desconto por Cupom"
                                                                    value={<span className="text-brand-green font-bold">- {formatCurrency(couponDiscountAmount)}</span>} />
                                                            )}
                                                            {paymentMethodDiscountAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Desconto do Método"
                                                                    value={<span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>} />
                                                            )}
                                                            {paymentMethodExtraAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Taxa do Método"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>} />
                                                            )}
                                                            {changeAmount > 0.009 && (
                                                                <PaymentRow
                                                                    label="Troco"
                                                                    value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(changeAmount)}</span>} />
                                                            )}
                                                            {wantsChange && payWithAmount !== null && (
                                                                <PaymentRow
                                                                    label="Troco Solicitado"
                                                                    value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(cashChangeAmount)} (para {formatCurrency(payWithAmount)})</span>} />
                                                            )}
                                                            {order.is_refunded && Number(order.refunded_amount || 0) > 0 && (
                                                                <PaymentRow
                                                                    label="Valor Reembolsado"
                                                                    value={<span className="text-brand-red font-bold">- {formatCurrency(order.refunded_amount || 0)}</span>} />
                                                            )}

                                                            <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                                                <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount)}</span>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {hasPendingPayment && (
                                                        <InfoCard
                                                            title="Valor ainda em aberto"
                                                            message={`Falta receber ${formatCurrency(remainingPaymentAmount)} para quitar este pedido.`}
                                                            color="orange" />
                                                    )}

                                                    {(cleanNotes || cancelNote) && (
                                                        <InfoCard
                                                            title="Observações do Pedido"
                                                            message={[cleanNotes, cancelNote].filter(Boolean).join("\n")}
                                                            color="orange" />
                                                    )}

                                                    {wantsChange && payWithAmount !== null && (
                                                        <InfoCard
                                                            title="Troco Necessário"
                                                            message={`O cliente pagará em dinheiro e precisa de troco para ${formatCurrency(payWithAmount)}. Levar ${formatCurrency(cashChangeAmount)} de troco.`}
                                                            color="orange" />
                                                    )}

                                                    <CustomerCard
                                                        customer={order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null)}
                                                        address={order.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order.customers?.addresses?.[0] || (order.delivery_address ? parseAddressString(order.delivery_address) : null)}
                                                        billingAddress={order.customers?.addresses?.find((a: any) => a.address_type === "billing")} />
                                                    {deliverySummary && deliverySummary.id && (
                                                        <InfoCard
                                                            title="Entrega vinculada"
                                                            color="blue"
                                                            message={
                                                                [
                                                                    deliverySummary.deliveryNumber
                                                                        ? `Entrega #${deliverySummary.deliveryNumber}`
                                                                        : `Entrega`,
                                                                    deliverySummary.driverName
                                                                        ? `Entregador: ${deliverySummary.driverName}`
                                                                        : null,
                                                                    deliverySummary.routeStep && deliverySummary.orderCount
                                                                        ? `Rota: ${deliverySummary.routeStep}/${deliverySummary.orderCount}`
                                                                        : null,
                                                                ]
                                                                    .filter(Boolean)
                                                                    .join("\n")
                                                            }
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Mobile/Tablet View */}
                                            <div className="xl:hidden space-y-6">
                                                {/* 1. Steps (Timeline) */}
                                                <FormSection title="" hasSeparator={false} className="mt-0">
                                                    {(() => {
                                                        const activeSteps = timelineSteps.filter(s => s.active);
                                                        const currentStep = activeSteps[activeSteps.length - 1] || timelineSteps[0];
                                                        return (
                                                            <ListItem
                                                                title={currentStep.label}
                                                                description={currentStep.date ? `${currentStep.date} às ${currentStep.time}` : undefined}
                                                                className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                                showChevron={true}
                                                                onClick={() => setIsStepsSheetOpen(true)}
                                                                left={
                                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${order.delivery_status === "delivery_failed"
                                                                        ? "bg-brand-red/10 text-brand-red"
                                                                        : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                                                        }`}>
                                                                        <div className={`w-2.5 h-2.5 rounded-full ${order.delivery_status === "delivery_failed"
                                                                            ? "bg-brand-red"
                                                                            : "bg-brand-dark dark:bg-dark-heading"
                                                                            }`} />
                                                                    </div>
                                                                }
                                                            />
                                                        );
                                                    })()}
                                                </FormSection>

                                                {/* 2. Observação */}
                                                {(cleanNotes || cancelNote) && (
                                                    <FormSection title="" hasSeparator={false} className="mt-0">
                                                        <InfoCard
                                                            title="Observações do Pedido"
                                                            message={[cleanNotes, cancelNote].filter(Boolean).join("\n")}
                                                            color="orange" />
                                                    </FormSection>
                                                )}

                                                {/* 3. Cliente */}
                                                {(() => {
                                                    const customerObj = order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null);
                                                    return customerObj ? (
                                                        <FormSection title="" hasSeparator={false} className="mt-0">
                                                            <ListItem
                                                                left={
                                                                    <UserProfileImage
                                                                        fullName={customerObj.name || "Cliente"}
                                                                        imageUrl={customerObj.avatar}
                                                                        className="w-10 h-10 text-base"
                                                                    />
                                                                }
                                                                title={customerObj.name || "Consumidor Final"}
                                                                description={customerObj.email || "Sem e-mail cadastrado"}
                                                                className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                                showChevron={true}
                                                                onClick={() => setIsCustomerSheetOpen(true)}
                                                            />
                                                        </FormSection>
                                                    ) : null;
                                                })()}

                                                {/* 4. Itens do Pedido */}
                                                <FormSection title="Itens do Pedido" hasSeparator={false} className="mt-0">
                                                    <div className="space-y-4">
                                                        {sortedOrderItems.map((item: any) => {
                                                            const isService = !!item.service_id || item.line_type === "service_booking";
                                                            const scheduleInfo = isService ? getServiceScheduleInfo(item, order) : null;
                                                            return (
                                                                <div key={item.id} className="flex items-start gap-4">
                                                                    <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                        <img
                                                                            src={getR2ImageUrl(item.image || item.products?.images || item.services?.images || null, "thumbnail")}
                                                                            className="w-full h-full object-cover rounded-xl"
                                                                            alt={item.product_name}
                                                                            onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex justify-between items-start mb-1">
                                                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                                <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.product_name || "Produto sem nome"}</h4>
                                                                                {item.is_gift && (
                                                                                    <Badge variant="blue" icon={null}>Brinde</Badge>
                                                                                )}
                                                                            </div>
                                                                            <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">
                                                                                {item.is_gift ? (
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    formatCurrency(item.subtotal || item.product_price * item.quantity)
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        {isService ? (
                                                                            scheduleInfo ? (
                                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                                                                    Data do agendamento: {formatServiceSchedule(scheduleInfo.date, scheduleInfo.time)}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                                                                    SKU: {item.product_variants?.sku || item.products?.sku || item.sku || "N/A"}
                                                                                </div>
                                                                            )
                                                                        ) : (
                                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.product_variants?.sku || item.products?.sku || item.sku || "N/A"}</div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 text-xs mt-1">
                                                                            <span className="text-brand-inactive-text">{formatProductQuantity(item.quantity, item.products?.unit)}</span>
                                                                            <span className="text-brand-border dark:text-dark-border">|</span>
                                                                            <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                                {item.is_gift ? (
                                                                                    <span className="flex items-center gap-1.5 inline-flex">
                                                                                        <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                    </span>
                                                                                ) : (
                                                                                    formatProductUnitPrice(item.product_price, item.products?.unit)
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </FormSection>

                                                {/* 5. Detalhes do Pagamento */}
                                                <FormSection title="Detalhes do Pagamento" hasSeparator={true} className="mt-0">
                                                    <div className="space-y-3">
                                                        <PaymentRow
                                                            label="Método de Pagamento"
                                                            value={renderPaymentMethodValue()} />

                                                        {paymentBreakdown.length > 1 && (
                                                            <PaymentRow
                                                                label="Valores por meio"
                                                                value={<div className="flex flex-col gap-1">
                                                                    {paymentBreakdown.map((entry: any, index: number) => (
                                                                        <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                            {entry.method}: {formatCurrency(entry.amount || 0)}
                                                                        </span>
                                                                    ))}
                                                                </div>} />
                                                        )}

                                                        <PaymentRow label="Valor Original" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotalValue)}</span>} />

                                                        {!hasOnlyServices && (
                                                            <PaymentRow
                                                                label="Tipo de Entrega"
                                                                value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                    {order.delivery_type === "pickup" ? "Retirada no local" : "Entrega no endereço"}
                                                                </span>} />
                                                        )}

                                                        {Number(order.delivery_fee || 0) > 0 && (
                                                            <PaymentRow
                                                                label="Valor da Entrega"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.delivery_fee)}</span>} />
                                                        )}

                                                        {Number(order.additional_costs || 0) > 0 && (
                                                            <PaymentRow label="Outros Custos" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.additional_costs)}</span>} />
                                                        )}

                                                        {Number(order.discount_value || 0) > 0 && (
                                                            <PaymentRow
                                                                label="Desconto do Pedido"
                                                                value={<span className="text-brand-green font-bold">- {formatCurrency(order.discount_value)}</span>} />
                                                        )}
                                                        {couponDiscountAmount > 0 && (
                                                            <PaymentRow
                                                                label="Desconto por Cupom"
                                                                value={<span className="text-brand-green font-bold">- {formatCurrency(couponDiscountAmount)}</span>} />
                                                        )}
                                                        {paymentMethodDiscountAmount > 0 && (
                                                            <PaymentRow
                                                                label="Desconto do Método"
                                                                value={<span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>} />
                                                        )}
                                                        {paymentMethodExtraAmount > 0 && (
                                                            <PaymentRow
                                                                label="Taxa do Método"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>} />
                                                        )}
                                                        {changeAmount > 0.009 && (
                                                            <PaymentRow
                                                                label="Troco"
                                                                value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(changeAmount)}</span>} />
                                                        )}
                                                        {wantsChange && payWithAmount !== null && (
                                                            <PaymentRow
                                                                label="Troco Solicitado"
                                                                value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(cashChangeAmount)} (para {formatCurrency(payWithAmount)})</span>} />
                                                        )}
                                                        {order.is_refunded && Number(order.refunded_amount || 0) > 0 && (
                                                            <PaymentRow
                                                                label="Valor Reembolsado"
                                                                value={<span className="text-brand-red font-bold">- {formatCurrency(order.refunded_amount || 0)}</span>} />
                                                        )}

                                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                            <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                                            <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount)}</span>
                                                        </div>
                                                    </div>
                                                </FormSection>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="history" className="mt-0">
                                        <FadeIn key="history">
                                            <OrderHistoryTab entries={historyEntries} loading={historyLoading} />
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div >
            </FadeIn >

            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <ActionsDropdown
                    onPrint={() => setPrintModalOrderId(order.id || order.order_number)}
                    onEdit={(canEdit && role !== 'DELIVERY') ? () => onEditOrder(order) : undefined}
                    onCancel={order.situation === "cancelled" ? () => onOpenNotes(order) : () => onCancelOrder(order)}
                    onPaymentStatus={order.situation !== "cancelled" ? () => onUpdatePaymentStatus(order) : undefined}
                    onDeliveryStatus={order.situation !== "cancelled" ? () => onUpdateDeliveryStatus(order) : undefined}
                    cancelLabel={order.situation === "cancelled" ? "Observação" : "Cancelar"}
                    trigger={<Button variant="outline" className="flex-1">
                        <ThreeDotsIcon className="w-4 h-4 mr-2" />
                        Opcoes
                    </Button>}
                />
            </div>

            <BottomSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                title="Detalhes do Cliente"
            >
                <div className="pt-2">
                    <CustomerCard
                        chrome="minimal"
                        customer={order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null)}
                        address={order.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order.customers?.addresses?.[0] || (order.delivery_address ? parseAddressString(order.delivery_address) : null)}
                        billingAddress={order.customers?.addresses?.find((a: any) => a.address_type === "billing")}
                    />
                </div>
            </BottomSheet>

            <BottomSheet
                isOpen={isStepsSheetOpen}
                onClose={() => setIsStepsSheetOpen(false)}
                title="Status do Pedido"
            >
                <div className="space-y-0 my-4 px-2">
                    {timelineSteps.map((step, idx) => {
                        const isLastFailed = order.delivery_status === "delivery_failed" && idx === timelineSteps.length - 1;
                        return (
                            <div key={idx} className="relative pl-6 pb-6 border-l-2 border-brand-border dark:border-dark-border last:border-l-transparent">
                                <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isLastFailed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
                                    {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>}
                                </div>
                                <div className="flex flex-col text-left">
                                    <span className={`text-sm font-semibold ${step.active ? (isLastFailed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
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
                        );
                    })}
                </div>
            </BottomSheet>

            {printModalOrderId && (
                <SaleReceiptPrintModal
                    isOpen={!!printModalOrderId}
                    onClose={() => setPrintModalOrderId(null)}
                    orderId={printModalOrderId}
                />
            )}
        </>
    )
}
