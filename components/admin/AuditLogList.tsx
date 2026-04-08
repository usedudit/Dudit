"use client"

import React, { useState, useCallback } from "react"
import {
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    Shield,
    AlertCircle,
    Clock,
} from "lucide-react"
import Button from "@/components/reusable/Button"
import { Badge } from "@/components/reusable/Badge"
import { getAuditLogs } from "@/app/actions/admin/audit-logs"
import type { AuditLogRow, CursorPaginatedResult } from "@/lib/admin/types"
import { formatDateTime } from "@/lib/utils"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
}

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
    if (action.includes("ban") || action.includes("delete") || action.includes("cancel") || action.includes("disable")) {
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

const AuditLogList = ({ initialData }: AuditLogListProps) => {
    const [data, setData] = useState(initialData)
    const [isLoading, setIsLoading] = useState(false)
    const [actionFilter, setActionFilter] = useState("all")
    const [targetFilter, setTargetFilter] = useState("all")

    const fetchLogs = useCallback(
        async (cursor?: string | null) => {
            setIsLoading(true)
            try {
                const result = await getAuditLogs(cursor, 20, {
                    actionType: actionFilter,
                    targetType: targetFilter,
                })
                setData(result)
            } catch (error) {
                console.error("Failed to fetch audit logs:", error)
            } finally {
                setIsLoading(false)
            }
        },
        [actionFilter, targetFilter]
    )

    const handleFilterChange = () => {
        fetchLogs(null)
    }

    return (
        <div className="p-6 md:p-8 max-w-[1700px] mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-1">
                    Audit Logs
                </h1>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                    Registro imutável de todas as ações administrativas.
                </p>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-gray-800 text-brand-dark dark:text-dark-heading text-sm outline-none"
                    >
                        <option value="all">Todas as Ações</option>
                        <option value="moderation.approve">Aprovações</option>
                        <option value="moderation.reject">Rejeições</option>
                        <option value="user.ban">Banimentos</option>
                        <option value="partner.suspend">Suspensões</option>
                        <option value="subscription.cancel">Cancelamentos</option>
                    </select>
                    <select
                        value={targetFilter}
                        onChange={(e) => setTargetFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-gray-800 text-brand-dark dark:text-dark-heading text-sm outline-none"
                    >
                        <option value="all">Todos os Alvos</option>
                        <option value="user">Usuário</option>
                        <option value="partner">Parceiro</option>
                        <option value="product">Produto</option>
                        <option value="service">Serviço</option>
                        <option value="system">Sistema</option>
                    </select>
                    <Button variant="outline" className="gap-2 px-3" onClick={handleFilterChange}>
                        <Filter size={16} /> Filtrar
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                        <thead>
                            <tr className="bg-brand-slate dark:bg-dark-surface">
                                <th className="py-2 px-4 pl-6 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    Data/Hora
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    Ação
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    Alvo
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    Detalhes
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    IP
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-brand-inactive-text dark:text-dark-body">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : data.data.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-brand-inactive-text dark:text-dark-body">
                                        <div className="flex flex-col items-center gap-2">
                                            <Shield size={32} className="text-brand-inactive-text/50" />
                                            <span>Nenhum log encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                data.data.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-dark-border/50 transition-colors">
                                        <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border">
                                            <div className="flex items-center gap-2 text-[13px] text-brand-dark dark:text-dark-heading">
                                                <Clock size={14} className="text-brand-inactive-text" />
                                                {formatDateTime(log.created_at)}
                                            </div>
                                        </td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                            {getActionBadge(log.action_type)}
                                        </td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                            <div className="text-[13px]">
                                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                </span>
                                                {log.target_id && (
                                                    <span className="text-brand-inactive-text dark:text-dark-body ml-1 font-mono text-[11px]">
                                                        {log.target_id.slice(0, 8)}...
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                            <div className="text-[12px] text-brand-inactive-text dark:text-dark-body max-w-[200px] truncate">
                                                {log.metadata?.reason
                                                    ? String(log.metadata.reason)
                                                    : log.metadata?.action
                                                        ? String(log.metadata.action)
                                                        : "—"}
                                            </div>
                                        </td>
                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                            <span className="text-[12px] font-mono text-brand-inactive-text dark:text-dark-body">
                                                {log.ip_address}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex justify-center">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        className="w-8 h-8 flex items-center justify-center p-0 disabled:opacity-50"
                        disabled={!data.prevCursor || isLoading}
                        onClick={() => fetchLogs(null)}
                    >
                        <ChevronLeft size={18} />
                    </Button>
                    <span className="text-sm text-brand-inactive-text dark:text-dark-body px-3">
                        {data.data.length} registros
                    </span>
                    <Button
                        variant="ghost"
                        className="w-8 h-8 flex items-center justify-center p-0 disabled:opacity-50"
                        disabled={!data.hasMore || isLoading}
                        onClick={() => fetchLogs(data.nextCursor)}
                    >
                        <ChevronRight size={18} />
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AuditLogList
