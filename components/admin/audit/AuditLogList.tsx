"use client"

import React, { useState, useMemo, useCallback } from "react"
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
import { useEntityPage } from "@/hooks/use-entity-page"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { DatabaseIcon } from "@/lib/icons"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
    initialStats?: AuditLogStats
}

const ITEMS_PER_PAGE = 8

type SortKey = "admin" | "action" | "target" | "date"
type SortDirection = "asc" | "desc"

type AuditFilters = AuditFilterState & { datePeriod: DatePeriodFilterValue }

const INITIAL_FILTERS: AuditFilters = {
    ...INITIAL_AUDIT_FILTERS,
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

export default function AuditLogList({ initialData, initialStats }: AuditLogListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    // Tab State
    const [targetTab, setTargetTab] = useState<string>("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [stats, setStats] = useState<AuditLogStats | undefined>(initialStats)

    // Local search state - DECLARED BEFORE useEntityPage
    const { search, setSearch, debouncedSearch } = useDebouncedSearch()

    // Filters - DECLARED BEFORE useEntityPage
    const [filters, setFilters] = useState<AuditFilters>(INITIAL_FILTERS)

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    const [page, setPage] = useState(1)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    const isDefaultView = targetTab === "all" && !isDatePeriodFilterActive(filters.datePeriod)

    const entityPage = useEntityPage<any, any, any>({
        entityType: "audit_logs",
        partnerId: "admin",
        queryKey: ["admin-audit-logs", targetTab, debouncedSearch, filters.datePeriod],
        initialItems: initialData?.data || [],
        initialNextCursor: initialData?.nextCursor || null,
        initialHasMore: initialData?.hasMore || false,
        skipInitialData: !isDefaultView,
        search: debouncedSearch,
        setSearch,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAuditLogs(cursor, 100, {
                targetType: targetTab === "all" ? undefined : targetTab,
                search: debouncedSearch || undefined,
                startDate: filters.datePeriod.from || undefined,
                endDate: filters.datePeriod.to || undefined,
            })
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((l: any) => String(l?.id || ""), []),
        getDetailFn: async () => null,
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: logs,
        afterMutation,
    } = entityPage

    const handleMutation = useCallback(() => {
        afterMutation()
        getAuditLogStats().then(setStats).catch(console.error)
    }, [afterMutation])

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const handleClearFilters = useCallback(() => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setTargetTab("all")
        setPage(1)
    }, [setSearch])

    React.useEffect(() => {
        setPage(1)
    }, [targetTab, debouncedSearch, filters.datePeriod])

    // If viewing detail of a specific log (?view=[id])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentLog = logs.find((l: any) => l.id === entityState.entityId)
        if (currentLog) {
            return (
                <AdminAuditDetailView
                    log={currentLog}
                    onBack={closeEntity}
                />
            )
        }
    }

    const actionOptions = Array.from(new Set(logs.map((l: any) => ACTION_TYPE_LABELS[l.action_type] || l.action_type))) as string[]
    const targetTypeOptions = Array.from(new Set(logs.map((l: any) => TARGET_TYPE_LABELS[l.target_type] || l.target_type))) as string[]

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
        {
            id: "datePeriod",
            title: "Período",
            type: "date-period",
        },
    ]

    const hasActiveFilters =
        search !== "" ||
        filters.action.length > 0 ||
        filters.targetType.length > 0 ||
        isDatePeriodFilterActive(filters.datePeriod)

    // In-memory filtering for action and target type (not yet supported server-side)
    const filteredLogs = useMemo(() => {
        let result = logs.filter((log: any) => {
            if (filters.action.length > 0) {
                const actionLabel = ACTION_TYPE_LABELS[log.action_type] || log.action_type
                if (!filters.action.includes(actionLabel)) return false
            }
            if (filters.targetType.length > 0) {
                const targetLabel = TARGET_TYPE_LABELS[log.target_type] || log.target_type
                if (!filters.targetType.includes(targetLabel)) return false
            }
            return true
        })

        if (sortConfig) {
            result = [...result].sort((a: any, b: any) => {
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
    }, [logs, filters.action, filters.targetType, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredLogs.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredLogs, page])

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
                    setFilters={setFilters as any}
                    hasActiveFilters={hasActiveFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-24 lg:pb-6 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredLogs.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    icon={DatabaseIcon}
                                    title="Nenhum log encontrado"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhum evento registrado nesta categoria."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: handleClearFilters,
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((log: any) => (
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
                                        {paginatedItems.map((log: any) => (
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
                                                    {paginatedItems.map((log: any) => (
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
                                            fixedUntil="lg"
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
                setFilters={setFilters as any}
                onClear={() => {
                    setFilters(INITIAL_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />
        </FadeIn>
    )
}
