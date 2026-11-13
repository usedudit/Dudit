'use client';

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox, DropdownItem } from "@/components/reusable"
import { CreditCardIcon, MoneyIcon, InstallmentIcon, RepeatIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { DueDateCountdown } from "@/lib/utils/transaction-due-countdown"
import { formatBrazilDateFromDbInput, formatTime } from "@/lib/utils/formatters"
import { PaymentMethodIndicator } from "./PaymentMethodIndicator"
import type { ERPTransaction } from "@/lib/services/transactions.types"

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
    selectable?: boolean
    onSelect: (id: string) => void
    onOpenDetail?: (transaction: ERPTransaction) => void
    onEdit?: (transaction: ERPTransaction) => void
    onMarkAsPaid?: (transaction: ERPTransaction) => void
    onCancelPending?: (transaction: ERPTransaction) => void
    onSettleInstallmentGroup?: (transaction: ERPTransaction) => void
    onPrint?: (transaction: ERPTransaction) => void
    onPrefetchMouseEnter?: (id: string) => void
    onPrefetchMouseLeave?: (id: string) => void
    onPrefetchTouchStart?: (id: string) => void
}

const BoletoIcon = ({ className }: { className?: string }) => (
    <img src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className={className} />
)

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return BoletoIcon
    return MoneyIcon
}

const TransactionListItem = React.memo(
    ({ transaction, columns, selected, selectable = true, onSelect, onOpenDetail, onEdit, onMarkAsPaid, onCancelPending, onSettleInstallmentGroup, onPrint, onPrefetchMouseEnter, onPrefetchMouseLeave, onPrefetchTouchStart }: TransactionListItemProps) => {
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
                                    <Badge variant="orange" icon={<InstallmentIcon size={12} />} className="whitespace-nowrap scale-90 shrink-0"></Badge>
                                )}
                                {!transaction.isInstallmentGroup && transaction.installmentNumber && transaction.installmentTotalCount && (
                                    <Badge variant="gray" icon={null} className="whitespace-nowrap scale-90 shrink-0">
                                        {transaction.installmentNumber}/{transaction.installmentTotalCount}
                                    </Badge>
                                )}
                                {(transaction.recurringId || transaction.isRecurringOccurrence) && (
                                    <Badge variant="purple" icon={<RepeatIcon size={12} />} className="whitespace-nowrap scale-90 shrink-0"></Badge>
                                )}
                            </div>
                            <div className="mt-1 flex items-center">
                                <PaymentMethodIndicator label={transaction.paymentType} simplify compact />
                            </div>
                        </div>
                    )

                case "category":
                    return (
                        <span className="text-[13px] font-medium truncate max-w-[120px]">
                            {transaction.category}
                        </span>
                    )

                case "originSource":
                    return (
                        <span className="text-[13px] font-medium truncate max-w-[120px]">
                            {transaction.originSource || "Manual"}
                        </span>
                    )

                case "contact":
                    return (
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate block max-w-[180px]">
                            {transaction.contactName}
                        </span>
                    )

                case "date": {
                    const isPaid =
                        transaction.rawStatus === "paid" ||
                        transaction.status === "Pago" ||
                        transaction.status === "Recebido" ||
                        Boolean(transaction.paymentDateRaw);
                    const displayDate =
                        (isPaid && (transaction.paymentDateDate || (transaction.paymentDateRaw ? formatBrazilDateFromDbInput(transaction.paymentDateRaw, "dayMonthYear") : null))) ||
                        transaction.createdAtDate;
                    const displayTime =
                        (isPaid && transaction.paymentDateRaw)
                            ? (transaction.paymentDateTime || (String(transaction.paymentDateRaw).includes("T") ? formatTime(transaction.paymentDateRaw) : null))
                            : transaction.createdAtTime;

                    return (
                        <div className="flex flex-col text-left">
                            <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                {displayDate}
                            </span>
                            {displayTime && (
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    {displayTime}
                                </span>
                            )}
                        </div>
                    )
                }

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
                    const isPartiallyPaid = transaction.paidAmount != null && transaction.paidAmount > 0 && transaction.paidAmount < transaction.amount && String(transaction.rawStatus || "").toLowerCase() === "pending";
                    const statusLabel = isPartiallyPaid
                        ? (transaction.ledgerDirection === "in" ? "Parcialmente recebido" : "Parcialmente pago")
                        : transaction.status;
                    const statusVariant = isPartiallyPaid ? "orange" : transaction.statusVariant;
                    return (
                        <div className={`flex ${getJustifyClass(columns.find(c => c.id === 'status')?.align)}`}>
                            <Badge variant={statusVariant} className="whitespace-nowrap">
                                {statusLabel}
                            </Badge>
                        </div>
                    )

                case "amount":
                    const isPaidRow = transaction.status === "Pago" || transaction.status === "Recebido" || String(transaction.rawStatus || "").toLowerCase() === "paid";
                    const isPartial = transaction.paidAmount != null && transaction.paidAmount > 0 && transaction.paidAmount < transaction.amount && !isPaidRow;
                    const displayAmount = isPaidRow
                        ? (transaction.paidAmount && transaction.paidAmount > 0 ? transaction.paidAmount : transaction.amount)
                        : transaction.amount;
                    return (
                        <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-[13px] font-bold whitespace-nowrap ${transaction.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}>
                                {transaction.ledgerDirection === "in" ? "+ " : "- "}
                                {formatCurrency(isPartial ? (transaction.paidAmount ?? 0) : displayAmount)}
                            </span>
                            {isPartial && (
                                <span className="text-[11px] text-brand-inactive-text whitespace-nowrap">
                                    de {formatCurrency(transaction.amount)}
                                </span>
                            )}
                        </div>
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
                                onPrint={onPrint ? () => onPrint(transaction) : undefined}
                            >
                                {((String(transaction.rawStatus || "").toLowerCase() === "pending" || transaction.isOverdue) && !transaction.isInstallmentGroup && !transaction.isRecurringOccurrence && onMarkAsPaid) && (
                                    <DropdownItem onClick={() => onMarkAsPaid(transaction)}>
                                        <MoneyIcon size={18} /> {transaction.paidAmount && transaction.paidAmount > 0
                                            ? `${transaction.ledgerDirection === "in" ? "Receber" : "Pagar"} saldo restante`
                                            : `Marcar como ${transaction.ledgerDirection === "in" ? "recebido" : "pago"}`
                                        }
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
                {selectable && (
                    <td
                        className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox checked={selected} onChange={() => onSelect(transaction.id)} />
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
        prev.transaction === next.transaction &&
        prev.selected === next.selected &&
        prev.selectable === next.selectable &&
        prev.columns === next.columns &&
        prev.onOpenDetail === next.onOpenDetail
)

TransactionListItem.displayName = "TransactionListItem"

export default TransactionListItem
