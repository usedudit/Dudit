'use client';

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox, DropdownItem } from "@/components/reusable"
import { CreditCardIcon, FileIcon, InstallmentIcon, MoneyIcon, RepeatIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { DueDateCountdown } from "@/lib/utils/transaction-due-countdown"
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
    onOpenDetail?: (transaction: ERPTransaction) => void
    onEdit?: (transaction: ERPTransaction) => void
    onMarkAsPaid?: (transaction: ERPTransaction) => void
    onCancelPending?: (transaction: ERPTransaction) => void
    onSettleInstallmentGroup?: (transaction: ERPTransaction) => void
    onPrefetchMouseEnter?: (id: string) => void
    onPrefetchMouseLeave?: (id: string) => void
    onPrefetchTouchStart?: (id: string) => void
}

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

const TransactionListItem = React.memo(
    ({ transaction, columns, selected, onSelect, onOpenDetail, onEdit, onMarkAsPaid, onCancelPending, onSettleInstallmentGroup, onPrefetchMouseEnter, onPrefetchMouseLeave, onPrefetchTouchStart }: TransactionListItemProps) => {
        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "transaction":
                    return (
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate leading-tight">
                                    {transaction.description}
                                </span>
                                {transaction.installmentGroupId && (
                                    <Badge variant="orange" icon={<InstallmentIcon size={12} />} className="whitespace-nowrap scale-90 shrink-0">
                                        Parcelado
                                    </Badge>
                                )}
                                {!transaction.isInstallmentGroup && transaction.installmentNumber && transaction.installmentTotalCount && (
                                    <Badge variant="gray" icon={null} className="whitespace-nowrap scale-90 shrink-0">
                                        {transaction.installmentNumber}/{transaction.installmentTotalCount}
                                    </Badge>
                                )}
                                {(transaction.recurringId || transaction.isRecurringOccurrence) && (
                                    <Badge variant="purple" icon={<RepeatIcon size={12} />} className="whitespace-nowrap scale-90 shrink-0">
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
                        <div className="flex flex-col text-left gap-0.5">
                            <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                {transaction.dueDate}
                            </span>
                            <DueDateCountdown transaction={transaction} />
                        </div>
                    )

                case "status":
                    return (
                        <div className={`flex ${getJustifyClass(columns.find(c => c.id === 'status')?.align)}`}>
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
                                onEdit={transaction.isInstallmentGroup ? undefined : onEdit ? () => onEdit(transaction) : undefined}
                                onCancel={
                                    transaction.isInstallmentGroup
                                        ? (onSettleInstallmentGroup ? () => onSettleInstallmentGroup(transaction) : undefined)
                                        : (transaction.isRecurringOccurrence && onMarkAsPaid
                                            ? () => onMarkAsPaid(transaction)
                                            : (String(transaction.rawStatus || "").toLowerCase() === "pending" && !transaction.installmentGroupId && onCancelPending
                                                ? () => onCancelPending(transaction)
                                                : undefined))
                                }
                                cancelLabel={
                                    transaction.isInstallmentGroup
                                        ? "Quitar tudo"
                                        : (transaction.isRecurringOccurrence ? "Marcar como pago" : (String(transaction.rawStatus || "").toLowerCase() === "pending" && !transaction.installmentGroupId ? "Cancelar" : undefined))
                                }
                            >
                                {((String(transaction.rawStatus || "").toLowerCase() === "pending" || transaction.isOverdue) && !transaction.isInstallmentGroup && !transaction.isRecurringOccurrence && onMarkAsPaid) && (
                                    <DropdownItem onClick={() => onMarkAsPaid(transaction)}>
                                        <MoneyIcon className="w-4 h-4" /> Marcar como {transaction.ledgerDirection === "in" ? "recebido" : "pago"}
                                    </DropdownItem>
                                )}
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
                onClick={(e) => {
                    const el = e.target as HTMLElement
                    if (el.closest("input") || el.closest(".action-btn")) return
                    onOpenDetail?.(transaction)
                }}
                onMouseEnter={() => onPrefetchMouseEnter?.(transaction.id)}
                onMouseLeave={() => onPrefetchMouseLeave?.(transaction.id)}
                onTouchStart={() => onPrefetchTouchStart?.(transaction.id)}
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
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.transaction === next.transaction &&
        prev.selected === next.selected &&
        prev.columns === next.columns &&
        prev.onOpenDetail === next.onOpenDetail
)

TransactionListItem.displayName = "TransactionListItem"

export default TransactionListItem
