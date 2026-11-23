"use client"

import React, { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    Badge,
    Button,
    CustomerCard,
    IconPlaceholder,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Tooltip,
} from "@/components/reusable"
import { BoxIcon, MoneyIcon, StoreIcon, TruckIcon, XIcon } from "@/lib/icons"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { parseAddressString } from "../orders/CreateOrder"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"

export interface DeliveryOrderDetailSheetProps {
    isOpen: boolean
    onClose: () => void
    order: any | null
    /** Optional override for the delivery status (e.g. resolved from delivery_orders link + order) */
    deliveryStatusOverride?: string | null
    /** Optional content rendered inside "Dados Gerais" above CustomerCard */
    extraGeneralContent?: React.ReactNode
    /** Optional custom footer (defaults to a "Fechar" button) */
    footer?: React.ReactNode
}

export default function DeliveryOrderDetailSheet({
    isOpen,
    onClose,
    order,
    deliveryStatusOverride,
    extraGeneralContent,
    footer,
}: DeliveryOrderDetailSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const sheetZIndex = useModalLayer(isOpen)
    const [activeOrder, setActiveOrder] = useState<any | null>(order)

    useEffect(() => {
        if (order) {
            setActiveOrder(order)
        }
    }, [order])

    if (!activeOrder) return null

    const displayId =
        activeOrder.displayId ||
        activeOrder.order_number ||
        activeOrder.orderNumber ||
        `#${String(activeOrder.id || "").slice(0, 8).toUpperCase()}`

    const paymentStatusRaw =
        activeOrder.situation ||
        activeOrder.status ||
        activeOrder.paymentStatus ||
        "pending"
    const paymentMeta = getPaymentStatusMeta(paymentStatusRaw)

    const deliveryStatusRaw =
        deliveryStatusOverride ||
        activeOrder.delivery_status ||
        activeOrder.deliveryStatus ||
        "not_sent"
    const deliveryMeta = getDeliveryStatusMeta(deliveryStatusRaw)
    const deliveryType = activeOrder.delivery_type || activeOrder.deliveryType || "delivery"

    const totalAmount = Number(activeOrder.total_amount ?? activeOrder.totalAmount ?? 0)
    const deliveryFee = Number(activeOrder.delivery_fee ?? activeOrder.shippingFee ?? activeOrder.deliveryFee ?? 0)
    const orderDateRaw = activeOrder.created_at || activeOrder.orderDate || activeOrder.order_date || null
    const paymentBreakdown = activeOrder.payment_breakdown || activeOrder.paymentBreakdown || null
    const paymentMethod = activeOrder.payment_method || activeOrder.paymentMethod || null

    const resolvedPaymentMethodLabel = (() => {
        if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
            return (
                paymentBreakdown
                    .map((e: any) =>
                        formatPaymentMethodLabel(e.method || e.payment_method || e.name, e.type || e.payment_type),
                    )
                    .filter(Boolean)
                    .join(", ") ||
                formatPaymentMethodLabel(paymentMethod, null) ||
                "Não informado"
            )
        }
        return formatPaymentMethodLabel(paymentMethod, null) || "Não informado"
    })()

    const resolvedCustomer = {
        ...(activeOrder.customer || {}),
        id: activeOrder.customer?.id || activeOrder.buyer_id || undefined,
        name: activeOrder.customer?.name || activeOrder.customer_name || "Cliente",
        email: activeOrder.customer?.email || "",
        phone: activeOrder.customer?.phone || "",
        image_url: activeOrder.customer?.image_url || null,
    }

    const rawAddressString = activeOrder.delivery_address || activeOrder.address || ""
    const resolvedAddress =
        activeOrder.customerAddress ||
        (rawAddressString ? parseAddressString(rawAddressString) : null)

    const rawItems = activeOrder.order_items || activeOrder.items || []
    const filteredItems = rawItems.filter((item: any) => {
        const pType = String(item.products?.product_type || "").toLowerCase()
        return pType !== "serviço" && pType !== "servico" && pType !== "service"
    })

    const sheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="min-w-0">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">{displayId}</p>
                </div>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative min-h-0">
                <Tabs defaultValue="dados_gerais" className="w-full">
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                        <TabsTrigger value="dados_gerais" className="px-0 pb-3 text-sm">
                            Dados Gerais
                        </TabsTrigger>
                        <TabsTrigger value="itens" className="px-0 pb-3 text-sm">
                            Itens do Pedido
                        </TabsTrigger>
                    </TabsList>

                    <div className="space-y-6">
                        <TabsContent value="dados_gerais" className="mt-0 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(totalAmount)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Taxa de Entrega (Frete)</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(deliveryFee)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Forma de Pagamento</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                        {resolvedPaymentMethodLabel}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status de Pagamento</span>
                                    <Tooltip text={paymentMeta.label}>
                                        <span className="inline-flex">
                                            <Badge variant={paymentMeta.variant} icon={<MoneyIcon />}>
                                                {paymentMeta.label}
                                            </Badge>
                                        </span>
                                    </Tooltip>
                                </div>
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Status da Entrega</span>
                                    <Tooltip text={deliveryMeta.label}>
                                        <span className="inline-flex">
                                            <Badge
                                                variant={deliveryMeta.variant}
                                                icon={deliveryType === "pickup" ? <StoreIcon /> : <TruckIcon />}
                                            >
                                                {deliveryMeta.label}
                                            </Badge>
                                        </span>
                                    </Tooltip>
                                </div>
                                <div className="flex justify-between items-center gap-3 text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data e Hora</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {orderDateRaw ? formatDateTime(orderDateRaw) : "-"}
                                    </span>
                                </div>
                            </div>

                            {extraGeneralContent}

                            <div className="border-t border-brand-border dark:border-dark-border w-full" />

                            <CustomerCard
                                customer={resolvedCustomer}
                                address={resolvedAddress}
                                showMap={true}
                                chrome="minimal"
                            />

                            {activeOrder.notes && (
                                <div>
                                    <h4 className="text-xs font-bold text-brand-dark dark:text-dark-heading mb-2 uppercase tracking-wide">
                                        Observações do Pedido
                                    </h4>
                                    <p className="text-sm text-brand-dark dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl p-3 border border-brand-border dark:border-dark-border">
                                        {activeOrder.notes}
                                    </p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="itens" className="mt-0">
                            {filteredItems.length === 0 ? (
                                <div className="flex items-center justify-center py-8">
                                    <IconPlaceholder
                                        icon={BoxIcon}
                                        title="Sem itens por aqui"
                                        subtitle="Nenhum item detalhado foi retornado para o pedido selecionado."
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredItems.map((item: any) => {
                                        const itemImage = getR2ImageUrl(
                                            item.product_variants?.variant_options?.image ||
                                                item.products?.images ||
                                                item.services?.images ||
                                                item.images ||
                                                item.image ||
                                                null,
                                            "thumbnail",
                                        )
                                        const itemSku = item.product_variants?.sku || item.products?.sku || item.sku || "N/A"
                                        const itemUnit = item.products?.unit || item.unit || "un"
                                        const itemPrice = Number(item.product_price || item.price || item.unit_price || 0)
                                        const itemSubtotal = Number(item.subtotal || itemPrice * Number(item.quantity || 0))

                                        return (
                                            <div key={item.id} className="flex items-start gap-4">
                                                <div className="w-12 h-12 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                    <img
                                                        src={itemImage}
                                                        className="w-full h-full object-cover rounded-full"
                                                        alt={item.product_name || "Produto sem nome"}
                                                        onError={(e: any) => {
                                                            e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png"
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2 mb-0.5">
                                                        <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                            {item.product_name || "Produto sem nome"}
                                                        </h4>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading shrink-0">
                                                            {formatCurrency(itemSubtotal)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mb-1">
                                                        SKU: {itemSku}
                                                    </div>
                                                    <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                        {formatQuantityWithUnit(item.quantity, itemUnit)} •{" "}
                                                        {formatUnitPriceWithUnit(itemPrice, itemUnit)}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                {footer || (
                    <Button type="button" variant="outline" className="w-full h-12" onClick={onClose}>
                        Fechar
                    </Button>
                )}
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {sheetContent}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fixed inset-0"
                        style={{ zIndex: sheetZIndex }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
                        <motion.div
                            className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface flex flex-col"
                            initial={{ x: "100%", opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: "100%", opacity: 0 }}
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
}
