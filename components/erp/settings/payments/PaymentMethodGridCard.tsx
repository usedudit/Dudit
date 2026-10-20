"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox, Tooltip } from "@/components/reusable"
import { CreditCardIcon, MoneyIcon, QRCodeIcon, StarIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { PaymentMethodListItem, getPaymentTypeLabel } from "./PaymentMethodListRow"

interface PaymentMethodGridCardProps {
    method: PaymentMethodListItem
    selected: boolean
    onSelect: () => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
    isQuick?: boolean
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

const isSystemCashMethod = (method: PaymentMethodListItem) => {
    const rawType = String(method.type || method.payment_type || "").toLowerCase()
    const rawName = String(method.name || "").trim().toLowerCase()
    return rawType === "cash" || rawType === "dinheiro" || rawName === "dinheiro"
}

const PaymentMethodGridCard = React.memo(
    ({ method, selected, onSelect, onEdit, onDelete, isQuick }: PaymentMethodGridCardProps) => {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => onEdit(method)}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        {getPaymentIcon(method)}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                                    title={method.name || "Sem nome"}
                                >
                                    <span className="truncate">{method.name || "Sem nome"}</span>
                                </h3>
                                <Tooltip text={`Status: ${method.is_active ? "Ativo" : "Inativo"}`}>
                                    <Badge
                                        variant={method.is_active ? "green" : "red"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                                {method.is_online_default && (
                                    <Tooltip text="Método padrão para checkout online">
                                        <Badge variant="blue" icon={<StarIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                            </div>

                            <div className="shrink-0 -mt-1 -mr-1" onClick={(event) => event.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center mt-0.5">
                            <span>ID {method.id ? method.id.slice(0, 5).toUpperCase() : "-"}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    <div className={`grid gap-4 ${isQuick ? "grid-cols-1" : "grid-cols-2"}`}>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Desconto</span>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {method.discount_percent ? `${method.discount_percent}%` : "-"}
                            </span>
                        </div>
                        {!isQuick && (
                            <div className="flex flex-col gap-0.5 items-end min-w-0">
                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Conta Financeira</span>
                                <span
                                    className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-full"
                                    title={method.finance_account_name || "-"}
                                >
                                    {method.finance_account_name || "-"}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {getPaymentTypeLabel(method)}
                                </span>
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
    (prev, next) =>
        prev.selected === next.selected &&
        prev.method.id === next.method.id &&
        prev.method.name === next.method.name &&
        prev.method.is_active === next.method.is_active &&
        prev.method.type === next.method.type &&
        prev.method.payment_type === next.method.payment_type &&
        prev.method.discount_percent === next.method.discount_percent &&
        prev.method.fee_percent === next.method.fee_percent &&
        prev.method.finance_account_name === next.method.finance_account_name &&
        prev.method.is_online_default === next.method.is_online_default &&
        prev.isQuick === next.isQuick
)

PaymentMethodGridCard.displayName = "PaymentMethodGridCard"

export default PaymentMethodGridCard
