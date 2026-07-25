"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"

interface ReturnListRowProps {
    request: any
    isPending: boolean
    onDetail: (request: any) => void
}

function getStatusBadge(status: string) {
    switch (status) {
        case "PENDING": return <Badge variant="orange">Pendente</Badge>
        case "APPROVED": return <Badge variant="green">Aprovado</Badge>
        case "REJECTED": return <Badge variant="red">Rejeitado</Badge>
        case "CANCELLED": return <Badge variant="gray">Cancelado</Badge>
        case "AWAITING_COLLECTION": return <Badge variant="blue">Aguardando Coleta</Badge>
        case "AWAITING_RECEIPT": return <Badge variant="blue">Aguardando Recebimento</Badge>
        case "REFUNDED": return <Badge variant="purple">Reembolsado</Badge>
        default: return <Badge variant="gray">{status}</Badge>
    }
}

function getTypeBadge(type: string) {
    switch (type) {
        case "exchange": return <Badge variant="blue">Troca</Badge>
        case "return": return <Badge variant="orange">Devolução</Badge>
        case "complaint": return <Badge variant="red">Reclamação</Badge>
        default: return <Badge variant="gray">{type}</Badge>
    }
}

const ReturnListRow = React.memo(({ request, isPending, onDetail }: ReturnListRowProps) => {
    const refundAmount = Number(request.refund_amount || 0)
    const creditAmount = Number(request.store_credit_amount || 0)
    const timelineCount = Array.isArray(request.return_events) ? request.return_events.length : 0
    const evidenceCount = Array.isArray(request.return_evidence) ? request.return_evidence.length : 0

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(request)}
        >
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        #{request.id.slice(0, 8)}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {formatDate(request.created_at)}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {request.order_number_snapshot || request.orders?.order_number || "-"}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {request.customer_name_snapshot || "Cliente"}
                </span>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {request.partners?.stores?.[0]?.name || request.partners?.store_name || request.partners?.business_type || "-"}
                    </span>
                    {request.orders?.store_id && (
                        <span className="text-[11px] font-medium text-brand-inactive-text">
                            store: {request.orders.store_id.slice(0, 8)}
                        </span>
                    )}
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getTypeBadge(request.request_type)}
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getStatusBadge(request.status)}
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                        {request.desired_resolution || request.approved_resolution || request.resolution_type || "-"}
                    </span>
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(refundAmount)}
                    </span>
                    {creditAmount > 0 && (
                        <span className="text-[10px] text-brand-inactive-text">Crédito: {formatCurrency(creditAmount)}</span>
                    )}
                </div>
            </td>

            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {request.source || "-"}
                </span>
            </td>

            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                        {timelineCount} eventos
                    </span>
                    <span className="text-[10px] text-brand-inactive-text">
                        {evidenceCount} evidências
                    </span>
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.request === next.request &&
    prev.isPending === next.isPending
)

ReturnListRow.displayName = "ReturnListRow"

export default ReturnListRow
