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
import AuditLogListRow, { ACTION_TYPE_LABELS, TARGET_TYPE_LABELS } from "./AuditLogListRow"
import AuditLogPageControls from "./AuditLogPageControls"
import { AdminAuditDetailView } from "./AdminAuditDetailView"
import { useEntityState } from "@/hooks/use-entity-state"
import { formatDate } from "@/lib/utils"
import { DatabaseIcon } from "@/lib/icons"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
    initialStats?: AuditLogStats
}

interface FilterState {
    action: string[]
}

const INITIAL_FILTERS: FilterState = {
    action: [],
}

const ITEMS_PER_PAGE = 8

type SortKey = "admin" | "action" | "target" | "date"
type SortDirection = "asc" | "desc"

export default function AuditLogList({ initialData, initialStats }: AuditLogListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    // Tab State
    const [targetTab, setTargetTab] = useState<string>("all")
    const [stats, setStats] = useState<AuditLogStats | undefined>(initialStats)

    // Search and Filters
    const [search, setSearch] = useState("")
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
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
                        aVal = (a.admin_name || a.admin_email || a.admin_user_id || "").toLowerCase()
                        bVal = (b.admin_name || b.admin_email || b.admin_user_id || "").toLowerCase()
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

    // Reset page on tab/search/filter change
    useMemo(() => {
        setPage(1)
    }, [targetTab, search, filters])

    // If viewing detail of a specific log (?view=[id])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentLog = logs.find(l => l.id === entityState.entityId)
        if (currentLog) {
            return (
                <AdminAuditDetailView
                    log={currentLog}
                    onBack={closeEntity}
                />
            )
        }
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "action",
            title: "Tipo de Ação",
            type: "checkbox-list",
            options: Object.values(ACTION_TYPE_LABELS),
        },
    ]

    const hasActiveFilters = search !== "" || filters.action.length > 0

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

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
                {/* Controls (Tabs + Search + Filters) */}
                <AuditLogPageControls
                    activeTab={targetTab}
                    setActiveTab={setTargetTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    hasActiveFilters={hasActiveFilters}
                    hasData={logs.length > 0}
                    stats={stats}
                />

                {/* Content Area */}
                <div>
                    <AnimatePresence mode="wait">
                        {filteredLogs.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    icon={DatabaseIcon}
                                    title="Nenhum log encontrado"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhum evento registrado nesta categoria."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
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

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                <span className="truncate">{log.target_name || log.target_id || "-"}</span>
                                                <span>{formatDate(log.created_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[950px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("admin")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Usuário (Executor) {sortConfig?.key === "admin" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("action")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Ação {sortConfig?.key === "action" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
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
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Data / Hora {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
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

            {/* Filter Drawer */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />
        </FadeIn>
    )
}
