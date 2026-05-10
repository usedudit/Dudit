"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ClockIcon, UserIcon, ShieldIcon } from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"
import type { AuditLogRow } from "@/lib/admin/types"

export const ACTION_TYPE_LABELS: Record<string, string> = {
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

export const TARGET_TYPE_LABELS: Record<string, string> = {
    user: "Usuário",
    partner: "Parceiro",
    product: "Produto",
    service: "Serviço",
    subscription: "Assinatura",
    system: "Sistema",
}

export const getActionBadge = (action: string) => {
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
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background text-sm"
        >
            {/* Data/Hora */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex items-center gap-2 font-medium text-brand-dark dark:text-dark-heading">
                    <ClockIcon size={14} className="text-brand-inactive-text shrink-0" />
                    {formatDateTime(log.created_at)}
                </div>
            </td>

            {/* Ação */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    {getActionBadge(log.action_type)}
                </div>
            </td>

            {/* Alvo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex items-center justify-center gap-2">
                    <span className="font-bold text-brand-dark dark:text-dark-heading uppercase text-[11px] tracking-wider opacity-60">
                        {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                    </span>
                    {log.target_id && (
                        <span className="text-brand-inactive-text dark:text-dark-body font-mono text-[10px] bg-brand-gray/50 dark:bg-dark-border/30 px-1.5 py-0.5 rounded">
                            {log.target_id.slice(0, 8)}
                        </span>
                    )}
                </div>
            </td>

            {/* Detalhes */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-full italic">
                    {log.metadata?.reason
                        ? String(log.metadata.reason)
                        : log.metadata?.action
                            ? String(log.metadata.action)
                            : "-"}
                </div>
            </td>

            {/* IP Address */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[10px] font-mono text-brand-inactive-text dark:text-dark-body opacity-50">
                    {log.ip_address}
                </span>
            </td>
        </motion.tr>
    )
})

AuditLogListRow.displayName = "AuditLogListRow"

export default AuditLogListRow
