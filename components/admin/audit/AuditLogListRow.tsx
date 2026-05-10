"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ClockIcon, UserIcon, ShieldIcon } from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"
import type { AuditLogRow } from "@/lib/admin/types"

const ACTION_TYPE_LABELS: Record<string, string> = {
    "admin.login": "Login Admin",
    "admin.logout": "Logout Admin",
    "admin.login_failed": "Login Falhou",
    "admin.step_up": "Step-Up Auth",
    "moderation.approve": "Moderação: Aprovar",
    "moderation.reject": "Moderação: Rejeitar",
    "moderation.reprocess": "Moderação: Reprocessar",
    "user.ban": "Banir Usuário",
    "user.unban": "Desbanir Usuário",
    "partner.suspend": "Suspender Parceiro",
    "partner.unsuspend": "Reativar Parceiro",
    "partner.disable_erp": "Desabilitar ERP",
    "partner.enable_erp": "Habilitar ERP",
    "product.soft_delete": "Deletar Produto",
    "service.soft_delete": "Deletar Serviço",
    "subscription.cancel": "Cancelar Assinatura",
}

const TARGET_TYPE_LABELS: Record<string, string> = {
    user: "Usuário",
    partner: "Parceiro",
    product: "Produto",
    service: "Serviço",
    subscription: "Assinatura",
    system: "Sistema",
}

const getActionBadge = (action: string) => {
    if (action.includes("ban") || action.includes("delete") || action.includes("cancel") || action.includes("disable") || action.includes("reject")) {
        return <Badge variant="red">{ACTION_TYPE_LABELS[action] || action}</Badge>
    }
    if (action.includes("approve") || action.includes("unban") || action.includes("unsuspend") || action.includes("enable")) {
        return <Badge variant="green">{ACTION_TYPE_LABELS[action] || action}</Badge>
    }
    if (action.includes("login") || action.includes("step_up")) {
        return <Badge variant="blue">{ACTION_TYPE_LABELS[action] || action}</Badge>
    }
    return <Badge variant="gray">{ACTION_TYPE_LABELS[action] || action}</Badge>
}

interface AuditLogListRowProps {
    log: AuditLogRow
}

const AuditLogListRow = React.memo(({ log }: AuditLogListRowProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-[180px_160px_140px_1fr_120px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background group text-sm"
        >
            {/* Data/Hora */}
            <div className="flex items-center gap-2 font-medium text-brand-dark dark:text-dark-heading">
                <ClockIcon size={14} className="text-brand-inactive-text shrink-0" />
                {formatDateTime(log.created_at)}
            </div>

            {/* Ação */}
            <div className="flex md:justify-start">
                {getActionBadge(log.action_type)}
            </div>

            {/* Alvo */}
            <div className="flex items-center gap-2">
                <span className="font-bold text-brand-dark dark:text-dark-heading uppercase text-[11px] tracking-wider opacity-60">
                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                </span>
                {log.target_id && (
                    <span className="text-brand-inactive-text dark:text-dark-body font-mono text-[10px] bg-brand-gray/50 dark:bg-dark-border/30 px-1.5 py-0.5 rounded">
                        {log.target_id.slice(0, 8)}
                    </span>
                )}
            </div>

            {/* Detalhes */}
            <div className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-full italic">
                {log.metadata?.reason
                    ? String(log.metadata.reason)
                    : log.metadata?.action
                        ? String(log.metadata.action)
                        : "-"}
            </div>

            {/* IP Address */}
            <div className="flex justify-end md:justify-center">
                <span className="text-[10px] font-mono text-brand-inactive-text dark:text-dark-body opacity-50">
                    {log.ip_address}
                </span>
            </div>
        </motion.div>
    )
})

AuditLogListRow.displayName = "AuditLogListRow"

export default AuditLogListRow
