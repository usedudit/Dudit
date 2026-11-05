"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import { StoreIcon, ReturnIcon, TruckIcon, UserIcon } from "@/lib/icons"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { getPaymentStatusMeta, getDeliveryStatusLabelForType, getFulfillmentModeLabel } from "@/lib/orders/status"

interface OrderListRowProps {
    order: any
    isPending: boolean
    onDetail: (order: any) => void
}

const OrderListRow = React.memo(({ order, isPending, onDetail }: OrderListRowProps) => {
    const returns = Array.isArray(order.return_requests) ? order.return_requests : []
    const exchangeOrder = order.exchange_parent_order_id || order.exchange_return_request_id

    // Use shared payment status meta (same as ERP)
    const paymentMeta = getPaymentStatusMeta(order.situation)
    const deliveryMeta = getDeliveryStatusLabelForType(order.delivery_status, order.delivery_type)
    const deliveryTypeLabel = getFulfillmentModeLabel(order.delivery_type)

    // Seller/Partner name from the joined data
    const store = order.stores || {}
    const partner = order.partners || {}
    const sellerName = partner.trade_name || partner.name || store.name || "—"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(order)}
        >
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        {order.order_number || order.id.slice(0, 8)}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {formatDate(order.created_at)} - {formatTime(order.created_at)}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {order.customer_name || "Cliente"}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {store.name || "—"}
                    </span>
                    {store.id && (
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                            ID: {store.id.slice(0, 8)}...
                        </span>
                    )}
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {sellerName}
                    </span>
                    {partner.id && (
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                            Vendedor ID: {partner.id.slice(0, 8)}...
                        </span>
                    )}
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-1">
                    <Badge variant={paymentMeta.variant}>
                        {paymentMeta.label}
                    </Badge>
                    {(() => {
                        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
                        const methodEntries = breakdown.filter((b: any) => b?.method && !b?.checkoutPricing);
                        const paidMethodEntries = methodEntries.filter((b: any) => Number(b?.amountReceived ?? b?.amount ?? 0) > 0.009);
                        const paidLabels = Array.from(new Set(paidMethodEntries.map((b: any) => String(b?.method || "").toLowerCase().trim()).filter(Boolean)));
                        let pmLabel: string | null = null;
                        if (paidLabels.length > 1) {
                            pmLabel = "Múltiplos meios";
                        } else if (paidMethodEntries.length === 1) {
                            pmLabel = paidMethodEntries[0]?.method || order.payment_method || null;
                        } else if (methodEntries.length === 1) {
                            pmLabel = methodEntries[0]?.method || order.payment_method || null;
                        } else {
                            pmLabel = order.payment_method || null;
                        }
                        return <PaymentMethodIndicator label={pmLabel || order.payment_provider || "-"} provider={order.payment_provider} simplify compact />
                    })()}
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {deliveryMeta} • {deliveryTypeLabel}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                    {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                        {order.order_items?.length || 0} itens
                    </span>
                    {exchangeOrder ? (
                        <span className="text-[10px] text-brand-green font-medium flex items-center gap-1">
                            <ReturnIcon size={10} /> Troca vinculada
                        </span>
                    ) : null}
                </div>
            </td>

            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                    {returns.length > 0 ? (
                        <span className="text-brand-orange font-bold">{returns.length} solicitação(ões)</span>
                    ) : (
                        <span className="text-brand-inactive-text">-</span>
                    )}
                </span>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.order === next.order &&
    prev.isPending === next.isPending
)

OrderListRow.displayName = "OrderListRow"

export default OrderListRow