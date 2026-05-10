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
    onView: (log: AuditLogRow) => void
}

const AuditLogListRow = React.memo(({ log, onView }: AuditLogListRowProps) => {
    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background text-sm cursor-pointer"
            onClick={() => onView(log)}
        >
            {/* Usuário (Executor) */}
            <td className="py-4 px-2 pl-6 border-b border-brand-border dark:border-dark-border">
                <div className="flex flex-col">
                    <span className="font-bold text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                        {log.admin_name || log.admin_email || "Desconhecido"}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {log.admin_user_id}
                    </span>
                </div>
            </td>

            {/* Alvo */}
            <td className="py-4 px-2 border-b border-brand-border dark:border-dark-border">
                <div className="flex flex-col items-center">
                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body opacity-80">
                        {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                    </span>
                    <span className="text-[11px] font-mono text-brand-inactive-text opacity-50">
                        {log.target_id || "Sem ID"}
                    </span>
                </div>
            </td>

            {/* Detalhes (Ação + Badge) */}
            <td className="py-4 px-2 border-b border-brand-border dark:border-dark-border">
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-start">
                        {getActionBadge(log.action_type)}
                    </div>
                    <p className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate max-w-[250px] italic">
                        {log.metadata?.reason
                            ? String(log.metadata.reason)
                            : log.metadata?.action
                                ? String(log.metadata.action)
                                : "-"}
                    </p>
                </div>
            </td>

            {/* Data/Hora */}
            <td className="py-4 px-2 border-b border-brand-border dark:border-dark-border">
                <div className="flex flex-col items-center">
                    <span className="font-bold text-brand-dark dark:text-dark-heading text-[13px]">
                        {new Date(log.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {new Date(log.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </span>
                </div>
            </td>

            {/* IP Address */}
            <td className="py-4 px-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[11px] font-mono text-brand-inactive-text dark:text-dark-body opacity-50">
                    {log.ip_address}
                </span>
            </td>
        </motion.tr>
    )
})

AuditLogListRow.displayName = "AuditLogListRow"

export default AuditLogListRow
