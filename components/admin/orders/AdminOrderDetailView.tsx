"use client"

import React, { useState, useEffect } from "react"
import {
    ChevronLeftIcon,
    ShoppingCartIcon,
    StoreIcon,
    UserIcon,
    PackageIcon,
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    TruckIcon,
    CalendarIcon,
    InfoIcon,
    ReturnIcon,
    FileIcon,
    MoneyIcon,
    ShareIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    ThreeDotsLoader,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

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

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
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
                <p className="text-base font-bold text-brand-dark dark:text-dark-heading">Pedido não encontrado</p>
                <Button variant="outline" onClick={onBack} className="mt-4">
                    Voltar aos pedidos
                </Button>
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

    const isPaid = order.situation === "paid"
    const isCancelled = order.situation === "cancelled"

    return (
        <FadeIn className="flex flex-col w-full min-h-screen bg-white dark:bg-dark-background">
            {/* Sticky Header */}
            <div className={`sticky top-0 z-20 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "shadow-sm py-3 px-4 md:px-8" : "py-4 px-4 md:px-8"}`}>
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onBack}
                            className="p-2 -ml-2 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading rounded-full"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </Button>

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                                    Pedido #{orderNumber}
                                </h1>
                                <Badge variant={isPaid ? "green" : isCancelled ? "red" : "orange"}>
                                    {isPaid ? "Pago" : isCancelled ? "Cancelado" : "Pendente"}
                                </Badge>
                                {order.delivery_status && (
                                    <Badge variant="blue">
                                        {order.delivery_status === "delivered" ? "Entregue" : order.delivery_status === "in_transit" ? "A Caminho" : "Preparando"}
                                    </Badge>
                                )}
                            </div>
                            <span className="text-xs text-brand-inactive-text mt-0.5">
                                Criado em {formatDateTime(order.created_at)} • Origem: {order.order_source || "Marketplace"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                toast.success("Link do pedido copiado!")
                            }}
                            leftIcon={<ShareIcon size={16} />}
                        >
                            Compartilhar
                        </Button>
                    </div>
                </div>

                {/* Sub-Tabs */}
                <div className="max-w-7xl mx-auto mt-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                            <TabsTrigger value="general" icon={ShoppingCartIcon}>
                                Dados Gerais
                            </TabsTrigger>
                            <TabsTrigger value="parties" icon={StoreIcon}>
                                Comprador & Seller
                            </TabsTrigger>
                            <TabsTrigger value="timeline" icon={ClockIcon}>
                                Histórico & Auditoria
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content Body */}
            <div className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6">
                {/* Banner de Troca / Devolução Vinculada */}
                {returns.length > 0 && (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/15 border border-orange-200 dark:border-orange-900/30 rounded-2xl flex items-start gap-3">
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

                {activeTab === "general" && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Coluna Principal: Itens do Pedido */}
                        <div className="col-span-12 lg:col-span-8 space-y-6">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm">
                                <div className="flex items-center justify-between pb-4 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex items-center gap-2">
                                        <PackageIcon className="w-5 h-5 text-brand-inactive-text" />
                                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                            Itens do Pedido ({items.length})
                                        </h2>
                                    </div>
                                </div>

                                <div className="divide-y divide-brand-border dark:divide-dark-border">
                                    {items.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-brand-inactive-text">Nenhum item registrado.</p>
                                    ) : (
                                        items.map((item: any) => {
                                            const itemImg = item.image_url ? getR2ImageUrl(item.image_url) : null
                                            return (
                                                <div key={item.id} className="py-4 flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-14 h-14 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                            {itemImg ? (
                                                                <img src={itemImg} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <PackageIcon className="w-6 h-6 text-brand-inactive-text" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex flex-col">
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                {item.product_name || "Produto"}
                                                            </span>
                                                            {item.variation_description && (
                                                                <span className="text-xs text-brand-inactive-text truncate">
                                                                    {item.variation_description}
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-brand-inactive-text mt-0.5">
                                                                Qtd: <strong>{item.quantity || 1}</strong> × {formatCurrency(Number(item.product_price || 0))}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="text-right shrink-0">
                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(Number(item.subtotal || item.net_item_value || (item.quantity * item.product_price) || 0))}
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Entrega e Endereço */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                    <TruckIcon className="w-5 h-5 text-brand-inactive-text" />
                                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                        Informações de Envio & Entrega
                                    </h2>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-xs font-semibold text-brand-inactive-text block">Modalidade</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                            {order.delivery_type === "pickup" ? "Retirada na Loja" : "Entrega / Delivery"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-brand-inactive-text block">Status da Entrega</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                            {order.delivery_status || "Não enviado"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Coluna Lateral: Resumo Financeiro e Pagamento */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            {/* Card de Resumo Financeiro */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                    <MoneyIcon className="w-5 h-5 text-brand-inactive-text" />
                                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                        Resumo Financeiro
                                    </h2>
                                </div>

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

                            {/* Card de Pagamento */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                    <InfoIcon className="w-5 h-5 text-brand-inactive-text" />
                                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                        Forma de Pagamento
                                    </h2>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div>
                                        <span className="text-xs font-semibold text-brand-inactive-text block mb-1">Método</span>
                                        <PaymentMethodIndicator label={order.payment_method || order.payment_provider || "Não definido"} />
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
                )}

                {activeTab === "parties" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Comprador */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                <UserIcon className="w-5 h-5 text-brand-inactive-text" />
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Dados do Comprador
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <UserProfileImage
                                    fullName={order.customer_name || buyer.full_name || "Cliente"}
                                    imageUrl={buyer.avatar_url}
                                    className="w-12 h-12 text-lg shrink-0"
                                />
                                <div className="min-w-0">
                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                        {order.customer_name || buyer.full_name || "Consumidor"}
                                    </h3>
                                    <span className="text-xs text-brand-inactive-text truncate block">
                                        {buyer.email || "Sem e-mail cadastrado"}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 text-sm border-t border-brand-border dark:border-dark-border">
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
                        </div>

                        {/* Loja / Seller */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 pb-3 border-b border-brand-border dark:border-dark-border">
                                <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Dados do Vendedor / Loja
                                </h2>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                    {store.logo_url ? (
                                        <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
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

                            <div className="space-y-2 pt-2 text-sm border-t border-brand-border dark:border-dark-border">
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
                )}

                {activeTab === "timeline" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Histórico de Auditoria e Eventos
                        </h2>

                        <div className="space-y-4">
                            <div className="flex items-start gap-3 border-l-2 border-brand-green pl-4 py-1">
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pedido Criado</p>
                                    <p className="text-xs text-brand-inactive-text">{formatDateTime(order.created_at)}</p>
                                </div>
                            </div>

                            {(order.audit_events || []).map((ev: any) => (
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
                    </div>
                )}
            </div>
        </FadeIn>
    )
}

export default AdminOrderDetailView
