"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { formatCurrency } from "@/lib/utils"
import { Crown, Tag, CreditCard, ShoppingCart, Calendar } from "lucide-react"

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
    gatewayLabel: string
    partnerName?: string | null
    createdAt: string
    onDetails: () => void
    onCancel?: () => void
    onInvoice?: () => void
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
        gatewayLabel,
        partnerName,
        createdAt,
        onDetails,
        onCancel,
        onInvoice,
    }: BillingGridCardProps) => {
        const TypeIcon = TYPE_ICONS[type] || Tag
        const dateStr = new Date(createdAt).toLocaleDateString("pt-BR")

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <TypeIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={description || typeLabel}>
                                    {description || typeLabel}
                                </h3>
                            </div>
                            <Badge variant={statusVariant} className="shrink-0 scale-90">{statusLabel}</Badge>
                        </div>

                        {partnerName && (
                            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate mt-1">
                                {partnerName}
                            </div>
                        )}

                        <div className="mt-2">
                            <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(totalAmount)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Gateway</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{gatewayLabel}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Data</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{dateStr}</span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{typeLabel}</span>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                                onView={onDetails}
                                onCancel={onCancel}
                                onPrint={onInvoice}
                                cancelLabel="Cancelar"
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.id === next.id &&
        prev.status === next.status &&
        prev.totalAmount === next.totalAmount
)

BillingGridCard.displayName = "BillingGridCard"
export default BillingGridCard
export { BillingGridCard }
