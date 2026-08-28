"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { ShieldCheck } from "lucide-react"
import { StoreIcon } from "@/lib/icons"

interface RefundListRowProps {
    refund: any
    isPending: boolean
    onDetail: (refund: any) => void
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case "approved":
            return <Badge variant="green">Estornado</Badge>
        case "rejected":
            return <Badge variant="red">Recusado</Badge>
        case "under_review":
            return <Badge variant="blue">Em Analise</Badge>
        case "cancelled":
            return <Badge variant="gray">Cancelado</Badge>
        default:
            return <Badge variant="orange">Pendente</Badge>
    }
}

const getReasonLabel = (cat: string) => {
    switch (cat) {
        case "repentance_7_days":
            return "Arrependimento (CDC 7d)"
        case "double_charge":
            return "Cobranca duplicada"
        case "technical_issue":
            return "Problema tecnico"
        case "commercial_agreement":
            return "Acordo comercial"
        case "unsatisfied":
            return "Insatisfacao"
        default:
            return "Outro"
    }
}

const RefundListRow = React.memo(({ refund, isPending, onDetail }: RefundListRowProps) => {
    const stores = refund.partner?.stores || []
    const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const storeName = hq.name || "Loja Parceira"
    const logoUrl = hq.logo_url
    const imagesCount = Array.isArray(refund.images) ? refund.images.length : 0
    const docsCount = Array.isArray(refund.documents) ? refund.documents.length : 0
    const planName = refund.purchase?.plan?.name || refund.purchase?.description || "Assinatura"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(refund)}
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
                            {refund.partner_id?.slice(0, 8)}...
                        </span>
                    </div>
                </div>
            </td>

            {/* 2. Plano / Fatura */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                    {planName}
                </span>
            </td>

            {/* 3. Valor */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                    {formatCurrency(refund.amount)}
                </span>
            </td>

            {/* 4. Motivo & Evidencias */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col">
                    <span className="font-semibold text-[13px] text-brand-dark dark:text-dark-heading">
                        {getReasonLabel(refund.reason_category)}
                    </span>
                    <span className="text-[11px] text-brand-inactive-text">
                        {imagesCount} fotos - {docsCount} PDFs
                    </span>
                </div>
            </td>

            {/* 5. Garantia CDC */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {refund.is_within_7_days ? (
                    <Badge variant="green" className="inline-flex items-center gap-1">
                        <ShieldCheck size={11} />
                        <span>7d CDC</span>
                    </Badge>
                ) : (
                    <Badge variant="gray">
                        Fora do prazo
                    </Badge>
                )}
            </td>

            {/* 6. Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                {getStatusBadge(refund.status)}
            </td>

            {/* 7. Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(refund.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(refund.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </td>

            {/* 8. Acoes */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs font-medium action-btn"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDetail(refund)
                    }}
                >
                    Ver Detalhes
                </Button>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.refund === next.refund &&
    prev.isPending === next.isPending
)

RefundListRow.displayName = "RefundListRow"

export default RefundListRow
