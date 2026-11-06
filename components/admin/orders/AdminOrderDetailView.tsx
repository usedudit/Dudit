"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    ReturnIcon,
    PackageIcon,
    TruckIcon,
    ClockIcon,
    UserIcon,
    ThreeDotsIcon,
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
    DefaultModal,
    Input,
    ActionsDropdown,
    DropdownItem,
    SidebarCard,
    FormTextarea,
} from "@/components/reusable"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { getPaymentStatusMeta, getDeliveryStatusLabelForType } from "@/lib/orders/status"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"
import { updateUserRiskScore } from "@/app/actions/admin/enforcement"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"

const formatDeliveryStatusLabel = (status?: string | null, deliveryType?: string | null) => {
    if (!status) return "Não enviado"
    return getDeliveryStatusLabelForType(status, deliveryType)
}

const formatPaymentMethodName = (method: string) => {
    const map: Record<string, string> = {
        pix: "Pix",
        credit_card: "Cartão de Crédito",
        debit_card: "Cartão de Débito",
        money: "Dinheiro",
        cash: "Dinheiro",
        store_credit: "Vale-compra",
        transfer: "Transferência",
        link: "Link de Pagamento",
        boleto: "Boleto",
        wallet: "Carteira Digital",
        mercadopago: "Mercado Pago",
    }
    return map[method?.toLowerCase()] || method
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
    const [isPending, startTransition] = useTransition()

    // Risk Score Modal for Buyer
    const [riskModalOpen, setRiskModalOpen] = useState(false)
    const [newRiskScore, setNewRiskScore] = useState("")
    const [riskTitle, setRiskTitle] = useState("")
    const [riskReason, setRiskReason] = useState("")

    // Header override for mobile back button
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const orderNumber = order?.order_number || orderId?.slice(0, 8)
    const orderTitle = `Pedido #${orderNumber}`

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: orderTitle,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [orderTitle, onBack, setHeaderOverride])

    const fetchDetail = useCallback(async () => {
        try {
            const data = await getAdminMarketplaceOrderDetail(orderId)
            if (data) {
                setOrder(data)
            }
        } catch (err) {
            console.error("Error fetching order detail:", err)
            toast.error("Erro ao carregar detalhes do pedido")
        } finally {
            setIsLoading(false)
        }
    }, [orderId])

    useEffect(() => {
        fetchDetail()
    }, [fetchDetail])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link do pedido copiado!")
    }, [])

    const handleCopyOrderId = useCallback(() => {
        if (!order?.id) return
        navigator.clipboard.writeText(order.id)
        toast.success("ID do pedido copiado com sucesso!")
    }, [order?.id])

    const handleSaveRiskScore = () => {
        if (!order?.buyer_id) return
        const score = Number(newRiskScore)
        if (isNaN(score) || score < 0 || score > 100) {
            toast.error("Pontuação de risco deve ser um número entre 0 e 100.")
            return
        }
        if (!riskReason.trim()) {
            toast.error("Por favor, descreva o motivo do ajuste para auditoria.")
            return
        }

        startTransition(async () => {
            try {
                const res = await updateUserRiskScore(order.buyer_id, score, riskReason.trim(), riskTitle.trim() || undefined)
                if (res.success) {
                    toast.success("Score de risco do cliente atualizado e notificação enviada!")
                    setRiskModalOpen(false)
                    setRiskTitle("")
                    setRiskReason("")
                    fetchDetail()
                } else {
                    toast.error(res.error || "Erro ao atualizar score de risco.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado ao salvar.")
            }
        })
    }

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

    const items = order.order_items || []
    const returns = Array.isArray(order.return_requests) ? order.return_requests : []
    const buyer = order.buyer_profile || {}
    const store = order.stores || {}
    const driver = order.delivery_driver || null

    // Accurate financial calculations
    const calculatedItemsSubtotal = items.reduce((sum: number, it: any) => {
        const unit = Number(it.product_price ?? it.unit_price ?? it.products?.price ?? it.services?.price ?? 0)
        const total = Number(it.subtotal ?? it.net_item_value ?? (unit * (it.quantity || 1)))
        return sum + total
    }, 0)

    const subtotal = Number(order.subtotal_original || order.subtotal || (calculatedItemsSubtotal > 0 ? calculatedItemsSubtotal : order.total_amount) || 0)
    const discount = Number(order.discount_total || order.discount_amount || 0)
    const paymentMethodDiscount = Number(order.payment_method_discount_amount || 0)
    const couponDiscount = Number(order.coupon_discount || 0)
    const storeCreditAmount = Number(order.store_credit_amount || 0)

    const shipping = Number(order.delivery_fee ?? order.shipping_total ?? order.shipping_amount ?? 0)
    const deliverySubsidy = Number(order.delivery_breakdown?.deliverySubsidy || 0)
    const isDeliveryFree = shipping === 0 && order.delivery_type !== "pickup"
    const isDeliverySellerPaid = order.delivery_payer === "seller"

    const interestAmount = Number(order.payment_method_interest_amount || 0)
    const feeAmount = Number(order.payment_method_fee_amount || order.payment_method_fixed_fee_amount || order.payment_method_extra_amount || 0)
    const total = Number(order.total_amount || order.paid_amount || order.amount_paid || 0)

    const paymentMeta = getPaymentStatusMeta(order.situation)
    const deliveryStatusLabel = formatDeliveryStatusLabel(order.delivery_status, order.delivery_type)

    // Parse payment breakdown if multiple methods exist
    const rawBreakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
    const paymentBreakdown = rawBreakdown.filter((p: any) => p && (p.amount > 0 || p.method))

    const paymentMethodLabel = (() => {
        const raw = order.payment_method || order.payment_provider
        if (!raw) return "Não definido"
        return formatPaymentMethodLabel(raw, null)
    })()

    // Delivery address formatted
    const deliveryAddress = order.delivery_address || order.address || null

    return (
        <>
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
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

                                    {/* Title row */}
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

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Criado em {formatDateTime(order.created_at)} • Origem: {order.order_source || "Marketplace"} • UUID: {order.id}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-3">
                                            <ActionsDropdown>
                                                <DropdownItem onClick={handleShare}>
                                                    <ShareIcon size={16} /> Compartilhar
                                                </DropdownItem>
                                            </ActionsDropdown>
                                        </div>
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
                                                    {/* Itens do Pedido */}
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
                                                                    const itemImg = item.products?.images?.length
                                                                        ? getR2ImageUrl(item.products.images)
                                                                        : item.services?.images?.length
                                                                            ? getR2ImageUrl(item.services.images)
                                                                            : null

                                                                    const unitPrice = Number(item.product_price ?? item.unit_price ?? item.products?.price ?? item.services?.price ?? 0)
                                                                    const lineTotal = Number(item.subtotal ?? item.net_item_value ?? (unitPrice * (item.quantity || 1)))
                                                                    const originalPrice = Number(item.original_price || 0)
                                                                    const isGift = Boolean(item.is_gift)

                                                                    return (
                                                                        <div key={item.id || Math.random()} className="flex items-start gap-4 p-3 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/40">
                                                                            <div className="w-14 h-14 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-center bg-white dark:bg-dark-surface">
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
                                                                                        <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate flex items-center gap-1.5 flex-wrap">
                                                                                            {isGift && <Badge variant="green">BRINDE</Badge>}
                                                                                            <span>{item.product_name || item.products?.name || item.services?.name || "Produto / Serviço"}</span>
                                                                                        </h4>

                                                                                        {item.product_variants?.variant_name && (
                                                                                            <span className="text-xs text-brand-inactive-text truncate">
                                                                                                Variação: {item.product_variants.variant_name}
                                                                                            </span>
                                                                                        )}

                                                                                        {item.products?.sku && (
                                                                                            <span className="text-[11px] font-mono text-brand-inactive-text">
                                                                                                SKU: {item.products.sku}
                                                                                            </span>
                                                                                        )}

                                                                                        <span className="text-xs text-brand-inactive-text mt-0.5 flex items-center gap-1.5">
                                                                                            <span>Qtd: <strong>{item.quantity || 1}</strong> ×</span>
                                                                                            {isGift ? (
                                                                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                            ) : originalPrice > unitPrice ? (
                                                                                                <span className="flex items-center gap-1">
                                                                                                    <span className="line-through text-[11px] text-brand-inactive-text">{formatCurrency(originalPrice)}</span>
                                                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(unitPrice)}</span>
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(unitPrice)}</span>
                                                                                            )}
                                                                                        </span>
                                                                                    </div>

                                                                                    <div className="flex flex-col items-end shrink-0 gap-0.5">
                                                                                        {!isGift && (
                                                                                            <>
                                                                                                <span className="text-[10px] text-brand-inactive-text">Valor do item</span>
                                                                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                                                    {formatCurrency(lineTotal)}
                                                                                                </span>
                                                                                                {item.quantity && item.quantity > 1 && (
                                                                                                    <span className="text-[11px] font-medium text-brand-inactive-text">
                                                                                                        {item.quantity} × {formatCurrency(unitPrice)}
                                                                                                    </span>
                                                                                                )}
                                                                                            </>
                                                                                        )}
                                                                                        {isGift && (
                                                                                            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                                                                                Grátis
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </FormSection>

                                                    {/* Informações de Envio & Entrega */}
                                                    <FormSection title="Informações de Envio & Entrega" hasSeparator>
                                                        <div className="space-y-4">
                                                            <ListItem
                                                                left={
                                                                    <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                                        <TruckIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                                                                    </div>
                                                                }
                                                                title={order.delivery_type === "pickup" ? "Retirada na Loja" : "Entrega no Endereço / Delivery"}
                                                                description={`Status: ${deliveryStatusLabel} • Tipo: ${order.delivery_type === "pickup" ? "Retirada no Local" : "Entrega Própria / Dudit"}`}
                                                                className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                            />

                                                            {/* Endereço de Entrega */}
                                                            {order.delivery_type !== "pickup" && deliveryAddress && (
                                                                <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface space-y-1">
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block mb-1">
                                                                        Endereço de Entrega
                                                                    </span>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {deliveryAddress.street || deliveryAddress.logradouro || "Rua não informada"}
                                                                        {deliveryAddress.number ? `, ${deliveryAddress.number}` : ""}
                                                                        {deliveryAddress.complement ? ` - ${deliveryAddress.complement}` : ""}
                                                                    </p>
                                                                    <p className="text-xs text-brand-inactive-text">
                                                                        {deliveryAddress.neighborhood || deliveryAddress.bairro || ""}
                                                                        {(deliveryAddress.city || deliveryAddress.cidade) ? ` • ${deliveryAddress.city || deliveryAddress.cidade}` : ""}
                                                                        {(deliveryAddress.state || deliveryAddress.estado) ? ` - ${deliveryAddress.state || deliveryAddress.estado}` : ""}
                                                                        {(deliveryAddress.cep || deliveryAddress.postal_code) ? ` • CEP ${deliveryAddress.cep || deliveryAddress.postal_code}` : ""}
                                                                    </p>
                                                                    {deliveryAddress.reference && (
                                                                        <p className="text-xs text-brand-inactive-text italic mt-1">
                                                                            Ref: {deliveryAddress.reference}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Card do Entregador */}
                                                            {driver ? (
                                                                <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-surface/60 space-y-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
                                                                            Entregador Responsável
                                                                        </span>
                                                                        <Badge variant={driver.type === "dudit_platform" ? "green" : "gray"}>
                                                                            {driver.type === "dudit_platform" ? "Entregador Dudit (Plataforma)" : "Entregador da Loja"}
                                                                        </Badge>
                                                                    </div>

                                                                    <div className="flex items-center gap-3">
                                                                        <UserProfileImage
                                                                            fullName={driver.full_name || "Entregador"}
                                                                            imageUrl={driver.avatar_url}
                                                                            className="w-12 h-12 text-base shrink-0"
                                                                        />
                                                                        <div className="flex flex-col min-w-0 flex-1">
                                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                {driver.full_name}
                                                                            </span>
                                                                            <div className="flex items-center gap-2 text-xs text-brand-inactive-text flex-wrap">
                                                                                {driver.phone && <span>Tel: {driver.phone}</span>}
                                                                                {driver.email && <span>• {driver.email}</span>}
                                                                                {driver.vehicle_type && (
                                                                                    <span>• Veículo: <strong className="capitalize">{driver.vehicle_type}</strong></span>
                                                                                )}
                                                                                {driver.city && (
                                                                                    <span>• {driver.city}{driver.neighborhood ? `, ${driver.neighborhood}` : ""}</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {driver.delivery_fee != null && Number(driver.delivery_fee) > 0 && (
                                                                        <div className="pt-2 border-t border-brand-border dark:border-dark-border flex justify-between text-xs">
                                                                            <span className="text-brand-inactive-text">Taxa do Entregador</span>
                                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(driver.delivery_fee))}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="p-3 rounded-xl border border-dashed border-brand-border dark:border-dark-border text-xs text-brand-inactive-text flex items-center gap-2">
                                                                    <TruckIcon size={16} />
                                                                    <span>Nenhum entregador específico foi alocado a este pedido ainda.</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Resumo Financeiro */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Resumo Financeiro">
                                                        <div className="space-y-2.5 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Subtotal dos itens</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(subtotal)}</span>
                                                            </div>

                                                            {discount > 0 && (
                                                                <div className="flex justify-between text-red-500">
                                                                    <span>Desconto no pedido</span>
                                                                    <span className="font-semibold">-{formatCurrency(discount)}</span>
                                                                </div>
                                                            )}

                                                            {couponDiscount > 0 && (
                                                                <div className="flex justify-between text-red-500">
                                                                    <span>Cupom ({order.coupon_code || "Aplicado"})</span>
                                                                    <span className="font-semibold">-{formatCurrency(couponDiscount)}</span>
                                                                </div>
                                                            )}

                                                            {paymentMethodDiscount > 0 && (
                                                                <div className="flex justify-between text-red-500">
                                                                    <span>Desconto do meio de pagamento</span>
                                                                    <span className="font-semibold">-{formatCurrency(paymentMethodDiscount)}</span>
                                                                </div>
                                                            )}

                                                            {storeCreditAmount > 0 && (
                                                                <div className="flex justify-between text-brand-blue dark:text-blue-400">
                                                                    <span>Vale-compra utilizado</span>
                                                                    <span className="font-semibold">-{formatCurrency(storeCreditAmount)}</span>
                                                                </div>
                                                            )}

                                                            <div className="flex justify-between text-brand-inactive-text items-center">
                                                                <span className="flex items-center gap-1">
                                                                    <span>Frete / Entrega</span>
                                                                    {isDeliverySellerPaid && <span className="text-[11px] text-orange-500">(Loja)</span>}
                                                                </span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {shipping > 0
                                                                        ? formatCurrency(shipping)
                                                                        : isDeliveryFree
                                                                            ? "Grátis"
                                                                            : order.delivery_type === "pickup"
                                                                                ? "Retirada (R$ 0,00)"
                                                                                : "Grátis"}
                                                                </span>
                                                            </div>

                                                            {interestAmount > 0 && (
                                                                <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                                                    <span>Juros de parcelamento</span>
                                                                    <span className="font-semibold">+{formatCurrency(interestAmount)}</span>
                                                                </div>
                                                            )}

                                                            {feeAmount > 0 && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Taxas operacionais</span>
                                                                    <span className="font-semibold">+{formatCurrency(feeAmount)}</span>
                                                                </div>
                                                            )}

                                                            <div className="pt-3 border-t border-brand-border dark:border-dark-border flex justify-between items-center text-base">
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">Total Pago</span>
                                                                <span className="font-bold text-brand-green text-lg">{formatCurrency(total)}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>

                                                    {/* Formas de Pagamento */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            {paymentBreakdown.length > 1 ? "Formas de Pagamento (Múltiplas)" : "Forma de Pagamento"}
                                                        </h3>
                                                        <div className="space-y-3 text-sm">
                                                            {paymentBreakdown.length > 0 ? (
                                                                <div className="space-y-2.5 divide-y divide-brand-border dark:divide-dark-border">
                                                                    {paymentBreakdown.map((entry: any, index: number) => (
                                                                        <div key={index} className="pt-2 first:pt-0 flex justify-between items-center gap-2">
                                                                            <div className="flex flex-col">
                                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                                    {formatPaymentMethodName(entry.method || "Pagamento")}
                                                                                </span>
                                                                                {entry.installmentNumber && entry.installmentNumber > 1 && (
                                                                                    <span className="text-xs text-brand-inactive-text">
                                                                                        {entry.installmentNumber}x de {formatCurrency((entry.amount || 0) / entry.installmentNumber)}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                                {formatCurrency(Number(entry.amount || 0))}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block mb-1">Método</span>
                                                                    <PaymentMethodIndicator label={paymentMethodLabel} provider={order.payment_provider} />
                                                                </div>
                                                            )}

                                                            {order.payment_provider && (
                                                                <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Provedor de Gateway</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{order.payment_provider}</span>
                                                                </div>
                                                            )}

                                                            {order.mp_payment_id && (
                                                                <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Mercado Pago ID</span>
                                                                    <span className="font-mono text-xs text-brand-dark dark:text-dark-heading">{order.mp_payment_id}</span>
                                                                </div>
                                                            )}

                                                            {order.mp_date_approved && (
                                                                <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Aprovado em</span>
                                                                    <span className="text-xs text-brand-dark dark:text-dark-heading">{formatDateTime(order.mp_date_approved)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Identificadores do Pedido */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Identificadores
                                                        </h3>
                                                        <div className="space-y-2 text-xs">
                                                            <div>
                                                                <span className="text-brand-inactive-text block">Número do Pedido</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">#{orderNumber}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-brand-inactive-text block">UUID do Pedido</span>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-brand-dark dark:text-dark-heading select-all truncate">{order.id}</span>
                                                                    <Button
                                                                        variant="link"
                                                                        onClick={handleCopyOrderId}
                                                                        className="text-sm shrink-0"
                                                                    >
                                                                        Copiar
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 2: Comprador e Loja */}
                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal: Comprador */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <AdminBuyerCard
                                                        buyer={buyer}
                                                        buyerId={order.buyer_id}
                                                        customerName={order.customer_name}
                                                        onAdjustRisk={() => {
                                                            setNewRiskScore(String(buyer.risk_score || 0))
                                                            setRiskModalOpen(true)
                                                        }}
                                                    />
                                                </div>

                                                {/* Sidebar: Loja */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <AdminStoreCard
                                                        store={store}
                                                        fallbackStoreId={order.store_id}
                                                    />
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 3: Histórico & Auditoria */}
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

                                                    // Map events to HistoryEntry format for HistoryTimeline
                                                    const historyEntries: HistoryEntry[] = [
                                                        {
                                                            id: `created-${order.id}`,
                                                            actor_name: "Sistema",
                                                            change_lines: ["Pedido criado"],
                                                            created_at: order.created_at,
                                                            entry_type: "order_created",
                                                            highlight: false,
                                                        },
                                                        ...events.map((ev: any) => {
                                                            const isDuditAction = ev.metadata?.dudit_action === true || ev.source_table === "audit_logs"
                                                            const actorName = isDuditAction
                                                                ? (ev.metadata?.admin_actor_name || ev.admin_name || "Equipe Dudit")
                                                                : (ev.admin_name || ev.actor_name || "Administrador")

                                                            return {
                                                                id: ev.id,
                                                                actor_name: actorName,
                                                                change_lines: Array.isArray(ev.change_lines)
                                                                    ? ev.change_lines
                                                                    : (ev.metadata?.reason
                                                                            ? [ev.metadata.reason]
                                                                            : [ev.action_type || "Ação Administrativa"]),
                                                                created_at: ev.created_at,
                                                                entry_type: ev.action_type || "updated",
                                                                highlight: isDuditAction,
                                                            }
                                                        }),
                                                    ]

                                                    return (
                                                        <HistoryTimeline
                                                            entries={historyEntries}
                                                            title="Histórico do Pedido"
                                                            emptyMessage="Este pedido ainda não possui eventos de auditoria."
                                                        />
                                                    )
                                                })()}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div >
            </FadeIn >

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <div className="flex-1">
                    <ActionsDropdown fullWidth trigger={
                        <Button variant="outline" className="w-full h-12">
                            <ThreeDotsIcon size={18} className="text-brand-inactive-text" />
                        </Button>
                    }>
                        <DropdownItem onClick={handleShare}>
                            <ShareIcon size={16} /> Compartilhar
                        </DropdownItem>
                    </ActionsDropdown>
                </div>
            </div>

            {/* Modal: Ajustar Score de Risco do Comprador */}
            < DefaultModal
                isOpen={riskModalOpen}
                onClose={() => {
                    setRiskModalOpen(false)
                    setRiskTitle("")
                    setRiskReason("")
                }
                }
                title="Ajustar Score de Risco do Cliente"
                description={`Defina a pontuação de risco para o cliente ${order.customer_name || buyer.full_name || "Comprador"}.`}
            >
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                            Novo Score de Risco (0 a 100)
                        </label>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={newRiskScore}
                            onChange={(e) => setNewRiskScore(e.target.value)}
                            placeholder="Ex: 10"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            0 a 24: Baixo risco • 25 a 49: Médio risco • 50+: Alto risco (alerta vermelho)
                        </span>
                    </div>

                    <div>
                        <Input
                            label="Título da Notificação (Opcional)"
                            type="text"
                            value={riskTitle}
                            onChange={(e) => setRiskTitle(e.target.value)}
                            placeholder="Ex: Atualização no Score de Risco"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            Se vazio, um título padrão sobre o ajuste de risco será utilizado.
                        </span>
                    </div>

                    <div>
                        <FormTextarea
                            label="Motivo / Mensagem da Notificação (Opcional)"
                            value={riskReason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRiskReason(e.target.value)}
                            placeholder="Descreva o motivo do ajuste que será enviado para o cliente..."
                            rows={2}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                        <Button variant="outline" onClick={() => {
                            setRiskModalOpen(false)
                            setRiskTitle("")
                            setRiskReason("")
                        }}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveRiskScore} disabled={isPending}>
                            Salvar Alteração
                        </Button>
                    </div>
                </div>
            </DefaultModal >
        </>
    )
}

export default AdminOrderDetailView