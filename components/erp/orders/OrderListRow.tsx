'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip, Button } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils";
import { ShoppingCartIcon, ArrowDownIcon, ArrowUpIcon, ReturnIcon, MoneyIcon, TruckIcon, StoreIcon } from "@/lib/icons"
import { PaymentMethodIndicator } from "../transactions/PaymentMethodIndicator"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface OrderListItemProps {
    order: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (order: any) => void
    onCancel?: (order: any) => void
    onDetails: (order: any) => void
    onPrint?: (order: any) => void
    onPaymentStatus?: (order: any) => void
    onDeliveryStatus?: (order: any) => void
    onGenerateLabel?: (order: any) => void
    canEdit?: boolean
    cancelLabel?: string
    showCheckbox?: boolean
    extraActions?: React.ReactNode
    /** Sangrias/reforços: título curto, subtítulo com operador, status simplificado. */
    rowVariant?: "order" | "cash_movement"
    actionMenuExtra?: React.ReactNode
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const OrderListItem = React.memo(
    ({
        order,
        columns,
        selected,
        onSelect,
        onEdit,
        onCancel,
        onDetails,
        onPrint,
        onPaymentStatus,
        onDeliveryStatus,
        onGenerateLabel,
        canEdit = true,
        cancelLabel = "Cancelar",
        showCheckbox = true,
        extraActions,
        rowVariant = "order",
        actionMenuExtra,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: OrderListItemProps) => {

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "order_id":
                    if (rowVariant === "cash_movement") {
                        const MvIcon = order.type === "deposit" ? ArrowUpIcon : ArrowDownIcon
                        return (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                    <MvIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </div>
                                <div className="flex flex-col text-left min-w-0">
                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[180px] leading-tight mb-0.5">
                                        {order.displayId}
                                    </span>
                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[220px]">
                                        {order.creator_subtitle || (order.creator_name ? `Por ${order.creator_name}` : "-")}
                                    </span>
                                </div>
                            </div>
                        )
                    }
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <ShoppingCartIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="flex flex-col text-left min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                        {order.displayId}
                                    </span>
                                    {Number(order.returnCount || 0) > 0 && (
                                        <Tooltip text="Possui histórico de trocas/devoluções">
                                            <Badge variant="purple" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap" />
                                        </Tooltip>
                                    )}
                                </div>
                                <div className="mt-1 flex items-center">
                                    {(() => {
                                        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
                                        const methodEntries = breakdown.filter((b: any) => b?.method && !b?.checkoutPricing)
                                        const paidMethodEntries = methodEntries.filter((b: any) => Number(b?.amountReceived ?? b?.amount ?? 0) > 0.009)
                                        const paidLabels = Array.from(new Set(paidMethodEntries.map((b: any) => String(b?.method || "").toLowerCase().trim()).filter(Boolean)))
                                        let pmLabel: string | null = null

                                        if (paidLabels.length > 1) {
                                            pmLabel = "Múltiplos meios"
                                        } else if (paidMethodEntries.length === 1) {
                                            pmLabel = paidMethodEntries[0]?.method || order.payment_method || null
                                        } else {
                                            pmLabel = methodEntries[0]?.method || order.payment_method || null
                                        }

                                        if (pmLabel && methodEntries.length === 1 && methodEntries[0]?.installmentNumber > 1) {
                                            pmLabel = `${pmLabel} - ${methodEntries[0].installmentNumber}x`
                                        }
                                        return <PaymentMethodIndicator label={pmLabel} provider={order.payment_provider} simplify compact />
                                    })()}
                                </div>
                            </div>
                        </div>
                    )

                case "total":
                    return (
                        <span className="text-[13px] font-bold text-brand-primary">
                            {formatCurrency(order.total_amount)}
                        </span>
                    )

                case "status":
                    if (rowVariant === "cash_movement") {
                        return (
                            <div className={`flex gap-2 w-full flex-wrap ${getJustifyClass(columns.find(c => c.id === 'status')?.align)}`}>
                                {order.situation === "cancelled" ? (
                                    <Badge variant={order.reversed_at ? "gray" : "green"} icon={order.reversed_at ? <ReturnIcon size={12} /> : undefined}>{order.reversed_at ? "Estornado" : "Cancelado"}</Badge>
                                ) : (
                                    <Badge variant={order.statusColor}>{order.statusLabel}</Badge>
                                )}
                            </div>
                        )
                    }
                    return (
                        <div className={`flex gap-2 w-full ${getJustifyClass(columns.find(c => c.id === 'status')?.align)}`}>
                            {order.situation === "cancelled" ? (
                                <Badge variant="red">
                                    Cancelado
                                </Badge>
                            ) : (
                                <Badge variant={order.statusColor} icon={<MoneyIcon />}>
                                    {order.statusLabel}
                                </Badge>
                            )}
                            {!order.hasOnlyServices && order.situation !== "cancelled" && (
                                <Badge variant={order.deliveryStatusColor || "gray"} icon={
                                    order.delivery_type === "pickup"
                                        ? <StoreIcon />
                                        : order.carrierBrandIcon
                                            ? <img src={order.carrierBrandIcon} alt="Transportadora" className="object-contain" />
                                            : <TruckIcon />
                                }>
                                    {order.deliveryStatusLabel || "Não informado"}
                                </Badge>
                            )}
                        </div>
                    )

                case "customer":
                    return (
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                            {order.customer_name}
                        </span>
                    )

                case "date":
                    return (
                        <div className="flex flex-col text-left">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                {order.formattedDate}
                            </span>
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                {order.formattedTime}
                            </span>
                        </div>
                    )

                case "channel":
                    return (
                        <span className="text-[13px] font-medium truncate max-w-[120px]">
                            {order.order_source || "Manual"}
                        </span>
                    )

                case "tracking":
                    if (!order.tracking_number) {
                        if (onGenerateLabel && order.situation !== "cancelled" && order.isCarrierDelivery) {
                            return (
                                <div
                                    className="flex items-center"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onGenerateLabel(order)}
                                    >
                                        Gerar etiqueta
                                    </Button>
                                </div>
                            )
                        }
                        return (
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                -
                            </span>
                        )
                    }
                    if (order.tracking_url) {
                        return (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    window.open(order.tracking_url, "_blank")
                                }}
                                title={order.tracking_number}
                                className="text-[13px] font-bold text-brand-blue hover:underline truncate max-w-[150px] block text-left"
                            >
                                {order.tracking_number}
                            </button>
                        )
                    }
                    return (
                        <span
                            title={order.tracking_number}
                            className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[150px] block"
                        >
                            {order.tracking_number}
                        </span>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center items-center min-h-[44px] action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onPrint={onPrint ? () => onPrint(order) : undefined}
                                onEdit={canEdit ? () => onEdit(order) : undefined}
                                onCancel={onCancel ? () => onCancel(order) : undefined}
                                onPaymentStatus={onPaymentStatus ? () => onPaymentStatus(order) : undefined}
                                onDeliveryStatus={onDeliveryStatus ? () => onDeliveryStatus(order) : undefined}
                                cancelLabel={cancelLabel}
                            >
                                {actionMenuExtra}
                                {extraActions}
                            </ActionsDropdown>
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
                onClick={() => onDetails(order)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                {showCheckbox && (
                    <td
                        className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox checked={selected} onChange={() => onSelect(order.originalId)} />
                    </td>
                )}

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.order === next.order &&
        prev.selected === next.selected &&
        prev.columns === next.columns &&
        prev.rowVariant === next.rowVariant &&
        prev.actionMenuExtra === next.actionMenuExtra &&
        prev.canEdit === next.canEdit
)

OrderListItem.displayName = "OrderListItem"

export default OrderListItem
