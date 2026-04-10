'use client';

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { CreditCardIcon, FileIcon, MoneyIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import type { ERPTransaction } from "../../../lib/services/transactions.types"

interface TransactionGridCardProps {
    transaction: ERPTransaction
    selected: boolean
    onSelect: (id: string) => void
}

const getPaymentIcon = (paymentType: string) => {
    const normalized = paymentType.toLowerCase()

    if (normalized.includes("credit")) return CreditCardIcon
    if (normalized.includes("boleto")) return FileIcon
    return MoneyIcon
}

const TransactionGridCard = React.memo(
    ({ transaction, selected, onSelect }: TransactionGridCardProps) => {
        const PaymentIcon = getPaymentIcon(transaction.paymentType)

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-dark/90 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <PaymentIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                                <h3 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink">
                                    {transaction.displayId}
                                </h3>
                                <Badge variant={transaction.statusVariant} className="whitespace-nowrap scale-90 shrink-0">
                                    {transaction.status}
                                </Badge>
                            </div>

                            <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={() => onSelect(transaction.id)} />
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-bold ${transaction.transactionType === "income" ? "text-brand-green" : "text-brand-red"}`}>
                                {transaction.transactionType === "income" ? "+ " : "- "}
                                {formatCurrency(transaction.amount)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Descrição</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                            {transaction.description}
                        </span>
                    </div>

                    <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Contato</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {transaction.contactName}
                            </span>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end shrink-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
                            <span className={`text-sm font-bold ${transaction.isOverdue ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                                {transaction.dueDateShort}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pagamento</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {transaction.paymentType}
                            </span>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown onView={() => { }} onEdit={() => { }} onDelete={() => { }} />
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.transaction === next.transaction
)

TransactionGridCard.displayName = "TransactionGridCard"

export default TransactionGridCard
