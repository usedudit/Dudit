"use client"

import { useMemo, useState, useTransition, useCallback } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { toast } from "@/hooks/use-notification"
import {
    Button,
    Badge,
    Input,
    Pagination,
    IconPlaceholder,
    DefaultModal,
} from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import type { Report, ReportsStats, ReportStatus } from "@/app/actions/admin/reports"
import {
    getReports,
    getReportsStats,
    resolveReport,
    dismissReport,
    markReportSpam,
    revertReportValidation,
} from "@/app/actions/admin/reports"
import ReportListRow from "./ReportListRow"
import ReportsPageControls from "./ReportsPageControls"
import { AdminReportDetailView } from "./AdminReportDetailView"
import { useEntityState } from "@/hooks/use-entity-state"
import { formatDate } from "@/lib/utils"
import { ShieldIcon } from "@/lib/icons"

interface ReportsListProps {
    initialData: Report[]
    initialStats: ReportsStats
    initialHasMore?: boolean
    initialNextCursor?: string | null
}

interface FilterState {
    targetType: string[]
}

const INITIAL_FILTERS: FilterState = {
    targetType: [],
}

const ITEMS_PER_PAGE = 8

type SortKey = "target" | "reason" | "reporter" | "date" | "type" | "status"
type SortDirection = "asc" | "desc"

