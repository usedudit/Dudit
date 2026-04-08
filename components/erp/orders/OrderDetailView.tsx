"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
    ChevronLeftIcon,
    ClockIcon,
    EditIcon,
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
import { getOrderDetailsAction, getOrderHistoryAction } from "@/app/actions/erp/orders"
import { OrderHistoryTab } from "./OrderHistoryTab"
import { useNotification } from "@/hooks/use-notification"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDateTime, formatTime, formatDayMonth } from "@/lib/utils"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"

interface OrderDetailViewProps {
    orderId: string
    partnerId: string
    onBack: () => void
    onEditOrder: (order: any) => void
    initialOrder?: any
}

export default function OrderDetailView({ orderId, partnerId, onBack, onEditOrder, initialOrder }: OrderDetailViewProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [order, setOrder] = useState<any>(initialOrder || null)
    const [loading, setLoading] = useState(!initialOrder)
    const [activeTab, setActiveTab] = useState("summary")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const { error: notifyError } = useNotification()

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    useEffect(() => {
        async function load() {
            if (!initialOrder) setLoading(true)
            const res = await getOrderDetailsAction(orderId, partnerId)
            if (res.success) {
                setOrder(res.data)
            } else if (!initialOrder) {
                notifyError("Erro", res.error)
                onBack()
            }
            setLoading(false)
        }
        load()
    }, [orderId, partnerId, initialOrder, notifyError, onBack])

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
    const deliveryStatus = getDeliveryStatusMeta(order.delivery_status)

    const getTimelineSteps = (status: string) => {
        const baseDate = formatDayMonth(order.created_at)
        const baseTime = formatTime(order.created_at)

        const steps = [
            { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
            { label: "Preparando", date: baseDate, time: "", active: ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(status) },
            { label: "Enviado", date: "", time: "", active: ["sent", "delivered", "delivery_failed"].includes(status) },
            { label: "Entregue", date: "", time: "", active: ["delivered"].includes(status), isFinal: true }
        ]

        if (status === "pickup_available") {
            steps[3].label = "Disponível"
        } else if (status === "delivery_failed") {
            steps[3].label = "Falha na entrega"
            steps[3].active = true
        } else if (status === "delivered") {
            steps[3].active = true
        }

        return steps
    }

    const timelineSteps = getTimelineSteps(order.delivery_status)

    const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px]">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right">{value}</div>
        </div>
    )

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
            >
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
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
                                    <Badge variant={deliveryStatus.variant}>
                                        {deliveryStatus.label}
                                    </Badge>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Criado em {formatDateTime(order.created_at)} • {order.order_source || "Manual"}
                                </div>
                            </div>

                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                <ActionsDropdown
                                    onPrint={() => window.print()}
                                    onShare={() => { }}
                                    onDelete={() => { }}
                                />

                                <Button onClick={() => onEditOrder(order)} className="whitespace-nowrap">
                                    <EditIcon className="w-[18px] h-[18px] mr-2" />
                                    Editar Venda
                                </Button>
                            </div>
                        </div>

                        {/* Tabs Navigation */}
                        <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <TabsList className="px-0 border-b-0">
                                    <TabsTrigger value="summary">Resumo</TabsTrigger>
                                    <TabsTrigger value="history">Histórico</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsContent value="summary" className="mt-0">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                        <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Local:</span>
                                                    <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                        {order.stores?.name || "Loja Dudit"}
                                                    </div>
                                                </div>
                                                <div className="hidden md:flex items-center gap-2">
                                                    <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
                                                    <Badge variant={deliveryStatus.variant}>{deliveryStatus.label}</Badge>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                            <div className="relative px-4">
                                                <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                    <div
                                                        className={`absolute left-0 h-full rounded-full transition-all duration-500 ${order.delivery_status === "delivery_failed" ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                                        style={{ width: `${(timelineSteps.filter((s) => s.active).length - 1) * 33.33}%` }}
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
                                                <div key={item.id} className="flex items-start gap-4 p-3">
                                                    <div className="w-16 h-16 overflow-hidden flex-shrink-0">
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

                                        <div className="flex items-center justify-between mb-4 pb-3">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Detalhes do Pagamento</h3>
                                            <div className="flex items-center gap-2">
                                                <Badge variant={paymentStatus.variant}>{paymentStatus.label}</Badge>
                                                <Badge variant={deliveryStatus.variant}>{deliveryStatus.label}</Badge>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <PaymentRow
                                                label="Método de Pagamento"
                                                value={(() => {
                                                    const m = order.payment_method?.toLowerCase() || ""
                                                    let brand = ""
                                                    if (m.includes("visa")) brand = "VISA"
                                                    else if (m.includes("master")) brand = "MASTERCARD"
                                                    else if (m.includes("elo")) brand = "ELO"
                                                    else if (m.includes("hiper")) brand = "HIPERCARD"
                                                    else if (m.includes("pix")) brand = "PIX"
                                                    else if (m.includes("dinheiro")) brand = "DINHEIRO"

                                                    if (brand === "PIX") return <div className="flex items-center gap-2"><div className="border border-brand-border dark:border-dark-border px-1.5 py-0.5 rounded bg-white dark:bg-dark-surface text-[10px] font-bold text-teal-600 dark:text-teal-400">PIX</div> <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">Pagamento Instantâneo</span></div>
                                                    if (brand === "DINHEIRO") return <div className="flex items-center gap-2"><div className="border border-brand-border dark:border-dark-border px-1.5 py-0.5 rounded bg-white dark:bg-dark-surface text-[10px] font-bold text-green-600 dark:text-green-400">CASH</div> <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">Dinheiro</span></div>
                                                    if (brand) return <div className="flex items-center gap-2"><div className="border border-brand-border dark:border-dark-border px-1.5 py-0.5 rounded bg-white dark:bg-dark-surface text-[10px] font-bold text-blue-800 dark:text-blue-400">{brand}</div> <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{order.payment_method}</span></div>
                                                    return <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{order.payment_method || "Não informado"}</span>
                                                })()}
                                            />

                                            <PaymentRow
                                                label="Subtotal"
                                                value={`${order.order_items?.length || 0} itens · ${formatCurrency(order.total_amount - (order.shipping_cost || 0) - (order.additional_costs || 0) + (order.discount_value || 0))}`}
                                            />

                                            <PaymentRow
                                                label="Tipo de Entrega"
                                                value={
                                                    <div className="text-right">
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                            {order.delivery_type === "pickup" ? "Retirada no Balcão" : "Entrega no Endereço"}
                                                        </span>
                                                        <div className="text-brand-inactive-text dark:text-dark-body font-bold text-[11px]">
                                                            ({formatCurrency(order.shipping_cost || 0)})
                                                        </div>
                                                    </div>
                                                }
                                            />

                                            {Number(order.additional_costs || 0) > 0 && (
                                                <PaymentRow
                                                    label="Custos Adicionais"
                                                    value={formatCurrency(order.additional_costs)}
                                                />
                                            )}

                                            {Number(order.discount_value || 0) > 0 && (
                                                <PaymentRow
                                                    label="Desconto"
                                                    value={<span className="text-brand-red font-bold">- {formatCurrency(order.discount_value)}</span>}
                                                />
                                            )}

                                            <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                                <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(order.total_amount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                    {order.notes && (
                                        <InfoCard
                                            title="Observações do Pedido"
                                            message={order.notes}
                                            color="orange"
                                        />
                                    )}

                                    <CustomerCard
                                        customer={order.customers || (order.customer_name ? { name: order.customer_name, email: order.buyer_email || null, phone: null } : null)}
                                        address={order.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || order.customers?.addresses?.[0] || (order.delivery_address ? { street: order.delivery_address } : null)}
                                        billingAddress={order.customers?.addresses?.find((a: any) => a.address_type === "billing")}
                                    />

                                    <div className="bg-[#EFFAF5] dark:bg-green-900/10 rounded-2xl p-5 border border-green-100 dark:border-green-900/30">
                                        <h4 className="text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-widest mb-2 font-body">Responsável pela Venda</h4>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-700 dark:text-green-400">
                                                <ClockIcon size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{order.seller_name || "Venda Automática"}</span>
                                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body">Operador no ERP</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="mt-0">
                            <OrderHistoryTab entries={historyEntries} loading={historyLoading} />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                <ActionsDropdown
                    onPrint={() => window.print()}
                    onShare={() => { }}
                    onDelete={() => { }}
                    trigger={
                        <Button
                            variant="outline"
                            className="flex-1"
                        >
                            <ThreeDotsIcon className="w-4 h-4 mr-2" />
                            Opções
                        </Button>
                    }
                />
                <Button onClick={() => onEditOrder(order)} className="flex-1 whitespace-nowrap">
                    <EditIcon className="w-4 h-4 mr-2" />
                    Editar Venda
                </Button>
            </div>
        </div>
    )
}
