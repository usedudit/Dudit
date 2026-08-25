"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, Button, InfoCard } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import { acceptDeliveryOfferAction } from "@/app/actions/delivery-drivers"
import {
    ChevronLeftIcon,
    TruckIcon,
    ClockIcon,
    PhoneIcon,
    WhatsappIcon,
    MapPinIcon,
    Package,
    AlertTriangleIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

export interface AvailableOfferDetailData {
    assignment_id: string
    id?: string
    order_id?: string
    order_number?: string | number
    delivery_id?: string
    partner_id?: string
    partner_name?: string
    store_name?: string
    store_phone?: string
    store_address?: string
    store_logo_url?: string
    customer_name?: string
    customer_phone?: string
    delivery_address?: string
    delivery_fee: number
    total_amount?: number
    payment_method?: string
    assigned_at?: string
    notes?: string
    items?: Array<{ name: string; quantity: number; unit_price?: number; total_price?: number }>
    orders?: Array<{
        order_id: string
        order_number?: string | number
        position?: number
        customer_name?: string
        customer_phone?: string
        delivery_address?: string
        total_amount?: number
        delivery_fee?: number
        payment_method?: string
        items?: Array<{ name: string; quantity: number; unit_price?: number; total_price?: number }>
        notes?: string
    }>
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export default function AvailableDeliveryDetail({
    offer,
    onBack,
}: {
    offer: AvailableOfferDetailData
    onBack?: () => void
}) {
    const router = useRouter()
    const { setHeaderOverride } = useSidebar()
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<"resumo" | "itens">("resumo")
    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null)

    const assignmentId = offer.assignment_id || offer.id || ""

    // Expiration Countdown
    useEffect(() => {
        if (!offer.assigned_at) return
        const calculateRemaining = () => {
            const assignedTime = new Date(offer.assigned_at!).getTime()
            const expiresAt = assignedTime + FIFTEEN_MINUTES_MS
            const remainingSec = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
            setTimeLeftSeconds(remainingSec)
        }

        calculateRemaining()
        const interval = setInterval(calculateRemaining, 1000)
        return () => clearInterval(interval)
    }, [offer.assigned_at])

    const isExpired = timeLeftSeconds !== null && timeLeftSeconds <= 0

    const ordersList = useMemo(() => {
        if (offer.orders && offer.orders.length > 0) {
            return offer.orders
        }
        return [
            {
                order_id: offer.order_id || assignmentId,
                order_number: offer.order_number,
                position: 1,
                customer_name: offer.customer_name,
                customer_phone: offer.customer_phone,
                delivery_address: offer.delivery_address,
                total_amount: offer.total_amount,
                delivery_fee: offer.delivery_fee,
                payment_method: offer.payment_method,
                items: offer.items || [],
                notes: offer.notes,
            },
        ]
    }, [offer, assignmentId])

    const totalRouteFee = useMemo(() => {
        if (offer.orders && offer.orders.length > 0) {
            return offer.orders.reduce((sum, o) => sum + Number(o.delivery_fee || 0), 0)
        }
        return Number(offer.delivery_fee || 0)
    }, [offer])

    const totalRouteAmount = useMemo(() => {
        return ordersList.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
    }, [ordersList])

    const totalItemsCount = useMemo(() => {
        return ordersList.reduce((sum, o) => {
            const list = o.items || []
            return sum + list.reduce((itSum, it) => itSum + (it.quantity || 1), 0)
        }, 0)
    }, [ordersList])

    const pageTitle = ordersList.length > 1
        ? `Rota com ${ordersList.length} pedidos`
        : `Pedido ${offer.order_number ? `#${offer.order_number}` : `#${String(offer.order_id || assignmentId).slice(0, 8)}`}`

    const handleBackClick = () => {
        if (onBack) {
            onBack()
        } else {
            router.push("/entregadores/entregas-disponiveis")
        }
    }

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackClick,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle])

    const handleAccept = async () => {
        if (isExpired) {
            toast.error("Esta oferta já expirou e não pode mais ser aceita.")
            return
        }

        setLoading(true)
        try {
            const res = await acceptDeliveryOfferAction(assignmentId)
            if (!res.success) {
                toast.error(res.error || "Não foi possível aceitar a entrega.")
                return
            }

            toast.success("Entrega aceita com sucesso! Abrindo painel da corrida...")
            router.push(`/entregadores/entregas/${assignmentId}`)
        } catch (e: any) {
            toast.error(e?.message || "Erro inesperado ao aceitar entrega.")
        } finally {
            setLoading(false)
        }
    }

    const cleanStorePhone = (offer.store_phone || "").replace(/\D/g, "")
    const storeMapsUrl = offer.store_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.store_address)}`
        : null
    const storeWhatsappUrl = cleanStorePhone ? `https://wa.me/55${cleanStorePhone}` : null

    return (
        <FadeIn>
            <div className="flex flex-col min-h-[calc(100vh-65px)] bg-white dark:bg-dark-background pb-16">
                {/* STICKY TOP BAR */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="filled"
                                onClick={handleBackClick}
                                className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                            >
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                        {pageTitle}
                                    </h1>
                                    <Badge variant="orange" className="shrink-0">
                                        Disponível
                                    </Badge>
                                    {ordersList.length > 1 && (
                                        <Badge variant="blue" className="shrink-0">
                                            {ordersList.length} Paradas
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs md:text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    {offer.store_name || offer.partner_name || "Estabelecimento"} • {offer.assigned_at ? formatDate(offer.assigned_at) : "Hoje"}
                                </p>
                            </div>
                        </div>

                        {/* RIGHT ACTIONS: TIMER & ACCEPT BUTTON */}
                        <div className="flex items-center gap-3 shrink-0 ml-auto md:ml-0">
                            {timeLeftSeconds !== null && (
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                                    isExpired
                                        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/40"
                                        : timeLeftSeconds < 180
                                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40"
                                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40"
                                }`}>
                                    <ClockIcon size={14} className={timeLeftSeconds < 180 && !isExpired ? "animate-pulse" : ""} />
                                    {isExpired
                                        ? "Oferta expirada"
                                        : `Expira em ${Math.floor(timeLeftSeconds / 60)}:${String(timeLeftSeconds % 60).padStart(2, "0")}`}
                                </div>
                            )}

                            <Button
                                variant="default"
                                size="default"
                                onClick={handleAccept}
                                disabled={loading || isExpired}
                                isLoading={loading}
                                className="font-bold px-6 shadow-sm"
                            >
                                {isExpired ? "Oferta Expirada" : "Aceitar Entrega"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* MAIN BODY */}
                <div className="max-w-[1200px] w-full mx-auto px-4 md:px-8 pt-6">
                    {isExpired && (
                        <div className="mb-6">
                            <InfoCard
                                title="Oferta de entrega expirada"
                                message="Esta oportunidade esteve disponível por 15 minutos e não foi aceita a tempo. Volte para a lista para ver novas entregas."
                                color="orange"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* LEFT COLUMN: ESTABELECIMENTO & PARADAS */}
                        <div className="col-span-12 lg:col-span-8 space-y-6">
                            {/* ESTABELECIMENTO / PONTO DE RETIRADA */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-sm">
                                <div className="flex items-center justify-between gap-4 pb-4 border-b border-brand-border dark:border-dark-border mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                            <TruckIcon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <span className="text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block">
                                                Ponto de Retirada (Loja)
                                            </span>
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                {offer.store_name || offer.partner_name || "Estabelecimento"}
                                            </h2>
                                        </div>
                                    </div>
                                    {storeWhatsappUrl && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => window.open(storeWhatsappUrl, "_blank")}
                                            className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 shrink-0"
                                        >
                                            <WhatsappIcon size={16} /> WhatsApp
                                        </Button>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        Endereço para Coleta
                                    </span>
                                    <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        {offer.store_address || "Endereço da loja não informado"}
                                    </p>
                                    {storeMapsUrl && (
                                        <div className="pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => window.open(storeMapsUrl, "_blank")}
                                                className="text-xs"
                                            >
                                                <MapPinIcon size={14} /> Abrir Localização no Maps
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DESTINOS / PARADAS DE ENTREGA */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        <span>Destinos da Rota</span>
                                        <span className="text-xs font-normal text-brand-inactive-text dark:text-dark-body">
                                            ({ordersList.length} {ordersList.length === 1 ? "parada" : "paradas"})
                                        </span>
                                    </h3>
                                </div>

                                {ordersList.map((order, idx) => {
                                    const cleanCustPhone = (order.customer_phone || "").replace(/\D/g, "")
                                    const custMapsUrl = order.delivery_address
                                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                        : null
                                    const custWhatsappUrl = cleanCustPhone ? `https://wa.me/55${cleanCustPhone}` : null
                                    const stopNumberDisplay = order.order_number
                                        ? `#${order.order_number}`
                                        : `#${String(order.order_id).slice(0, 8)}`

                                    return (
                                        <div
                                            key={order.order_id || idx}
                                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-sm space-y-4 relative"
                                        >
                                            {/* Parada Header */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-7 h-7 rounded-full bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-background flex items-center justify-center font-bold text-xs">
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        <span className="text-xs font-bold font-mono text-brand-dark dark:text-dark-heading">
                                                            {stopNumberDisplay}
                                                        </span>
                                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                            {order.customer_name || "Cliente"}
                                                        </h4>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {custWhatsappUrl && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => window.open(custWhatsappUrl, "_blank")}
                                                            className="text-xs h-8 px-2.5"
                                                        >
                                                            <WhatsappIcon size={14} /> Contato
                                                        </Button>
                                                    )}
                                                    {custMapsUrl && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => window.open(custMapsUrl, "_blank")}
                                                            className="text-xs h-8 px-2.5"
                                                        >
                                                            <MapPinIcon size={14} /> Rota
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Endereço */}
                                            <div className="bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl p-3.5 flex flex-col gap-1">
                                                <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                                    Endereço de Entrega
                                                </span>
                                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                    {order.delivery_address || "Endereço não informado"}
                                                </span>
                                            </div>

                                            {/* Resumo da Parada (Pagamento, Itens, Taxa) */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 border-t border-brand-border dark:border-dark-border text-xs">
                                                <div>
                                                    <span className="text-brand-inactive-text dark:text-dark-body block">Forma de Pagamento</span>
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading capitalize">
                                                        {order.payment_method || "Online"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-brand-inactive-text dark:text-dark-body block">Valor do Pedido</span>
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(order.total_amount || 0)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-brand-inactive-text dark:text-dark-body block">Itens</span>
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading flex items-center gap-1">
                                                        <Package size={12} />
                                                        {(order.items || []).reduce((s, it) => s + (it.quantity || 1), 0)} itens
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Lista de itens expansível/detalhada */}
                                            {order.items && order.items.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider block mb-1.5">
                                                        Itens desta entrega
                                                    </span>
                                                    <ul className="divide-y divide-brand-border/40 dark:divide-dark-border/40">
                                                        {order.items.map((it, itIdx) => (
                                                            <li key={itIdx} className="py-1.5 flex justify-between items-center text-xs">
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                    <strong className="text-brand-green mr-1">{it.quantity}x</strong> {it.name}
                                                                </span>
                                                                {it.total_price != null && (
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">
                                                                        {formatCurrency(it.total_price)}
                                                                    </span>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {order.notes && (
                                                <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                                                    <strong>Observação:</strong> {order.notes}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* RIGHT SIDEBAR: GANHOS & RESUMO DA OFERTA */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            {/* GANHO DO ENTREGADOR */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-sm">
                                <span className="text-xs uppercase font-bold tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                    Sua Remuneração (Líquida)
                                </span>
                                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mb-4">
                                    {formatCurrency(totalRouteFee)}
                                </div>

                                <div className="space-y-2.5 text-sm pt-4 border-t border-brand-border dark:border-dark-border">
                                    <div className="flex justify-between items-center text-brand-inactive-text dark:text-dark-body">
                                        <span>Total de Paradas:</span>
                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                            {ordersList.length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-brand-inactive-text dark:text-dark-body">
                                        <span>Total de Itens:</span>
                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                            {totalItemsCount}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-brand-inactive-text dark:text-dark-body">
                                        <span>Valor dos Pedidos:</span>
                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(totalRouteAmount)}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <Button
                                        variant="default"
                                        size="lg"
                                        onClick={handleAccept}
                                        disabled={loading || isExpired}
                                        isLoading={loading}
                                        className="w-full font-bold shadow-md"
                                    >
                                        {isExpired ? "Oferta Expirada" : "Aceitar Corrida Agora"}
                                    </Button>
                                </div>
                            </div>

                            {/* INFORMAÇÕES E REGRAS */}
                            <div className="bg-brand-gray/50 dark:bg-dark-surface/50 border border-brand-border dark:border-dark-border rounded-2xl p-5 text-xs text-brand-inactive-text dark:text-dark-body space-y-2">
                                <p className="font-bold text-brand-dark dark:text-dark-heading">
                                    Informações importantes:
                                </p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Após aceitar, dirija-se ao estabelecimento para conferir e retirar os pedidos.</li>
                                    <li>Mantenha o status atualizado no painel a cada etapa (Retirada, Em Rota, Entregue).</li>
                                    <li>Se o pagamento for em dinheiro, confirme o recebimento no aplicativo ao entregar.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </FadeIn>
    )
}
