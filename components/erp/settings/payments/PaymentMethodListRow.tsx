'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { CreditCardIcon, MoneyIcon, QRCodeIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

export interface PaymentMethodListItem {
    id: string
    name?: string | null
    type?: string | null
    payment_type?: string | null
    card_brand?: string | null
    max_installments?: number | null
    discount_percent?: number | null
    fee_percent?: number | null
    percentage_rate?: number | null
    fee_fixed?: number | null
    fixed_amount?: number | null
    is_active?: boolean | null
    is_online_default?: boolean | null
}

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface PaymentMethodListRowProps {
    method: PaymentMethodListItem
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
}

export const getPaymentTypeLabel = (method: PaymentMethodListItem) => {
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

export const getPaymentIcon = (method: PaymentMethodListItem) => {
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

export const getBrandsLabel = (method: PaymentMethodListItem) => {
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

const PaymentMethodListRow = React.memo(
    ({
        method,
        columns,
        selected,
        onSelect,
        onEdit,
        onDelete,
    }: PaymentMethodListRowProps) => {

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "name":
                    return (
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                {getPaymentIcon(method)}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                                    {method.name || "Método sem nome"}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {getBrandsLabel(method) || `Tipo ${getPaymentTypeLabel(method)}`}
                                </span>
                            </div>
                        </div>
                    )

                case "type":
                    return (
                        <Badge variant="gray" className="capitalize" icon={null}>
                            {getPaymentTypeLabel(method)}
                        </Badge>
                    )

                case "discount":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {method.discount_percent ? `${method.discount_percent}%` : "-"}
                        </span>
                    )

                case "fees":
                    return (
                        <div className="flex flex-col text-left">
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {getFeeLabel(method)}
                            </span>
                            {method.max_installments && method.max_installments > 1 ? (
                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                    Até {method.max_installments}x
                                </span>
                            ) : null}
                        </div>
                    )

                case "status":
                    return (
                        <Badge variant={method.is_active ? "green" : "red"} icon={null}>
                            {method.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={() => onEdit(method)}
                                onDelete={isSystemCashMethod(method) ? undefined : () => onDelete(method)}
                            />
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
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onEdit(method)}
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(method.id)} />
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
        prev.method === next.method &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

PaymentMethodListRow.displayName = "PaymentMethodListRow"

export default PaymentMethodListRow
