"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Crown, Tag, CreditCard, ShoppingCart, Calendar } from "lucide-react"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

const TYPE_ICONS: Record<string, any> = {
    subscription: Crown,
    addon: Tag,
    credit_pack: CreditCard,
    order_payment: ShoppingCart,
    marketplace_feature: Tag,
    service: Calendar,
}

interface BillingListRowProps {
    id: string
    type: string
    typeLabel: string
    description: string | null
    amount: number
    totalAmount: number
    status: string
    statusLabel: string
    statusVariant: "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"
    gatewayLabel: string
    createdAt: string
    columns: ColumnDef[]
    onDetails: () => void
    onCancel?: () => void
    onInvoice?: () => void
}

const BillingListRow = React.memo(
    ({
        id,
        type,
        typeLabel,
        description,
        totalAmount,
        status,
        statusLabel,
        statusVariant,
        gatewayLabel,
        createdAt,
        columns,
        onDetails,
        onCancel,
        onInvoice,
    }: BillingListRowProps) => {
        const dateStr = formatDate(createdAt)

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center"
            if (align === "right") return "text-right"
            return "text-left"
        }

        const getJustifyClass = (align?: string) => {
            if (align === "center") return "justify-center"
            if (align === "right") return "justify-end"
            return "justify-start"
        }

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "type":
                    return (
                        <span className="text-xs text-brand-inactive-text">{typeLabel}</span>
                    )
                case "description":
                    return (
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate max-w-[200px] block">
                                {description || typeLabel}
                            </span>
                        </div>
                    )
                case "amount":
                    return (
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                    )
                case "status":
                    return (
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                    )
                case "gateway":
                    return (
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{gatewayLabel}</span>
                    )
                case "date":
                    return (
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{dateStr}</span>
                    )
                case "actions":
                    return (
                        <div className="action-btn" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                                onView={onDetails}
                                onCancel={onCancel}
                                onPrint={onInvoice}
                                cancelLabel="Cancelar"
                            />
                        </div>
                    )
                default:
                    return null
            }
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background"
            >
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
        prev.id === next.id &&
        prev.status === next.status &&
        prev.totalAmount === next.totalAmount
)

BillingListRow.displayName = "BillingListRow"
export default BillingListRow
export { BillingListRow }
