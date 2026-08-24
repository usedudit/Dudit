"use client"

import React, { useState, useMemo, useTransition, useCallback } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
    Button,
    IconPlaceholder,
    Pagination,
} from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { getAuditLogs, getAuditLogStats, type AuditLogStats } from "@/app/actions/admin/audit-logs"
import type { AuditLogRow, CursorPaginatedResult } from "@/lib/admin/types"
import AuditLogListRow, { ACTION_TYPE_LABELS, TARGET_TYPE_LABELS, getActionBadge } from "./AuditLogListRow"
import AuditLogPageControls, { type AuditFilterState, INITIAL_AUDIT_FILTERS } from "./AuditLogPageControls"
import { AdminAuditDetailView } from "./AdminAuditDetailView"
import { useEntityState } from "@/hooks/use-entity-state"
import { DatabaseIcon } from "@/lib/icons"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
    initialStats?: AuditLogStats
}

const ITEMS_PER_PAGE = 8

type SortKey = "admin" | "action" | "target" | "date"
type SortDirection = "asc" | "desc"

export default function AuditLogList({ initialData, initialStats }: AuditLogListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    // Tab State
    const [targetTab, setTargetTab] = useState<string>("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [stats, setStats] = useState<AuditLogStats | undefined>(initialStats)

    // Search and Filters
    const [search, setSearch] = useState("")
    const [filters, setFilters] = useState<AuditFilterState>(INITIAL_AUDIT_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State
    const [logs, setLogs] = useState<AuditLogRow[]>(initialData?.data || [])
    const [page, setPage] = useState(1)
    const [isPending, startTransition] = useTransition()

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshLogs = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getAuditLogs(null, 150),
                    getAuditLogStats(),
                ])
                setLogs(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh audit logs:", err)
            }
        })
    }, [])

    // Instant in-memory filtering (0ms)
    const filteredLogs = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = logs.filter((log) => {
            // Tab filter
            if (targetTab !== "all") {
                if (targetTab === "partner" && log.target_type !== "partner" && log.target_type !== "store") {
                    return false
                } else if (targetTab !== "partner" && log.target_type !== targetTab) {
                    return false
                }
            }

            // Action Filter
            if (filters.action.length > 0) {
                const actionLabel = ACTION_TYPE_LABELS[log.action_type] || log.action_type
                if (!filters.action.includes(actionLabel)) {
                    return false
                }
            }

            // Target Type Filter
            if (filters.targetType.length > 0) {
                const targetLabel = TARGET_TYPE_LABELS[log.target_type] || log.target_type
                if (!filters.targetType.includes(targetLabel)) {
                    return false
                }
            }

            // Search Filter
            if (term) {
                const adminName = String(log.admin_name || "").toLowerCase()
                const adminEmail = String(log.admin_email || "").toLowerCase()
                const adminId = String(log.admin_user_id || "").toLowerCase()
                const targetName = String(log.target_name || "").toLowerCase()
                const targetId = String(log.target_id || "").toLowerCase()
                const actionLabel = String(ACTION_TYPE_LABELS[log.action_type] || log.action_type).toLowerCase()
                const reason = String(log.metadata?.reason || log.metadata?.action || "").toLowerCase()

                if (
                    !adminName.includes(term) &&
                    !adminEmail.includes(term) &&
                    !adminId.includes(term) &&
                    !targetName.includes(term) &&
                    !targetId.includes(term) &&
                    !actionLabel.includes(term) &&
                    !reason.includes(term)
                ) {
                    return false
                }
            }

            return true
        })

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "admin":
                        aVal = (a.admin_name || a.admin_email || "").toLowerCase()
                        bVal = (b.admin_name || b.admin_email || "").toLowerCase()
                        break
                    case "action":
                        aVal = (ACTION_TYPE_LABELS[a.action_type] || a.action_type).toLowerCase()
                        bVal = (ACTION_TYPE_LABELS[b.action_type] || b.action_type).toLowerCase()
                        break
                    case "target":
                        aVal = (a.target_name || a.target_id || "").toLowerCase()
                        bVal = (b.target_name || b.target_id || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [logs, targetTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredLogs.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredLogs, page])

    // Reset page on filter changes
    useMemo(() => {
        setPage(1)
    }, [targetTab, search, filters])

    // If viewing detail of a specific log (?view=[id])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentLog = logs.find((l) => l.id === entityState.entityId)
        if (currentLog) {
            return (
                <AdminAuditDetailView
                    log={currentLog}
                    onBack={closeEntity}
                />
            )
        }
    }

    const actionOptions = Array.from(new Set(logs.map((l) => ACTION_TYPE_LABELS[l.action_type] || l.action_type)))
    const targetTypeOptions = Array.from(new Set(logs.map((l) => TARGET_TYPE_LABELS[l.target_type] || l.target_type)))

    const filterSections: FilterSectionConfig[] = [
        {
            id: "action",
            title: "Tipo de Ação",
            type: "checkbox-list",
            options: actionOptions.slice(0, 15),
        },
        {
            id: "targetType",
            title: "Tipo de Alvo",
            type: "checkbox-list",
            options: targetTypeOptions,
        },
    ]

    const hasActiveFilters = search !== "" || filters.action.length > 0 || filters.targetType.length > 0

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Logs de Auditoria
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Rastreie todas as ações administrativas, alterações e eventos críticos da plataforma.
                        </p>
                    </div>
                </div>

                {/* Controls (Tabs + Search + Filters) */}
                <AuditLogPageControls
                    activeTab={targetTab}
                    setActiveTab={setTargetTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-6 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredLogs.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    icon={DatabaseIcon}
                                    title="Nenhum log encontrado"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhum evento registrado nesta categoria."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_AUDIT_FILTERS)
                                            setTargetTab("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((log) => (
                                        <div
                                            key={log.id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => openEntity("view", log.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        {ACTION_TYPE_LABELS[log.action_type] || log.action_type}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        Por: {log.admin_name || log.admin_email || "Administrador"}
                                                    </span>
                                                </div>
                                                <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center text-xs text-brand-inactive-text pt-1">
                                                <span>Alvo: {log.target_name || log.target_id || "Sistema"}</span>
                                                <span>{log.created_at ? new Date(log.created_at).toLocaleDateString("pt-BR") : ""}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View */}
                                {viewMode === "grid" ? (
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((log) => (
                                            <div
                                                key={log.id}
                                                onClick={() => openEntity("view", log.id)}
                                                className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer flex flex-col justify-between gap-4"
                                            >
                                                <div className="flex flex-col gap-2 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {log.admin_name || log.admin_email || "Administrador"}
                                                        </span>
                                                        {getActionBadge(log.action_type)}
                                                    </div>
                                                    <p className="text-xs text-brand-inactive-text truncate">
                                                        Alvo: <strong className="text-brand-dark dark:text-dark-heading">{log.target_name || log.target_id || "Sistema"}</strong>
                                                    </p>
                                                </div>

                                                <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                    <div className="flex justify-between items-center">
                                                        <span>Tipo</span>
                                                        <span>{TARGET_TYPE_LABELS[log.target_type] || log.target_type}</span>
                                                    </div>
                                                    <p className="line-clamp-2 min-h-[2rem]">
                                                        {(log.metadata as any)?.reason || (log.metadata as any)?.action || "Sem detalhes adicionais"}
                                                    </p>
                                                </div>

                                                <div className="flex justify-between items-center text-xs text-brand-inactive-text">
                                                    <span>{log.created_at ? new Date(log.created_at).toLocaleDateString("pt-BR") : ""}</span>
                                                    <span>{log.created_at ? new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th
                                                            onClick={() => handleSort("admin")}
                                                            className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Administrador {sortConfig?.key === "admin" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("action")}
                                                            className="py-3 px-2 w-56 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Ação Realizada {sortConfig?.key === "action" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("target")}
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Alvo {sortConfig?.key === "target" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            Motivo / Detalhes
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("date")}
                                                            className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Data/Hora {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 pr-6 rounded-r-lg w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((log) => (
                                                        <AuditLogListRow
                                                            key={log.id}
                                                            log={log}
                                                            onView={() => openEntity("view", log.id)}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Filter Drawer / Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_AUDIT_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />
        </FadeIn>
    )
}
