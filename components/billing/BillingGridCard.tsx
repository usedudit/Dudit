"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, DropdownItem } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Crown, Tag, CreditCard, ShoppingCart, Calendar, Wallet } from "lucide-react"
import Image from "next/image"

const TYPE_ICONS: Record<string, any> = {
    subscription: Crown,
    addon: Tag,
    credit_pack: CreditCard,
    order_payment: ShoppingCart,
    marketplace_feature: Tag,
    service: Calendar,
}

interface BillingGridCardProps {
    id: string
    type: string
    typeLabel: string
    description: string | null
    amount: number
    totalAmount: number
    status: string
    statusLabel: string
    statusVariant: "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray"
    paymentMethodLabel: string
    paymentMethodDetails?: string
    paymentMethodIcon?: string
    createdAt: string
    invoiceId?: string | null
    onDetails: () => void
    onCancel?: () => void
    onInvoice?: (invoiceId: string) => void
    onPay?: () => void
}

const BillingGridCard = React.memo(
    ({
        id,
        type,
        typeLabel,
        description,
        amount,
        totalAmount,
        status,
        statusLabel,
        statusVariant,
        paymentMethodLabel,
        paymentMethodDetails,
        paymentMethodIcon,
        createdAt,
        invoiceId,
        onDetails,
        onCancel,
        onInvoice,
        onPay,
    }: BillingGridCardProps) => {
        const TypeIcon = TYPE_ICONS[type] || Tag
        const dateStr = formatDate(createdAt)

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative"
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <TypeIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={description || typeLabel}>
                                    {description || typeLabel}
                                </h3>
                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                                    <TypeIcon className="w-3 h-3" />
                                    {typeLabel}
                                </span>
                            </div>
                            <Badge variant={statusVariant} className="shrink-0 scale-90">{statusLabel}</Badge>
                        </div>

                        <div className="mt-2">
                            <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(totalAmount)}
                            </span>
                        </div>
                    </div>
                </div>

                    <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5 items-end">
                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Data</span>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{dateStr}</span>
                            </div>
                        </div>

                        {(paymentMethodLabel || paymentMethodIcon) && (
                            <div className="flex items-center gap-2 pt-1">
                                {paymentMethodIcon && (
                                    <Image
                                        src={paymentMethodIcon}
                                        alt=""
                                        width={20}
                                        height={20}
                                        className="w-5 h-5 object-contain"
                                    />
                                )}
                                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">
                                    {paymentMethodLabel || "Não informado"}
                                </span>
                            </div>
                        )}

                    <div className="flex items-end justify-between mt-1">
                        <div />
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                                onView={onDetails}
                                onCancel={onCancel}
                                onPrint={invoiceId ? () => onInvoice?.(invoiceId) : undefined}
                                cancelLabel="Cancelar"
                            >
                                {onPay && (
                                    <DropdownItem onClick={onPay}>
                                        <Wallet size={18} />
                                        Pagar
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
        prev.id === next.id &&
        prev.status === next.status &&
        prev.totalAmount === next.totalAmount &&
        prev.invoiceId === next.invoiceId &&
        prev.paymentMethodIcon === next.paymentMethodIcon &&
        prev.paymentMethodDetails === next.paymentMethodDetails
)

BillingGridCard.displayName = "BillingGridCard"
export default BillingGridCard
export { BillingGridCard }
