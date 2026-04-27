'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, Checkbox, ActionsDropdown } from "@/components/reusable"
import { CreditCardIcon, MoneyIcon, QRCodeIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import type { PaymentMethodListItem } from "./PaymentMethodListRow"

interface PaymentMethodMobileItemProps {
    method: PaymentMethodListItem
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
}

const getPaymentTypeLabel = (method: PaymentMethodListItem) => {
    const raw = String(method.type || method.payment_type || "").toLowerCase()

    switch (raw) {
        case "pix":
            return "Pix"
        case "credit_card":
        case "credito":
        case "credit":
            return "Cartão de crédito"
        case "debit_card":
        case "debito":
        case "debit":
            return "Cartão de débito"
        case "cash":
        case "dinheiro":
            return "Dinheiro"
        default:
            return raw ? raw.replaceAll("_", " ") : "Outro"
    }
}

const getPaymentIcon = (method: PaymentMethodListItem) => {
    const raw = String(method.type || method.payment_type || "").toLowerCase()

    if (raw === "pix") {
        return <QRCodeIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
    }

    if (raw === "cash" || raw === "dinheiro") {
        return <MoneyIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
    }

    return <CreditCardIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
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

const PaymentMethodMobileItem = React.memo(
    ({ method, selected, onSelect, onEdit, onDelete }: PaymentMethodMobileItemProps) => {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
                onClick={() => onEdit(method)}
            >
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center">
                        {getPaymentIcon(method)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading leading-tight truncate pr-1">
                                {method.name || "Método sem nome"}
                            </h3>
                            <div
                                className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${method.is_active ? "bg-brand-green" : "bg-brand-red"
                                    }`}
                            ></div>
                        </div>

                        <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                            <span>{getBrandsLabel(method) || getPaymentTypeLabel(method)}</span>
                            {method.max_installments && method.max_installments > 1 && (
                                <>
                                    <span className="mx-1.5">•</span>
                                    <span>Até {method.max_installments}x</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-end justify-between gap-2 mt-0.5">
                            <div className="flex items-center flex-wrap gap-y-1">
                                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                    {getFeeLabel(method)}
                                </span>
                                {method.discount_percent && (
                                    <>
                                        <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                        <Badge variant="green" className="h-5 text-[10px] px-1.5">
                                            {method.discount_percent}% desc.
                                        </Badge>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={() => onSelect(method.id)} />
                                <ActionsDropdown
                                    onEdit={() => onEdit(method)}
                                    onDelete={isSystemCashMethod(method) ? undefined : () => onDelete(method)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.method === next.method &&
        prev.selected === next.selected
)

PaymentMethodMobileItem.displayName = "PaymentMethodMobileItem"

export default PaymentMethodMobileItem
