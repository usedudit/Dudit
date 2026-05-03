"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { CreditCardIcon, MoneyIcon, QRCodeIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { PaymentMethodListItem, getPaymentTypeLabel } from "./PaymentMethodListRow"

interface PaymentMethodGridCardProps {
    method: PaymentMethodListItem
    selected: boolean
    onSelect: () => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
}

const getPaymentIcon = (method: PaymentMethodListItem) => {
    const raw = String(method.type || method.payment_type || "").toLowerCase()

    if (raw === "pix") {
        return <QRCodeIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
    }

    if (raw === "cash" || raw === "dinheiro") {
        return <MoneyIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
    }

    return <CreditCardIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
}

const getFeeLabel = (method: PaymentMethodListItem) => {
    const feePercent = method.fee_percent ?? method.percentage_rate
    const feeFixed = method.fee_fixed ?? method.fixed_amount

    if (!feePercent && !feeFixed) return "-"

    const parts: string[] = []
    if (feePercent) parts.push(`${feePercent}%`)
    if (feeFixed) parts.push(`+ ${formatCurrency(feeFixed)}`)
    return parts.join(" ")
}

const getBrandsLabel = (method: PaymentMethodListItem) => {
    if (!method.card_brand) return ""

    return method.card_brand
        .split(";")
        .map((brand) => brand.trim().replaceAll("_", " "))
        .filter(Boolean)
        .join(", ")
}

const isSystemCashMethod = (method: PaymentMethodListItem) => {
    const rawType = String(method.type || method.payment_type || "").toLowerCase()
    const rawName = String(method.name || "").trim().toLowerCase()
    return rawType === "cash" || rawType === "dinheiro" || rawName === "dinheiro"
}

const PaymentMethodGridCard = React.memo(
    ({ method, selected, onSelect, onEdit, onDelete }: PaymentMethodGridCardProps) => {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => onEdit(method)}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative overflow-hidden"
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        {getPaymentIcon(method)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                    {method.name || "Sem nome"}
                                </h3>
                                <Badge variant={method.is_active ? "green" : "red"} icon={null} className="whitespace-nowrap scale-90 shrink-0">
                                    {method.is_active ? "Ativo" : "Inativo"}
                                </Badge>
                            </div>

                            <div className="shrink-0 -mt-1 -mr-1" onClick={(event) => event.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate mt-1">
                            {getBrandsLabel(method) || getPaymentTypeLabel(method)}
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Desconto</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {method.discount_percent ? `${method.discount_percent}%` : "-"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Taxas</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {getFeeLabel(method)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-3">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>
                            <div className="flex items-center gap-2.5">
                                <Badge variant="gray" icon={null} className="whitespace-nowrap scale-90">
                                    {getPaymentTypeLabel(method)}
                                </Badge>
                            </div>
                        </div>

                        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                            <ActionsDropdown
                                onEdit={() => onEdit(method)}
                                onDelete={isSystemCashMethod(method) ? undefined : () => onDelete(method)}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
)

PaymentMethodGridCard.displayName = "PaymentMethodGridCard"

export default PaymentMethodGridCard
