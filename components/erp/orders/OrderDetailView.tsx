"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
    ChevronLeftIcon,
    ThreeDotsIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    XIcon,
    ClockIcon,
    MoneyIcon
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
    ListItem,
    FormSection,
    Pagination
} from "@/components/reusable"
import { usePermissions } from "@/lib/permission-context"

import { getOrderDetailsAction, getOrderHistoryAction } from "@/app/actions/erp/orders"
import { getOrderDeliverySummaryAction } from "@/app/actions/erp/deliveries"
import { OrderHistoryTab } from "./OrderHistoryTab"
import { OrderAttachmentsTab } from "./OrderAttachmentsTab"
import { useNotification } from "@/hooks/use-notification"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDateTime, formatTime, formatDayMonth, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { useStore } from "@/lib/store-context"
import { parseAddressString } from "./CreateOrder"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import BottomSheet from "@/components/BottomSheet"
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal"
import { getOrderFinancialBreakdownAction } from "@/app/actions/erp/order-financial-breakdown"
import type { FinancialBreakdownData } from "@/app/actions/erp/order-financial-breakdown"

const formatProductQuantity = (qty: number, unit?: string | null) => {
    return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    return formatUnitPriceWithUnit(price, unit);
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

const getReturnStatusMeta = (status: string) => {
    switch (status) {
        case "PENDING_REVIEW":
            return { label: "Pendente", variant: "orange" as const }
        case "UNDER_ANALYSIS":
            return { label: "Em análise", variant: "blue" as const }
        case "WAITING_CUSTOMER":
            return { label: "Aguardando cliente", variant: "purple" as const }
        case "WAITING_ITEM_RETURN":
            return { label: "Aguardando devolução", variant: "purple" as const }
        case "APPROVED":
            return { label: "Aprovada", variant: "green" as const }
        case "REJECTED":
            return { label: "Recusada", variant: "red" as const }
        case "PROCESSING":
            return { label: "Processando", variant: "blue" as const }
        case "RESOLVED":
            return { label: "Concluída", variant: "green" as const }
        case "EXPIRED":
            return { label: "Expirada", variant: "red" as const }
        case "ESCALATED":
            return { label: "Escalada", variant: "red" as const }
        default:
            return { label: "Pendente", variant: "orange" as const }
    }
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
    const [showFinancialBreakdown, setShowFinancialBreakdown] = useState(false)
    const [financialData, setFinancialData] = useState<FinancialBreakdownData | null>(null)
    const [financialLoading, setFinancialLoading] = useState(false)
    const ITEMS_PER_PAGE = 8
    const [itemPage, setItemPage] = useState(1)
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
            try {
                // Only show loading spinner if we have NO data at all
                if (!initialOrder) setLoading(true)

                const res = await getOrderDetailsAction(orderId, partnerId)
                if (!mounted) return

                if (res && 'success' in res && res.success) {
                    setOrder(res.data)
                } else {
                    const errorMsg = res && 'error' in res && typeof res.error === 'string' ? res.error : "Erro ao carregar detalhes do pedido"
                    console.error("[OrderDetailView] error loading order details:", errorMsg)
                    if (!initialOrder) {
                        notifyError("Erro", errorMsg)
                        onBack()
                    }
                }
            } catch (err: any) {
                console.error("[OrderDetailView] failed to fetch order details:", err)
                if (!initialOrder) {
                    notifyError("Erro", err?.message || "Erro desconhecido")
                    onBack()
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        load()
        return () => { mounted = false }
    }, [orderId, partnerId, initialOrder, notifyError, onBack])

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

    const loadFinancialBreakdown = useCallback(async () => {
        if (financialData) {
            setShowFinancialBreakdown(prev => !prev)
            return
        }
        setFinancialLoading(true)
        const res = await getOrderFinancialBreakdownAction(orderId, partnerId)
        if (res.success) {
            setFinancialData(res.data)
            setShowFinancialBreakdown(true)
        } else {
            notifyError("Erro", res.error || "Erro ao carregar dados financeiros")
        }
        setFinancialLoading(false)
    }, [orderId, partnerId, financialData, notifyError])

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

    const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
    const paymentEntry = breakdown.find((e: any) => e?.method && !e?.checkoutPricing);
    const installmentCount = paymentEntry?.installmentNumber || 1;
    const mpLeg = breakdown.find((e: any) => String(e?.provider || "").toLowerCase().includes("mercado pago") || String(e?.method || "").toLowerCase().includes("mercado pago"));
    const mpPaymentStatus = mpLeg?.paymentStatus;
    const mpPaymentStatusDetail = mpLeg?.paymentStatusDetail;
    const mpTotalFeeAmount = mpLeg?.feeAmount;
    const mpFeeDetails: Array<{ type: string; amount: number; feePayer: string }> | undefined = mpLeg?.feeDetails;
    const mpNetReceivedAmount = mpLeg?.amountReceived;

    const getPaymentTypeLabel = () => {
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const breakdownMethod = breakdown.find((e: any) => e?.method)?.method;
        const rawMethod = breakdownMethod || order.payment_method;

        let label = formatPaymentMethodLabel(rawMethod, null);
        if (!label) label = "Não informado";

        if (installmentCount && installmentCount > 1) {
            label = `${label} - ${installmentCount}x`;
        }
        if (order.payment_provider === "Mercado Pago") {
            if (!label.toLowerCase().includes("mercado pago") && !label.toLowerCase().includes("mercadopago")) {
                return `${label} (Mercado Pago)`;
            }
        }
        return label;
    };
    const paymentMethodLabel = `${getPaymentTypeLabel()}${pendingSuffix}`
    const isMercadoPago = order.payment_provider === "Mercado Pago";
    const getPaymentIcon = () => {
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const breakdownMethod = breakdown.find((e: any) => e?.method)?.method;
        const subMethod = String(breakdownMethod || order.payment_method || "").toLowerCase();

        const icons: React.ReactNode[] = [];
        if (isMercadoPago) {
            icons.push(
                <img key="mp" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />
            );
        }

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
            icons.push(
                <img key="sub" src={`https://img.dudit.com.br/static/icons/payments/${iconName}`} alt="Sub method" className="w-5 h-5 object-contain shrink-0" />
            );
        } else if (!isMercadoPago) {
            icons.push(
                <span key="default" className="text-brand-dark dark:text-dark-heading shrink-0 text-sm">💳</span>
            );
        }

        return <div className="flex items-center gap-1">{icons}</div>;
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
                    color: "text-brand-inactive-text dark:text-dark-body",
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
        const formattedLabel = getPaymentTypeLabel();

        return (
            <div className="flex items-center gap-2 flex-wrap text-sm">
                <div className="flex items-center gap-2">
                    <div className={`${isMercadoPago ? "w-auto px-1.5" : "w-4"} h-4 flex items-center justify-center overflow-hidden shrink-0`}>
                        {getPaymentIcon()}
                    </div>
                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                        {formattedLabel}
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
    const totalItemPages = Math.ceil(sortedOrderItems.length / ITEMS_PER_PAGE)
    const paginatedItems = sortedOrderItems.slice((itemPage - 1) * ITEMS_PER_PAGE, itemPage * ITEMS_PER_PAGE)
    useEffect(() => { setItemPage(1) }, [sortedOrderItems.length])
    const itemsLabel = itemCount === 1 ? "1 item" : `${itemCount} itens`
    const couponDiscountAmount = Math.max(0, Number(order.coupon_discount_amount || 0))
    const paymentMethodDiscountAmount = Math.max(0, Number(order.payment_method_discount_amount || 0))
    const paymentMethodExtraAmount = Math.max(0, Number(order.payment_method_extra_amount || 0))

    const hasDetailedAmounts = paymentBreakdown.some((e: any) => e.interestAmount !== undefined || e.feeAmount !== undefined || e.fixedFeeAmount !== undefined)

    const detailedInterestAmount = hasDetailedAmounts
        ? paymentBreakdown.reduce((sum: number, e: any) => sum + Number(e.interestAmount || 0), 0)
        : paymentMethodExtraAmount
    const detailedFeeAmount = hasDetailedAmounts
        ? paymentBreakdown.reduce((sum: number, e: any) => sum + Number(e.feeAmount || 0), 0)
        : 0
    const detailedFixedFeeAmount = hasDetailedAmounts
        ? paymentBreakdown.reduce((sum: number, e: any) => sum + Number(e.fixedFeeAmount || 0), 0)
        : 0
    const subtotalValue = Number(order.subtotal_value || 0) > 0
        ? Number(order.subtotal_value || 0)
        : Number(order.total_amount || 0) - Number(order.delivery_fee || 0) - Number(order.additional_costs || 0) + Number(order.discount_value || 0) + couponDiscountAmount + paymentMethodDiscountAmount - paymentMethodExtraAmount
    const changeAmount = Math.max(0, Number(order.paid_amount || 0) - Number(order.total_amount || 0))
    const cashEntry = Array.isArray(order.payment_breakdown)
        ? order.payment_breakdown.find((entry: any) => {
            const m = String(entry?.method || "").toLowerCase().trim();
            return m === "cash" || m === "dinheiro";
        })
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

    const isMarketplaceOrder = order.order_source === "Marketplace" || order.order_source === "Online Store" || order.order_source === "Vitrine Online"

    const itemsBaseSubtotal = (sortedOrderItems || []).reduce(
        (sum: number, item: any) => sum + Number(item.subtotal || item.product_price * item.quantity || 0), 0
    )
    const hasItemDiscount = isMarketplaceOrder && itemsBaseSubtotal > 0 && subtotalValue > 0 && Math.abs(itemsBaseSubtotal - subtotalValue) > 0.005
    const itemDiscountRatio = hasItemDiscount ? subtotalValue / itemsBaseSubtotal : 1

    const getItemDiscountedPrice = (item: any) => {
        const basePrice = Number(item.product_price || 0)
        if (item.is_gift || item.is_promotional) return basePrice
        if (!hasItemDiscount) return basePrice
        const discounted = basePrice * itemDiscountRatio
        return Math.round(discounted * 100) / 100
    }

    // Detect if order has services vs products for dynamic timeline labels
    const orderItems = order.order_items || []
    const hasOnlyServices = order.order_source === "admin_service_order" || (orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking"))
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
                                                    <Badge variant="purple" icon={<MoneyIcon />}>
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
                                                onDeliveryStatus={(order.situation !== "cancelled" && !hasOnlyServices) ? () => onUpdateDeliveryStatus(order) : undefined}
                                                cancelLabel={order.situation === "cancelled" ? "Observação" : "Cancelar"}
                                            />
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="summary">Dados gerais</TabsTrigger>
                                            <TabsTrigger value="history">Histórico</TabsTrigger>
                                            <TabsTrigger value="attachments">Anexos</TabsTrigger>
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
                                                                        {order.order_source === "Marketplace" ? "Origem da venda:" : "Responsável pela venda:"}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                        {order.order_source === "Marketplace"
                                                                            ? (order.order_source || "Marketplace")
                                                                            : (order.seller_name || "Não informado")}
                                                                    </div>
                                                                </div>
                                                                {order.order_source !== "Marketplace" && (
                                                                    <div className="hidden md:block text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                                                        Origem da venda: <strong className="text-brand-dark dark:text-dark-heading">{order.order_source || "Manual"}</strong>
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

                                                    <FormSection title="Itens do Pedido" hasSeparator className="mb-8">
                                                        <div className="space-y-4">
                                                            {paginatedItems.map((item: any) => {
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
                                                                                    {(() => {
                                                                                        const displayPrice = getItemDiscountedPrice(item)
                                                                                        const basePrice = Number(item.product_price || 0)
                                                                                        const displaySubtotal = displayPrice * Number(item.quantity || 1)
                                                                                        if (item.is_gift) {
                                                                                            return (
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                                </div>
                                                                                            )
                                                                                        }
                                                                                        if (hasItemDiscount) {
                                                                                            return (
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.subtotal || basePrice * item.quantity)}</span>
                                                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(displaySubtotal)}</span>
                                                                                                </div>
                                                                                            )
                                                                                        }
                                                                                        return formatCurrency(item.subtotal || basePrice * item.quantity)
                                                                                    })()}
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
                                                                                    {(() => {
                                                                                        const displayPrice = getItemDiscountedPrice(item)
                                                                                        const basePrice = Number(item.product_price || 0)
                                                                                        if (item.is_gift) {
                                                                                            return (
                                                                                                <span className="flex items-center gap-1.5 inline-flex">
                                                                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                                </span>
                                                                                            )
                                                                                        }
                                                                                        if (hasItemDiscount) {
                                                                                            return (
                                                                                                <span className="flex items-center gap-1.5 inline-flex">
                                                                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                                                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                                                                </span>
                                                                                            )
                                                                                        }
                                                                                        return formatProductUnitPrice(basePrice, item.products?.unit)
                                                                                    })()}
                                                                                </span>
                                                                            </div>

                                                                            {/* Return History for this item */}
                                                                            {(() => {
                                                                                const itemReturns = (order.return_requests || []).flatMap((rr: any) => {
                                                                                    const matchingItems = (rr.return_items || []).filter((ri: any) => ri.order_item_id === item.id);
                                                                                    return matchingItems.map((ri: any) => ({
                                                                                        ...ri,
                                                                                        requestStatus: rr.status,
                                                                                        requestId: rr.id,
                                                                                        createdAt: rr.created_at || rr.returnDate,
                                                                                    }));
                                                                                });

                                                                                if (itemReturns.length === 0) return null;

                                                                                return (
                                                                                    <div className="mt-3 p-3 bg-brand-gray/40 dark:bg-dark-border/20 rounded-xl border border-brand-border/40 dark:border-dark-border/40 space-y-2">
                                                                                        <h5 className="text-[11px] font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1">
                                                                                            <span>🔄 Histórico de Devolução / Troca</span>
                                                                                        </h5>
                                                                                        <div className="divide-y divide-brand-border/30 dark:divide-dark-border/10">
                                                                                            {itemReturns.map((ret: any, idx: number) => {
                                                                                                const statusMeta = getReturnStatusMeta(ret.requestStatus);
                                                                                                return (
                                                                                                    <div key={idx} className="py-1.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <span className="font-medium text-brand-inactive-text">
                                                                                                                Qtd: <strong className="text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(ret.quantity, ret.unit)}</strong>
                                                                                                            </span>
                                                                                                            <span className="text-gray-300">&bull;</span>
                                                                                                            <span className="text-brand-inactive-text">Condição: {ret.condition === "sealed" || ret.condition === "lacrado" ? "Lacrado" : ret.condition === "damaged" || ret.condition === "danificado" ? "Danificado" : "Aberto"}</span>
                                                                                                            <span className="text-gray-300">&bull;</span>
                                                                                                            <span className="text-brand-inactive-text">Motivo: {ret.reason || "Não informado"}</span>
                                                                                                        </div>
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <span className="text-brand-inactive-text font-mono text-[10px] bg-white dark:bg-dark-surface px-1.5 py-0.5 rounded border border-brand-border/50">
                                                                                                                DVL-{ret.requestId.slice(0, 6).toUpperCase()}
                                                                                                            </span>
                                                                                                            <Badge variant={statusMeta.variant} className="scale-90 whitespace-nowrap">{statusMeta.label}</Badge>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </FormSection>

                                                    {totalItemPages > 1 && (
                                                        <div className="mt-2 mb-8">
                                                            <Pagination currentPage={itemPage} totalPages={totalItemPages} onPageChange={setItemPage} />
                                                        </div>
                                                    )}

                                                    <FormSection
                                                        title="Detalhes do Pagamento"
                                                        titleRight={
                                                            <button
                                                                onClick={loadFinancialBreakdown}
                                                                className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                                                            >
                                                                {financialLoading ? "Carregando..." : showFinancialBreakdown ? "Ocultar lucro líquido" : "Ver lucro líquido"}
                                                            </button>
                                                        }
                                                        hasSeparator>
                                                        <div className="space-y-3">
                                                            <PaymentRow
                                                                label="Método de Pagamento"
                                                                value={renderPaymentMethodValue()} />

                                                            {isMercadoPago && (
                                                                <>
                                                                    {mpPaymentStatus && (
                                                                        <PaymentRow
                                                                            label="Status do Pagamento (MP)"
                                                                            value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{mpPaymentStatus} {mpPaymentStatusDetail ? `(${mpPaymentStatusDetail})` : ""}</span>} />
                                                                    )}
                                                                    {installmentCount > 1 && (
                                                                        <PaymentRow
                                                                            label="Parcelas"
                                                                            value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{installmentCount}x</span>} />
                                                                    )}
                                                                    {mpTotalFeeAmount != null && (
                                                                        <PaymentRow
                                                                            label="Taxa do Mercado Pago"
                                                                            value={<span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">{formatCurrency(mpTotalFeeAmount)}</span>} />
                                                                    )}
                                                                    {Array.isArray(mpFeeDetails) && mpFeeDetails.length > 0 && mpFeeDetails.map((fd, i) => {
                                                                        const feeTypeLabel = fd.type === "mercadopago_fee" ? "Taxa MP"
                                                                            : fd.type === "installment_fee" ? "Taxa de Parcelamento"
                                                                            : fd.type === "coupon_fee" ? "Taxa de Cupom"
                                                                            : fd.type === "application_fee" ? "Taxa de Aplicação"
                                                                            : fd.type || `Taxa ${i + 1}`
                                                                        return (
                                                                            <PaymentRow
                                                                                key={i}
                                                                                label={feeTypeLabel}
                                                                                value={<span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">{formatCurrency(fd.amount)}</span>} />
                                                                        )
                                                                    })}
                                                                    {mpNetReceivedAmount != null && (
                                                                        <PaymentRow
                                                                            label="Valor Líquido Recebido"
                                                                            value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(mpNetReceivedAmount)}</span>} />
                                                                    )}
                                                                    {order.mp_date_approved && (
                                                                        <PaymentRow
                                                                            label="Data de Aprovação (MP)"
                                                                            value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{formatDateTime(order.mp_date_approved)}</span>} />
                                                                    )}
                                                                </>
                                                            )}

                                                            {paymentBreakdown.length > 1 && (
                                                                <PaymentRow
                                                                    label="Valores por meio"
                                                                    value={<div className="flex flex-col gap-1">
                                                                        {paymentBreakdown.map((entry: any, index: number) => (
                                                                            <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                                {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(entry.amount || 0)}
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
                                                                    label={
                                                                        order.payment_method === "exchange" ? "Crédito de troca" :
                                                                            order.payment_method === "store_credit" ? "Vale-compra" :
                                                                                "Desconto do Método"
                                                                    }
                                                                    value={<span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>} />
                                                            )}
                                                            {!hasDetailedAmounts && paymentMethodExtraAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Taxa do Método"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>} />
                                                            )}
                                                            {hasDetailedAmounts && detailedInterestAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Juros do Método"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedInterestAmount)}</span>} />
                                                            )}
                                                            {hasDetailedAmounts && detailedFeeAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Taxa do Método"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedFeeAmount)}</span>} />
                                                            )}
                                                            {hasDetailedAmounts && detailedFixedFeeAmount > 0 && (
                                                                <PaymentRow
                                                                    label="Custo do Método"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedFixedFeeAmount)}</span>} />
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

                                                    {showFinancialBreakdown && financialData && (
                                                        <FinancialBreakdownDisplay data={financialData} formatCurrency={formatCurrency} />
                                                    )}
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
                                                            color="blue" />
                                                    )}

                                                    <CustomerCard
                                                        customer={order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null)}
                                                        address={order.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order.customers?.addresses?.[0] || (order.delivery_address ? parseAddressString(order.delivery_address) : null)}
                                                        billingAddress={order.customers?.addresses?.find((a: any) => a.address_type === "billing")} />
                                                    {(() => {
                                                        const isPickup = order.delivery_type === "pickup"
                                                        const hasDelivery = deliverySummary && deliverySummary.id
                                                        if (!isPickup && !hasDelivery) return null
                                                        return (
                                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                                                                <div className="px-4 py-4 space-y-3">
                                                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {isPickup ? "Retirada" : "Entrega"}
                                                                    </h3>
                                                                    <div className="space-y-2 text-xs">
                                                                        {isPickup ? (
                                                                            <>
                                                                                <div className="flex justify-between">
                                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Tipo</span>
                                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">Retirada no local</span>
                                                                                </div>
                                                                                {hasDelivery && deliverySummary.status && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{deliverySummary.status}</span>
                                                                                    </div>
                                                                                )}
                                                                                {hasDelivery && deliverySummary.completedAt && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Retirada em</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatDateTime(deliverySummary.completedAt)}</span>
                                                                                    </div>
                                                                                )}
                                                                                {!hasDelivery && order.delivery_status && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{order.delivery_status}</span>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className="flex justify-between">
                                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Tipo</span>
                                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">Entrega no endereço</span>
                                                                                </div>
                                                                                {deliverySummary.deliveryNumber && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Nº Entrega</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">#{deliverySummary.deliveryNumber}</span>
                                                                                    </div>
                                                                                )}
                                                                                {deliverySummary.status && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Status</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{deliverySummary.status}</span>
                                                                                    </div>
                                                                                )}
                                                                                {deliverySummary.driverName && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Entregador</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{deliverySummary.driverName}</span>
                                                                                    </div>
                                                                                )}
                                                                                {deliverySummary.departureTime && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Saída</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatDateTime(deliverySummary.departureTime)}</span>
                                                                                    </div>
                                                                                )}
                                                                                {deliverySummary.completedAt && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Entrega</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatDateTime(deliverySummary.completedAt)}</span>
                                                                                    </div>
                                                                                )}
                                                                                {deliverySummary.routeStep && deliverySummary.orderCount && (
                                                                                    <div className="flex justify-between">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Rota</span>
                                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{deliverySummary.routeStep}/{deliverySummary.orderCount}</span>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}
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
                                                <FormSection title="Itens do Pedido" hasSeparator={false} className="mb-8">
                                                    <div className="space-y-4">
                                                        {paginatedItems.map((item: any) => {
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
                                                                                {(() => {
                                                                                    const displayPrice = getItemDiscountedPrice(item)
                                                                                    const basePrice = Number(item.product_price || 0)
                                                                                    const displaySubtotal = displayPrice * Number(item.quantity || 1)
                                                                                    if (item.is_gift) {
                                                                                        return (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                            </div>
                                                                                        )
                                                                                    }
                                                                                    if (hasItemDiscount) {
                                                                                        return (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.subtotal || basePrice * item.quantity)}</span>
                                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(displaySubtotal)}</span>
                                                                                            </div>
                                                                                        )
                                                                                    }
                                                                                    return formatCurrency(item.subtotal || basePrice * item.quantity)
                                                                                })()}
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
                                                                                {(() => {
                                                                                    const displayPrice = getItemDiscountedPrice(item)
                                                                                    const basePrice = Number(item.product_price || 0)
                                                                                    if (item.is_gift) {
                                                                                        return (
                                                                                            <span className="flex items-center gap-1.5 inline-flex">
                                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                            </span>
                                                                                        )
                                                                                    }
                                                                                    if (hasItemDiscount) {
                                                                                        return (
                                                                                            <span className="flex items-center gap-1.5 inline-flex">
                                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                                                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                                                            </span>
                                                                                        )
                                                                                    }
                                                                                    return formatProductUnitPrice(basePrice, item.products?.unit)
                                                                                })()}
                                                                            </span>
                                                                        </div>

                                                                        {/* Return History for this item */}
                                                                        {(() => {
                                                                            const itemReturns = (order.return_requests || []).flatMap((rr: any) => {
                                                                                const matchingItems = (rr.return_items || []).filter((ri: any) => ri.order_item_id === item.id);
                                                                                return matchingItems.map((ri: any) => ({
                                                                                    ...ri,
                                                                                    requestStatus: rr.status,
                                                                                    requestId: rr.id,
                                                                                    createdAt: rr.created_at || rr.returnDate,
                                                                                }));
                                                                            });

                                                                            if (itemReturns.length === 0) return null;

                                                                            return (
                                                                                <div className="mt-3 p-3 bg-brand-gray/40 dark:bg-dark-border/20 rounded-xl border border-brand-border/40 dark:border-dark-border/40 space-y-2">
                                                                                    <h5 className="text-[11px] font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1">
                                                                                        <span>🔄 Histórico de Devolução / Troca</span>
                                                                                    </h5>
                                                                                    <div className="divide-y divide-brand-border/30 dark:divide-dark-border/10">
                                                                                        {itemReturns.map((ret: any, idx: number) => {
                                                                                            const statusMeta = getReturnStatusMeta(ret.requestStatus);
                                                                                            return (
                                                                                                <div key={idx} className="py-1.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className="font-medium text-brand-inactive-text">
                                                                                                            Qtd: <strong className="text-brand-dark dark:text-dark-heading">{ret.quantity} un.</strong>
                                                                                                        </span>
                                                                                                        <span className="text-gray-300">&bull;</span>
                                                                                                        <span className="text-brand-inactive-text">Condição: {ret.condition === "sealed" || ret.condition === "lacrado" ? "Lacrado" : ret.condition === "damaged" || ret.condition === "danificado" ? "Danificado" : "Aberto"}</span>
                                                                                                        <span className="text-gray-300">&bull;</span>
                                                                                                        <span className="text-brand-inactive-text">Motivo: {ret.reason || "Não informado"}</span>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className="text-brand-inactive-text font-mono text-[10px] bg-white dark:bg-dark-surface px-1.5 py-0.5 rounded border border-brand-border/50">
                                                                                                            DVL-{ret.requestId.slice(0, 6).toUpperCase()}
                                                                                                        </span>
                                                                                                        <Badge variant={statusMeta.variant} className="scale-90 whitespace-nowrap">{statusMeta.label}</Badge>
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </FormSection>

                                                {totalItemPages > 1 && (
                                                    <div className="mt-2">
                                                        <Pagination currentPage={itemPage} totalPages={totalItemPages} onPageChange={setItemPage} inline />
                                                    </div>
                                                )}

                                                {/* 5. Detalhes do Pagamento */}
                                                <FormSection
                                                    title="Detalhes do Pagamento"
                                                    titleRight={
                                                        <button
                                                            onClick={loadFinancialBreakdown}
                                                            className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                                                        >
                                                            {financialLoading ? "Carregando..." : showFinancialBreakdown ? "Ocultar lucro líquido" : "Ver lucro líquido"}
                                                        </button>
                                                    }
                                                    hasSeparator={true} className="mt-0">
                                                    <div className="space-y-3">
                                                        <PaymentRow
                                                            label="Método de Pagamento"
                                                            value={renderPaymentMethodValue()} />

                                                        {isMercadoPago && (
                                                            <>
                                                                {order.mp_payment_status && (
                                                                    <PaymentRow
                                                                        label="Status do Pagamento (MP)"
                                                                        value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{order.mp_payment_status} {order.mp_payment_status_detail ? `(${order.mp_payment_status_detail})` : ""}</span>} />
                                                                )}
                                                                {order.mp_installments && order.mp_installments > 1 && (
                                                                    <PaymentRow
                                                                        label="Parcelas"
                                                                        value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{order.mp_installments}x</span>} />
                                                                )}
                                                                {order.mp_total_fee_amount != null && (
                                                                    <PaymentRow
                                                                        label="Taxa do Mercado Pago"
                                                                        value={<span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">{formatCurrency(order.mp_total_fee_amount)}</span>} />
                                                                )}
                                                                {order.mp_net_received_amount != null && (
                                                                    <PaymentRow
                                                                        label="Valor Líquido Recebido"
                                                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.mp_net_received_amount)}</span>} />
                                                                )}
                                                                {order.mp_date_approved && (
                                                                    <PaymentRow
                                                                        label="Data de Aprovação (MP)"
                                                                        value={<span className="text-brand-dark dark:text-dark-heading font-medium text-sm">{formatDateTime(order.mp_date_approved)}</span>} />
                                                                )}
                                                            </>
                                                        )}

                                                        {paymentBreakdown.length > 1 && (
                                                            <PaymentRow
                                                                label="Valores por meio"
                                                                value={<div className="flex flex-col gap-1">
                                                                    {paymentBreakdown.map((entry: any, index: number) => (
                                                                        <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                            {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(entry.amount || 0)}
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
                                                        {!hasDetailedAmounts && paymentMethodExtraAmount > 0 && (
                                                            <PaymentRow
                                                                label="Taxa do Método"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>} />
                                                        )}
                                                        {hasDetailedAmounts && detailedInterestAmount > 0 && (
                                                            <PaymentRow
                                                                label="Juros do Método"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedInterestAmount)}</span>} />
                                                        )}
                                                        {hasDetailedAmounts && detailedFeeAmount > 0 && (
                                                            <PaymentRow
                                                                label="Taxa do Método"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedFeeAmount)}</span>} />
                                                        )}
                                                        {hasDetailedAmounts && detailedFixedFeeAmount > 0 && (
                                                            <PaymentRow
                                                                label="Custo do Método"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(detailedFixedFeeAmount)}</span>} />
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

                                                {showFinancialBreakdown && financialData && (
                                                    <FinancialBreakdownDisplay data={financialData} formatCurrency={formatCurrency} />
                                                )}
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="history" className="mt-0">
                                        <FadeIn key="history">
                                            <OrderHistoryTab entries={historyEntries} loading={historyLoading} />
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="attachments" className="mt-0">
                                        <FadeIn key="attachments">
                                            <OrderAttachmentsTab orderId={order.id} partnerId={partnerId} />
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
                    onDeliveryStatus={(order.situation !== "cancelled" && !hasOnlyServices) ? () => onUpdateDeliveryStatus(order) : undefined}
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

function FinancialBreakdownDisplay({ data, formatCurrency }: { data: FinancialBreakdownData; formatCurrency: (v: number) => string }) {
    const Section = ({ section }: { section: FinancialBreakdownData["revenue"] }) => (
        <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1.5">{section.label}</h4>
            {section.lines.map((line, i) => (
                <div key={i} className="flex justify-between text-[13px]">
                    <span className="text-brand-inactive-text dark:text-dark-body">{line.label}</span>
                    <span className={`font-semibold ${line.value >= 0 ? "text-brand-dark dark:text-dark-heading" : "text-brand-red"}`}>
                        {line.value >= 0 ? formatCurrency(line.value) : `- ${formatCurrency(Math.abs(line.value))}`}
                    </span>
                </div>
            ))}
            {section.total != null && (
                <div className="flex justify-between text-[13px] font-bold pt-1.5 border-t border-brand-border/50 dark:border-dark-border/50 mt-1.5">
                    <span className="text-brand-dark dark:text-dark-heading">{section.label} total</span>
                    <span className={section.total >= 0 ? "text-brand-green" : "text-brand-red"}>
                        {section.total >= 0 ? formatCurrency(section.total) : `- ${formatCurrency(Math.abs(section.total))}`}
                    </span>
                </div>
            )}
        </div>
    )

    return (
        <div className="mt-4 mb-2 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl border border-brand-border/40 dark:border-dark-border/40 p-4 space-y-4 text-sm">
            <Section section={data.revenue} />

            <div className="border-t border-brand-border/50 dark:border-dark-border/50" />

            <Section section={data.discounts} />

            <div className="border-t border-brand-border/50 dark:border-dark-border/50" />

            <Section section={data.costs} />

            <div className="border-t-2 border-brand-border dark:border-dark-border" />

            <div className="space-y-1.5">
                <div className="flex justify-between text-[13px] font-bold pt-1">
                    <span className="text-brand-inactive-text dark:text-dark-body">Total das deduções</span>
                    <span className="text-brand-red">{formatCurrency(Math.abs(data.totalDeductions))}</span>
                </div>
            </div>

            <div className="border-t-2 border-brand-dark/20 dark:border-dark-heading/20" />

            <div className="space-y-1.5">
                <div className="flex justify-between text-sm font-bold">
                    <span className="text-brand-dark dark:text-dark-heading">Lucro líquido</span>
                    <span className={data.netProfit >= 0 ? "text-brand-green" : "text-brand-red"}>
                        {data.netProfit >= 0 ? formatCurrency(data.netProfit) : `- ${formatCurrency(Math.abs(data.netProfit))}`}
                    </span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-brand-inactive-text dark:text-dark-body">Margem líquida</span>
                    <span className={`font-bold ${data.netMargin >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                        {data.netMargin >= 0 ? `${data.netMargin.toFixed(2)}%` : `-${Math.abs(data.netMargin).toFixed(2)}%`}
                    </span>
                </div>
            </div>
        </div>
    )
}
