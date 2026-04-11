'use client';

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { CreditCardIcon, FileIcon, MoneyIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import type { ERPTransaction } from "../../../lib/services/transactions.types"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface TransactionListItemProps {
    transaction: ERPTransaction
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
}

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

const TransactionListItem = React.memo(
    ({ transaction, columns, selected, onSelect }: TransactionListItemProps) => {
        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "transaction":
                    return (
                        <div className="flex flex-col text-left min-w-0">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate leading-tight mb-0.5">
                                {transaction.description}
                            </span>
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                {transaction.displayId}
                                {transaction.details ? ` • ${transaction.details}` : ""}
                            </span>
                        </div>
                    )

                case "category":
                    return (
                        <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-brand-gray dark:bg-dark-border text-xs font-medium text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                            {transaction.category}
                        </span>
                    )

                case "contact":
                    return (
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate block max-w-[180px]">
                            {transaction.contactName}
                        </span>
                    )

                case "date":
                    return (
                        <div className="flex flex-col text-left">
                            <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                {transaction.dueDate}
                            </span>
                            <span className={`text-xs font-medium ${transaction.isOverdue ? "text-brand-red" : "text-brand-inactive-text dark:text-dark-body"}`}>
                                {transaction.dateNote}
                            </span>
                        </div>
                    )

                case "payment":
                    const PaymentIcon = getPaymentIcon(transaction.paymentType)
                    return (
                        <div className="flex items-center gap-2">
                            <PaymentIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                            <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                {transaction.paymentType}
                            </span>
                        </div>
                    )

                case "status":
                    return (
                        <div className="flex justify-start">
                            <Badge variant={transaction.statusVariant} className="whitespace-nowrap">
                                {transaction.status}
                            </Badge>
                        </div>
                    )

                case "amount":
                    return (
                        <span className={`text-[13px] font-bold whitespace-nowrap ${transaction.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}>
                            {transaction.ledgerDirection === "in" ? "+ " : "- "}
                            {formatCurrency(transaction.amount)}
                        </span>
                    )

                case "actions":
                    return (
                        <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown onView={() => { }} onEdit={() => { }} onDelete={() => { }} />
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
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(transaction.id)} />
                </td>

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
        prev.transaction === next.transaction &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

TransactionListItem.displayName = "TransactionListItem"

export default TransactionListItem
