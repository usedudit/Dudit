"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { StoreIcon, ReturnIcon } from "@/lib/icons"

interface OrderListRowProps {
    order: any
    isPending: boolean
    onDetail: (order: any) => void
}

const OrderListRow = React.memo(({ order, isPending, onDetail }: OrderListRowProps) => {
    const returns = Array.isArray(order.return_requests) ? order.return_requests : []
    const exchangeOrder = order.exchange_parent_order_id || order.exchange_return_request_id

    const situationBadge = (situation: string) => {
        switch (situation) {
            case "paid": return <Badge variant="green">Pago</Badge>
            case "pending": return <Badge variant="orange">Pendente</Badge>
            case "cancelled": return <Badge variant="red">Cancelado</Badge>
            case "delivered": return <Badge variant="blue">Entregue</Badge>
            case "processing": return <Badge variant="blue">Processando</Badge>
            case "shipped": return <Badge variant="blue">Enviado</Badge>
            case "refunded": return <Badge variant="purple">Reembolsado</Badge>
            default: return <Badge variant="gray">{situation}</Badge>
        }
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(order)}
        >
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        {order.order_number || order.id.slice(0, 8)}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {formatDate(order.created_at)}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {order.customer_name || "Cliente"}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex items-center gap-1">
                    <StoreIcon size={12} className="text-brand-inactive-text shrink-0" />
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {order.partners?.store_name || order.partners?.business_type || "-"}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-1">
                    {situationBadge(order.situation)}
                    <span className="text-[10px] font-medium text-brand-inactive-text">
                        {order.payment_method || order.payment_provider || "-"}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {order.delivery_status || "-"}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                    {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                        {order.order_items?.length || 0} itens
                    </span>
                    {exchangeOrder ? (
                        <span className="text-[10px] text-brand-green font-medium flex items-center gap-1">
                            <ReturnIcon size={10} /> Troca vinculada
                        </span>
                    ) : null}
                </div>
            </td>

            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                    {returns.length > 0 ? (
                        <span className="text-brand-orange font-bold">{returns.length} solicitação(ões)</span>
                    ) : (
                        <span className="text-brand-inactive-text">-</span>
                    )}
                </span>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.order === next.order &&
    prev.isPending === next.isPending
)

OrderListRow.displayName = "OrderListRow"

export default OrderListRow
