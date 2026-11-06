"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { StoreIcon } from "@/lib/icons"

interface SubscriptionsListRowProps {
    subscription: any
    isPending: boolean
    onDetail: (subscription: any) => void
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case "active":
            return <Badge variant="green">Ativa</Badge>
        case "past_due":
            return <Badge variant="red">Em atraso</Badge>
        case "cancelled":
            return <Badge variant="gray">Cancelada</Badge>
        case "trialing":
            return <Badge variant="blue">Trial</Badge>
        case "incomplete":
            return <Badge variant="orange">Incompleta</Badge>
        case "incomplete_expired":
            return <Badge variant="red">Trial expirado</Badge>
        default:
            return <Badge variant="gray">{status}</Badge>
    }
}

const SubscriptionsListRow = React.memo(({ subscription, isPending, onDetail }: SubscriptionsListRowProps) => {
    const stores = subscription.partner?.stores || []
    const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const storeName = hq.name || "Loja Parceira"
    const logoUrl = hq.logo_url
    const planName = subscription.plan?.name || subscription.description || "N/A"
    const subStatus = subscription.subscription?.status || "unknown"
    const periodEnd = subscription.subscription?.current_period_end
    const price = subscription.plan?.price || subscription.total_amount || subscription.amount || 0
    const interval = subscription.plan?.interval || "month"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(subscription)}
        >
            {/* 1. Loja / Parceiro */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                            <img src={getR2ImageUrl(logoUrl)} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[180px]">
                            {storeName}
                        </span>
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                            {subscription.partner_id?.slice(0, 8)}...
                        </span>
                    </div>
                </div>
            </td>

            {/* 2. Plano */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {planName}
                </span>
            </td>

            {/* 3. Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getStatusBadge(subStatus)}
            </td>

            {/* 4. Valor */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                    {formatCurrency(price)}/{interval === "month" ? "mês" : interval === "year" ? "ano" : interval}
                </span>
            </td>

            {/* 5. Próx. Cobrança */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[12px] font-medium text-brand-dark dark:text-dark-heading">
                    {periodEnd ? formatDate(periodEnd) : "—"}
                </span>
            </td>

            {/* 6. Criada em */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(subscription.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(subscription.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </td>

            {/* 7. Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs font-medium action-btn"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDetail(subscription)
                    }}
                >
                    Ver Detalhes
                </Button>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.subscription === next.subscription &&
    prev.isPending === next.isPending
)

SubscriptionsListRow.displayName = "SubscriptionsListRow"

export default SubscriptionsListRow