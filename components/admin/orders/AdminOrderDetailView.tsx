"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    ReturnIcon,
    PackageIcon,
    StoreIcon,
    TruckIcon,
    ClockIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    ThreeDotsLoader,
    FormSection,
    IconPlaceholder,
    ListItem,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { getPaymentStatusMeta, getDeliveryStatusLabelForType } from "@/lib/orders/status"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

const formatDeliveryStatusLabel = (status?: string | null, deliveryType?: string | null) => {
    if (!status) return "Não enviado"
    return getDeliveryStatusLabelForType(status, deliveryType)
}

interface AdminOrderDetailViewProps {
    orderId: string
    initialOrder?: any
    onBack: () => void
}

export function AdminOrderDetailView({
    orderId,
    initialOrder,
    onBack,
}: AdminOrderDetailViewProps) {
    const [order, setOrder] = useState<any>(initialOrder || null)
    const [isLoading, setIsLoading] = useState(!initialOrder)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    useEffect(() => {
        let isMounted = true
        async function fetchDetail() {
            try {
                const data = await getAdminMarketplaceOrderDetail(orderId)
                if (isMounted && data) {
                    setOrder(data)
                }
            } catch (err) {
                console.error("Error fetching order detail:", err)
                toast.error("Erro ao carregar detalhes do pedido")
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }
        fetchDetail()
        return () => { isMounted = false }
    }, [orderId])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link do pedido copiado!")
    }, [])

    if (isLoading && !order) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={PackageIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Pedido não encontrado"
                    subtitle="O pedido pode ter sido removido ou o link está incorreto."
                    itemButton={{
                        text: "Voltar aos pedidos",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const orderNumber = order.order_number || order.id?.slice(0, 8)
    const items = order.order_items || []
    const returns = Array.isArray(order.return_requests) ? order.return_requests : []
    const buyer = order.buyer_profile || {}
    const store = order.stores || {}

    const subtotal = Number(order.subtotal_original || order.total_amount || 0)
    const discount = Number(order.discount_total || 0)
    const shipping = Number(order.shipping_total || 0)
    const total = Number(order.total_amount || order.paid_amount || 0)

    const paymentMeta = getPaymentStatusMeta(order.situation)
    const deliveryStatusLabel = formatDeliveryStatusLabel(order.delivery_status, order.delivery_type)

    const paymentMethodLabel = (() => {
        const raw = order.payment_method || order.payment_provider
        if (!raw) return "Não definido"
        return String(raw).toLowerCase().includes("mercado pago")
            ? "Mercado Pago"
            : raw
    })()

    return (
        <>
            <FadeIn>
                <div className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row - desktop */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">Pedido #{orderNumber}</span>
                                                <Badge variant={paymentMeta.variant}>
                                                    {paymentMeta.label}
                                                </Badge>
                                                {order.delivery_status && (
                                                    <Badge variant="blue">
                                                        {deliveryStatusLabel}
                                                    </Badge>
                                                )}
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Criado em {formatDateTime(order.created_at)} • Origem: {order.order_source || "Marketplace"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <Button
                                                variant="outline"
                                                onClick={handleShare}
                                                leftIcon={<ShareIcon size={16} />}
                                            >
                                                Compartilhar
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center justify-between gap-3 py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        Pedido #{orderNumber}
                                                    </h1>
                                                    <Badge variant={paymentMeta.variant}>
                                                        {paymentMeta.label}
                                                    </Badge>
                                                </div>
                                                <span className="text-xs text-brand-inactive-text truncate">
                                                    Criado em {formatDateTime(order.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleShare}
                                            className="shrink-0"
                                        >
                                            Compartilhar
                                        </Button>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="parties">Comprador e Loja</TabsTrigger>
                                            <TabsTrigger value="timeline">Histórico & Auditoria</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            {/* Banner de Troca / Devolução Vinculada */}
                                            {returns.length > 0 && (
                                                <div className="p-4 bg-orange-50 dark:bg-orange-900/15 border border-orange-200 dark:border-orange-900/30 rounded-2xl flex items-start gap-3 mb-8">
                                                    <ReturnIcon className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-sm font-bold text-orange-950 dark:text-orange-300">
                                                            Solicitação de Troca ou Devolução Registrada ({returns.length})
                                                        </h3>
                                                        <p className="text-xs text-orange-900/80 dark:text-orange-400/80 mt-0.5">
                                                            Este pedido possui uma ou mais solicitações de pós-venda em andamento ou finalizadas.
                                                        </p>
                                                    </div>
                                                    <Link
                                                        href="/ddt-admin/returns"
                                                        className="text-xs font-bold text-orange-700 dark:text-orange-400 hover:underline shrink-0"
                                                    >
                                                        Ver em Devoluções →
                                                    </Link>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title={`Itens do Pedido (${items.length})`} hasSeparator>
                                                        {items.length === 0 ? (
                                                            <div className="py-6">
                                                                <IconPlaceholder
                                                                    icon={PackageIcon}
                                                                    containerSize="w-14 h-14 mb-2"
                                                                    iconSize="w-6 h-6"
                                                                    title="Nenhum item registrado"
                                                                    subtitle="Este pedido não possui itens vinculados."
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-4">
                                                                {items.map((item: any) => {
                                                                    const itemImg = item.products?.images?.length ? getR2ImageUrl(item.products.images) : null
                                                                    return (
                                                                        <div key={item.id} className="flex items-start gap-4">
                                                                            <div className="w-14 h-14 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                                {itemImg ? (
                                                                                    <img src={itemImg} alt="" className="w-full h-full object-cover rounded-xl" />
                                                                                ) : (
                                                                                    <IconPlaceholder
                                                                                        icon={PackageIcon}
                                                                                        containerSize="w-14 h-14"
                                                                                        iconSize="w-6 h-6"
                                                                                    />
                                                                                )}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex justify-between items-start gap-2">
                                                                                    <div className="min-w-0 flex flex-col">
                                                                                        <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                                            {item.product_name || "Produto"}
                                                                                        </h4>
                                                                                        {item.product_variants?.variant_name && (
                                                                                            <span className="text-xs text-brand-inactive-text truncate">
                                                                                                {item.product_variants.variant_name}
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="text-xs text-brand-inactive-text mt-0.5">
                                                                                            Qtd: <strong>{item.quantity || 1}</strong> × {formatCurrency(Number(item.product_price || 0))}
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading shrink-0">
                                                                                        {formatCurrency(Number(item.subtotal || item.net_item_value || (item.quantity * item.product_price) || 0))}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </FormSection>

                                                    <FormSection title="Informações de Envio & Entrega" hasSeparator>
                                                        <ListItem
                                                            left={
                                                                <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                                    <TruckIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                                                                </div>
                                                            }
                                                            title={order.delivery_type === "pickup" ? "Retirada na Loja" : "Entrega / Delivery"}
                                                            description={`Status: ${deliveryStatusLabel}`}
                                                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                        />
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Resumo Financeiro
                                                        </h3>
                                                        <div className="space-y-2.5 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Subtotal dos produtos</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(subtotal)}</span>
                                                            </div>
                                                            {discount > 0 && (
                                                                <div className="flex justify-between text-red-500">
                                                                    <span>Descontos</span>
                                                                    <span className="font-semibold">-{formatCurrency(discount)}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Frete</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{shipping > 0 ? formatCurrency(shipping) : "Grátis"}</span>
                                                            </div>
                                                            <div className="pt-3 border-t border-brand-border dark:border-dark-border flex justify-between items-center text-base">
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">Total Pago</span>
                                                                <span className="font-bold text-brand-green text-lg">{formatCurrency(total)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Forma de Pagamento
                                                        </h3>
                                                        <div className="space-y-3 text-sm">
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block mb-1">Método</span>
                                                                <PaymentMethodIndicator label={paymentMethodLabel} />
                                                            </div>
                                                            {order.payment_provider && (
                                                                <div>
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Provedor</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{order.payment_provider}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Dados do Comprador" hasSeparator>
                                                        <ListItem
                                                            left={
                                                                <UserProfileImage
                                                                    fullName={order.customer_name || buyer.full_name || "Cliente"}
                                                                    imageUrl={buyer.avatar_url}
                                                                    className="w-12 h-12 text-lg shrink-0"
                                                                />
                                                            }
                                                            title={order.customer_name || buyer.full_name || "Consumidor"}
                                                            description={buyer.email || "Sem e-mail cadastrado"}
                                                        />

                                                        <div className="space-y-2 text-sm pt-2">
                                                            {buyer.phone && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-inactive-text">Telefone</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{buyer.phone}</span>
                                                                </div>
                                                            )}
                                                            {buyer.cpf && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-inactive-text">CPF</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{buyer.cpf}</span>
                                                                </div>
                                                            )}
                                                            {order.buyer_id && (
                                                                <div className="pt-2">
                                                                    <Link
                                                                        href={`/ddt-admin/users?search=${order.buyer_id}`}
                                                                        className="text-xs font-bold text-brand-green hover:underline"
                                                                    >
                                                                        Ver ficha completa do usuário →
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Dados do Vendedor / Loja
                                                        </h3>
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                                {store.logo_url ? (
                                                                    <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <IconPlaceholder
                                                                        icon={StoreIcon}
                                                                        containerSize="w-12 h-12"
                                                                        iconSize="w-6 h-6"
                                                                    />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                    {store.name || "Loja Parceira"}
                                                                </h3>
                                                                <span className="text-xs text-brand-inactive-text">
                                                                    Pontuação de Risco: <strong>{store.risk_score || 0} pts</strong>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 text-sm">
                                                            {store.phone && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-inactive-text">Telefone</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{store.phone}</span>
                                                                </div>
                                                            )}
                                                            {store.partner_id && (
                                                                <div className="pt-2">
                                                                    <Link
                                                                        href={`/ddt-admin/partners?search=${store.name || store.partner_id}`}
                                                                        className="text-xs font-bold text-brand-green hover:underline"
                                                                    >
                                                                        Ver ficha completa do parceiro →
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <FormSection title="Histórico de Auditoria e Eventos" hasSeparator>
                                                {(() => {
                                                    const events = order.audit_events || []
                                                    if (events.length === 0) {
                                                        return (
                                                            <IconPlaceholder
                                                                icon={ClockIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhum evento registrado"
                                                                subtitle="Este pedido ainda não possui eventos de auditoria."
                                                            />
                                                        )
                                                    }
                                                    return (
                                                        <div className="space-y-4">
                                                            <div className="flex items-start gap-3 border-l-2 border-brand-green pl-4 py-1">
                                                                <div className="flex-1">
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pedido Criado</p>
                                                                    <p className="text-xs text-brand-inactive-text">{formatDateTime(order.created_at)}</p>
                                                                </div>
                                                            </div>

                                                            {events.map((ev: any) => (
                                                                <div key={ev.id} className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1">
                                                                    <div className="flex-1">
                                                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                            {ev.action_type || "Ação Administrativa"}
                                                                        </p>
                                                                        <p className="text-xs text-brand-inactive-text">{formatDateTime(ev.created_at)}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                })()}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleShare} leftIcon={<ShareIcon size={16} />}>
                    Compartilhar
                </Button>
            </div>
        </>
    )
}

export default AdminOrderDetailView