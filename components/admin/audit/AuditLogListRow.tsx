"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import type { AuditLogRow } from "@/lib/admin/types"

export const ACTION_TYPE_LABELS: Record<string, string> = {
    "admin.login": "Login Admin",
    "admin.logout": "Logout Admin",
    "admin.login_failed": "Login Falhou",
    "admin.step_up": "Autenticação Step-Up",
    "moderation.approve": "Moderação: Aprovado",
    "moderation.reject": "Moderação: Rejeitado",
    "moderation.reprocess": "Moderação: Reprocessado",
    "moderation.edit_field": "Moderação: Edição de Campo",
    "moderation.remove_image": "Moderação: Imagem Removida",
    "moderation.hide_review": "Moderação: Ocultar Avaliação",
    "moderation.edit_review": "Moderação: Editar Avaliação",
    "moderation.risk_score": "Moderação: Ajuste de Risco",
    "user.ban": "Banimento de Usuário",
    "user.unban": "Desbanimento de Usuário",
    "partner.suspend": "Suspensão de Parceiro",
    "partner.unsuspend": "Reativação de Parceiro",
    "partner.disable_erp": "Desabilitação de ERP",
    "partner.enable_erp": "Habilitação de ERP",
    "partner.suspend_store": "Suspensão de Loja",
    "partner.unsuspend_store": "Reativação de Loja",
    "product.soft_delete": "Exclusão de Produto",
    "service.soft_delete": "Exclusão de Serviço",
    "recurring_plan.delete": "Exclusão de Plano",
    "review.delete": "Exclusão de Avaliação",
    "report.validate": "Validação de Denúncia",
    "report.dismiss": "Descarte de Denúncia",
    "report.spam": "Denúncia Marcada Spam",
    "report.revert": "Reversão de Denúncia",
    "subscription.cancel": "Cancelamento de Assinatura",
    "advertising.create": "Criação de Anúncio",
    "advertising.update": "Atualização de Anúncio",
    "advertising.delete": "Exclusão de Anúncio",
    "advertising.status_change": "Status de Anúncio",
    "notification.announcement_send": "Envio de Comunicado",
    "marketplace.synonym_change": "Sinônimos de Busca",
    "delivery_driver.invite_create": "Convite de Entregador",
    "delivery_driver.update": "Atualização de Entregador",
    "delivery_driver.deactivate": "Desativação de Entregador",
    "delivery_driver.activate": "Ativação de Entregador",
}

export const TARGET_TYPE_LABELS: Record<string, string> = {
    user: "Usuário",
    partner: "Parceiro",
    store: "Loja",
    product: "Produto",
    service: "Serviço",
    subscription: "Assinatura",
    recurring_plan: "Plano Recorrente",
    review: "Avaliação",
    return_request: "Devolução",
    order: "Pedido",
    advertisement: "Anúncio",
    delivery_driver: "Entregador",
    system: "Sistema",
}

export const getActionBadge = (action: string) => {
    const label = ACTION_TYPE_LABELS[action] || action.replace(/_/g, " ")
    if (action.includes("ban") || action.includes("delete") || action.includes("cancel") || action.includes("disable") || action.includes("reject") || action.includes("suspend") || action.includes("deactivate")) {
        return <Badge variant="red">{label}</Badge>
    }
    if (action.includes("approve") || action.includes("unban") || action.includes("unsuspend") || action.includes("enable") || action.includes("activate") || action.includes("validate")) {
        return <Badge variant="green">{label}</Badge>
    }
    if (action.includes("login") || action.includes("step_up") || action.includes("invite")) {
        return <Badge variant="blue">{label}</Badge>
    }
    if (action.includes("revert") || action.includes("dismiss")) {
        return <Badge variant="orange">{label}</Badge>
    }
    return <Badge variant="gray">{label}</Badge>
}

interface AuditLogListRowProps {
    log: AuditLogRow
    onView: (log: AuditLogRow) => void
}

const AuditLogListRow = React.memo(({ log, onView }: AuditLogListRowProps) => {
    const metadata = log.metadata || {}
    const reason = (metadata as any).reason || (metadata as any).action || (metadata as any).resolution_reason

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background text-sm cursor-pointer"
            onClick={() => onView(log)}
        >
            {/* Usuário (Executor) */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        {log.admin_name || log.admin_email || "Administrador"}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {log.admin_user_id || "Sistema"}
                    </span>
                </div>
            </td>

            {/* Ação */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    {getActionBadge(log.action_type)}
                </div>
            </td>

            {/* Alvo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {log.target_name || TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {TARGET_TYPE_LABELS[log.target_type] || log.target_type}{log.target_id ? ` • ${log.target_id.slice(0, 8)}` : ""}
                    </span>
                </div>
            </td>

            {/* Motivo / Detalhes */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[280px]">
                    {reason ? String(reason) : "-"}
                </p>
            </td>

            {/* Data / Hora */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(log.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs font-medium action-btn"
                    onClick={(e) => {
                        e.stopPropagation()
                        onView(log)
                    }}
                >
                    Ver Detalhes
                </Button>
            </td>
        </motion.tr>
    )
})

AuditLogListRow.displayName = "AuditLogListRow"

export default AuditLogListRow
