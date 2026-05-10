"use client"

import React, { useState, useCallback } from "react"
import {
    ChevronLeft,
    ChevronRight,
} from "lucide-react"
import { Button, Pagination, IconPlaceholder } from "@/components/reusable"
import { getAuditLogs } from "@/app/actions/admin/audit-logs"
import type { AuditLogRow, CursorPaginatedResult } from "@/lib/admin/types"
import AuditLogListRow, { getActionBadge, TARGET_TYPE_LABELS } from "./AuditLogListRow"
import AuditLogPageControls from "./AuditLogPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { ClockIcon } from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
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
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                
                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Audit Logs
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Registro imutável de todas as ações administrativas realizadas no sistema.
                        </p>
                    </div>
                </div>

                {/* Page Controls (Standardized) */}
                <AuditLogPageControls 
                    actionFilter={actionFilter}
                    setActionFilter={setActionFilter}
                    targetFilter={targetFilter}
                    setTargetFilter={setTargetFilter}
                    onApplyFilters={handleFilterChange}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {data.data.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum log"
                                    title="Nenhum log encontrado"
                                    subtitle="Não há registros que correspondam aos filtros selecionados."
                                    itemButton={{
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setActionFilter("all")
                                            setTargetFilter("all")
                                            setTimeout(handleFilterChange, 0)
                                        },
                                        variant: "outline"
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {data.data.map((log) => (
                                        <div
                                            key={log.id}
                                            className="py-4 flex flex-col gap-2"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-xs font-medium text-brand-dark dark:text-dark-heading">
                                                    <ClockIcon size={14} className="text-brand-inactive-text shrink-0" />
                                                    {formatDateTime(log.created_at)}
                                                </div>
                                                <span className="text-[10px] font-mono text-brand-inactive-text opacity-50">
                                                    {log.ip_address}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {getActionBadge(log.action_type)}
                                                <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider opacity-60">
                                                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                </span>
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body italic">
                                                {log.metadata?.reason ? String(log.metadata.reason) : log.metadata?.action ? String(log.metadata.action) : "-"}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body uppercase tracking-wider">Data/Hora</th>
                                                    <th className="py-3 px-2 w-48 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider text-center">Ação</th>
                                                    <th className="py-3 px-2 w-48 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider text-center">Alvo</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 uppercase tracking-wider text-left">Detalhes</th>
                                                    <th className="py-3 px-2 w-32 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body uppercase tracking-wider text-center">IP</th>
                                                </tr>
                                            </thead>
                                            <tbody className="relative">
                                                {isLoading && (
                                                    <tr className="absolute inset-0 bg-white/50 dark:bg-dark-background/50 backdrop-blur-[1px] z-10">
                                                        <td colSpan={5} className="h-full">
                                                            <div className="flex items-center justify-center h-full">
                                                                <div className="w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin"></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {data.data.map((log) => (
                                                    <AuditLogListRow key={log.id} log={log} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination (Cursor Based) */}
                                <div className="mt-6 flex justify-center pb-8">
                                    <div className="flex items-center gap-4 bg-brand-gray/30 dark:bg-dark-border/20 px-4 py-2 rounded-full border border-brand-border/50 dark:border-dark-border/50">
                                        <Button
                                            variant="ghost"
                                            className="w-10 h-10 flex items-center justify-center p-0 disabled:opacity-30 rounded-full hover:bg-white dark:hover:bg-dark-surface"
                                            disabled={!data.prevCursor || isLoading}
                                            onClick={() => fetchLogs(null)}
                                        >
                                            <ChevronLeft size={20} />
                                        </Button>
                                        
                                        <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-tighter">
                                            {isLoading ? "..." : `${data.data.length} Registros`}
                                        </span>
                                        
                                        <Button
                                            variant="ghost"
                                            className="w-10 h-10 flex items-center justify-center p-0 disabled:opacity-30 rounded-full hover:bg-white dark:hover:bg-dark-surface"
                                            disabled={!data.hasMore || isLoading}
                                            onClick={() => fetchLogs(data.nextCursor)}
                                        >
                                            <ChevronRight size={20} />
                                        </Button>
                                    </div>
                                </div>
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </FadeIn>
    )
}

export default AuditLogList