export default function ReportsList({
    initialData,
    initialStats,
}: ReportsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    // Filters
    const [statusTab, setStatusTab] = useState<string>("pending")
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [search, setSearch] = useState("")

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State
    const [reports, setReports] = useState<Report[]>(initialData || [])
    const [stats, setStats] = useState<ReportsStats>(initialStats)
    const [page, setPage] = useState(1)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [resolveTarget, setResolveTarget] = useState<Report | null>(null)
    const [dismissTarget, setDismissTarget] = useState<Report | null>(null)
    const [spamTarget, setSpamTarget] = useState<Report | null>(null)
    const [revertTarget, setRevertTarget] = useState<Report | null>(null)
    const [actionReason, setActionReason] = useState("")

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshReports = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getReports(null, 100, { status: "all", targetType: "all" }),
                    getReportsStats(),
                ])
                setReports(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh reports:", err)
            }
        })
    }, [])

    const handleConfirmResolve = () => {
        if (!resolveTarget) return
        startTransition(async () => {
            try {
                const res = await resolveReport(resolveTarget.id, actionReason || "Denúncia procedente")
                if (res.success) {
                    toast.success("Denúncia validada com sucesso!")
                    setResolveTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao validar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmDismiss = () => {
        if (!dismissTarget) return
        startTransition(async () => {
            try {
                const res = await dismissReport(dismissTarget.id, actionReason || "Denúncia improcedente")
                if (res.success) {
                    toast.success("Denúncia descartada!")
                    setDismissTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao descartar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmSpam = () => {
        if (!spamTarget) return
        startTransition(async () => {
            try {
                const res = await markReportSpam(spamTarget.id, actionReason || "Classificada como spam")
                if (res.success) {
                    toast.success("Denúncia marcada como spam!")
                    setSpamTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao marcar como spam")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmRevert = () => {
        if (!revertTarget) return
        startTransition(async () => {
            try {
                const res = await revertReportValidation(revertTarget.id, actionReason || "Reversão administrativa")
                if (res.success) {
                    toast.success("Validação revertida com sucesso!")
                    setRevertTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao reverter validação")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Instant in-memory filtering (0ms)
    const filteredReports = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = reports.filter((r) => {
            // Tab filter
            if (statusTab !== "all" && r.status !== statusTab) return false

            // FilterSheet targetType
            if (filters.targetType.length > 0) {
                const targetLabel = r.target_type === "product" ? "Produto" : r.target_type === "service" ? "Serviço" : r.target_type === "partner" ? "Parceiro" : "Avaliação"
                if (!filters.targetType.includes(targetLabel)) {
                    return false
                }
            }

            // Search filter
            if (term) {
                const tName = String(r.target_name || "").toLowerCase()
                const tId = String(r.target_id || "").toLowerCase()
                const repName = String(r.reporter_name || "").toLowerCase()
                const reason = String(r.reason_label || r.reason || "").toLowerCase()
                if (!tName.includes(term) && !tId.includes(term) && !repName.includes(term) && !reason.includes(term)) {
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
                    case "target":
                        aVal = (a.target_name || a.target_id || "").toLowerCase()
                        bVal = (b.target_name || b.target_id || "").toLowerCase()
                        break
                    case "reason":
                        aVal = (a.reason_label || a.reason || "").toLowerCase()
                        bVal = (b.reason_label || b.reason || "").toLowerCase()
                        break
                    case "reporter":
                        aVal = (a.reporter_name || a.reporter_user_id || "").toLowerCase()
                        bVal = (b.reporter_name || b.reporter_user_id || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "type":
                        aVal = a.target_type || ""
                        bVal = b.target_type || ""
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [reports, statusTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredReports.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredReports, page])

    // Reset page on tab/search/filter change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search, filters])

    // If viewing detail of a specific report (?view=[id])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminReportDetailView
                reportId={entityState.entityId}
                initialReport={reports.find(r => r.id === entityState.entityId)}
                onBack={closeEntity}
                onReportUpdated={refreshReports}
            />
        )
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "targetType",
            title: "Tipo de Alvo",
            type: "checkbox-list",
            options: ["Produto", "Serviço", "Parceiro", "Avaliação"],
        },
    ]

    const hasActiveFilters = search !== "" || filters.targetType.length > 0

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
                {/* Header Controls */}
                <ReportsPageControls
                    activeTab={statusTab}
                    setActiveTab={setStatusTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    hasActiveFilters={hasActiveFilters}
                    hasData={reports.length > 0}
                    stats={stats}
                />

                {/* Content Area */}
                <div>
                    <AnimatePresence mode="wait">
                        {filteredReports.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    icon={ShieldIcon}
                                    title="Nenhuma denúncia encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma denúncia nesta categoria."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
                                            setStatusTab("pending")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((report) => (
                                        <div
                                            key={report.id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => openEntity("view", report.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        {report.target_type === "review" ? `Avaliação #${report.target_id.slice(0, 8)}` : report.target_name || report.target_id}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        Por: {report.reporter_name || "Usuário"}
                                                    </span>
                                                </div>
                                                <Badge variant={report.status === "validated" ? "red" : report.status === "pending" ? "orange" : "gray"}>
                                                    {report.status === "validated" ? "Validada" : report.status === "pending" ? "Pendente" : report.status === "spam" ? "Spam" : "Descartada"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                <span className="truncate">{report.reason_label || report.reason}</span>
                                                <span>{formatDate(report.created_at)}</span>
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
                                                        onClick={() => handleSort("target")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Item Denunciado {sortConfig?.key === "target" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("reason")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Motivo {sortConfig?.key === "reason" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("reporter")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Denunciante {sortConfig?.key === "reporter" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("type")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Tipo {sortConfig?.key === "type" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((report) => (
                                                    <ReportListRow
                                                        key={report.id}
                                                        report={report}
                                                        isPending={isPending}
                                                        onDetail={() => openEntity("view", report.id)}
                                                        onResolve={() => setResolveTarget(report)}
                                                        onDismiss={() => setDismissTarget(report)}
                                                        onSpam={() => setSpamTarget(report)}
                                                        onRevert={() => setRevertTarget(report)}
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

            {/* Modal: Validar */}
            <DefaultModal
                isOpen={!!resolveTarget}
                onClose={() => {
                    setResolveTarget(null)
                    setActionReason("")
                }}
                title="Validar Denúncia"
                description={`Tem certeza que deseja validar a denúncia contra "${resolveTarget?.target_name || resolveTarget?.target_id}"? Isso atribuirá +5 pontos de risco.`}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setResolveTarget(null); setActionReason(""); }}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleConfirmResolve} disabled={isPending}>Validar Denúncia</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Justificativa da Decisão
                    </label>
                    <Input
                        placeholder="Informe a motivação para validação..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Descartar */}
            <DefaultModal
                isOpen={!!dismissTarget}
                onClose={() => {
                    setDismissTarget(null)
                    setActionReason("")
                }}
                title="Descartar Denúncia"
                description={`Deseja descartar a denúncia de "${dismissTarget?.reporter_name}"?`}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setDismissTarget(null); setActionReason(""); }}>Cancelar</Button>
                        <Button variant="default" onClick={handleConfirmDismiss} disabled={isPending}>Descartar</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Motivo do Descarte
                    </label>
                    <Input
                        placeholder="Informe o motivo..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Spam */}
            <DefaultModal
                isOpen={!!spamTarget}
                onClose={() => {
                    setSpamTarget(null)
                    setActionReason("")
                }}
                title="Marcar como Spam"
                description="Classificar esta denúncia como spam?"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setSpamTarget(null); setActionReason(""); }}>Cancelar</Button>
                        <Button variant="default" onClick={handleConfirmSpam} disabled={isPending}>Marcar como Spam</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Observação (Opcional)
                    </label>
                    <Input
                        placeholder="Observação..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Reverter */}
            <DefaultModal
                isOpen={!!revertTarget}
                onClose={() => {
                    setRevertTarget(null)
                    setActionReason("")
                }}
                title="Reverter Validação"
                description="Isso removerá os 5 pontos de risco atribuídos anteriormente."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setRevertTarget(null); setActionReason(""); }}>Cancelar</Button>
                        <Button variant="default" onClick={handleConfirmRevert} disabled={isPending}>Reverter</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Motivo da Reversão
                    </label>
                    <Input
                        placeholder="Informe o motivo da reversão..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>
        </FadeIn>
    )
}
