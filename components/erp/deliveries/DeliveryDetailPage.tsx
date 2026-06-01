"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button, Badge, InfoCard, ThreeDotsLoader, ActionsDropdown } from "@/components/reusable"
import { DropdownItem } from "@/components/reusable/Dropdown"
import DefaultModal from "@/components/reusable/DefaultModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon } from "@/lib/icons"
import { getERPDeliveryDetailsAction, getDeliveryRoutePointsAction, updateERPSingleOrderDeliveryStatusAction } from "@/app/actions/erp/deliveries"
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { toast } from "@/hooks/use-notification"

const DeliveryRouteMap = dynamic(
    () => import("./DeliveryRouteMap").then((m) => m.DeliveryRouteMap),
    { ssr: false },
)

const MaximizeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
)

const SidebarCard = ({
    children,
    hasTopStrip = true,
}: {
    children: React.ReactNode
    hasTopStrip?: boolean
}) => (
    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden text-left w-full">
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-heading rounded-t-2xl" />}
        {children}
    </div>
)

export default function DeliveryDetailPage({
    deliveryId,
    partnerId,
    onBack,
}: {
    deliveryId: string
    partnerId: string
    onBack: () => void
}) {
    const [delivery, setDelivery] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [route, setRoute] = useState<any | null>(null)
    const [routeLoading, setRouteLoading] = useState(false)
    const [isMapModalOpen, setIsMapModalOpen] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const mounted = useRef(true)

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    useEffect(() => {
        mounted.current = true
        const run = async () => {
            setLoading(true)
            const res = await getERPDeliveryDetailsAction(deliveryId, partnerId)
            if (mounted.current) {
                setDelivery(res.success ? res.data : null)
                setLoading(false)
            }
        }
        run()
        return () => {
            mounted.current = false
        }
    }, [deliveryId, partnerId])

    useEffect(() => {
        let alive = true
        const run = async () => {
            setRouteLoading(true)
            const res = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
            if (!alive) return
            setRoute(res.success ? res.data : null)
            setRouteLoading(false)
        }
        run()
        return () => { alive = false }
    }, [deliveryId, partnerId])

    const handleOrderDeliveryStatusChange = async (orderId: string, nextStatus: string) => {
        setUpdatingOrderId(orderId)
        try {
            const res = await updateERPSingleOrderDeliveryStatusAction({
                partnerId,
                deliveryId,
                orderId,
                status: nextStatus as any,
            })
            if (res.success) {
                toast.success("Status do pedido atualizado com sucesso!")
                // Re-fetch details & routes
                const detailRes = await getERPDeliveryDetailsAction(deliveryId, partnerId)
                if (detailRes.success) {
                    setDelivery(detailRes.data)
                }
                const routeRes = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
                if (routeRes.success) {
                    setRoute(routeRes.data)
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

    if (loading) return <div className="h-full flex items-center justify-center"><ThreeDotsLoader /></div>
    if (!delivery) return null

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

    return (
        <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10 custom-scrollbar">

                {/* Sticky Header */}
                <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "py-2 shadow-sm" : "py-4"}`}>
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
                                    Criado em {formatDateTime(delivery.created_at)} • {delivery.partner_users?.user_profiles?.full_name || "Entrega própria"}
                                </p>
                            </div>
                        </div>

                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </div>
                </div>

                {/* Content columns */}
                <div className="max-w-[1300px] mx-auto w-full p-4 md:p-6 grid grid-cols-12 gap-y-8 xl:gap-y-0 relative mt-4">

                    {/* Left Column */}
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12 space-y-8">

                        {/* Linked Orders Card */}
                        <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                            <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50">
                                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Pedidos Vinculados ({links.length})
                                </h3>
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
                                            <div key={link.id} className="p-4 flex items-center justify-between gap-4">
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
                                                    <Badge variant={deliveryMeta.variant}>
                                                        {deliveryMeta.label}
                                                    </Badge>

                                                    {/* Individual Order Status Actions */}
                                                    <div className="ml-2 border-l border-brand-border dark:border-dark-border pl-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                        {!["delivered", "cancelled", "delivery_failed"].includes(link.status) ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="py-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-950/30 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 border border-emerald-200/50"
                                                                    onClick={() => handleOrderDeliveryStatusChange(order.id, "delivered")}
                                                                    disabled={updatingOrderId === order.id}
                                                                >
                                                                    {updatingOrderId === order.id ? "Salvando..." : "Entregue"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="py-1 px-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 border border-red-200/50"
                                                                    onClick={() => handleOrderDeliveryStatusChange(order.id, "delivery_failed")}
                                                                    disabled={updatingOrderId === order.id}
                                                                >
                                                                    Falhou
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <ActionsDropdown
                                                                onEdit={undefined}
                                                                trigger={
                                                                    <Button size="sm" variant="outline" className="h-7 py-0 px-2 text-xs font-medium">
                                                                        Alterar
                                                                    </Button>
                                                                }
                                                            >
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "pending")}>Pendente</DropdownItem>
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "preparing")}>Em preparação</DropdownItem>
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "sent")}>Saiu para entrega</DropdownItem>
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "delivered")}>Concluída</DropdownItem>
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "delivery_failed")}>Falha na entrega</DropdownItem>
                                                                <DropdownItem onClick={() => handleOrderDeliveryStatusChange(order.id, "cancelled")}>Cancelada</DropdownItem>
                                                            </ActionsDropdown>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>

                        {/* Delivery Info Metrics Grid */}
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">
                                Informações da Entrega
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InfoCard title="Distância" message={`${Number(delivery.distance_km || 0).toFixed(2)} km`} color="blue" />
                                <InfoCard title="Duração Estimada" message={`${delivery.estimated_duration_minutes || 0} min`} color="purple" />
                                <InfoCard title="Saída" message={delivery.departure_time ? formatDateTime(delivery.departure_time) : (delivery.started_at ? formatDateTime(delivery.started_at) : "-")} color="orange" />
                                <InfoCard title="Conclusão" message={delivery.completed_at ? formatDateTime(delivery.completed_at) : (delivery.delivered_at ? formatDateTime(delivery.delivered_at) : "-")} color="green" />
                            </div>
                        </div>

                        {/* Notes */}
                        {delivery.notes && (
                            <div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">
                                    Observações da Entrega
                                </h3>
                                <InfoCard title="Observações" message={delivery.notes} color="gray" />
                            </div>
                        )}

                        {/* Order Items list */}
                        <div>
                            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">
                                Itens dos Pedidos
                            </h3>
                            {allItems.length === 0 ? (
                                <div className="p-5 text-sm text-brand-inactive-text border border-brand-border dark:border-dark-border rounded-2xl">
                                    Nenhum item detalhado foi retornado para os pedidos selecionados.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {allItems.map((item: any, idx: number) => {
                                        const itemImage = getR2ImageUrl(item.products?.images || item.image || null, "thumbnail")
                                        const itemSku = item.products?.sku || item.sku || "N/A"
                                        const itemPrice = Number(item.product_price || item.price || 0)
                                        const itemSubtotal = Number(item.subtotal || itemPrice * Number(item.quantity || 0))

                                        return (
                                            <div key={`${item.id || idx}-${idx}`} className="flex items-start gap-4">
                                                <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                    <img
                                                        src={itemImage}
                                                        className="w-full h-full object-cover rounded-xl"
                                                        alt={item.product_name || "Produto sem nome"}
                                                        onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                            {item.product_name || "Produto sem nome"}
                                                        </h4>
                                                        <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(itemSubtotal)}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                                        SKU: {itemSku} • Pedido: {item.orderDisplayId}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                                        <span>
                                                            {item.quantity} un. • {formatCurrency(itemPrice)} / un.
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Right Column */}
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">

                        {/* Driver and Route general information card */}
                        <SidebarCard>
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Informações Gerais</h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium uppercase">Entregador</p>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {delivery.partner_users?.user_profiles?.full_name || "Entrega própria"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium uppercase">Pedidos na Rota</p>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {links.length} pedido(s)
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium uppercase">Valor Total do Frete</p>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {formatCurrency(totalDeliveryFee)}
                                    </p>
                                </div>
                            </div>
                        </SidebarCard>

                        {/* Divider */}
                        <div className="border-t border-brand-border dark:border-dark-border my-6"></div>

                        {/* Map Card */}
                        <SidebarCard hasTopStrip={false}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Mapa da Rota</h3>
                                {route?.points?.length > 0 && (
                                    <button
                                        type="button"
                                        className="p-1.5 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg transition-colors"
                                        onClick={() => setIsMapModalOpen(true)}
                                        title="Expandir mapa"
                                    >
                                        <MaximizeIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="h-[280px] w-full">
                                {routeLoading ? (
                                    <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border">
                                        <span className="text-sm text-brand-inactive-text">Carregando mapa...</span>
                                    </div>
                                ) : route?.points?.length ? (
                                    <DeliveryRouteMap
                                        points={route.points}
                                        initialLat={route.origin?.lat ?? null}
                                        initialLng={route.origin?.lng ?? null}
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-surface/50">
                                        <span className="text-sm text-brand-inactive-text">Sem dados de rota para exibir.</span>
                                    </div>
                                )}
                            </div>
                        </SidebarCard>
                    </div>
                </div>
            </div>

            {/* Expanded Route Map Modal */}
            <DefaultModal
                isOpen={isMapModalOpen}
                onClose={() => setIsMapModalOpen(false)}
                title="Mapa da Rota Expandido"
                maxWidth="5xl"
                footer={
                    <div className="flex justify-end w-full">
                        <Button variant="outline" onClick={() => setIsMapModalOpen(false)}>
                            Fechar
                        </Button>
                    </div>
                }
            >
                <div className="h-[550px] w-full p-2">
                    {route?.points?.length && (
                        <DeliveryRouteMap
                            points={route.points}
                            initialLat={route.origin?.lat ?? null}
                            initialLng={route.origin?.lng ?? null}
                        />
                    )}
                </div>
            </DefaultModal>

        </FadeIn>
    )
}
