"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Button, Checkbox, Spinner } from "@/components/reusable"
import { Separator } from "@/components/reusable/Separator"
import { CreditCardIcon, MoneyIcon, QRCodeIcon, ThreeDotsIcon } from "@/lib/icons"
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
}

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
}

interface PaymentMethodListRowProps {
    method: PaymentMethodListItem
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
    onToggleStatus: (method: PaymentMethodListItem, nextValue: boolean) => void
    isToggling: boolean
    isDeleting: boolean
}

export const getPaymentTypeLabel = (method: PaymentMethodListItem) => {
    const raw = String(method.type || method.payment_type || "").toLowerCase()

    switch (raw) {
        case "pix":
            return "Pix"
        case "credit_card":
        case "credito":
        case "credit":
            return "Cartao de credito"
        case "debit_card":
        case "debito":
        case "debit":
            return "Cartao de debito"
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

const getStatusBadge = (isActive: boolean | null | undefined) => (
    <Badge variant={isActive ? "green" : "gray"}>
        {isActive ? "Ativo" : "Inativo"}
    </Badge>
)

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

const PaymentMethodListRow = React.memo(({
    method,
    columns,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onToggleStatus,
    isToggling,
    isDeleting,
}: PaymentMethodListRowProps) => {
    const renderCellContent = (columnId: string) => {
        switch (columnId) {
            case "name":
                return (
                    <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                            {getPaymentIcon(method)}
                        </div>

                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[220px] xl:max-w-[320px]">
                                {method.name || "Metodo sem nome"}
                            </span>

                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                {getBrandsLabel(method) || `Tipo ${getPaymentTypeLabel(method)}`}
                            </span>
                        </div>
                    </div>
                )

            case "type":
                return (
                    <Badge variant="gray" className="capitalize">
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
                                Ate {method.max_installments}x
                            </span>
                        ) : null}
                    </div>
                )

            case "status":
                return (
                    <div className="flex items-center justify-center gap-3">
                        {getStatusBadge(Boolean(method.is_active))}
                        {isToggling ? (
                            <Spinner size={16} className="text-brand-dark dark:text-dark-heading" />
                        ) : (
                            <Checkbox
                                checked={Boolean(method.is_active)}
                                onChange={(checked) => onToggleStatus(method, checked)}
                            />
                        )}
                    </div>
                )

            case "actions":
                return (
                    <div className="flex justify-center action-btn" onClick={(event) => event.stopPropagation()}>
                        {isDeleting ? (
                            <Spinner size={16} className="text-brand-red" />
                        ) : (
                            <ActionsDropdown
                                onEdit={() => onEdit(method)}
                                onDelete={() => onDelete(method)}
                                trigger={
                                    <Button variant="outline" size="icon" className="w-9 h-9 bg-transparent border-opacity-50">
                                        <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                    </Button>
                                }
                            />
                        )}
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
            onClick={() => onEdit(method)}
        >
            <td className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14" onClick={(event) => event.stopPropagation()}>
                <Checkbox checked={selected} onChange={() => onSelect(method.id)} />
            </td>

            {columns.map((column) => (
                <td
                    key={column.id}
                    className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(column.align)}`}
                >
                    <div className={`flex items-center w-full min-w-0 ${getJustifyClass(column.align)}`}>
                        {renderCellContent(column.id)}
                    </div>
                </td>
            ))}
        </motion.tr>
    )
}, (prev, next) =>
    prev.method === next.method &&
    prev.selected === next.selected &&
    prev.columns === next.columns &&
    prev.isToggling === next.isToggling &&
    prev.isDeleting === next.isDeleting
)

PaymentMethodListRow.displayName = "PaymentMethodListRow"

interface PaymentMethodMobileItemProps {
    method: PaymentMethodListItem
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (method: PaymentMethodListItem) => void
    onDelete: (method: PaymentMethodListItem) => void
    onToggleStatus: (method: PaymentMethodListItem, nextValue: boolean) => void
    isToggling: boolean
    isDeleting: boolean
    showSeparator?: boolean
}

export function PaymentMethodMobileItem({
    method,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onToggleStatus,
    isToggling,
    isDeleting,
    showSeparator = true,
}: PaymentMethodMobileItemProps) {
    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-4 cursor-pointer"
                onClick={() => onEdit(method)}
            >
                <div className="flex items-start gap-3">
                    <div className="pt-1" onClick={(event) => event.stopPropagation()}>
                        <Checkbox checked={selected} onChange={() => onSelect(method.id)} />
                    </div>

                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center">
                        {getPaymentIcon(method)}
                    </div>

                    <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                    {method.name || "Metodo sem nome"}
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    {getBrandsLabel(method) || getPaymentTypeLabel(method)}
                                </p>
                            </div>

                            <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                                {isDeleting ? (
                                    <div className="w-9 h-9 flex items-center justify-center">
                                        <Spinner size={16} className="text-brand-red" />
                                    </div>
                                ) : (
                                    <ActionsDropdown
                                        onEdit={() => onEdit(method)}
                                        onDelete={() => onDelete(method)}
                                        trigger={
                                            <Button variant="ghost" size="icon" className="w-9 h-9">
                                                <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                            </Button>
                                        }
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="gray">{getPaymentTypeLabel(method)}</Badge>
                            {getStatusBadge(Boolean(method.is_active))}
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
                                    Desconto
                                </p>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {method.discount_percent ? `${method.discount_percent}%` : "-"}
                                </p>
                            </div>

                            <div>
                                <p className="text-[11px] uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
                                    Taxas
                                </p>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {getFeeLabel(method)}
                                </p>
                            </div>

                            <div>
                                <p className="text-[11px] uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
                                    Parcelas
                                </p>
                                <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {method.max_installments && method.max_installments > 1 ? `Ate ${method.max_installments}x` : "-"}
                                </p>
                            </div>
                        </div>

                        <div
                            className="flex items-center justify-between rounded-2xl bg-brand-gray/70 dark:bg-dark-border/20 px-3 py-2"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                Status
                            </span>

                            {isToggling ? (
                                <Spinner size={16} className="text-brand-dark dark:text-dark-heading" />
                            ) : (
                                <Checkbox
                                    checked={Boolean(method.is_active)}
                                    onChange={(checked) => onToggleStatus(method, checked)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {showSeparator ? <Separator className="bg-brand-border dark:bg-dark-border" /> : null}
        </>
    )
}

export default PaymentMethodListRow
