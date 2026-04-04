"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import {
    ChevronLeftIcon,
    ClockIcon,
    EditIcon,
    CreditCardIcon
} from "@/lib/icons"
import {
    Button,
    Badge,
    ActionsDropdown,
    ThreeDotsLoader,
    InfoCard,
    CustomerCard
} from "@/components/reusable"
import { getOrderDetailsAction } from "@/app/actions/erp/orders"
import { useNotification } from "@/hooks/use-notification"
import { useRouter } from "next/navigation"

interface OrderDetailViewProps {
    orderId: string
    partnerId: string
    onBack: () => void
    onEditOrder: (order: any) => void
}

export default function OrderDetailView({ orderId, partnerId, onBack, onEditOrder }: OrderDetailViewProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [order, setOrder] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    useEffect(() => {
        async function load() {
            setLoading(true)
            const res = await getOrderDetailsAction(orderId, partnerId)
            if (res.success) {
                setOrder(res.data)
            } else {
                notifyError("Erro", res.error)
                onBack()
            }
            setLoading(false)
        }
        load()
    }, [orderId, partnerId, onBack])

    if (loading) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface min-h-[400px]"><ThreeDotsLoader /></div>
    if (!order) return null

    const pageTitle = `Pedido ${order.order_number}`

    const getStatusInfo = (s: string) => {
        switch (s) {
            case 'paid': return { label: 'Pago', variant: 'green' as const, color: 'bg-green-500' }
            case 'partially_paid': return { label: 'Parcialmente Pago', variant: 'orange' as const, color: 'bg-yellow-500' }
            case 'cancelled': return { label: 'Cancelado', variant: 'red' as const, color: 'bg-red-500' }
            case 'pending': return { label: 'Pendente', variant: 'gray' as const, color: 'bg-gray-400' }
            default: return { label: s, variant: 'gray' as const, color: 'bg-gray-400' }
        }
    }

    const statusInfo = getStatusInfo(order.situation)

    // Timeline logic
    const getTimelineSteps = (status: string) => {
        const baseDate = new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        const baseTime = new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

        const steps = [
            { label: 'Pedido Realizado', date: baseDate, time: baseTime, active: true },
            { label: 'Preparando', date: baseDate, time: '', active: ['preparing', 'sent', 'delivered', 'pickup_available', 'delivery_failed'].includes(status) },
            { label: 'Enviado', date: '', time: '', active: ['sent', 'delivered', 'delivery_failed'].includes(status) },
            { label: 'Entregue', date: '', time: '', active: ['delivered'].includes(status), isFinal: true }
        ]

        if (status === 'pickup_available') {
            steps[3].label = 'Disponível'
        } else if (status === 'delivery_failed') {
            steps[3].label = 'Falha na entrega'
            steps[3].active = true // Show as "active" but with error color logic in UI
        } else if (status === 'delivered') {
            steps[3].active = true
        }

        return steps
    }

    const timelineSteps = getTimelineSteps(order.delivery_status)

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
            >
                {/* --- HEADER PATTERN --- */}
                <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out`}>
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                        {/* Back button — desktop only */}
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="hidden md:inline truncate">{pageTitle}</span>
                                    <Badge variant={statusInfo.variant} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5">
                                        {statusInfo.label}
                                    </Badge>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Criado em {new Date(order.created_at).toLocaleString('pt-BR')} • {order.order_source || "Manual"}
                                </div>
                            </div>

                            {/* Desktop action buttons */}
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

                        {/* Mobile Title */}
                        <div className="md:hidden flex items-center justify-between py-4 px-2">
                            <div className="flex flex-col gap-1 min-w-0">
                                <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading truncate pr-4">
                                    {pageTitle}
                                </h1>
                                <div className="text-xs text-brand-inactive-text font-medium">
                                    {order.order_source || "Manual"}
                                </div>
                            </div>
                            <Badge variant={statusInfo.variant}>
                                {statusInfo.label}
                            </Badge>
                        </div>

                        <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"} pb-4`}>
                        </div>
                    </div>
                </div>

                {/* --- CONTENT --- */}
                <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">

                        {/* LEFT COLUMN */}
                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

                            {/* Progress / Status Card */}
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                <div className="bg-[#F9FAFB] dark:bg-gray-800/50 p-6 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Local:</span>
                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                {order.stores?.name || "Loja Dudit"}
                                            </div>
                                        </div>
                                        <div className="hidden md:block text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                            Canal de venda: <strong className="text-brand-dark dark:text-dark-heading">{order.order_source || "Marketplace"}</strong>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-dark-surface p-8 pb-12">
                                    <div className="relative px-4">
                                        <div className="relative h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-between">
                                            <div
                                                className={`absolute left-0 h-full rounded-full transition-all duration-500 ${order.delivery_status === 'delivery_failed' ? 'bg-red-500' : 'bg-brand-dark dark:bg-dark-heading'}`}
                                                style={{ width: `${(timelineSteps.filter(s => s.active).length - 1) * 33.33}%` }}
                                            ></div>

                                            {timelineSteps.map((step, idx) => (
                                                <div key={idx} className="relative flex flex-col items-center">
                                                    <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (order.delivery_status === 'delivery_failed' && idx === 3 ? 'bg-red-500 border-red-500' : 'bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading') : 'bg-white dark:bg-dark-surface border-gray-300 dark:border-gray-600'}`}>
                                                        {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>}
                                                    </div>
                                                    <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                        <span className={`text-[12px] md:text-[13px] font-bold mb-1 ${step.active ? (order.delivery_status === 'delivery_failed' && idx === 3 ? 'text-red-500' : 'text-brand-dark dark:text-dark-heading') : 'text-gray-300 dark:text-gray-600'}`}>
                                                            {step.label}
                                                        </span>
                                                        {step.active && step.date && (
                                                            <div className="flex items-center gap-1 text-[10px] text-brand-inactive-text font-bold">
                                                                <span>{step.date}</span>
                                                                {step.time && <span>{step.time}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Products List */}
                            <div className="mb-10">
                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 border-b border-brand-border dark:border-dark-border pb-3">Itens do Pedido</h3>
                                <div className="space-y-4">
                                    {(order.order_items || []).map((item: any) => (
                                        <div key={item.id} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-brand-gray/20 transition-colors group">
                                            <div className="w-16 h-16 rounded-xl bg-brand-gray/50 dark:bg-gray-800 border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 p-1">
                                                <img
                                                    src={item.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                                    className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform"
                                                    alt={item.product_name}
                                                    onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.product_name || "Produto sem nome"}</h4>
                                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">R$ {Number(item.subtotal || item.product_price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div className="text-[10px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-2">SKU: {item.sku || "N/A"}</div>
                                                <div className="flex items-center gap-2 text-[11px] md:text-[12px] text-brand-inactive-text dark:text-dark-body font-bold">
                                                    <span>{item.quantity} un. • R$ {Number(item.product_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / un.</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Payment Summary */}
                            <div className="bg-[#F9FAFB] dark:bg-gray-800/20 rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 border-b border-brand-border dark:border-dark-border pb-3">Resumo Financeiro</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-[14px]">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Subtotal ({order.order_items?.length} itens)</span>
                                        <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">R$ {Number(order.total_amount - (order.shipping_cost || 0) - (order.additional_costs || 0) + (order.discount_value || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[14px]">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Frete / Entrega</span>
                                        <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">R$ {Number(order.shipping_cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {(order.discount_value || 0) > 0 && (
                                        <div className="flex justify-between items-center text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto</span>
                                            <span className="text-red-500 font-bold text-sm">- R$ {Number(order.discount_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                        <span className="font-bold text-base md:text-lg text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                        <span className="font-bold text-xl md:text-2xl text-brand-dark dark:text-dark-heading tracking-tight text-right">R$ {Number(order.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
                                        <CreditCardIcon size={14} className="text-brand-inactive-text" />
                                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide">Método: {order.payment_method || "Não informado"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">

                            {/* Observations (InfoCard) */}
                            {order.notes && (
                                <InfoCard
                                    title="Observações do Pedido"
                                    message={order.notes}
                                    color="orange"
                                />
                            )}

                            {/* Customer Section */}
                            <CustomerCard
                                customer={{
                                    name: order.customer_name || "Cliente Balcão",
                                    email: order.buyer_email || "-", // Fallback as joins are gone
                                    phone: "-" // Fallback as joins are gone
                                }}
                                address={order.delivery_address ? { street: order.delivery_address } : null}
                            />

                            {/* Seller Info */}
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
                </div>
            </div>
        </div>
    )
}
