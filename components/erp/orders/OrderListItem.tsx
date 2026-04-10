'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils";
import { ShoppingCartIcon } from "@/lib/icons"

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
    onCancel: (order: any) => void
    onDetails: (order: any) => void
    canEdit?: boolean
    cancelLabel?: string
    showCheckbox?: boolean
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
        canEdit = true,
        cancelLabel = "Cancelar",
        showCheckbox = true,
    }: OrderListItemProps) => {

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "order_id":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <ShoppingCartIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="flex flex-col text-left min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                    {order.displayId}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    {order.items_count} {order.items_count === 1 ? 'item' : 'itens'}
                                </span>
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
                    return (
                        <div className="flex gap-2 w-full">
                            <Badge variant={order.statusColor}>
                                {order.statusLabel}
                            </Badge>
                            <Badge variant={order.deliveryStatusColor || "gray"}>
                                {order.deliveryStatusLabel || "Não informado"}
                            </Badge>
                            {order.isUnfulfilled && (
                                <Badge variant="gray" className="opacity-70">
                                    Pendente
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
                            {order.order_source || "Venda Direta"}
                        </span>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={canEdit ? () => onEdit(order) : undefined}
                                onCancel={() => onCancel(order)}
                                cancelLabel={cancelLabel}
                            />
                        </div>
                    )

                default:
                    return null
            }
        }

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center justify-center"
            if (align === "right") return "text-right justify-end"
            return "text-left justify-start"
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onDetails(order)}
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
                        {renderCellContent(col.id)}
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.order === next.order &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

OrderListItem.displayName = "OrderListItem"

export default OrderListItem
