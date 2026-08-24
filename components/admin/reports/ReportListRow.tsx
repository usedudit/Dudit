"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    CheckCircleIcon,
    AlertTriangleIcon,
    ReturnIcon,
    UserIcon,
    MailIcon
} from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"
import type { Report } from "@/app/actions/admin/reports"

interface ReportListRowProps {
    report: Report
    isPending: boolean
    onDetail: (report: Report) => void
    onResolve: (report: Report) => void
    onDismiss: (report: Report) => void
    onSpam: (report: Report) => void
    onRevert: (report: Report) => void
}

const ReportListRow = React.memo(({
    report,
    isPending,
    onDetail,
    onResolve,
    onDismiss,
    onSpam,
    onRevert
}: ReportListRowProps) => {

    const statusMap: Record<string, { variant: "orange" | "red" | "gray" | "purple"; label: string }> = {
        pending: { variant: "orange", label: "Pendente" },
        validated: { variant: "red", label: "Validada" },
        dismissed: { variant: "gray", label: "Descartada" },
        spam: { variant: "purple", label: "Spam" },
    }

    const statusInfo = statusMap[report.status] || { variant: "gray", label: report.status }

    const targetTypeLabels: Record<string, string> = {
        product: "Produto",
        service: "Serviço",
        partner: "Loja",
        store: "Loja",
        review: "Avaliação",
        return_request: "Devolução",
        order: "Pedido",
        user: "Usuário",
    }

    const targetTypeBadgeVariant: Record<string, "blue" | "orange" | "green" | "purple" | "cyan" | "gray" | "red"> = {
        product: "blue",
        service: "green",
        partner: "orange",
        store: "orange",
        review: "purple",
        return_request: "orange",
        order: "blue",
        user: "gray",
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(report)}
        >
            {/* Item Denunciado */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border">
                <div className="flex flex-col text-left min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        {report.target_name || (
                            report.target_type === "review"
                                ? `Avaliação #${report.target_id.slice(0, 8)}`
                                : report.target_type === "product"
                                ? `Produto #${report.target_id.slice(0, 8)}`
                                : report.target_type === "service"
                                ? `Serviço #${report.target_id.slice(0, 8)}`
                                : report.target_type === "partner" || (report.target_type as string) === "store"
                                ? `Loja #${report.target_id.slice(0, 8)}`
                                : report.target_type === "return_request"
                                ? `Devolução #${report.target_id.slice(0, 8)}`
                                : report.target_id
                        )}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {report.target_id}
                    </span>
                </div>
            </td>

            {/* Motivo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                    {report.reason_label || report.reason}
                </span>
            </td>

            {/* Quem Denunciou */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {report.reporter_name || "Usuário"}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {report.reporter_user_id}
                    </span>
                </div>
            </td>

            {/* Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(report.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(report.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* Tipo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    <Badge variant={targetTypeBadgeVariant[report.target_type] || "gray"}>
                        {targetTypeLabels[report.target_type] || report.target_type}
                    </Badge>
                </div>
            </td>

            {/* Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                    </Badge>
                </div>
            </td>

            {/* Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown
                        onView={() => onDetail(report)}
                        onCancel={report.status === "pending" ? () => onDismiss(report) : undefined}
                        cancelLabel="Descartar"
                    >
                        {report.status === "pending" && (
                            <>
                                <DropdownItem onClick={() => onResolve(report)} className="text-brand-red">
                                    <CheckCircleIcon size={16} /> Validar Denúncia
                                </DropdownItem>
                                <DropdownItem onClick={() => onSpam(report)} className="text-purple-600">
                                    <AlertTriangleIcon size={16} /> Marcar como Spam
                                </DropdownItem>
                            </>
                        )}
                        {report.status === "validated" && (
                            <DropdownItem onClick={() => onRevert(report)}>
                                <ReturnIcon size={16} /> Reverter Validação
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.report === next.report &&
    prev.isPending === next.isPending
)

ReportListRow.displayName = "ReportListRow"

export default ReportListRow
