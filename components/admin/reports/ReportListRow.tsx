"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { 
    ClockIcon, 
    InfoIcon, 
    CheckCircleIcon, 
    CancelCircleIcon, 
    AlertTriangleIcon,
    ReturnIcon 
} from "@/lib/icons"
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
        partner: "Parceiro",
        review: "Avaliação",
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-[100px_1fr_100px_100px_130px_180px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background group"
        >
            {/* Tipo */}
            <div className="flex items-center md:justify-start">
                <Badge variant="blue" className="w-fit">
                    {targetTypeLabels[report.target_type] || report.target_type}
                </Badge>
            </div>

            {/* Denúncia Info */}
            <div className="min-w-0 flex flex-col text-left">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                    {report.target_name}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                    Motivo: {report.reason_label || report.reason}
                </span>
                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body/60">
                    Por: {report.reporter_name}
                </span>
            </div>

            {/* Severidade */}
            <div className="flex md:justify-center">
                {report.severity === "high" ? (
                    <Badge variant="red">Alto</Badge>
                ) : report.severity === "normal" ? (
                    <Badge variant="orange">Médio</Badge>
                ) : (
                    <Badge variant="gray">Baixo</Badge>
                )}
            </div>

            {/* Status */}
            <div className="flex md:justify-center">
                <Badge variant={statusInfo.variant}>
                    {statusInfo.label}
                </Badge>
            </div>

            {/* Data */}
            <div className="flex items-center md:justify-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                <ClockIcon size={14} className="opacity-70" />
                {new Date(report.created_at).toLocaleDateString("pt-BR")}
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end md:justify-center gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    onClick={() => onDetail(report)}
                    disabled={isPending}
                    className="h-8 w-8 p-0"
                    title="Detalhes"
                >
                    <InfoIcon size={16} className="text-brand-inactive-text" />
                </Button>

                {report.status === "pending" && (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => onResolve(report)}
                            disabled={isPending}
                            className="h-8 w-8 p-0 border-brand-red/20 hover:border-brand-red/40 hover:bg-brand-red/5"
                            title="Validar"
                        >
                            <CheckCircleIcon size={16} className="text-brand-red" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => onDismiss(report)}
                            disabled={isPending}
                            className="h-8 w-8 p-0"
                            title="Descartar"
                        >
                            <CancelCircleIcon size={16} className="text-brand-inactive-text" />
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => onSpam(report)}
                            disabled={isPending}
                            className="h-8 w-8 p-0 hover:bg-purple-50 dark:hover:bg-purple-900/10"
                            title="Marcar como spam"
                        >
                            <AlertTriangleIcon size={16} className="text-purple-600" />
                        </Button>
                    </>
                )}

                {report.status === "validated" && (
                    <Button
                        variant="ghost"
                        onClick={() => onRevert(report)}
                        disabled={isPending}
                        className="h-8 w-8 p-0"
                        title="Reverter validação"
                    >
                        <ReturnIcon size={16} className="text-brand-inactive-text" />
                    </Button>
                )}
            </div>
        </motion.div>
    )
}, (prev, next) => 
    prev.report === next.report && 
    prev.isPending === next.isPending
)

ReportListRow.displayName = "ReportListRow"

export default ReportListRow
