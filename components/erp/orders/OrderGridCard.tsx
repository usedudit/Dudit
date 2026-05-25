'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils";
import { ShoppingCartIcon } from "@/lib/icons"

interface OrderGridCardProps {
    order: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onCancel: () => void
    onDetails: () => void
    onPrint?: () => void
    canEdit?: boolean
    cancelLabel?: string
    extraActions?: React.ReactNode
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const OrderGridCard = React.memo(
    ({
        order,
        selected,
        onSelect,
        onEdit,
        onCancel,
        onDetails,
        onPrint,
        canEdit = true,
        cancelLabel = "Cancelar",
        extraActions,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: OrderGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Order Visual Indicator */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <ShoppingCartIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Row 1: ID + Badge + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                                    title={order.displayId}
                                >
                                    {order.displayId}
                                </h3>
                                {Number(order.returnCount || 0) > 0 && (
                                    <span
                                        className="inline-flex shrink-0 items-center rounded-full border border-brand-border px-2 py-0.5 text-xs font-bold text-brand-dark dark:border-dark-border dark:text-dark-heading"
                                        title="Contains return/exchange history"
                                    >
                                        ↩{Number(order.returnCount || 0) > 1 ? ` ${order.returnCount}` : ""}
                                    </span>
                                )}
                                <div className="flex items-center shrink-0">
                                    {order.situation === "cancelled" ? (
                                        <Badge variant="red" className="whitespace-nowrap scale-90">
                                            Cancelado
                                        </Badge>
                                    ) : (
                                        <>
                                            <Badge
                                                variant={order.statusColor}
                                                icon={order.statusIcon}
                                                className="whitespace-nowrap scale-90"
                                            >
                                                {order.statusLabel}
                                            </Badge>
                                            <Badge
                                                variant={order.deliveryStatusColor || "gray"}
                                                icon={order.deliveryStatusIcon}
                                                className="whitespace-nowrap scale-90"
                                            >
                                                {order.deliveryStatusLabel || "Não informado"}
                                            </Badge>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Checkbox */}
                            <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Row 2: Stats (Items • Total) */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                {order.items_count} {order.items_count === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                            <span className="text-sm font-bold text-brand-primary">
                                {formatCurrency(order.total_amount)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Info Rows */}
                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Row 1: Cliente & Data */}
                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {order.customer_name}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end shrink-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
                            <div className="flex flex-col items-end text-right">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                    {order.formattedDate}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    {order.formattedTime}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Canal & Actions */}
                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Canal</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                                    {order.store_name || "Loja"}
                                </span>
                            </div>
                        </div>

                        {/* Actions button at same height as Channel info */}
                        <div
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onPrint={onPrint}
                                onEdit={canEdit ? onEdit : undefined}
                                onCancel={onCancel}
                                cancelLabel={cancelLabel}
                            >
                                {extraActions}
                            </ActionsDropdown>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.order === next.order
)

OrderGridCard.displayName = "OrderGridCard"

export default OrderGridCard
