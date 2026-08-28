"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
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
} from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import type { DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"

const SidebarCard = ({ title, children, className = "" }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) => (
    <>
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 ${className}`}>
            {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
            {children}
        </div>
        <FormSection title={title} hasSeparator className="lg:hidden">
            {children}
        </FormSection>
    </>
)

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
                                                <Badge variant="blue" className="shrink-0">{ordersList.length} Paradas</Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {offer.store_name || offer.partner_name || "Loja"} • {offer.assigned_at ? formatDate(offer.assigned_at) : "Hoje"}
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {timeLeftSeconds !== null && (
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${isExpired
                                                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/40"
                                                : timeLeftSeconds < 180
                                                    ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/40"
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
                                            size="sm"
                                            onClick={handleAccept}
                                            disabled={loading || isExpired}
                                            isLoading={loading}
                                            className="font-bold"
                                        >
                                            {isExpired ? "Oferta Expirada" : "Aceitar Entrega"}
                                        </Button>
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="resumo">Resumo</TabsTrigger>
                                        <TabsTrigger value="itens">Itens do Pedido</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
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
                                                <FormSection title="Local de Coleta (Estabelecimento)">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div className="space-y-1">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
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
                                                                    <Button variant="outline" size="sm">Contato / Rota</Button>
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
                                                    const custWaze = order.delivery_address
                                                        ? `https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}`
                                                        : null
                                                    const stopTitle = ordersList.length > 1
                                                        ? `Parada ${idx + 1} de ${ordersList.length} - ${order.customer_name || "Cliente"} (Pedido #${order.order_number || String(order.order_id).slice(0, 8)})`
                                                        : "Local de Entrega (Cliente)"

                                                    return (
                                                        <FormSection key={order.order_id || idx} title={stopTitle} hasSeparator>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                                <div className="space-y-1">
                                                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading flex items-center gap-2">
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
                                                                <div className="shrink-0">
                                                                    <ActionsDropdown
                                                                        trigger={
                                                                            <Button variant="outline" size="sm">Rota</Button>
                                                                        }
                                                                    >
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
                                                                    </ActionsDropdown>
                                                                </div>
                                                            </div>
                                                        </FormSection>
                                                    )
                                                })}
                                            </div>

                                            {/* RIGHT SIDEBAR COLUMN with divider */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                                <SidebarCard title="Remuneração & Valores">
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
            </div>
        </FadeIn>
    )
}
