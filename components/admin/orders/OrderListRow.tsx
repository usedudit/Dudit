"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Checkbox, Tooltip } from "@/components/reusable"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import { ReturnIcon, TruckIcon, StoreIcon, MoneyIcon, UserIcon, ShoppingCartIcon } from "@/lib/icons"
import { getPaymentStatusMeta, getDeliveryStatusLabelForType, getFulfillmentModeLabel } from "@/lib/orders/status"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    sortable?: boolean
}

interface OrderListRowProps {
    order: any
    columns: ColumnDef[]
    isPending: boolean
    onDetail: (order: any) => void
    selected?: boolean
    onSelect?: (id: string) => void
    showCheckbox?: boolean
}

const OrderListRow = React.memo((
    { order, columns, isPending, onDetail, selected, onSelect, showCheckbox = true }: OrderListRowProps
) => {
    const returns = Array.isArray(order.return_requests) ? order.return_requests : []
    const exchangeOrder = order.exchange_parent_order_id || order.exchange_return_request_id

    const hasRefund = Boolean(
        order.is_refunded ||
        Number(order.refunded_amount || 0) > 0 ||
        order.situation === "refunded" ||
        order.situation === "chargeback" ||
        returns.some((req: any) =>
            ["APPROVED", "RESOLVED"].includes(req.status) &&
            (req.approved_resolution === "refund" || req.desired_resolution === "refund" || Number(req.refund_amount || 0) > 0)
        )
    )

    // Use shared payment status meta (same as ERP)
    const paymentMeta = getPaymentStatusMeta(order.situation)
    const deliveryMeta = getDeliveryStatusLabelForType(order.delivery_status, order.delivery_type)
    const deliveryTypeLabel = getFulfillmentModeLabel(order.delivery_type)

    // Seller/Partner name from the joined data (via stores)
    const store = order.stores || {}
    const sellerName = store.name || "—"
    const orderSource = order.order_source || "Manual"

    const renderCellContent = (colId: string) => {
        switch (colId) {
            case "order_number": {
                const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
                const methodEntries = breakdown.filter((b: any) => b?.method && !b?.checkoutPricing)
                const paidMethodEntries = methodEntries.filter((b: any) => Number(b?.amountReceived ?? b?.amount ?? 0) > 0.009)
                const paidLabels = Array.from(new Set(paidMethodEntries.map((b: any) => String(b?.method || "").toLowerCase().trim()).filter(Boolean)))
                let pmLabel: string | null = null

                if (paidLabels.length > 1) {
                    pmLabel = "Múltiplos meios"
                } else if (paidMethodEntries.length === 1) {
                    pmLabel = paidMethodEntries[0]?.method || order.payment_method || null
                } else if (methodEntries.length === 1) {
                    pmLabel = methodEntries[0]?.method || order.payment_method || null
                } else {
                    pmLabel = order.payment_method || null
                }

                if (pmLabel && methodEntries.length === 1 && methodEntries[0]?.installmentNumber > 1) {
                    pmLabel = `${pmLabel} - ${methodEntries[0].installmentNumber}x`
                }

                return (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                            <ShoppingCartIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                    #{order.order_number || order.id.slice(0, 8)}
                                </span>
                                {returns.length > 0 && (
                                    <Tooltip text="Possui histórico de trocas/devoluções">
                                        <Badge variant="purple" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap" />
                                    </Tooltip>
                                )}
                                {hasRefund && (
                                    <Tooltip text="Possui histórico de reembolso">
                                        <Badge variant="red" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap" />
                                    </Tooltip>
                                )}
                            </div>
                            <div className="mt-1 flex items-center">
                                <PaymentMethodIndicator label={pmLabel || order.payment_provider || "-"} provider={order.payment_provider} simplify compact />
                            </div>
                        </div>
                    </div>
                )
            }

            case "customer":
                return (
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {order.customer_name || "Cliente"}
                    </span>
                )

            case "channel":
                return (
                    <span className="text-[13px] font-medium truncate max-w-[120px] block">
                        {orderSource}
                    </span>
                )

            case "date":
                return (
                    <div className="flex flex-col text-left">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                            {formatDate(order.created_at)}
                        </span>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                            {formatTime(order.created_at)}
                        </span>
                    </div>
                )

            case "total":
                return (
                    <span className="text-[13px] font-bold text-brand-primary">
                        {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                    </span>
                )

            case "status":
                return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {order.situation === "cancelled" ? (
                            <Badge variant="red">
                                Cancelado
                            </Badge>
                        ) : (
                            <Badge variant={paymentMeta.variant} icon={<MoneyIcon />}>
                                {paymentMeta.label}
                            </Badge>
                        )}
                        {order.delivery_status && order.situation !== "cancelled" && (
                            <Badge
                                variant={deliveryMeta === "Entregue" ? "green" : deliveryMeta === "Enviado" ? "blue" : deliveryMeta === "Pronto para retirada" ? "orange" : "gray"}
                                icon={
                                    order.delivery_type === "pickup"
                                        ? <StoreIcon />
                                        : <TruckIcon />
                                }
                            >
                                {deliveryMeta}
                            </Badge>
                        )}
                    </div>
                )

            case "seller":
                return (
                    <div className="flex flex-col min-w-0">
                        <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading truncate">
                            {sellerName}
                        </span>
                        {store.id && (
                            <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                                Loja ID: {store.id.slice(0, 8)}...
                            </span>
                        )}
                    </div>
                )

            case "actions":
                return (
                    <div className="flex justify-center items-center min-h-[44px]">
                        <div className="w-6 h-6 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center cursor-pointer hover:bg-brand-gray/50 dark:hover:bg-dark-border/50 transition-colors" title="Ações">
                            <svg className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                        </div>
                    </div>
                )

            default:
                return null
        }
    }

    const getJustifyClass = (align?: string) => {
        if (align === "center") return "justify-center"
        if (align === "right") return "justify-end"
        return "justify-start"
    }

    const getAlignClass = (align?: string) => {
        if (align === "center") return "text-center"
        if (align === "right") return "text-right"
        return "text-left"
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(order)}
        >
            {showCheckbox && (
                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected ?? false} onChange={() => onSelect?.(order.id)} />
                </td>
            )}
            {columns.map((col) => (
                <td
                    key={col.id}
                    className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)} ${col.id === "actions" ? "pr-6" : col.id === "order_number" ? "pl-6" : ""}`}
                    style={{ width: col.width }}
                >
                    <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                        {renderCellContent(col.id)}
                    </div>
                </td>
            ))}
        </motion.tr>
    )
}, (prev, next) =>
    prev.order === next.order &&
    prev.isPending === next.isPending &&
    prev.columns === next.columns &&
    prev.selected === next.selected &&
    prev.showCheckbox === next.showCheckbox
)

OrderListRow.displayName = "OrderListRow"

export default OrderListRow