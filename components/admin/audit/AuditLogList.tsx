"use client"

import React, { useState, useMemo, useRef } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { TerminalIcon, DatabaseIcon, GlobeIcon, MonitorIcon, XIcon, ClockIcon, UserIcon } from "@/lib/icons"
import { Button, IconPlaceholder, Badge, ThreeDotsLoader } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import Portal from "@/components/Portal"

import { getAuditLogs } from "@/app/actions/admin/audit-logs"
import type { AuditLogRow, CursorPaginatedResult } from "@/lib/admin/types"
import AuditLogListRow, { getActionBadge, TARGET_TYPE_LABELS, ACTION_TYPE_LABELS } from "./AuditLogListRow"
import AuditLogPageControls from "./AuditLogPageControls"

import { formatDateTime } from "@/lib/utils"

import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

interface AuditLogListProps {
    initialData: CursorPaginatedResult<AuditLogRow>
}

interface FilterState {
    action: string[]
}

const INITIAL_FILTERS: FilterState = {
    action: [],
}

const AuditLogList = ({ initialData }: AuditLogListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const observerTarget = useRef<HTMLDivElement>(null)

    // ─── Local State ──────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<string>("all")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [detailLog, setDetailLog] = useState<AuditLogRow | null>(null)

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<AuditLogRow, any, string>({
        entityType: 'audit-logs',
        partnerId: 'admin',
        queryKey: ['admin', 'audit-logs', activeTab, debouncedSearch],
        initialItems: (activeTab === "all" && debouncedSearch === "") ? initialData.data : [],
        initialNextCursor: (activeTab === "all" && debouncedSearch === "") ? initialData.nextCursor : null,
        initialHasMore: (activeTab === "all" && debouncedSearch === "") ? initialData.hasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAuditLogs(cursor, 40, {
                actionType: "all",
                targetType: activeTab as any,
                search: debouncedSearch
            })
            return { items: res.data, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (l) => l.id,
        getDetailFn: async () => null,
    })

    const {
        items: rawLogs, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading,
    } = entityPage

    const itemsPerPage = 8

    const filterSections: FilterSectionConfig[] = [
        {
            id: "action",
            title: "Ação",
            type: "checkbox-list",
            options: Object.values(ACTION_TYPE_LABELS)
        },
    ]

    const filteredLogs = useMemo(() => {
        if (!rawLogs) return []
        return rawLogs.filter(log => {
            // Action Filter
            const actionLabel = ACTION_TYPE_LABELS[log.action_type] || log.action_type
            const filterMatch = filters.action.length === 0 || filters.action.includes(actionLabel)
            return filterMatch
        })
    }, [rawLogs, filters])

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)
    const paginated = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const hasActiveFilters = filters.action.length > 0 || search.length > 0
    const hasLogs = (rawLogs?.length || 0) > 0

    // Reset page when search or tab changes
    useMemo(() => {
        setPage(1)
    }, [debouncedSearch, activeTab])

    return (
        <>
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
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

                    <AuditLogPageControls
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        search={search}
                        onSearchChange={setSearch}
                        onOpenFilter={() => setModals({ filter: true })}
                        hasActiveFilters={hasActiveFilters}
                        hasData={hasLogs}
                    />

                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                        <AnimatePresence mode="wait">
                            {isListLoading ? (
                                <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                    <ThreeDotsLoader />
                                </FadeIn>
                            ) : !hasLogs && !isListLoading ? (
                                <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Nenhum log"
                                        title="Nenhum log no sistema"
                                        subtitle="Ainda não existem logs de auditoria."
                                    />
                                </FadeIn>
                            ) : paginated.length === 0 && !isListLoading ? (
                                <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Nenhum resultado"
                                        title="Nenhum log encontrado"
                                        subtitle="Tente ajustar seus filtros ou termos de busca."
                                        itemButton={{
                                            text: "Limpar filtros",
                                            action: () => {
                                                setSearch("")
                                                setActiveTab("all")
                                                setFilters(INITIAL_FILTERS)
                                            },
                                            variant: "outline"
                                        }}
                                    />
                                </FadeIn>
                            ) : (
                                <FadeIn key="list" className="w-full">
                                    {isMobile ? (
                                        <div className="flex flex-col w-full border-b border-brand-border dark:border-dark-border">
                                            {paginated.map((log) => (
                                                <div
                                                    key={log.id}
                                                    className="py-4 border-b border-brand-border dark:border-dark-border last:border-0 flex flex-col gap-2 cursor-pointer"
                                                    onClick={() => setDetailLog(log)}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2 text-xs font-medium text-brand-dark dark:text-dark-heading">
                                                            <ClockIcon size={14} className="text-brand-inactive-text shrink-0" />
                                                            {formatDateTime(log.created_at)}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {getActionBadge(log.action_type)}
                                                        <Badge variant="gray">
                                                            {log.target_name || TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        {log.metadata?.reason ? String(log.metadata.reason) : log.metadata?.action ? String(log.metadata.action) : "-"}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="w-full overflow-hidden rounded-xl relative">
                                            <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                    <thead>
                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                            <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors">Usuário</th>
                                                            <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-left">Alvo</th>
                                                            <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-left">Motivo / Detalhes</th>
                                                            <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Data / Hora</th>
                                                            <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Tipo</th>
                                                            <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors rounded-r-lg text-center">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="relative">
                                                        {paginated.map((log) => (
                                                            <AuditLogListRow
                                                                key={log.id}
                                                                log={log}
                                                                onView={setDetailLog}
                                                            />
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </FadeIn>
                            )}
                        </AnimatePresence>
                    </div>

                    {hasLogs && (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={(p) => {
                                setPage(p)
                                if (p >= totalPages - 1 && hasNextPage && !isFetchingNextPage) {
                                    void fetchNextPage()
                                }
                            }}
                        />
                    )}
                </div>
            </FadeIn>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <AuditLogDetailsSheet
                log={detailLog}
                isOpen={!!detailLog}
                onClose={() => setDetailLog(null)}
            />
        </>
    )
}

export default AuditLogList

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface AuditLogDetailsSheetProps {
    log: AuditLogRow | null
    isOpen: boolean
    onClose: () => void
}

function AuditLogDetailsSheet({ log, isOpen, onClose }: AuditLogDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    if (!log) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold dark:text-dark-heading">Detalhes do Log</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Status/Type Header */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        {getActionBadge(log.action_type)}
                        <Badge variant="gray">{TARGET_TYPE_LABELS[log.target_type] || log.target_type}</Badge>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {ACTION_TYPE_LABELS[log.action_type] || log.action_type}
                        </h3>
                        <p className="text-xs text-brand-inactive-text mt-1 opacity-70 tracking-wider font-bold">LOG ID: {log.id}</p>
                    </div>
                </div>

                {/* Primary Info Cards */}
                <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                        <div className="flex items-start gap-3">
                            <ClockIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                            <div>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Data e Hora</span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDateTime(log.created_at)}</span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                            <UserIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                            <div>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Executor</span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{log.admin_name || log.admin_email || "N/A"}</span>
                                <span className="text-[10px] text-brand-inactive-text block opacity-70">UID: {log.admin_user_id}</span>
                            </div>
                        </div>
                        {log.target_id && (
                            <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <DatabaseIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                                <div>
                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Alvo da Ação</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1 block">
                                        {log.target_name || TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                    </span>
                                    <span className="text-[11px] text-brand-inactive-text bg-white dark:bg-dark-background px-2 py-0.5 rounded border border-brand-border/50 font-mono">
                                        ID: {log.target_id}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Metadata JSON */}
                <div className="space-y-3">
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body flex items-center gap-2">
                        <TerminalIcon size={16} /> Parâmetros e Contexto
                    </h4>
                    <div className="bg-brand-gray dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl p-4 overflow-x-auto">
                        <pre className="text-[12px] text-brand-dark dark:text-dark-heading font-mono leading-relaxed">
                            {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                    </div>
                </div>

                {/* Connection Details */}
                <div className="space-y-3">
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Origem do Acesso</h4>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl border border-brand-border/30 dark:border-dark-border/30">
                            <div className="flex items-center gap-2">
                                <GlobeIcon size={14} className="text-brand-inactive-text" />
                                <span className="text-xs font-medium text-brand-inactive-text">Endereço IP</span>
                            </div>
                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading font-mono">{log.ip_address}</span>
                        </div>
                        <div className="flex items-start gap-2 p-3 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl border border-brand-border/30 dark:border-dark-border/30">
                            <MonitorIcon size={14} className="text-brand-inactive-text mt-0.5 shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-brand-inactive-text">User Agent</span>
                                <span className="text-[11px] text-brand-dark dark:text-dark-heading break-words opacity-80 mt-1">{log.user_agent}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 md:w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
