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
    onEdit?: (transaction: ERPTransaction) => void
    onMarkAsPaid?: (transaction: ERPTransaction) => void
}

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

const TransactionListItem = React.memo(
    ({ transaction, columns, selected, onSelect, onEdit, onMarkAsPaid }: TransactionListItemProps) => {
        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "transaction":
                    return (
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                    {transaction.description}
                                </span>
                                {(transaction.recurringId || transaction.isRecurringOccurrence) && (
                                    <Badge variant="purple" className="whitespace-nowrap">
                                        Recorrente
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                {getPaymentIcon(transaction.paymentType)({ className: "w-3.5 h-3.5" })}
                                <span>{transaction.paymentType}</span>
                            </div>
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
                                {transaction.createdAtDate}
                            </span>
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                {transaction.createdAtTime}
                            </span>
                        </div>
                    )

                case "dueDate":
                    return (
                        <div className="flex flex-col text-left">
                            <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                {transaction.dueDate}
                            </span>
                            {transaction.status.toLowerCase().includes("pago") || transaction.status.toLowerCase().includes("recebido") || transaction.daysUntilDue === -999 ? null : transaction.daysUntilDue === 0 && !transaction.isOverdue ? (
                                <span className="text-xs font-bold text-brand-yellow">
                                    Vence hoje
                                </span>
                            ) : transaction.isOverdue ? (
                                <span className="text-xs font-bold text-brand-red">
                                    Atrasado
                                </span>
                            ) : (
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    Faltam {transaction.daysUntilDue} dias
                                </span>
                            )}
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
                            <ActionsDropdown
                                onEdit={onEdit ? () => onEdit(transaction) : undefined}
                                onCancel={transaction.isRecurringOccurrence && onMarkAsPaid ? () => onMarkAsPaid(transaction) : undefined}
                                cancelLabel={transaction.isRecurringOccurrence ? "Marcar como pago" : undefined}
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
