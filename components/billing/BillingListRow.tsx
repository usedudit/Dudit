"use client"

import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { Crown, Tag, CreditCard, EyeIcon, XIcon, PrinterIcon } from "lucide-react"

interface Column {
    id: string
    label: string
    align?: "left" | "center" | "right"
    width?: string
}

interface BillingListRowProps {
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
    columns: Column[]
    onDetails: () => void
    onCancel?: () => void
    onInvoice?: () => void
}

const TYPE_ICONS: Record<string, any> = {
    subscription: Crown,
    addon: Tag,
    credit_pack: CreditCard,
}

export function BillingListRow({
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
    columns,
    onDetails,
    onCancel,
    onInvoice,
}: BillingListRowProps) {
    const dateStr = new Date(createdAt).toLocaleDateString("pt-BR")

    return (
        <tr onClick={onDetails} className="group hover:bg-brand-gray cursor-pointer bg-white dark:bg-dark-surface">
            {columns.map((col) => (
                <td key={col.id} className={`p-2 border-b border-brand-border dark:border-dark-border ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}>
                    {col.id === "type" && (
                        <span className="text-xs text-brand-inactive-text">{typeLabel}</span>
                    )}
                    {col.id === "description" && (
                        <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate max-w-[200px] block">
                            {description || typeLabel}
                        </span>
                    )}
                    {col.id === "partner" && partnerName && (
                        <span className="text-xs text-brand-dark dark:text-dark-heading">{partnerName}</span>
                    )}
                    {col.id === "amount" && (
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                    )}
                    {col.id === "status" && (
                        <Badge variant={statusVariant}>{statusLabel}</Badge>
                    )}
                    {col.id === "gateway" && (
                        <span className="text-xs text-brand-inactive-text">{gatewayLabel}</span>
                    )}
                    {col.id === "date" && (
                        <span className="text-xs text-brand-inactive-text">{dateStr}</span>
                    )}
                    {col.id === "actions" && (
                        <div className="action-btn opacity-0 group-hover:opacity-100 transition-opacity">
                            <ActionsDropdown
                                onView={onDetails}
                                onCancel={onCancel}
                                onPrint={onInvoice}
                                cancelLabel="Cancelar"
                                cancelIcon={undefined}
                            />
                        </div>
                    )}
                </td>
            ))}
        </tr>
    )
}
