"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { StoreIcon } from "@/lib/icons"

interface PurchasesListRowProps {
    purchase: any
    isPending: boolean
    onDetail: (purchase: any) => void
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case "completed":
            return <Badge variant="green">Pago</Badge>
        case "pending":
            return <Badge variant="orange">Pendente</Badge>
        case "failed":
            return <Badge variant="red">Falhou</Badge>
        case "rejected":
            return <Badge variant="red">Recusado</Badge>
        case "refunded":
            return <Badge variant="purple">Reembolsado</Badge>
        case "partially_refunded":
            return <Badge variant="purple">Reembolso parcial</Badge>
        case "cancelled":
            return <Badge variant="gray">Cancelado</Badge>
        default:
            return <Badge variant="gray">{status}</Badge>
    }
}

const getTypeLabel = (type: string) => {
    switch (type) {
        case "subscription":
            return "Assinatura"
        case "addon":
            return "Add-on"
        case "credit_pack":
            return "Créditos"
        case "order_payment":
            return "Pedido"
        case "service":
            return "Serviço"
        case "marketplace_feature":
            return "Marketplace"
        default:
            return type
    }
}

const PurchasesListRow = React.memo(({ purchase, isPending, onDetail }: PurchasesListRowProps) => {
    const stores = purchase.partner?.stores || []
    const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const storeName = hq.name || "Loja Parceira"
    const logoUrl = hq.logo_url
    const planName = purchase.plan?.name || purchase.description || "N/A"
    const typeLabel = getTypeLabel(purchase.purchase_type)
    const payment = purchase.payments?.[0]
    const paymentMethod = payment?.payment_method_type || "Não informado"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(purchase)}
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
                            {purchase.partner_id?.slice(0, 8)}...
                        </span>
                    </div>
                </div>
            </td>

            {/* 2. Plano / Descrição */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {planName}
                </span>
            </td>

            {/* 3. Tipo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <Badge variant="gray" className="text-[11px] px-2 py-0.5">
                    {typeLabel}
                </Badge>
            </td>

            {/* 4. Valor */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                    {formatCurrency(purchase.total_amount || purchase.amount || 0)}
                </span>
            </td>

            {/* 5. Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getStatusBadge(purchase.status)}
            </td>

            {/* 6. Meio Pagamento */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {paymentMethod}
                </span>
            </td>

            {/* 7. Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(purchase.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(purchase.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </td>

            {/* 8. Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs font-medium action-btn"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDetail(purchase)
                    }}
                >
                    Ver Detalhes
                </Button>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.purchase === next.purchase &&
    prev.isPending === next.isPending
)

PurchasesListRow.displayName = "PurchasesListRow"

export default PurchasesListRow