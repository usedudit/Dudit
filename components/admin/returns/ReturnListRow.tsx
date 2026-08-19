"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"

interface ReturnListRowProps {
    request: any
    isPending: boolean
    onDetail: (request: any) => void
}

function getStatusBadge(statusRaw: string) {
    const s = String(statusRaw || "").toUpperCase()
    switch (s) {
        case "PENDING":
        case "PENDING_REVIEW":
        case "UNDER_REVIEW":
        case "UNDER_ANALYSIS":
            return <Badge variant="orange">Pendente</Badge>
        case "APPROVED":
        case "AUTHORIZED":
            return <Badge variant="green">Aprovado</Badge>
        case "REJECTED":
            return <Badge variant="red">Recusado</Badge>
        case "CANCELLED":
        case "CANCELED":
            return <Badge variant="gray">Cancelado</Badge>
        case "COMPLETED":
        case "RESOLVED":
        case "CLOSED":
            return <Badge variant="green">Concluído</Badge>
        case "AWAITING_COLLECTION":
            return <Badge variant="blue">Aguardando Coleta</Badge>
        case "AWAITING_RECEIPT":
            return <Badge variant="blue">Aguardando Recebimento</Badge>
        case "REFUNDED":
            return <Badge variant="purple">Reembolsado</Badge>
        default:
            return <Badge variant="gray">{statusRaw || "-"}</Badge>
    }
}

function getResolutionBadge(resolutionRaw?: string) {
    const r = String(resolutionRaw || "").toLowerCase()
    switch (r) {
        case "refund":
        case "reembolso":
        case "estorno":
            return <Badge variant="orange">Reembolso</Badge>
        case "store_credit":
        case "credito":
        case "vale_compra":
            return <Badge variant="blue">Vale-Compra</Badge>
        case "exchange":
        case "replacement":
        case "troca":
            return <Badge variant="purple">Troca</Badge>
        case "repair":
        case "reparo":
            return <Badge variant="gray">Reparo</Badge>
        default:
            return <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{resolutionRaw || "-"}</span>
    }
}

const ReturnListRow = React.memo(({ request, isPending, onDetail }: ReturnListRowProps) => {
    const refundAmount = Number(request.refund_amount || 0)
    const creditAmount = Number(request.store_credit_amount || 0)
    const totalDisplay = refundAmount > 0 ? refundAmount : creditAmount

    const storeName = request.stores?.name || request.partners?.stores?.[0]?.name || request.partners?.store_name || "Loja"
    const storeId = request.store_id || request.orders?.store_id || request.partner_id

    const resolution = request.resolution_type || request.approved_resolution || request.desired_resolution || request.request_type

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(request)}
        >
            {/* 1. Código (Apenas código) */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight">
                    #{request.id ? request.id.slice(0, 8) : "-"}
                </span>
            </td>

            {/* 2. Pedido */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {request.order_number_snapshot || request.orders?.order_number || "-"}
                </span>
            </td>

            {/* 3. Loja */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {storeName}
                    </span>
                    {storeId && (
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                            store: {storeId.slice(0, 8)}
                        </span>
                    )}
                </div>
            </td>

            {/* 4. Cliente */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {request.customer_name_snapshot || "Cliente"}
                </span>
            </td>

            {/* 5. Data (Data e Hora) */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(request.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* 6. Resolução (Em português) */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getResolutionBadge(resolution)}
            </td>

            {/* 7. Status (Em português) */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getStatusBadge(request.status)}
            </td>

            {/* 8. Total */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(totalDisplay)}
                    </span>
                    {creditAmount > 0 && refundAmount > 0 && (
                        <span className="text-[10px] text-brand-inactive-text">Crédito: {formatCurrency(creditAmount)}</span>
                    )}
                </div>
            </td>

            {/* 9. Origem */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading capitalize">
                    {request.source === "erp" ? "ERP" : request.source === "marketplace" ? "Marketplace" : request.source || "-"}
                </span>
            </td>

            {/* 10. Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs font-medium action-btn"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDetail(request)
                    }}
                >
                    Ver Detalhes
                </Button>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.request === next.request &&
    prev.isPending === next.isPending
)

ReturnListRow.displayName = "ReturnListRow"

export default ReturnListRow
