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
    CustomerCard,
    Accordion,
    SidebarCard,
} from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
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
    BoxIcon,
    XIcon,
    EyeIcon,
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

    // Expiration Timer: 15 minutes (900 seconds)
    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(() => {
        if (!offer.assigned_at) return null
        const assignedTime = new Date(offer.assigned_at).getTime()
        const expireTime = assignedTime + 15 * 60 * 1000
        const diffSec = Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
        return diffSec
    })

    useEffect(() => {
        if (!offer.assigned_at) return
        const interval = setInterval(() => {
            const assignedTime = new Date(offer.assigned_at).getTime()
            const expireTime = assignedTime + 15 * 60 * 1000
            const diffSec = Math.max(0, Math.floor((expireTime - Date.now()) / 1000))
            setTimeLeftSeconds(diffSec)
        }, 30000)
        return () => clearInterval(interval)
    }, [offer.assigned_at])

    const isExpired = timeLeftSeconds !== null && timeLeftSeconds <= 0

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
        if (isExpired) {
            toast.error("Esta oferta expirou após 15 minutos.")
            return
        }

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
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBackClick} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            <Badge variant="orange" className="shrink-0">Disponível</Badge>
                                            {ordersList.length > 1 && (
                                                <Badge variant="gray" className="shrink-0">{ordersList.length} paradas</Badge>
                                            )}
                                        </h1>
                                        <div className="flex items-center gap-4 text-xs text-brand-inactive-text dark:text-dark-body">
                                            <span>Loja: <strong className="text-brand-dark dark:text-dark-heading">{offer.store_name || offer.partner_name || "Estabelecimento"}</strong></span>
                                            <span>•</span>
                                            <span>Taxa de Entrega: <strong className="text-brand-green">{formatCurrency(totalRouteDeliveryFee)}</strong></span>
                                            {timeLeftSeconds !== null && (
                                                <>
                                                    <span>•</span>
                                                    <span className={`flex items-center gap-1 font-semibold ${isExpired ? "text-red-500" : timeLeftSeconds < 180 ? "text-amber-500" : "text-brand-inactive-text"}`}>
                                                        <ClockIcon size={13} />
                                                        {isExpired ? "Expirada" : `${Math.floor(timeLeftSeconds / 60)} min restantes`}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <Button
                                            variant="default"
                                            size="default"
                                            onClick={handleAccept}
                                            disabled={loading || isExpired}
                                            isLoading={loading}
                                            className="font-bold shadow-none"
                                        >
                                            {isExpired ? "Oferta Expirada" : "Aceitar Entrega"}
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
                                                {isExpired && (
                                                    <InfoCard
                                                        title="Oferta de entrega expirada"
                                                        message="Esta oportunidade esteve disponível por 15 minutos e não foi aceita a tempo. Volte para a lista para ver novas entregas."
                                                        color="red"
                                                    />
                                                )}

                                                {offer.notes && (
                                                    <InfoCard title="Instruções do Estabelecimento" message={offer.notes} color="orange" />
                                                )}

                                                {/* Local de Coleta */}
                                                <FormSection title="Local de Coleta (Estabelecimento)" hasSeparator>
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
                                                    const cleanCustPhone = (order.customer_phone || "").replace(/\D/g, "")
                                                    const custMaps = order.delivery_address
                                                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
                                                        : null
                                                    const custWaze = order.delivery_address
                                                        ? `https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}`
                                                        : null
                                                    const custWhatsapp = cleanCustPhone ? `https://wa.me/55${cleanCustPhone}` : null
                                                    const stopTitle = ordersList.length > 1
                                                        ? `Parada ${idx + 1} de ${ordersList.length} - ${order.customer_name || "Cliente"} (Pedido #${order.order_number || String(order.order_id).slice(0, 8)})`
                                                        : "Local de Entrega (Cliente)"

                                                    return (
                                                        <FormSection key={order.order_id || idx} title={stopTitle} hasSeparator>
                                                            <div
                                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer rounded-xl hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors -mx-2 px-2 py-2"
                                                                onClick={() => { setSelectedOrderForDetail(order); setIsOrderDetailSheetOpen(true) }}
                                                            >
                                                                <div className="space-y-1 min-w-0">
                                                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading flex items-center gap-2 flex-wrap">
                                                                        <span>{order.customer_name || "Cliente"}</span>
                                                                        {order.total_amount && (
                                                                            <span className="text-xs font-normal text-brand-inactive-text">
                                                                                ({formatCurrency(order.total_amount)})
                                                                            </span>
                                                                        )}
                                                                    </h3>
                                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-start gap-1">
                                                                        <span>{order.delivery_address || "Endereço não informado"}</span>
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
                                                                            <EyeIcon size={16} /> Ver Detalhes do Pedido
                                                                        </DropdownItem>
                                                                        {custMaps && (
                                                                            <DropdownItem onClick={() => window.open(custMaps, "_blank")}>
                                                                                <MapPinIcon size={16} /> Abrir Rota no Maps
                                                                            </DropdownItem>
                                                                        )}
                                                                        {custWaze && (
                                                                            <DropdownItem onClick={() => window.open(custWaze, "_blank")}>
                                                                                <TruckIcon size={16} /> Abrir no Waze
                                                                            </DropdownItem>
                                                                        )}
                                                                        {cleanCustPhone && (
                                                                            <DropdownItem onClick={() => window.open(`tel:${cleanCustPhone}`, "_self")}>
                                                                                <PhoneIcon size={16} /> Ligar para o Cliente
                                                                            </DropdownItem>
                                                                        )}
                                                                        {custWhatsapp && (
                                                                            <DropdownItem onClick={() => window.open(custWhatsapp, "_blank")}>
                                                                                <WhatsappIcon size={16} /> WhatsApp
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
                                                <SidebarCard hasSeparator title="Remuneração & Valores">
                                                    <InfoCard
                                                        title="Sua Taxa de Entrega (Total)"
                                                        message={formatCurrency(totalRouteDeliveryFee)}
                                                        color="green"
                                                    />
                                                    <div className="space-y-3 text-xs mt-4">
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
                                                                    <Badge variant={getPaymentStatusMeta(offer.payment_status).variant}>
                                                                        {getPaymentStatusMeta(offer.payment_status).label}
                                                                    </Badge>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    <div className="pt-4 border-t border-brand-border dark:border-dark-border mt-4">
                                                        <Button
                                                            variant="default"
                                                            size="lg"
                                                            onClick={handleAccept}
                                                            disabled={loading || isExpired}
                                                            isLoading={loading}
                                                            className="w-full font-bold shadow-none"
                                                        >
                                                            {isExpired ? "Oferta Expirada" : "Aceitar Entrega"}
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
                        const paymentMeta = getPaymentStatusMeta(order.payment_status || order.situation || "pending")
                        const deliveryMeta = getDeliveryStatusMeta("available")
                        const ordItems = order.items || []
                        const orderDate = order.created_at || order.order_date || order.order_created_at || offer.assigned_at

                        const orderHistoryEntries: HistoryEntry[] = []
                        if (order.created_at || order.order_date) {
                            orderHistoryEntries.push({ id: "created", actor_name: "Sistema", change_lines: ["Pedido criado"], created_at: order.created_at || order.order_date, entry_type: "status" })
                        }
                        if (order.payment_status === "paid" || order.situation === "paid" || order.situation === "concluído") {
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
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-lg">
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
                                                    <Badge variant={paymentMeta.variant}>{paymentMeta.label}</Badge>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status de Entrega</span>
                                                    <Badge variant={deliveryMeta.variant} icon={getDeliveryStatusIcon("available")}>
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
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium shrink-0">Endereço de Entrega</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-right flex items-start gap-1">
                                                            <MapPinIcon size={14} className="shrink-0 mt-0.5 text-brand-inactive-text" />
                                                            {order.delivery_address}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-brand-border dark:border-dark-border w-full" />

                                            <CustomerCard
                                                customer={{
                                                    name: order.customer_name || "Cliente",
                                                    phone: order.customer_phone || "",
                                                    email: order.customer_email || "",
                                                }}
                                                address={order.delivery_address ? parseAddressString(order.delivery_address) : null}
                                                showMap={true}
                                                chrome="minimal"
                                            />

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
                                                                        className="w-full h-full object-cover rounded-xl"
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

