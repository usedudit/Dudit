"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    Badge,
    Button,
    FormSection,
    InfoCard,
    ActionsDropdown,
    DropdownItem,
    Pagination,
    IconPlaceholder,
    Accordion,
    SidebarCard,
} from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import { acceptDeliveryOfferAction, declineDeliveryOfferAction } from "@/app/actions/delivery-drivers"
import {
    ChevronLeftIcon,
    TruckIcon,
    ClockIcon,
    PhoneIcon,
    WhatsappIcon,
    MapPinIcon,
    BoxIcon,
    XIcon,
    EyeIcon,
    MoneyIcon,
    StoreIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getPaymentStatusMeta, getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useModalLayer } from "@/lib/modal-stack"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { useMediaQuery } from "@/components/erp/hooks"
import { parseAddressString } from "@/components/erp/orders/CreateOrder"
import type { DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"

const ITEMS_PER_PAGE = 10

export interface AvailableDeliveryDetailProps {
    offer: DeliveryAssignmentItem & {
        store_name?: string
        store_phone?: string
        store_address?: string
        store_logo_url?: string
        offer_id?: string | null
        offer_tier?: number | null
        offer_mode?: "board" | "directed"
        offer_expires_at?: string | null
        dispatch_tier?: number
        bonus_amount?: number
        pickup_km?: number | null
        pickup_distance_km?: number | null
        distance_km?: number | null
        pickup_minutes?: number | null
        delivery_km?: number | null
        delivery_distance_km?: number | null
        delivery_minutes?: number | null
        eta_total_minutes?: number | null
        vehicle_compatible?: boolean
        position_quality?: "live" | "address" | "unknown"
        route_km?: number | null
        rs_per_km?: number | null
        dimensions_unknown?: boolean
        order_count?: number
        orders?: Array<{
            order_id?: string
            order_number?: string | null
            position?: number
            customer_name?: string
            customer_phone?: string
            delivery_address?: string
            total_amount?: number
            delivery_fee?: number
            payment_method?: string
            payment_status?: string
            items?: any[]
            notes?: string
        }>
    }
    onBack?: () => void
    onAccepted?: () => void
}

export default function AvailableDeliveryDetail({
    offer: initialOffer,
    onBack,
    onAccepted,
}: AvailableDeliveryDetailProps) {
    const router = useRouter()
    const { setHeaderOverride } = useSidebar()
    const [offer, setOffer] = useState<any>(initialOffer)
    const [loading, setLoading] = useState(false)
    const [declining, setDeclining] = useState(false)
    const [activeTab, setActiveTab] = useState("resumo")
    const [itemsPage, setItemsPage] = useState(1)
    const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null)
    const [isOrderDetailSheetOpen, setIsOrderDetailSheetOpen] = useState(false)

    // z-index dinâmico: a sheet desktop de detalhes do pedido abre acima de
    // tudo que já estava aberto (a variante mobile usa BottomSheet, que já
    // registra a própria camada).
    const orderDetailZIndex = useModalLayer(isOrderDetailSheetOpen && !!selectedOrderForDetail)

    const isMobile = useMediaQuery("(max-width: 768px)")

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    useEffect(() => {
        setOffer(initialOffer)
    }, [initialOffer])

    // Multi-stop orders normalization
    const ordersList = useMemo(() => {
        if (offer.orders && offer.orders.length > 0) {
            return offer.orders
        }
        return [
            {
                order_id: offer.order_id,
                order_number: offer.order_number,
                position: 1,
                customer_name: offer.customer_name,
                customer_phone: offer.customer_phone,
                delivery_address: offer.delivery_address,
                total_amount: offer.total_amount,
                delivery_fee: offer.delivery_fee,
                payment_method: offer.payment_method,
                payment_status: offer.payment_status || "Pendente",
                items: offer.items || [],
                notes: offer.notes,
            },
        ]
    }, [offer])

    const totalRouteDeliveryFee = useMemo(() => {
        if (offer.orders && offer.orders.length > 0) {
            return offer.orders.reduce((sum: number, o: any) => sum + Number(o.delivery_fee || 0), 0)
        }
        return Number(offer.delivery_fee || 0)
    }, [offer])

    const totalRouteAmount = useMemo(() => {
        return ordersList.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)
    }, [ordersList])

    // Elapsed waiting time + janela do tier atual (Fase 2)
    const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(() => {
        if (!offer.assigned_at) return null
        const assignedTime = new Date(offer.assigned_at).getTime()
        return Math.max(0, Math.floor((Date.now() - assignedTime) / 60000))
    })
    const [tierSecondsLeft, setTierSecondsLeft] = useState<number | null>(() => {
        if (!offer.offer_expires_at) return null
        return Math.max(0, Math.floor((new Date(offer.offer_expires_at).getTime() - Date.now()) / 1000))
    })

    useEffect(() => {
        const calc = () => {
            if (offer.assigned_at) {
                const assignedTime = new Date(offer.assigned_at).getTime()
                setElapsedMinutes(Math.max(0, Math.floor((Date.now() - assignedTime) / 60000)))
            }
            if (offer.offer_expires_at) {
                setTierSecondsLeft(Math.max(0, Math.floor((new Date(offer.offer_expires_at).getTime() - Date.now()) / 1000)))
            } else {
                setTierSecondsLeft(null)
            }
        }
        calc()
        const interval = setInterval(calc, offer.offer_expires_at ? 1000 : 30000)
        return () => clearInterval(interval)
    }, [offer.assigned_at, offer.offer_expires_at])

    const orderNumberDisplay = offer.order_number
        ? `#${offer.order_number}`
        : `#${String(offer.order_id || offer.assignment_id || offer.id).slice(0, 8)}`

    const pageTitle = ordersList.length > 1
        ? `Rota com ${ordersList.length} pedidos`
        : `Oportunidade ${orderNumberDisplay}`

    const cleanStorePhone = (offer.store_phone || "").replace(/\D/g, "")
    const storeMapsUrl = offer.store_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.store_address)}`
        : null
    const storeWhatsappUrl = cleanStorePhone ? `https://wa.me/55${cleanStorePhone}` : null

    const handleBackClick = useCallback(() => {
        if (onBack) {
            onBack()
        } else {
            router.push("/entregadores/entregas-disponiveis")
        }
    }, [onBack, router])

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackClick,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBackClick, setHeaderOverride])

    const handleAccept = async () => {
        setLoading(true)
        try {
            const assignmentKey = offer.id || offer.assignment_id
            const res = await acceptDeliveryOfferAction(assignmentKey)
            if (res.success) {
                toast.success("Entrega aceita com sucesso! Boa rota!")
                if (onAccepted) {
                    onAccepted()
                } else {
                    router.push(`/entregadores/entregas?view=${assignmentKey}`)
                }
            } else {
                toast.error(res.error || "Não foi possível aceitar a entrega.")
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao aceitar entrega.")
        } finally {
            setLoading(false)
        }
    }

    const handleDecline = async () => {
        setDeclining(true)
        try {
            const assignmentKey = offer.id || offer.assignment_id
            const res = await declineDeliveryOfferAction(assignmentKey, offer.offer_id || null)
            if (res.success) {
                if (res.data?.cooldown_applied) {
                    toast.info("Oferta recusada. Pausa temporária de 15 min ativada após recusas consecutivas.")
                } else {
                    toast.info("Oferta recusada.")
                }
                handleBackClick()
            } else {
                toast.error(res.error || "Não foi possível recusar a oferta.")
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao recusar oferta.")
        } finally {
            setDeclining(false)
        }
    }

    // Consolidated item list across all orders
    const allItems = useMemo(() => {
        const list: any[] = []
        for (const order of ordersList) {
            for (const item of order.items || []) {
                list.push({
                    ...item,
                    order_number: order.order_number,
                    customer_name: order.customer_name,
                })
            }
        }
        return list
    }, [ordersList])

    const totalItemPages = Math.ceil(allItems.length / ITEMS_PER_PAGE) || 1
    const paginatedItems = allItems.slice((itemsPage - 1) * ITEMS_PER_PAGE, itemsPage * ITEMS_PER_PAGE)

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            <Badge variant="orange" className="shrink-0">Disponível</Badge>
                                            {ordersList.length > 1 && (
                                                <Badge variant="gray" className="shrink-0">{ordersList.length} paradas</Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:flex items-center gap-2 text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            <span>Loja: <strong className="text-brand-dark dark:text-dark-heading">{offer.store_name || offer.partner_name || "Estabelecimento"}</strong></span>
                                            {tierSecondsLeft !== null && tierSecondsLeft > 0 ? (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1 font-semibold text-brand-inactive-text">
                                                        <ClockIcon size={13} />
                                                        fecha em {tierSecondsLeft}s
                                                    </span>
                                                </>
                                            ) : elapsedMinutes !== null ? (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1 font-semibold text-brand-inactive-text">
                                                        <ClockIcon size={13} />
                                                        {elapsedMinutes === 0 ? "Solicitada agora" : `Aguardando há ${elapsedMinutes} min`}
                                                    </span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="default"
                                            onClick={handleDecline}
                                            disabled={loading || declining}
                                            isLoading={declining}
                                            className="font-bold shadow-none"
                                        >
                                            Recusar
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="default"
                                            onClick={handleAccept}
                                            disabled={loading || declining}
                                            isLoading={loading}
                                            className="font-bold shadow-none"
                                        >
                                            Aceitar Entrega
                                        </Button>
                                    </div>
                                </div>

                                <div className="pt-2 md:pt-4">
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border">
                                        <TabsTrigger value="resumo" className="px-0 pb-3 text-sm">
                                            Resumo da Rota
                                        </TabsTrigger>
                                        <TabsTrigger value="itens" className="px-0 pb-3 text-sm">
                                            Itens do Pedido ({allItems.length})
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="max-w-[1300px] mx-auto p-4 md:p-6 pb-28 md:pb-8">
                            <AnimatePresence mode="wait">
                                {activeTab === "resumo" && (
                                    <FadeIn key="resumo" className="block">
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                            {/* LEFT MAIN COLUMN */}
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                                {offer.vehicle_compatible === false && (
                                                    <InfoCard
                                                        title="Pedido acima do limite recomendado para o seu veículo"
                                                        message="O peso ou volume estimado deste pedido excede o padrão do seu veículo cadastrado. Verifique os itens antes de aceitar."
                                                        color="red"
                                                    />
                                                )}

                                                {offer.dimensions_unknown && (
                                                    <InfoCard
                                                        title="⚠ Itens sem dimensão informada"
                                                        message="O estabelecimento não informou peso ou dimensões de todos os itens. Confirme se o pedido cabe no seu veículo antes de aceitar."
                                                        color="orange"
                                                    />
                                                )}

                                                {offer.position_quality === "address" && (
                                                    <InfoCard
                                                        title="Estimativa calculada pelo seu endereço de cadastro"
                                                        message="Ative a localização GPS no topo da página para receber distâncias e tempos calculados a partir da sua posição atual."
                                                        color="blue"
                                                    />
                                                )}

                                                {offer.notes && (
                                                    <InfoCard title="Instruções do Estabelecimento" message={offer.notes} color="orange" />
                                                )}

                                                {/* Local de Coleta */}
                                                <FormSection title="Local de Coleta (Estabelecimento)">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div className="space-y-1 min-w-0">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                {offer.store_name || offer.partner_name || "Estabelecimento Parceiro"}
                                                            </h3>
                                                            {offer.store_address && (
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                    <MapPinIcon size={14} className="shrink-0 text-brand-inactive-text mt-0.5" />
                                                                    <span>{offer.store_address}</span>
                                                                </p>
                                                            )}
                                                            {offer.pickup_distance_km != null && (
                                                                <p className="text-xs font-semibold text-brand-green flex items-center gap-1 flex-wrap">
                                                                    <span>
                                                                        📍 {offer.pickup_distance_km === 0
                                                                            ? "No seu local"
                                                                            : `${offer.pickup_distance_km} km${offer.pickup_minutes != null ? ` · ${offer.pickup_minutes} min até a loja` : ""}`}
                                                                        {offer.delivery_minutes != null ? ` · ${offer.delivery_minutes} min até o cliente` : ""}
                                                                    </span>
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="shrink-0">
                                                            <ActionsDropdown
                                                                trigger={
                                                                    <Button variant="outline" size="sm">Opções</Button>
                                                                }
                                                            >
                                                                {storeMapsUrl && (
                                                                    <DropdownItem onClick={() => window.open(storeMapsUrl, "_blank")}>
                                                                        <MapPinIcon size={16} /> Abrir Rota no Maps
                                                                    </DropdownItem>
                                                                )}
                                                                {cleanStorePhone && (
                                                                    <DropdownItem onClick={() => window.open(`tel:${cleanStorePhone}`, "_self")}>
                                                                        <PhoneIcon size={16} /> Ligar para o Estabelecimento
                                                                    </DropdownItem>
                                                                )}
                                                                {storeWhatsappUrl && (
                                                                    <DropdownItem onClick={() => window.open(storeWhatsappUrl, "_blank")}>
                                                                        <WhatsappIcon size={16} /> WhatsApp
                                                                    </DropdownItem>
                                                                )}
                                                            </ActionsDropdown>
                                                        </div>
                                                    </div>
                                                </FormSection>

                                                {/* Paradas de Entrega */}
                                                {ordersList.map((order: any, idx: number) => {
                                                    const custMaps = order.delivery_address
                                                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                                        : null
                                                    const stopTitle = ordersList.length > 1
                                                        ? `Parada ${idx + 1} de ${ordersList.length} — Destino da Entrega (Pedido #${order.order_number || String(order.order_id).slice(0, 8)})`
                                                        : "Destino da Entrega"

                                                    return (
                                                        <FormSection key={order.order_id || idx} title={stopTitle} hasSeparator>
                                                            <div
                                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer rounded-xl hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors -mx-2 px-2 py-2"
                                                                onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}
                                                            >
                                                                <div className="space-y-1 min-w-0">
                                                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading flex items-center gap-2 flex-wrap">
                                                                        <span>{order.delivery_address || "Região local"}</span>
                                                                        {order.total_amount && (
                                                                            <span className="text-xs font-normal text-brand-inactive-text">
                                                                                ({formatCurrency(order.total_amount)})
                                                                            </span>
                                                                        )}
                                                                    </h3>
                                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1.5 mt-0.5">
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-gray dark:bg-dark-border/40 text-brand-dark dark:text-dark-heading">
                                                                            🔒 Rua, número e contato liberados após aceite
                                                                        </span>
                                                                    </p>
                                                                    {order.notes && (
                                                                        <p className="text-xs text-brand-orange mt-1">
                                                                            <strong>Obs:</strong> {order.notes}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                                    <ActionsDropdown
                                                                        trigger={
                                                                            <Button variant="outline" size="sm">Opções</Button>
                                                                        }
                                                                    >
                                                                        <DropdownItem onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}>
                                                                            <EyeIcon size={16} /> Ver Resumo do Pedido
                                                                        </DropdownItem>
                                                                        {custMaps && (
                                                                            <DropdownItem onClick={() => window.open(custMaps, "_blank")}>
                                                                                <MapPinIcon size={16} /> Ver Região no Maps
                                                                            </DropdownItem>
                                                                        )}
                                                                    </ActionsDropdown>
                                                                </div>
                                                            </div>
                                                        </FormSection>
                                                    )
                                                })}
                                            </div>

                                            {/* RIGHT SIDEBAR COLUMN with divider */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                                <SidebarCard hasSeparator hasTopStrip title="Remuneração & Valores">
                                                    <InfoCard
                                                        title="Sua Taxa de Entrega (Total)"
                                                        message={formatCurrency(totalRouteDeliveryFee)}
                                                        color="green"
                                                    />
                                                    <div className="space-y-3 text-sm mt-4">
                                                        {offer.bonus_amount != null && Number(offer.bonus_amount) > 0 && (
                                                            <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Bônus autorizado:</span>
                                                                <span className="font-bold text-brand-green font-mono">
                                                                    + {formatCurrency(Number(offer.bonus_amount))}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {offer.rs_per_km != null && offer.rs_per_km > 0 && (
                                                            <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor por km:</span>
                                                                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                                                    {formatCurrency(offer.rs_per_km)}/km
                                                                </span>
                                                            </div>
                                                        )}
                                                        {offer.eta_total_minutes != null && (
                                                            <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tempo total estimado:</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                    ~{offer.eta_total_minutes} min
                                                                </span>
                                                            </div>
                                                        )}
                                                        {offer.route_km != null && offer.route_km > 0 && (
                                                            <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Distância estimada:</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                    {offer.route_km} km
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total de Paradas:</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{ordersList.length}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total dos Pedidos:</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalRouteAmount)}</span>
                                                        </div>
                                                        {ordersList.length === 1 && (
                                                            <>
                                                                <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Forma de Pagamento:</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                        {formatPaymentMethodLabel(offer.payment_method, null) || "Não informada"}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center justify-between text-brand-dark dark:text-dark-heading">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Situação do Pagamento:</span>
                                                                    <Badge variant={getPaymentStatusMeta(offer.payment_status || (offer as any).situation).variant} icon={<MoneyIcon />}>
                                                                        {getPaymentStatusMeta(offer.payment_status || (offer as any).situation).label}
                                                                    </Badge>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    <div className="pt-4 border-t border-brand-border dark:border-dark-border mt-4 flex flex-col gap-2">
                                                        <Button
                                                            variant="default"
                                                            size="lg"
                                                            onClick={handleAccept}
                                                            disabled={loading || declining}
                                                            isLoading={loading}
                                                            className="w-full font-bold shadow-none"
                                                        >
                                                            Aceitar Entrega
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="default"
                                                            onClick={handleDecline}
                                                            disabled={loading || declining}
                                                            isLoading={declining}
                                                            className="w-full font-bold shadow-none"
                                                        >
                                                            Recusar Oferta
                                                        </Button>
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </FadeIn>
                                )}

                                {activeTab === "itens" && (
                                    <FadeIn key="itens" className="block">
                                        <FormSection title={`Itens a serem entregues (${allItems.length})`} description="Confira todos os itens antes de sair do estabelecimento">
                                            {allItems.length === 0 ? (
                                                <div className="py-12 flex flex-col items-center justify-center text-center">
                                                    <IconPlaceholder
                                                        icon={BoxIcon}
                                                        title="Nenhum item detalhado"
                                                        subtitle="Os itens individuais não foram especificados para este pedido."
                                                    />
                                                </div>
                                            ) : ordersList.length > 1 ? (
                                                <div className="space-y-4">
                                                    {ordersList.map((order: any, oIdx: number) => {
                                                        const orderItems = order.items || []
                                                        return (
                                                            <Accordion
                                                                key={order.order_id || oIdx}
                                                                title={
                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                        Parada {oIdx + 1}: Pedido #{order.order_number || String(order.order_id).slice(0, 8)} – {order.customer_name || "Cliente"} ({orderItems.length} {orderItems.length === 1 ? "item" : "itens"} • {formatCurrency(order.total_amount || 0)})
                                                                    </span>
                                                                }
                                                                defaultOpen={oIdx === 0}
                                                            >
                                                                <div className="divide-y divide-brand-border dark:divide-dark-border pt-2">
                                                                    {orderItems.map((item: any, idx: number) => {
                                                                        const itemImg = getR2ImageUrl(item.product_variants?.variant_options?.image || item.products?.images || item.images || item.image_url || item.image || null, "thumbnail")
                                                                        const itemSku = item.product_variants?.sku || item.products?.sku || item.sku || (item.sku !== "N/A" ? item.sku : null)
                                                                        const qty = Number(item.quantity || 1)
                                                                        const unit = item.unit || item.products?.unit || "un"
                                                                        const price = Number(item.product_price || item.price || item.unit_price || 0)
                                                                        const subtotal = Number(item.subtotal || price * qty)

                                                                        return (
                                                                            <div key={item.id || idx} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                                                                                <div className="flex items-center gap-4 min-w-0">
                                                                                    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                                        <img
                                                                                            src={itemImg}
                                                                                            alt={item.name || item.product_name || "Produto"}
                                                                                            className="w-full h-full object-cover"
                                                                                            onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="min-w-0">
                                                                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                            {item.name || item.product_name || "Produto sem nome"}
                                                                                        </h4>
                                                                                        {itemSku && (
                                                                                            <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase">
                                                                                                SKU: {itemSku}
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-2 mt-0.5">
                                                                                            <span>{formatQuantityWithUnit(qty, unit)}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="text-right shrink-0">
                                                                                    <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                                        {subtotal > 0 ? formatCurrency(subtotal) : (price > 0 ? formatCurrency(price * qty) : "-")}
                                                                                    </div>
                                                                                    {qty > 1 && price > 0 && (
                                                                                        <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                                            {formatUnitPriceWithUnit(price, unit)}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </Accordion>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                                                        {paginatedItems.map((item: any, idx: number) => {
                                                            const itemImg = getR2ImageUrl(item.product_variants?.variant_options?.image || item.products?.images || item.images || item.image_url || item.image || null, "thumbnail")
                                                            const itemSku = item.product_variants?.sku || item.products?.sku || item.sku || (item.sku !== "N/A" ? item.sku : null)
                                                            const qty = Number(item.quantity || 1)
                                                            const unit = item.unit || item.products?.unit || "un"
                                                            const price = Number(item.product_price || item.price || item.unit_price || 0)
                                                            const subtotal = Number(item.subtotal || price * qty)

                                                            return (
                                                                <div key={item.id || idx} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                                                                    <div className="flex items-center gap-4 min-w-0">
                                                                        <div className="w-12 h-12 shrink-0 rounded-full overflow-hidden bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                            <img
                                                                                src={itemImg}
                                                                                alt={item.name || item.product_name || "Produto"}
                                                                                className="w-full h-full object-cover"
                                                                                onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                            />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                {item.name || item.product_name || "Produto sem nome"}
                                                                            </h4>
                                                                            {itemSku && (
                                                                                <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase">
                                                                                    SKU: {itemSku}
                                                                                </div>
                                                                            )}
                                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-2 mt-0.5">
                                                                                <span>{formatQuantityWithUnit(qty, unit)}</span>
                                                                                {item.order_number && (
                                                                                    <span>• Pedido #{item.order_number}</span>
                                                                                )}
                                                                                {item.customer_name && (
                                                                                    <span>• {item.customer_name}</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            {subtotal > 0 ? formatCurrency(subtotal) : (price > 0 ? formatCurrency(price * qty) : "-")}
                                                                        </div>
                                                                        {qty > 1 && price > 0 && (
                                                                            <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                                {formatUnitPriceWithUnit(price, unit)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>

                                                    {totalItemPages > 1 && (
                                                        <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                                            <Pagination
                                                                currentPage={itemsPage}
                                                                totalPages={totalItemPages}
                                                                onPageChange={setItemsPage}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* EXACT SAME ORDER DETAILS SHEET AS ERP */}
                {(() => {
                    const isOpen = isOrderDetailSheetOpen && !!selectedOrderForDetail
                    const handleClose = () => {
                        setIsOrderDetailSheetOpen(false)
                        setSelectedOrderForDetail(null)
                    }

                    if (!selectedOrderForDetail) return null
                    const order = selectedOrderForDetail
                    const displayId = order.order_number ? `#${order.order_number}` : `#${String(order.order_id || order.id || "").slice(0, 8).toUpperCase()}`
                    const paymentMeta = getPaymentStatusMeta(order.situation || order.payment_status || offer.situation || offer.payment_status || "pending")
                    const rawDeliveryStatus = order.delivery_status || order.deliveryStatus || (offer.status === "delivered" ? "delivered" : "preparing")
                    const deliveryMeta = getDeliveryStatusMeta(rawDeliveryStatus)
                    const ordItems = order.items || []
                    const orderDate = order.created_at || order.order_date || order.order_created_at || offer.assigned_at

                    const orderHistoryEntries: HistoryEntry[] = []
                    if (order.created_at || order.order_date) {
                        orderHistoryEntries.push({ id: "created", actor_name: "Sistema", change_lines: ["Pedido criado"], created_at: order.created_at || order.order_date, entry_type: "status" })
                    }
                    if (["paid", "pago", "approved", "aprovado", "concluido", "concluído"].includes(String(order.situation || order.payment_status || "").toLowerCase())) {
                        orderHistoryEntries.push({ id: "paid", actor_name: "Sistema", change_lines: ["Pagamento confirmado"], created_at: order.updated_at || order.created_at, entry_type: "payment" })
                    }

                    const sheetContent = (
                        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                                <div>
                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">{displayId}</p>
                                </div>
                                <Button variant="filled" onClick={handleClose} size="icon">
                                    <XIcon className="h-5 w-5" />
                                </Button>
                            </header>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                <Tabs defaultValue="dados_gerais" className="w-full">
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                                        <TabsTrigger value="dados_gerais" className="px-0 pb-3 text-sm">
                                            Dados Gerais
                                        </TabsTrigger>
                                        <TabsTrigger value="itens" className="px-0 pb-3 text-sm">
                                            Itens do Pedido ({ordItems.length})
                                        </TabsTrigger>
                                        {orderHistoryEntries.length > 0 && (
                                            <TabsTrigger value="historico" className="px-0 pb-3 text-sm">
                                                Histórico
                                            </TabsTrigger>
                                        )}
                                    </TabsList>

                                    <TabsContent value="dados_gerais" className="mt-0 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(order.total_amount || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Taxa de Entrega (Frete)</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(order.delivery_fee || 0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Forma de Pagamento</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                    {formatPaymentMethodLabel(order.payment_method, null) || "Não informado"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Situação do Pagamento</span>
                                                <Badge variant={paymentMeta.variant} icon={<MoneyIcon />}>
                                                    {paymentMeta.label}
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status de Entrega</span>
                                                <Badge
                                                    variant={deliveryMeta.variant}
                                                    icon={order.delivery_type === "pickup" ? <StoreIcon /> : getDeliveryStatusIcon(rawDeliveryStatus)}
                                                >
                                                    {deliveryMeta.label}
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data do Pedido</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {orderDate ? formatDateTime(orderDate) : "-"}
                                                </span>
                                            </div>
                                            {order.delivery_address && (
                                                <div className="flex justify-between items-start text-sm gap-4">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Região de Entrega</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-right flex items-start gap-1">
                                                        <MapPinIcon size={14} className="shrink-0 mt-0.5 text-brand-inactive-text" />
                                                        {order.delivery_address}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t border-brand-border dark:border-dark-border w-full" />

                                        <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/20 p-4 space-y-2">
                                            <div className="flex items-center gap-2 text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                <span>🔒 Proteção de Dados do Comprador</span>
                                            </div>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                Por segurança e privacidade (LGPD), o nome completo, contato direto (telefone/WhatsApp) e o endereço exato com número e complemento são liberados na sua tela imediatamente após você aceitar a entrega.
                                            </p>
                                        </div>

                                        {order.notes && (
                                            <div>
                                                <h4 className="text-xs font-bold text-brand-dark dark:text-dark-heading mb-2 uppercase tracking-wide">Observações do Pedido</h4>
                                                <p className="text-sm text-brand-dark dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl p-3 border border-brand-border dark:border-dark-border">
                                                    {order.notes}
                                                </p>
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="itens" className="mt-0">
                                        {ordItems.length === 0 ? (
                                            <div className="flex items-center justify-center py-8">
                                                <IconPlaceholder
                                                    icon={BoxIcon}
                                                    title="Sem itens por aqui"
                                                    subtitle="Nenhum item detalhado foi retornado para o pedido selecionado."
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {ordItems.map((item: any, idx: number) => {
                                                    const itemImage = getR2ImageUrl(item.product_variants?.variant_options?.image || item.products?.images || item.services?.images || item.images || item.image || item.image_url || null, "thumbnail")
                                                    const itemSku = item.product_variants?.sku || item.products?.sku || item.sku || (item.sku !== "N/A" ? item.sku : null)
                                                    const itemUnit = item.products?.unit || item.unit || "un"
                                                    const itemPrice = Number(item.product_price || item.price || item.unit_price || 0)
                                                    const itemQty = Number(item.quantity || 1)
                                                    const itemSubtotal = Number(item.subtotal || itemPrice * itemQty)

                                                    return (
                                                        <div key={item.id || idx} className="flex items-start gap-4">
                                                            <div className="w-12 h-12 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                <img
                                                                    src={itemImage}
                                                                    className="w-full h-full object-cover rounded-full"
                                                                    alt={item.name || item.product_name || "Produto sem nome"}
                                                                    onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-start mb-0.5">
                                                                    <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                        {item.name || item.product_name || "Produto sem nome"}
                                                                    </h4>
                                                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(itemSubtotal)}
                                                                    </span>
                                                                </div>
                                                                {itemSku && (
                                                                    <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mb-1">
                                                                        SKU: {itemSku}
                                                                    </div>
                                                                )}
                                                                <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                    {formatQuantityWithUnit(itemQty, itemUnit)} • {formatUnitPriceWithUnit(itemPrice, itemUnit)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </TabsContent>

                                    {orderHistoryEntries.length > 0 && (
                                        <TabsContent value="historico" className="mt-0">
                                            <HistoryTimeline entries={orderHistoryEntries} />
                                        </TabsContent>
                                    )}
                                </Tabs>
                            </div>
                        </div>
                    )

                    return isMobile ? (
                        <BottomSheet isOpen={isOpen} onClose={handleClose}>
                            {sheetContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        className="fixed inset-0 z-[110] bg-black/50"
                                        style={{ zIndex: orderDetailZIndex }}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={handleClose}
                                    >
                                        <motion.div
                                            className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
                                            initial={{ x: "120%", opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            exit={{ x: "120%", opacity: 0 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {sheetContent}
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Portal>
                    )
                })()}
            </div>
        </FadeIn>
    )
}

