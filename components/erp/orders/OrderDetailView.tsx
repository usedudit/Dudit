"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
    ChevronLeftIcon,
    ThreeDotsIcon
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
    TabsTrigger
} from "@/components/reusable"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { getOrderDetailsAction, getOrderHistoryAction } from "@/app/actions/erp/orders"
import { OrderHistoryTab } from "./OrderHistoryTab"
import { useNotification } from "@/hooks/use-notification"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDateTime, formatTime, formatDayMonth } from "@/lib/utils"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { FadeIn } from "@/components/animations/FadeIn"

interface OrderDetailViewProps {
    orderId: string
    partnerId: string
    onBack: () => void
    onEditOrder: (order: any) => void
    onUpdateDeliveryStatus: (order: any) => void
    onCancelOrder: (order: any) => void
    onOpenNotes: (order: any) => void
    initialOrder?: any
}

export default function OrderDetailView({ orderId, partnerId, onBack, onEditOrder, onUpdateDeliveryStatus, onCancelOrder, onOpenNotes, initialOrder }: OrderDetailViewProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [order, setOrder] = useState<any>(initialOrder || null)
    const [loading, setLoading] = useState(!initialOrder)
    const [activeTab, setActiveTab] = useState("summary")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
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
    const paymentMethodLabel = `${order.payment_method || "Nao informado"}${pendingSuffix}`
    const paymentBreakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
        ? order.payment_breakdown.filter((entry: any) => entry?.method)
        : Number(order.paid_amount || 0) > 0 && order.payment_method
            ? [{ method: order.payment_method, amount: Number(order.paid_amount || 0) }]
            : []
    const itemCount = Number(order.order_items?.length || 0)
    const itemsLabel = itemCount === 1 ? "1 item" : `${itemCount} itens`
    const subtotalValue = Number(order.subtotal_value || 0) > 0
        ? Number(order.subtotal_value || 0)
        : Number(order.total_amount || 0) - Number(order.shipping_cost || 0) - Number(order.additional_costs || 0) + Number(order.discount_value || 0)
    const couponDiscountAmount = Math.max(0, Number(order.coupon_discount_amount || 0))
    const paymentMethodDiscountAmount = Math.max(0, Number(order.payment_method_discount_amount || 0))
    const paymentMethodExtraAmount = Math.max(0, Number(order.payment_method_extra_amount || 0))
    const cleanNotes = String(order.notes || "").replace(/\n*Pedido cancelado por:[\s\S]*$/, "").trim()
    const cancelNote = (String(order.notes || "").match(/Pedido cancelado por:[\s\S]*$/)?.[0] || "").trim()
    const changeAmount = Math.max(0, Number(order.paid_amount || 0) - Number(order.total_amount || 0))
    const canEdit = order.situation !== "cancelled"
    const isPickupOrder = order.delivery_type === "pickup" || Number(order.shipping_cost || 0) <= 0
    const timelineDate = (isActive: boolean) => {
        if (!isActive) return { date: "", time: "" }
        const when = order.updated_at || order.created_at
        return { date: formatDayMonth(when), time: formatTime(when) }
    }

    const getTimelineSteps = (status: string) => {
        const baseDate = formatDayMonth(order.created_at)
        const baseTime = formatTime(order.created_at)
        if (order.situation === "cancelled") {
            const cancelledAt = order.updated_at || order.created_at
            return [
                { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
                { label: "Cancelado", date: formatDayMonth(cancelledAt), time: formatTime(cancelledAt), active: true },
            ]
        }

        if (isPickupOrder) {
            const pickedUp = ["delivered", "pickup_available"].includes(status)
            const pickedMeta = timelineDate(pickedUp)
            return [
                { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
                { label: "Pedido Retirado", date: pickedMeta.date, time: pickedMeta.time, active: pickedUp },
            ]
        }

        const preparingActive = ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(status)
        const sentActive = ["sent", "delivered", "delivery_failed", "pickup_available"].includes(status)
        const finalActive = ["delivered", "pickup_available", "delivery_failed"].includes(status)
        const preparingMeta = timelineDate(preparingActive)
        const sentMeta = timelineDate(sentActive)
        const finalMeta = timelineDate(finalActive)

        return [
            { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
            { label: "Preparando", date: preparingMeta.date, time: preparingMeta.time, active: preparingActive },
            { label: status === "pickup_available" ? "Disponível para retirada" : "Enviado", date: sentMeta.date, time: sentMeta.time, active: sentActive },
            { label: status === "delivery_failed" ? "Entrega não realizada" : "Entregue", date: finalMeta.date, time: finalMeta.time, active: finalActive }
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
        <FadeIn>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="hidden md:inline truncate">{pageTitle}</span>
                                        <Badge variant={paymentStatus.variant}>
                                            {paymentStatus.label}
                                        </Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Criado em {formatDateTime(order.created_at)} • {order.order_source || "Manual"}
                                    </div>
                                </div>

                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <ActionsDropdown
                                        onEdit={canEdit ? () => onEditOrder(order) : undefined}
                                        onCancel={order.situation === "cancelled" ? () => onOpenNotes(order) : () => onCancelOrder(order)}
                                        cancelLabel={order.situation === "cancelled" ? "Observação" : "Cancelar"}
                                    >
                                        {order.situation !== "cancelled" && (
                                            <DropdownItem onClick={() => onUpdateDeliveryStatus(order)}>
                                                Alterar status de entrega
                                            </DropdownItem>
                                        )}
                                    </ActionsDropdown>
                                </div>
                            </div>

                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="summary">Dados gerais</TabsTrigger>
                                    <TabsTrigger value="history">Histórico</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsContent value="summary" className="mt-0">
                                <FadeIn key="summary">
                                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
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

                                                            {timelineSteps.map((step, idx) => (
                                                                <div key={idx} className="relative flex flex-col items-center">
                                                                    <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                                        <span className={`text-xs font-medium ${step.active ? (order.delivery_status === "delivery_failed" && idx === 3 ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}>
                                                                            {step.label}
                                                                        </span>
                                                                    </div>
                                                                    <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (order.delivery_status === "delivery_failed" && idx === 3 ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}>
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
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-8">
                                                <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Itens do Pedido</h3>
                                                <div className="space-y-4">
                                                    {(order.order_items || []).map((item: any) => (
                                                        <div key={item.id} className="flex items-start gap-4">
                                                            <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                <img
                                                                    src={getR2ImageUrl(item.image, "thumbnail")}
                                                                    className="w-full h-full object-cover rounded-xl"
                                                                    alt={item.product_name}
                                                                    onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.product_name || "Produto sem nome"}</h4>
                                                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(item.subtotal || item.product_price * item.quantity)}</span>
                                                                </div>
                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku || "N/A"}</div>
                                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                                                    <span>{item.quantity} un. • {formatCurrency(item.product_price)} / un.</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-8">
                                                <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Detalhes do Pagamento</h3>
                                                </div>

                                                <div className="space-y-3">
                                                    <PaymentRow
                                                        label="Método de Pagamento"
                                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{paymentMethodLabel}</span>}
                                                    />

                                                    {paymentBreakdown.length > 1 && (
                                                        <PaymentRow
                                                            label="Valores por meio"
                                                            value={
                                                                <div className="flex flex-col gap-1">
                                                                    {paymentBreakdown.map((entry: any, index: number) => (
                                                                        <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                            {entry.method}: {formatCurrency(entry.amount || 0)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            }
                                                        />
                                                    )}

                                                    <PaymentRow label="Subtotal" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{`${itemsLabel} • ${formatCurrency(subtotalValue)}`}</span>} />

                                                    <PaymentRow
                                                        label="Tipo de Entrega"
                                                        value={
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                                {order.delivery_type === "pickup" ? "Retirada no local" : "Entrega no endereco"} •{" "}
                                                                <span className={Number(order.shipping_cost || 0) <= 0 ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"}>
                                                                    {Number(order.shipping_cost || 0) <= 0 ? "Grátis" : formatCurrency(order.shipping_cost || 0)}
                                                                </span>
                                                            </span>
                                                        }
                                                    />

                                                    {Number(order.additional_costs || 0) > 0 && (
                                                        <PaymentRow label="Custos Adicionais" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(order.additional_costs)}</span>} />
                                                    )}

                                                    {Number(order.discount_value || 0) > 0 && (
                                                        <PaymentRow
                                                            label="Desconto"
                                                            value={<span className="text-brand-red font-bold">- {formatCurrency(order.discount_value)}</span>}
                                                        />
                                                    )}
                                                    {couponDiscountAmount > 0 && (
                                                        <PaymentRow
                                                            label="Desconto por cupom"
                                                            value={<span className="text-brand-red font-bold">- {formatCurrency(couponDiscountAmount)}</span>}
                                                        />
                                                    )}
                                                    {paymentMethodDiscountAmount > 0 && (
                                                        <PaymentRow
                                                            label="Desconto por método de pagamento"
                                                            value={<span className="text-brand-red font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>}
                                                        />
                                                    )}
                                                    {paymentMethodExtraAmount > 0 && (
                                                        <PaymentRow
                                                            label="Acréscimo do método de pagamento"
                                                            value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(paymentMethodExtraAmount)}</span>}
                                                        />
                                                    )}
                                                    {changeAmount > 0.009 && (
                                                        <PaymentRow
                                                            label="Troco"
                                                            value={<span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{formatCurrency(changeAmount)}</span>}
                                                        />
                                                    )}

                                                    <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                                        <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                            {hasPendingPayment && (
                                                <InfoCard
                                                    title="Valor ainda em aberto"
                                                    message={`Falta receber ${formatCurrency(remainingPaymentAmount)} para quitar este pedido.`}
                                                    color="orange"
                                                />
                                            )}

                                            {(cleanNotes || cancelNote) && (
                                                <InfoCard
                                                    title="Observações do Pedido"
                                                    message={[cleanNotes, cancelNote].filter(Boolean).join("\n")}
                                                    color="orange"
                                                />
                                            )}

                                            <CustomerCard
                                                customer={order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null)}
                                                address={order.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order.customers?.addresses?.[0] || (order.delivery_address ? { street: order.delivery_address } : null)}
                                                billingAddress={order.customers?.addresses?.find((a: any) => a.address_type === "billing")}
                                            />
                                        </div>
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

                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                    <ActionsDropdown
                        onEdit={canEdit ? () => onEditOrder(order) : undefined}
                        onCancel={order.situation === "cancelled" ? () => onOpenNotes(order) : () => onCancelOrder(order)}
                        cancelLabel={order.situation === "cancelled" ? "Observação" : "Cancelar"}
                        trigger={
                            <Button variant="outline" className="flex-1">
                                <ThreeDotsIcon className="w-4 h-4 mr-2" />
                                Opcoes
                            </Button>
                        }
                    >
                        {order.situation !== "cancelled" && (
                            <DropdownItem onClick={() => onUpdateDeliveryStatus(order)}>
                                Alterar status de entrega
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
                </div>
            </Tabs>
        </FadeIn>
    )
}
