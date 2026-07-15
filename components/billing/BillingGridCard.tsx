"use client"

import { Badge, Button } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { Crown, Calendar, CreditCard, Tag } from "lucide-react"

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

const TYPE_ICONS: Record<string, any> = {
    subscription: Crown,
    addon: Tag,
    credit_pack: CreditCard,
    order_payment: Calendar,
}

export function BillingGridCard({
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
}: BillingGridCardProps) {
    const TypeIcon = TYPE_ICONS[type] || Tag
    const dateStr = new Date(createdAt).toLocaleDateString("pt-BR")

    return (
        <FadeIn>
            <div
                onClick={onDetails}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 cursor-pointer group flex flex-col h-full relative"
            >
                <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center shrink-0">
                        <TypeIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                    </div>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                        {description || typeLabel}
                    </p>
                    {partnerName && (
                        <p className="text-xs text-brand-inactive-text mt-0.5 truncate">{partnerName}</p>
                    )}
                </div>

                <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-brand-inactive-text">Valor</span>
                        <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-brand-inactive-text">Gateway</span>
                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">{gatewayLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-brand-inactive-text">Data</span>
                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">{dateStr}</span>
                    </div>
                </div>

                <div className="border-t border-brand-border dark:border-dark-border mt-4 pt-3">
                    <ActionsDropdown
                        onView={onDetails}
                        onCancel={onCancel}
                        onPrint={onInvoice}
                        cancelLabel="Cancelar"
                        cancelIcon={undefined}
                    />
                </div>
            </div>
        </FadeIn>
    )
}
