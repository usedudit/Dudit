'use client';

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox, DropdownItem, Tooltip } from "@/components/reusable"
import { CreditCardIcon, FileIcon, MoneyIcon, InstallmentIcon, RepeatIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { DueDateCountdown } from "@/lib/utils/transaction-due-countdown"
import type { ERPTransaction } from "../../../lib/services/transactions.types"
import { PaymentMethodIndicator } from "./PaymentMethodIndicator";

interface TransactionGridCardProps {
    transaction: ERPTransaction
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

const TransactionGridCard = React.memo(
    ({ transaction, selected, onSelect, onOpenDetail, onEdit, onMarkAsPaid, onCancelPending, onSettleInstallmentGroup, onPrefetchMouseEnter, onPrefetchMouseLeave, onPrefetchTouchStart }: TransactionGridCardProps) => {
        const PaymentIcon = getPaymentIcon(transaction.paymentType)
        const isRecurring = !!transaction.recurringId || !!transaction.isRecurringOccurrence

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={() => onOpenDetail?.(transaction)}
                onMouseEnter={() => onPrefetchMouseEnter?.(transaction.id)}
                onMouseLeave={() => onPrefetchMouseLeave?.(transaction.id)}
                onTouchStart={() => onPrefetchTouchStart?.(transaction.id)}
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <PaymentIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                                <h3 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink">
                                    {transaction.description}
                                </h3>
                                {transaction.installmentGroupId && (
                                    <Tooltip text="Faturamento: Parcelado">
                                        <Badge variant="orange" icon={<InstallmentIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                                {!transaction.isInstallmentGroup && transaction.installmentNumber && transaction.installmentTotalCount && (
                                    <Tooltip text={`Parcela: ${transaction.installmentNumber}/${transaction.installmentTotalCount}`}>
                                        <Badge variant="gray" icon={<InstallmentIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                                {isRecurring && (
                                    <Tooltip text="Faturamento: Recorrente">
                                        <Badge variant="purple" icon={<RepeatIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                                {(() => {
                                    const isPartial = transaction.paidAmount != null && transaction.paidAmount > 0 && transaction.paidAmount < transaction.amount && String(transaction.rawStatus || "").toLowerCase() === "pending";
                                    const gridStatusLabel = isPartial
                                        ? (transaction.ledgerDirection === "in" ? "Parcialmente recebido" : "Parcialmente pago")
                                        : transaction.status;
                                    const gridStatusVariant = isPartial ? "orange" : transaction.statusVariant;
                                    return (
                                        <Tooltip text={`Status: ${gridStatusLabel}`}>
                                            <Badge variant={gridStatusVariant} className="whitespace-nowrap scale-90 shrink-0">{gridStatusLabel}</Badge>
                                        </Tooltip>
                                    );
                                })()}
                            </div>

                            <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={() => onSelect(transaction.id)} />
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <div className="mt-1 flex items-center">
                                <PaymentMethodIndicator label={transaction.paymentType} simplify />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                    <div className="flex justify-between items-center w-full">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Valor</span>
                            {(() => {
                                const isGridPaidRow = transaction.status === "Pago" || transaction.status === "Recebido" || String(transaction.rawStatus || "").toLowerCase() === "paid";
                                const isGridPartial = transaction.paidAmount != null && transaction.paidAmount > 0 && transaction.paidAmount < transaction.amount && !isGridPaidRow;
                                const gridDisplayAmount = isGridPaidRow
                                    ? (transaction.paidAmount && transaction.paidAmount > 0 ? transaction.paidAmount : transaction.amount)
                                    : (isGridPartial ? (transaction.paidAmount ?? 0) : transaction.amount);
                                return (
                                    <div className="flex flex-col gap-0.5">
                                        <span className={`text-[15px] font-bold ${transaction.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}>
                                            {transaction.ledgerDirection === "in" ? "+ " : "- "}
                                            {formatCurrency(gridDisplayAmount)}
                                        </span>
                                        {isGridPartial && (
                                            <span className="text-[11px] text-brand-inactive-text">de {formatCurrency(transaction.amount)}</span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Origem</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {transaction.originSource || "Manual"}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Data</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {transaction.createdAtDate}
                            </span>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end shrink-0 text-right">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vencimento</span>
                            <span className={`text-sm font-bold ${transaction.isOverdue ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                                {transaction.dueDateShort}
                                {(() => {
                                    const countdown = <DueDateCountdown transaction={transaction} align="right" />
                                    return countdown === null ? null : (<><span className="text-brand-inactive-text"> | </span>{countdown}</>)
                                })()}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Contato</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {transaction.contactName}
                            </span>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                        <MoneyIcon size={18} /> {transaction.paidAmount && transaction.paidAmount > 0
                                            ? `${transaction.ledgerDirection === "in" ? "Receber" : "Pagar"} saldo restante`
                                            : `Marcar como ${transaction.ledgerDirection === "in" ? "recebido" : "pago"}`
                                        }
                                    </DropdownItem>
                                )}
                            </ActionsDropdown>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.transaction === next.transaction &&
        prev.onOpenDetail === next.onOpenDetail
)

TransactionGridCard.displayName = "TransactionGridCard"

export default TransactionGridCard
